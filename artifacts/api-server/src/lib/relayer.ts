/**
 * Bridge Relayer Service
 *
 * BSC → MChain: Watches Deposited events on BSC bridge → calls mint() on MChain bridge
 * MChain → BSC: Watches Withdrawn events on MChain bridge → calls unlock() on BSC bridge
 *
 * Runs as a background polling loop. Persists processed event IDs to disk so
 * events are never double-processed across server restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWalletClient, http, parseUnits } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient as bscPublicClient } from './bscClient.js';
import { mchainPublicClient, getMchainWalletClient, MCHAIN_CHAIN_ID } from './mchainClient.js';
import { loadConfig, getGasWalletKey } from './config.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const STATE_PATH = join(DATA_DIR, 'relayer-state.json');

const BRIDGE_FEE_BPS = 100; // 1% fee — must match frontend
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const BLOCKS_TO_SCAN = 1000n; // scan last N blocks each poll

// ── ABIs ────────────────────────────────────────────────────────────────────
const BSC_BRIDGE_ABI = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'txId',               type: 'bytes32', indexed: true },
      { name: 'user',               type: 'address', indexed: true },
      { name: 'amount',             type: 'uint256', indexed: false },
      { name: 'destinationAddress', type: 'string',  indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'unlock',
    inputs: [
      { name: 'user',   type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'burnId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const MCHAIN_BRIDGE_ABI = [
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'txId',               type: 'bytes32', indexed: true },
      { name: 'user',               type: 'address', indexed: true },
      { name: 'amount',             type: 'uint256', indexed: false },
      { name: 'destinationAddress', type: 'string',  indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'user',      type: 'address' },
      { name: 'amount',    type: 'uint256' },
      { name: 'depositId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ── Persistent state ─────────────────────────────────────────────────────────
type RelayerState = {
  processedBscDeposits: string[];  // txId hex strings already minted on MChain
  processedMchainWithdraws: string[]; // txId hex strings already unlocked on BSC
  lastBscBlock: string;
  lastMchainBlock: string;
};

function loadState(): RelayerState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    }
  } catch { /* fall through */ }
  return {
    processedBscDeposits: [],
    processedMchainWithdraws: [],
    lastBscBlock: '0',
    lastMchainBlock: '0',
  };
}

function saveState(state: RelayerState): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ── Fee calculation ──────────────────────────────────────────────────────────
function applyFee(amount: bigint): bigint {
  return amount - (amount * BigInt(BRIDGE_FEE_BPS)) / 10000n;
}

// ── BSC → MChain relay ──────────────────────────────────────────────────────
async function relayBscDeposits(
  state: RelayerState,
  bscBridge: `0x${string}`,
  mchainBridge: `0x${string}`,
): Promise<void> {
  const key = getGasWalletKey();
  if (!key) return;

  let latestBlock: bigint;
  try {
    latestBlock = await bscPublicClient.getBlockNumber();
  } catch (err) {
    logger.error({ err }, 'BSC getBlockNumber failed');
    return;
  }

  const fromBlock = state.lastBscBlock !== '0'
    ? BigInt(state.lastBscBlock)
    : latestBlock - BLOCKS_TO_SCAN;

  logger.info({ fromBlock: fromBlock.toString(), toBlock: latestBlock.toString() }, 'Scanning BSC for deposits');

  let logs;
  try {
    logs = await bscPublicClient.getLogs({
      address: bscBridge,
      event: BSC_BRIDGE_ABI[0],
      fromBlock,
      toBlock: latestBlock,
    });
  } catch (err) {
    logger.error({ err, fromBlock: fromBlock.toString(), toBlock: latestBlock.toString() }, 'BSC getLogs failed');
    // Advance block pointer so next poll doesn't retry same huge range
    state.lastBscBlock = latestBlock.toString();
    return;
  }

  logger.info({ count: logs.length }, 'BSC deposit events found');

  for (const log of logs) {
    const txId = log.args.txId as `0x${string}`;
    if (!txId || state.processedBscDeposits.includes(txId)) continue;

    const user = log.args.user as `0x${string}`;
    const amount = log.args.amount as bigint;
    const netAmount = applyFee(amount);

    try {
      const walletClient = getMchainWalletClient();
      const hash = await walletClient.writeContract({
        address: mchainBridge,
        abi: MCHAIN_BRIDGE_ABI,
        functionName: 'mint',
        args: [user, netAmount, txId],
      });

      logger.info({ txId, user, amount: amount.toString(), netAmount: netAmount.toString(), hash }, 'BSC→MChain mint sent');
      state.processedBscDeposits.push(txId);
      if (state.processedBscDeposits.length > 10000) {
        state.processedBscDeposits = state.processedBscDeposits.slice(-5000);
      }
    } catch (err) {
      logger.error({ err, txId }, 'Failed to mint on MChain');
    }
  }

  state.lastBscBlock = latestBlock.toString();
}

// ── MChain → BSC relay ──────────────────────────────────────────────────────
async function relayMchainWithdrawals(
  state: RelayerState,
  mchainBridge: `0x${string}`,
  bscBridge: `0x${string}`,
): Promise<void> {
  const key = getGasWalletKey();
  if (!key) return;

  let latestBlock: bigint;
  try {
    latestBlock = await mchainPublicClient.getBlockNumber();
  } catch (err) {
    logger.error({ err }, 'MChain getBlockNumber failed');
    return;
  }

  const fromBlock = state.lastMchainBlock !== '0'
    ? BigInt(state.lastMchainBlock)
    : latestBlock - BLOCKS_TO_SCAN;

  logger.info({ fromBlock: fromBlock.toString(), toBlock: latestBlock.toString() }, 'Scanning MChain for withdrawals');

  let logs;
  try {
    logs = await mchainPublicClient.getLogs({
      address: mchainBridge,
      event: MCHAIN_BRIDGE_ABI[0],
      fromBlock,
      toBlock: latestBlock,
    });
  } catch (err) {
    logger.error({ err, fromBlock: fromBlock.toString(), toBlock: latestBlock.toString() }, 'MChain getLogs failed');
    state.lastMchainBlock = latestBlock.toString();
    return;
  }

  logger.info({ count: logs.length }, 'MChain withdrawal events found');

  for (const log of logs) {
    const txId = log.args.txId as `0x${string}`;
    if (!txId || state.processedMchainWithdraws.includes(txId)) continue;

    const destinationAddress = log.args.destinationAddress as string;
    const amount = log.args.amount as bigint;
    const netAmount = applyFee(amount);

    if (!/^0x[0-9a-fA-F]{40}$/.test(destinationAddress)) {
      logger.warn({ txId, destinationAddress }, 'Invalid BSC destination address — skipping');
      state.processedMchainWithdraws.push(txId);
      continue;
    }

    try {
      const account = privateKeyToAccount(key as `0x${string}`);
      const walletClient = createWalletClient({ account, chain: bsc, transport: http('https://bsc-dataseed.binance.org') });
      const hash = await walletClient.writeContract({
        address: bscBridge,
        abi: BSC_BRIDGE_ABI,
        functionName: 'unlock',
        args: [destinationAddress as `0x${string}`, netAmount, txId],
      });

      logger.info({ txId, destinationAddress, amount: amount.toString(), netAmount: netAmount.toString(), hash }, 'MChain→BSC unlock sent');
      state.processedMchainWithdraws.push(txId);
      if (state.processedMchainWithdraws.length > 10000) {
        state.processedMchainWithdraws = state.processedMchainWithdraws.slice(-5000);
      }
    } catch (err) {
      logger.error({ err, txId }, 'Failed to unlock on BSC');
    }
  }

  state.lastMchainBlock = latestBlock.toString();
}

// ── Main loop ────────────────────────────────────────────────────────────────
export function startRelayer(): void {
  logger.info('Relayer starting');

  async function tick() {
    const cfg = loadConfig();
    const bscBridge = cfg.contracts.bsc.bridge as `0x${string}`;
    const mchainBridge = cfg.contracts.mchain.bridge as `0x${string}`;

    // Skip if contracts are still placeholder
    const isPlaceholder = (addr: string) =>
      addr === '0x0000000000000000000000000000000000000004' ||
      addr === '0x0000000000000000000000000000000000000002' ||
      addr === '0x0000000000000000000000000000000000000000';

    if (isPlaceholder(bscBridge) || isPlaceholder(mchainBridge)) {
      logger.debug('Relayer: contract addresses are placeholders — skipping');
      return;
    }

    const key = getGasWalletKey();
    if (!key) {
      logger.debug('Relayer: no relayer key configured — skipping');
      return;
    }

    const state = loadState();
    try {
      await Promise.allSettled([
        relayBscDeposits(state, bscBridge, mchainBridge),
        relayMchainWithdrawals(state, mchainBridge, bscBridge),
      ]);
    } finally {
      saveState(state);
    }
  }

  // Run immediately on start, then on interval
  tick().catch((err) => logger.error({ err }, 'Relayer tick error'));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'Relayer tick error'));
  }, POLL_INTERVAL_MS);
}
