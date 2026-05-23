import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

export type AppConfig = {
  adminPassword: string;
  contracts: {
    bsc: { bridge: string; token: string };
    mchain: { bridge: string; token: string };
  };
  maxLiquidityUsd: number;
  gasWalletPrivateKey: string; // empty string = fall back to env var BRIDGE_ADMIN_PRIVATE_KEY
  telegramBotToken: string;
  telegramChatIds: string[]; // list of chat IDs to notify
};

const DEFAULTS: AppConfig = {
  adminPassword: 'admin123',
  contracts: {
    bsc: {
      bridge: '0xE4363F8FbD39FB0930772644Ebd14597e5756986',
      token: '0x55d398326f99059fF775485246999027B3197955',
    },
    mchain: {
      bridge: '0x0000000000000000000000000000000000000004',
      token: '0x0000000000000000000000000000000000000002',
    },
  },
  maxLiquidityUsd: 10000,
  gasWalletPrivateKey: '',
  telegramBotToken: '',
  telegramChatIds: [],
};

let _cache: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_cache) return _cache;
  try {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8');
      _cache = { ...DEFAULTS };
      return _cache;
    }
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    _cache = { ...DEFAULTS, ...JSON.parse(raw) };
    return _cache;
  } catch {
    _cache = { ...DEFAULTS };
    return _cache;
  }
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const updated: AppConfig = {
    ...current,
    ...partial,
    contracts: {
      bsc: { ...current.contracts.bsc, ...(partial.contracts?.bsc ?? {}) },
      mchain: { ...current.contracts.mchain, ...(partial.contracts?.mchain ?? {}) },
    },
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  _cache = updated;
  return updated;
}

/** Resolve active gas wallet private key: config file value takes precedence over env var */
export function getGasWalletKey(): string | undefined {
  const cfg = loadConfig();
  if (cfg.gasWalletPrivateKey) return cfg.gasWalletPrivateKey;
  return process.env['BRIDGE_ADMIN_PRIVATE_KEY'];
}
