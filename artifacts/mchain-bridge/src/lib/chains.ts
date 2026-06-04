export const BSC_CHAIN_ID = 56;
export const MCHAIN_CHAIN_ID = 1888;

export const BSC_NETWORK = {
  chainId: '0x38',
  chainName: 'BNB Smart Chain',
  rpcUrls: ['https://bsc.publicnode.com'],
  blockExplorerUrls: ['https://bscscan.com/'],
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
};

export const MCHAIN_NETWORK = {
  chainId: '0x760',
  chainName: 'MChain',
  rpcUrls: ['/api/rpc/mchain'],
  blockExplorerUrls: ['https://explorer.mchain.network'],
  nativeCurrency: { name: 'MChain', symbol: 'MC', decimals: 18 },
};

export const BSC_RPC = 'https://bsc.publicnode.com';

export function getMchainRpc(): string {
  if (typeof window !== 'undefined') return `${window.location.origin}/api/rpc/mchain`;
  return 'https://node.mymchain.com/api/rpc';
}

export function getRpcUrl(chainId: number): string {
  return chainId === MCHAIN_CHAIN_ID ? getMchainRpc() : BSC_RPC;
}

export const SUPPORTED_CHAINS = [
  { id: BSC_CHAIN_ID, name: 'BNB Smart Chain' },
  { id: MCHAIN_CHAIN_ID, name: 'MChain' },
] as const;
