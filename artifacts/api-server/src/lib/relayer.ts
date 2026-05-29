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
import { createWalletClient, http, decodeEventLog } from 'viem';
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
const BLOCKS_TO_SCAN = 1000n; // scan last N blocks on first start (BSC only)
const MAX_BLOCK_RANGE = 1999n; // bsc-dataseed.binance.org hard cap ~2000 blocks
// Note: MChain withdrawals are NOT polled. The withdrawal is user-initiated so the
// frontend calls /bridge/notify immediately with the tx hash. The server processes
// the receipt on demand. For stuck txs (e.g. API was briefly down) there is a manual
// recovery endpoint at /bridge/recover. No block scanning is needed or useful.

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

export function loadState(): RelayerState {
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

export function saveState(state: RelayerState): void {
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

  const rawFrom = state.lastBscBlock !== '0'
    ? BigInt(state.lastBscBlock)
    : latestBlock - BLOCKS_TO_SCAN;
  // Clamp range to MAX_BLOCK_RANGE to satisfy bsc-dataseed rate limits
  const fromBlock = rawFrom > latestBlock ? latestBlock : rawFrom;
  const cappedTo = latestBlock;
  const cappedFrom = cappedTo > MAX_BLOCK_RANGE ? cappedTo - MAX_BLOCK_RANGE : 0n;
  const effectiveFrom = fromBlock > cappedFrom ? fromBlock : cappedFrom;

  logger.info({ fromBlock: effectiveFrom.toString(), toBlock: cappedTo.toString() }, 'Scanning BSC for deposits');

  let logs;
  try {
    logs = await bscPublicClient.getLogs({
      address: bscBridge,
      event: BSC_BRIDGE_ABI[0],
      fromBlock: effectiveFrom,
      toBlock: cappedTo,
    });
  } catch (err) {
    logger.error({ err, fromBlock: effectiveFrom.toString(), toBlock: cappedTo.toString() }, 'BSC getLogs failed');
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


// ── Process a single MChain withdrawal by tx hash ────────────────────────────
// Used by both the background scanner and the on-demand notify endpoint.
export async function processWithdrawalReceipt(
  txHash: `0x${string}`,
  mchainBridge: `0x${string}`,
  bscBridge: `0x${string}`,
  state: RelayerState,
  key: string,
): Promise<void> {
  let receipt;
  try {
    receipt = await mchainPublicClient.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    logger.error({ err, txHash }, 'MChain getTransactionReceipt failed');
    return;
  }

  if (!receipt || receipt.status !== 'success') return;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== mchainBridge.toLowerCase()) continue;

    let decoded: { txId: `0x${string}`; user: `0x${string}`; amount: bigint; destinationAddress: string } | null = null;
    try {
      const result = decodeEventLog({
        abi: MCHAIN_BRIDGE_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Withdrawn',
      });
      decoded = result.args as typeof decoded;
    } catch {
      continue; // not a Withdrawn event — skip
    }

    if (!decoded) continue;
    const { txId, amount, destinationAddress } = decoded;

    if (!txId || state.processedMchainWithdraws.includes(txId)) continue;

    if (!/^0x[0-9a-fA-F]{40}$/i.test(destinationAddress)) {
      logger.warn({ txId, destinationAddress }, 'Invalid BSC destination address — skipping');
      state.processedMchainWithdraws.push(txId);
      continue;
    }

    const netAmount = applyFee(amount);

    try {
      const account = privateKeyToAccount(key as `0x${string}`);
      const walletClient = createWalletClient({ account, chain: bsc, transport: http('https://bsc.publicnode.com') });
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
}

// ── On-demand trigger ────────────────────────────────────────────────────────
// Called immediately after a deposit/withdraw tx is submitted so the relay
// fires as soon as the tx is mined rather than waiting for the next poll.
let _tickFn: (() => Promise<void>) | null = null;

export function triggerRelayTick(): void {
  if (_tickFn) {
    _tickFn().catch((err) => logger.error({ err }, 'On-demand relay tick error'));
  }
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
      await relayBscDeposits(state, bscBridge, mchainBridge);
    } finally {
      saveState(state);
    }
  }

  // Expose tick for on-demand triggering
  _tickFn = tick;

  // Run immediately on start, then on interval
  tick().catch((err) => logger.error({ err }, 'Relayer tick error'));
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'Relayer tick error'));
  }, POLL_INTERVAL_MS);
}
