import { Router, type IRouter } from 'express';
import { z } from 'zod/v4';
import {
  getUsdtBalance,
  getBnbBalance,
  sendBnbFromAdmin,
  broadcastTx,
  getTxStatus,
  GAS_THRESHOLD_BNB,
  BNB_TO_SEND,
  MIN_BRIDGE_USDT,
} from '../lib/bscClient.js';

const router: IRouter = Router();

// ── In-memory rate limit store ─────────────────────────────────────────────────
// address → timestamp of last gas fund (ms)
const gasRateLimit = new Map<string, number>();
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

function isRateLimited(address: string): boolean {
  const last = gasRateLimit.get(address.toLowerCase());
  if (!last) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}

function recordGasFund(address: string): void {
  gasRateLimit.set(address.toLowerCase(), Date.now());
}

// ── Zod schemas ────────────────────────────────────────────────────────────────
const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');

const CheckBody = z.object({
  bscAddress: AddressSchema,
  amount: z.string().optional(),
});

const FundGasBody = z.object({
  bscAddress: AddressSchema,
});

const BroadcastBody = z.object({
  signedTxs: z
    .array(z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid hex tx'))
    .min(1)
    .max(2),
});

// ── POST /bridge/check ─────────────────────────────────────────────────────────
router.post('/bridge/check', async (req, res) => {
  const parsed = CheckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const { bscAddress, amount } = parsed.data;
  const addr = bscAddress as `0x${string}`;

  try {
    const [usdtBalance, bnbBalance] = await Promise.all([
      getUsdtBalance(addr),
      getBnbBalance(addr),
    ]);

    const bnbNum = Number(bnbBalance);
    const usdtNum = Number(usdtBalance);
    const requestedAmount = Number(amount ?? '0');

    const needsGas = bnbNum < GAS_THRESHOLD_BNB;
    const sufficient = requestedAmount > 0
      ? usdtNum >= requestedAmount && requestedAmount >= MIN_BRIDGE_USDT
      : usdtNum >= MIN_BRIDGE_USDT;

    res.json({
      usdtBalance: usdtNum.toFixed(6),
      bnbBalance: bnbNum.toFixed(6),
      needsGas,
      minimumAmount: String(MIN_BRIDGE_USDT),
      sufficient,
    });
  } catch (err) {
    req.log.error({ err }, 'bridge/check failed');
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

// ── POST /bridge/fund-gas ──────────────────────────────────────────────────────
router.post('/bridge/fund-gas', async (req, res) => {
  const parsed = FundGasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const { bscAddress } = parsed.data;
  const addr = bscAddress as `0x${string}`;

  // Rate limit check
  if (isRateLimited(bscAddress)) {
    res.status(429).json({
      error: 'Rate limited',
      message: 'Gas can only be funded once per 24 hours per address',
      retryAfterMs: RATE_LIMIT_MS - (Date.now() - (gasRateLimit.get(bscAddress.toLowerCase()) ?? 0)),
    });
    return;
  }

  // Verify USDT balance before funding gas
  try {
    const usdtBalance = await getUsdtBalance(addr);
    if (Number(usdtBalance) < MIN_BRIDGE_USDT) {
      res.status(400).json({
        error: 'Insufficient USDT',
        message: `Minimum ${MIN_BRIDGE_USDT} USDT required to receive gas subsidy`,
      });
      return;
    }

    const gasTxHash = await sendBnbFromAdmin(addr);
    recordGasFund(bscAddress);

    req.log.info({ addr, gasTxHash, bnbSent: BNB_TO_SEND }, 'gas funded');

    res.json({
      funded: true,
      gasTxHash,
      bnbSent: BNB_TO_SEND,
      waitMs: 4000, // wait ~1 BSC block before signing
    });
  } catch (err) {
    const e = err as Error;
    req.log.error({ err }, 'bridge/fund-gas failed');

    if (e.message?.includes('not configured')) {
      res.status(503).json({ error: 'Gas subsidy not available', message: 'Admin wallet not configured' });
    } else {
      res.status(500).json({ error: 'Failed to fund gas', message: e.message });
    }
  }
});

// ── POST /bridge/broadcast ─────────────────────────────────────────────────────
router.post('/bridge/broadcast', async (req, res) => {
  const parsed = BroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const { signedTxs } = parsed.data;

  try {
    const txHashes: string[] = [];
    for (const rawTx of signedTxs) {
      const hash = await broadcastTx(rawTx as `0x${string}`);
      txHashes.push(hash);
    }

    req.log.info({ txHashes }, 'transactions broadcast');
    res.json({ txHashes, primaryTxHash: txHashes[txHashes.length - 1] });
  } catch (err) {
    const e = err as Error;
    req.log.error({ err }, 'bridge/broadcast failed');
    res.status(500).json({ error: 'Broadcast failed', message: e.message });
  }
});

// ── GET /bridge/status/:txHash ─────────────────────────────────────────────────
router.get('/bridge/status/:txHash', async (req, res) => {
  const { txHash } = req.params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ error: 'Invalid tx hash' });
    return;
  }

  try {
    const result = await getTxStatus(txHash as `0x${string}`);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, 'bridge/status failed');
    res.status(500).json({ error: 'Failed to get tx status' });
  }
});

export default router;
