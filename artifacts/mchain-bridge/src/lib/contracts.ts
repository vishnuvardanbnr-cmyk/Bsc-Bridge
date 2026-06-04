export const CONTRACTS = {
  bsc: {
    bridge: '0x1765C355ab987Cc7Bf79b251F495b63F591B3a4b',
    token: '0x55d398326f99059fF775485246999027B3197955',
  },
  mchain: {
    bridge: '0x81321895560887229979485dc36886436a0d38b7',
    token: '0x7b2ed1be97fa240dbd0328dd307e35e588bcb917',
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

export const TX_STATUS_MAP: Record<number, 'Pending' | 'Completed' | 'Failed' | 'Cancelled'> = {
  0: 'Pending',
  1: 'Completed',
  2: 'Failed',
  3: 'Cancelled',
};

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
