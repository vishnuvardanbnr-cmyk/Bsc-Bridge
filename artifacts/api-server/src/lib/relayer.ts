/**
 * Bridge Relayer
 *
 * Fully on-demand — no polling loops, no timers, no eth_getLogs scans.
 *
 * BSC → MChain: Frontend calls /bridge/notify with the BSC deposit tx hash.
 *   Server waits for the receipt, decodes the Deposited event, calls mint() on MChain.
 *
 * MChain → BSC: Frontend calls /bridge/notify with the MChain withdrawal tx hash.
 *   Server waits for the receipt, decodes the Withdrawn event, calls unlock() on BSC.
 *
 * Stuck txs (API was briefly down): user pastes tx hash into /bridge/recover.
 *
 * Processed txIds are persisted to disk so nothing is ever double-processed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWalletClient, http, decodeEventLog } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient as bscPublicClient } from './bscClient.js';
import { mchainPublicClient, getMchainWalletClient } from './mchainClient.js';
import { getGasWalletKey } from './config.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const STATE_PATH = join(DATA_DIR, 'relayer-state.json');

const BRIDGE_FEE_BPS = 100; // 1% fee — must match frontend

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
  processedBscDeposits: string[];       // txId hex strings already minted on MChain
  processedMchainWithdraws: string[];   // txId hex strings already unlocked on BSC
};

export function loadState(): RelayerState {
  try {
    if (existsSync(STATE_PATH)) {
      const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      return {
        processedBscDeposits: raw.processedBscDeposits ?? [],
        processedMchainWithdraws: raw.processedMchainWithdraws ?? [],
      };
    }
  } catch { /* fall through */ }
  return { processedBscDeposits: [], processedMchainWithdraws: [] };
}

export function saveState(state: RelayerState): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ── Fee calculation ──────────────────────────────────────────────────────────
function applyFee(amount: bigint): bigint {
  return amount - (amount * BigInt(BRIDGE_FEE_BPS)) / 10000n;
}

// ── BSC → MChain: process a single deposit by tx hash ────────────────────────
// Reads the BSC receipt, decodes the Deposited event, calls mint() on MChain.
export async function processBscDepositReceipt(
  txHash: `0x${string}`,
  bscBridge: `0x${string}`,
  mchainBridge: `0x${string}`,
  state: RelayerState,
): Promise<void> {
  const key = getGasWalletKey();
  if (!key) {
    logger.warn({ txHash }, 'No relayer key — cannot process BSC deposit');
    return;
  }

  let receipt;
  try {
    receipt = await bscPublicClient.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    logger.error({ err, txHash }, 'BSC getTransactionReceipt failed');
    return;
  }

  if (!receipt || receipt.status !== 'success') return;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== bscBridge.toLowerCase()) continue;

    let decoded: { txId: `0x${string}`; user: `0x${string}`; amount: bigint; destinationAddress: string } | null = null;
    try {
      const result = decodeEventLog({
        abi: BSC_BRIDGE_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'Deposited',
      });
      decoded = result.args as typeof decoded;
    } catch {
      continue; // not a Deposited event — skip
    }

    if (!decoded) continue;
    const { txId, user, amount } = decoded;

    if (!txId || state.processedBscDeposits.includes(txId)) {
      logger.info({ txId }, 'BSC deposit already processed — skip');
      continue;
    }

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
}

// ── MChain → BSC: process a single withdrawal by tx hash ─────────────────────
// Reads the MChain receipt, decodes the Withdrawn event, calls unlock() on BSC.
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

    if (!txId || state.processedMchainWithdraws.includes(txId)) {
      logger.info({ txId }, 'MChain withdrawal already processed — skip');
      continue;
    }

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
