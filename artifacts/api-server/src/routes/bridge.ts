import { Router, type IRouter } from 'express';
import { z } from 'zod/v4';
import {
  getUsdtBalance,
  getBnbBalance,
  getBridgeUsdtBalance,
  sendBnbFromAdmin,
  broadcastTx,
  getTxStatus,
  GAS_THRESHOLD_BNB,
  BNB_TO_SEND,
  MIN_BRIDGE_USDT,
} from '../lib/bscClient.js';
import { loadConfig } from '../lib/config.js';
import { maybeSendLiquidityAlert } from '../lib/telegram.js';

const router: IRouter = Router();

// ── Rate limit store ────────────────────────────────────────────────────────────
// Tracks per-address: when gas was last funded and when the last bridge completed.
// Key insight: if the user successfully bridged AFTER the last funding, they consumed
// the gas legitimately and may be funded again on the next bridge.
type GasRecord = {
  lastFunded: number;         // ms timestamp
  lastBridgeConfirmed: number; // ms timestamp (0 = never)
};

const gasLog = new Map<string, GasRecord>();
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 h fallback

function getRecord(address: string): GasRecord {
  return gasLog.get(address.toLowerCase()) ?? { lastFunded: 0, lastBridgeConfirmed: 0 };
}

/**
 * Rate-limited if:
 *   - funded within 24 h  AND
 *   - the user has NOT completed a bridge since the last funding
 * (If they bridged successfully → gas was consumed → allow funding again)
 */
function isRateLimited(address: string): boolean {
  const { lastFunded, lastBridgeConfirmed } = getRecord(address);
  if (!lastFunded) return false;
  const withinWindow = Date.now() - lastFunded < RATE_LIMIT_MS;
  const bridgedSinceLastFund = lastBridgeConfirmed > lastFunded;
  return withinWindow && !bridgedSinceLastFund;
}

function recordGasFund(address: string): void {
  const prev = getRecord(address);
  gasLog.set(address.toLowerCase(), { ...prev, lastFunded: Date.now() });
}

function recordBridgeConfirmed(address: string): void {
  const prev = getRecord(address);
  gasLog.set(address.toLowerCase(), { ...prev, lastBridgeConfirmed: Date.now() });
}

// ── Zod schemas ────────────────────────────────────────────────────────────────
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');

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
    const cfg = loadConfig();
    const bscToken = cfg.contracts.bsc.token as `0x${string}`;
    const bscBridge = cfg.contracts.bsc.bridge as `0x${string}`;

    const [usdtBalance, bnbBalance, bridgeBalance] = await Promise.all([
      getUsdtBalance(addr, bscToken),
      getBnbBalance(addr),
      getBridgeUsdtBalance(bscBridge, bscToken),
    ]);

    const bnbNum = Number(bnbBalance);
    const usdtNum = Number(usdtBalance);
    const bridgeNum = Number(bridgeBalance);
    const requestedAmount = Number(amount ?? '0');

    const needsGas = bnbNum < GAS_THRESHOLD_BNB;
    const sufficient = requestedAmount > 0
      ? usdtNum >= requestedAmount && requestedAmount >= MIN_BRIDGE_USDT
      : usdtNum >= MIN_BRIDGE_USDT;

    // Liquidity cap: reject if BSC bridge already holds >= maxLiquidityUsd
    const liquidityCapReached = bridgeNum >= cfg.maxLiquidityUsd;

    // Fire-and-forget: alert if bridge balance >= 90% of cap
    maybeSendLiquidityAlert(bridgeNum).catch(() => {});

    res.json({
      usdtBalance: usdtNum.toFixed(6),
      bnbBalance: bnbNum.toFixed(6),
      needsGas,
      minimumAmount: String(MIN_BRIDGE_USDT),
      sufficient,
      bridgeBalance: bridgeNum.toFixed(2),
      maxLiquidityUsd: cfg.maxLiquidityUsd,
      liquidityCapReached,
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

  // 1. Check live BNB balance first — if sufficient, no need to fund
  try {
    const bnbBalance = await getBnbBalance(addr);
    if (Number(bnbBalance) >= GAS_THRESHOLD_BNB) {
      res.json({
        funded: false,
        alreadyHasGas: true,
        bnbBalance,
        message: 'Wallet already has sufficient BNB for gas',
        waitMs: 0,
      });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, 'Could not read BNB balance before funding — proceeding');
  }

  // 2. Rate limit check (allows re-funding if user previously bridged successfully)
  if (isRateLimited(bscAddress)) {
    const { lastFunded } = getRecord(bscAddress);
    res.status(429).json({
      error: 'Rate limited',
      message: 'Gas can only be funded once per bridge cycle. Complete a bridge first to unlock funding again.',
      retryAfterMs: RATE_LIMIT_MS - (Date.now() - lastFunded),
    });
    return;
  }

  // 3. Verify USDT balance — only fund users who actually intend to bridge
  try {
    const usdtBalance = await getUsdtBalance(addr);
    if (Number(usdtBalance) < MIN_BRIDGE_USDT) {
      res.status(400).json({
        error: 'Insufficient USDT',
        message: `Minimum ${MIN_BRIDGE_USDT} USDT required to receive gas subsidy`,
      });
      return;
    }

    // 4. Send BNB from admin wallet
    const gasTxHash = await sendBnbFromAdmin(addr);
    recordGasFund(bscAddress);

    req.log.info({ addr, gasTxHash, bnbSent: BNB_TO_SEND }, 'gas funded');

    res.json({
      funded: true,
      alreadyHasGas: false,
      gasTxHash,
      bnbSent: BNB_TO_SEND,
      waitMs: 4000,
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
// Optional query param: ?bscAddress=0x... — when the tx is confirmed, clears the
// rate limit for that address so they can be funded again on the next bridge.
router.get('/bridge/status/:txHash', async (req, res) => {
  const { txHash } = req.params;
  const { bscAddress } = req.query as { bscAddress?: string };

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ error: 'Invalid tx hash' });
    return;
  }

  try {
    const result = await getTxStatus(txHash as `0x${string}`);

    // When bridge tx is confirmed, record it so the rate limit resets for next time
    if (result.status === 'confirmed' && bscAddress && /^0x[0-9a-fA-F]{40}$/.test(bscAddress)) {
      const { lastBridgeConfirmed, lastFunded } = getRecord(bscAddress);
      // Only mark confirmed once per funding cycle
      if (lastFunded > lastBridgeConfirmed) {
        recordBridgeConfirmed(bscAddress);
        req.log.info({ bscAddress, txHash }, 'bridge confirmed — rate limit reset for next cycle');
      }
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, 'bridge/status failed');
    res.status(500).json({ error: 'Failed to get tx status' });
  }
});

export default router;
