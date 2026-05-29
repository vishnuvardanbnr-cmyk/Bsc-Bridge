import { type Address } from 'viem';

export const CONTRACTS = {
  bsc: {
    bridge: '0x1765C355ab987Cc7Bf79b251F495b63F591B3a4b' as Address,
    token: '0x55d398326f99059fF775485246999027B3197955' as Address,
  },
  mchain: {
    bridge: '0x205aa52e0196e06c1f6ca5059ff079df1204495c' as Address,
    token: '0xab8c6267dcca9e70b625014c8f77eee9728e14c3' as Address,
  },
} as const;

export const EXPLORER_URLS: Record<number, string> = {
  56: 'https://bscscan.com',
  1888: 'https://explorer.mchain.network',
};

export function getExplorerTxUrl(chainId: number, hash: string) {
  const base = EXPLORER_URLS[chainId] ?? '';
  return base ? `${base}/tx/${hash}` : '#';
}

export function getExplorerAddressUrl(chainId: number, address: string) {
  const base = EXPLORER_URLS[chainId] ?? '';
  return base ? `${base}/address/${address}` : '#';
}

export const RPC_URLS: Record<number, string> = {
  56: 'https://bsc.publicnode.com',
  1888: 'https://node.mymchain.com/api/rpc',
};

// ── USDT ERC-20 ABI ────────────────────────────────────────────────────────────
export const usdtAbi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ── BSC Bridge ABI ─────────────────────────────────────────────────────────────
// BSC: deposit(amount, destinationAddress) — user locks USDT on BSC
export const bscBridgeAbi = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationAddress', type: 'string' },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'burnId', type: 'bytes32' },
    ],
    name: 'unlock',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'timeRange', type: 'uint256' },
    ],
    name: 'getUserTransactionsByTimeRange',
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'transactionId', type: 'bytes32' },
          { name: 'user', type: 'address' },
          { name: 'transactionType', type: 'string' },
          { name: 'amount', type: 'uint256' },
          { name: 'sourceChain', type: 'string' },
          { name: 'destinationChain', type: 'string' },
          { name: 'destinationAddress', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'linkedId', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMarketOverview',
    outputs: [
      { name: 'current24hVolume', type: 'uint256' },
      { name: 'previous24hVolume', type: 'uint256' },
      { name: 'volumeIncreasePercent', type: 'uint256' },
      { name: 'successRate', type: 'uint256' },
      { name: 'avgProcessingTime', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalTransactions',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ── MChain Bridge ABI ──────────────────────────────────────────────────────────
// MChain: withdraw(amount, destinationAddress) — user burns mUSDT on MChain
export const mchainBridgeAbi = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationAddress', type: 'string' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'depositId', type: 'bytes32' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'timeRange', type: 'uint256' },
    ],
    name: 'getUserTransactionsByTimeRange',
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'transactionId', type: 'bytes32' },
          { name: 'user', type: 'address' },
          { name: 'transactionType', type: 'string' },
          { name: 'amount', type: 'uint256' },
          { name: 'sourceChain', type: 'string' },
          { name: 'destinationChain', type: 'string' },
          { name: 'destinationAddress', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'linkedId', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMarketOverview',
    outputs: [
      { name: 'current24hVolume', type: 'uint256' },
      { name: 'previous24hVolume', type: 'uint256' },
      { name: 'volumeIncreasePercent', type: 'uint256' },
      { name: 'successRate', type: 'uint256' },
      { name: 'avgProcessingTime', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalTransactions',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type BridgeTx = {
  transactionId: string;
  user: string;
  transactionType: string;
  amount: bigint;
  sourceChain: string;
  destinationChain: string;
  destinationAddress: string;
  status: number;
  timestamp: bigint;
  linkedId: string;
};

export const TX_STATUS_MAP: Record<number, 'Pending' | 'Completed' | 'Failed' | 'Cancelled'> = {
  0: 'Pending',
  1: 'Completed',
  2: 'Failed',
  3: 'Cancelled',
};
