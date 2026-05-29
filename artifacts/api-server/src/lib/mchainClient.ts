import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getGasWalletKey } from './config.js';

const MCHAIN_RPC = 'https://node.mymchain.com/api/rpc';
export const MCHAIN_CHAIN_ID = 1888;

const mchain = {
  id: MCHAIN_CHAIN_ID,
  name: 'MChain',
  nativeCurrency: { name: 'MChain', symbol: 'MC', decimals: 18 },
  rpcUrls: { default: { http: [MCHAIN_RPC] } },
} as const;

export const mchainPublicClient = createPublicClient({
  chain: mchain,
  transport: http(MCHAIN_RPC),
});

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function getMusdtBalance(
  address: `0x${string}`,
  tokenAddress: `0x${string}`,
): Promise<string> {
  const raw = await mchainPublicClient.readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return formatUnits(raw, 18);
}

export function getMchainWalletClient() {
  const key = getGasWalletKey();
  if (!key) throw new Error('Relayer key not configured');
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({ account, chain: mchain, transport: http(MCHAIN_RPC) });
}
