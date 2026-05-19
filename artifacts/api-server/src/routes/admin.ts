import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod/v4';
import { loadConfig, saveConfig } from '../lib/config.js';
import { getBridgeUsdtBalance } from '../lib/bscClient.js';

const router: IRouter = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cfg = loadConfig();
  const password = req.headers['x-admin-password'] as string | undefined;
  if (!password || password !== cfg.adminPassword) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ── Validation ─────────────────────────────────────────────────────────────────
const EvmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');
const HexKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid private key');

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
  gasWalletPrivateKey: z.union([HexKey, z.literal('')]).optional(),
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
  });
});

// ── POST /admin/config ─────────────────────────────────────────────────────────
router.post('/admin/config', requireAdmin, (req, res) => {
  const parsed = ConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const updated = saveConfig(parsed.data as Parameters<typeof saveConfig>[0]);
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
  });
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
router.post('/admin/verify', (req, res) => {
  const cfg = loadConfig();
  const { password } = req.body as { password?: string };
  if (password === cfg.adminPassword) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Wrong password' });
  }
});

export default router;
