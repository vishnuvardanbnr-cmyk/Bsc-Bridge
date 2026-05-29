import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod/v4';
import { loadConfig, saveConfig, hashPassword, verifyPassword } from '../lib/config.js';
import { getBridgeUsdtBalance } from '../lib/bscClient.js';
import { sendTestMessage } from '../lib/telegram.js';

const router: IRouter = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cfg = loadConfig();
  const password = req.headers['x-admin-password'] as string | undefined;
  if (!password) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // verifyPassword is async — run it then call next
  verifyPassword(password, cfg.adminPassword).then((ok) => {
    if (!ok) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Unauthorized' });
  });
}

// ── Validation ─────────────────────────────────────────────────────────────────
const EvmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');
const HexKey = z.string().regex(
  /^0x[0-9a-fA-F]{64}$/,
  'Invalid private key — must be 0x followed by 64 hex characters (66 chars total)',
);

const ConfigUpdateSchema = z.object({
  adminPassword: z.string().min(6).optional(),
  contracts: z
    .object({
      bsc: z
        .object({ bridge: EvmAddress.optional(), token: EvmAddress.optional() })
        .optional(),
      mchain: z
        .object({ bridge: EvmAddress.optional(), token: EvmAddress.optional() })
        .optional(),
    })
    .optional(),
  maxLiquidityUsd: z.number().positive().optional(),
  gasWalletPrivateKey: z.string().optional().refine(
    (v) => v === undefined || v === '' || /^0x[0-9a-fA-F]{64}$/.test(v),
    'Invalid private key — must be 0x followed by 64 hex characters',
  ),
  telegramBotToken: z.string().optional(),
  telegramChatIds: z.array(z.string()).optional(),
});

// ── GET /admin/config ──────────────────────────────────────────────────────────
router.get('/admin/config', requireAdmin, (_req, res) => {
  const cfg = loadConfig();
  res.json({
    contracts: cfg.contracts,
    maxLiquidityUsd: cfg.maxLiquidityUsd,
    gasWalletKeyConfigured: !!cfg.gasWalletPrivateKey,
    gasWalletKeySource: cfg.gasWalletPrivateKey
      ? 'config'
      : process.env['BRIDGE_ADMIN_PRIVATE_KEY']
      ? 'env'
      : 'none',
    telegramBotToken: cfg.telegramBotToken,
    telegramChatIds: cfg.telegramChatIds,
  });
});

// ── POST /admin/config ─────────────────────────────────────────────────────────
router.post('/admin/config', requireAdmin, async (req, res) => {
  const parsed = ConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const data = parsed.data as Parameters<typeof saveConfig>[0];
  // Hash new password before storing
  if (data.adminPassword) {
    data.adminPassword = await hashPassword(data.adminPassword);
  }
  const updated = saveConfig(data);
  res.json({
    ok: true,
    contracts: updated.contracts,
    maxLiquidityUsd: updated.maxLiquidityUsd,
    gasWalletKeyConfigured: !!updated.gasWalletPrivateKey,
    gasWalletKeySource: updated.gasWalletPrivateKey
      ? 'config'
      : process.env['BRIDGE_ADMIN_PRIVATE_KEY']
      ? 'env'
      : 'none',
    telegramBotToken: updated.telegramBotToken,
    telegramChatIds: updated.telegramChatIds,
  });
});

// ── POST /admin/telegram-test ──────────────────────────────────────────────────
router.post('/admin/telegram-test', requireAdmin, async (req, res) => {
  const cfg = loadConfig();
  const token = cfg.telegramBotToken;
  const chatIds = cfg.telegramChatIds;

  if (!token || chatIds.length === 0) {
    res.status(400).json({ error: 'Telegram not configured — save bot token and chat IDs first' });
    return;
  }

  const result = await sendTestMessage(token, chatIds);
  if (result.ok) {
    res.json({ ok: true, message: 'Test message sent successfully' });
  } else {
    res.status(500).json({ ok: false, errors: result.errors });
  }
});

// ── GET /admin/liquidity ───────────────────────────────────────────────────────
// Returns live BSC bridge USDT balance + configured cap
router.get('/admin/liquidity', requireAdmin, async (req, res) => {
  const cfg = loadConfig();
  try {
    const balance = await getBridgeUsdtBalance(cfg.contracts.bsc.bridge as `0x${string}`, cfg.contracts.bsc.token as `0x${string}`);
    const balanceNum = Number(balance);
    res.json({
      bridgeUsdtBalance: balanceNum.toFixed(2),
      maxLiquidityUsd: cfg.maxLiquidityUsd,
      utilizationPercent: cfg.maxLiquidityUsd > 0
        ? Math.min(100, (balanceNum / cfg.maxLiquidityUsd) * 100).toFixed(1)
        : '0',
      capReached: balanceNum >= cfg.maxLiquidityUsd,
    });
  } catch (err) {
    req.log.error({ err }, 'admin/liquidity failed');
    res.status(500).json({ error: 'Failed to read bridge balance' });
  }
});

// ── POST /admin/verify ─────────────────────────────────────────────────────────
// Just validates the password — used for the login gate
router.post('/admin/verify', async (req, res) => {
  const cfg = loadConfig();
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(401).json({ ok: false, error: 'Wrong password' });
    return;
  }
  const ok = await verifyPassword(password, cfg.adminPassword);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Wrong password' });
  }
});

export default router;
