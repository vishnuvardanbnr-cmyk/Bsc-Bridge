import { createPublicClient, createWalletClient, http, parseEther, formatEther, formatUnits } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const BSC_RPC = 'https://bsc-dataseed.binance.org';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;

export const GAS_THRESHOLD_BNB = 0.003; // min BNB needed for 2 txs
export const BNB_TO_SEND = '0.003';     // amount admin sends
export const MIN_BRIDGE_USDT = 1;       // minimum USDT to bridge

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(BSC_RPC),
});

const USDT_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function getUsdtBalance(address: `0x${string}`): Promise<string> {
  const raw = await publicClient.readContract({
    address: USDT_ADDRESS,
    abi: USDT_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return formatUnits(raw, 18);
}

export async function getBnbBalance(address: `0x${string}`): Promise<string> {
  const raw = await publicClient.getBalance({ address });
  return formatEther(raw);
}

export async function sendBnbFromAdmin(toAddress: `0x${string}`): Promise<`0x${string}`> {
  const adminKey = process.env['BRIDGE_ADMIN_PRIVATE_KEY'];
  if (!adminKey) throw new Error('BRIDGE_ADMIN_PRIVATE_KEY not configured');

  const account = privateKeyToAccount(adminKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(BSC_RPC),
  });

  const hash = await walletClient.sendTransaction({
    to: toAddress,
    value: parseEther(BNB_TO_SEND),
  });

  return hash;
}

export async function broadcastTx(signedTx: `0x${string}`): Promise<`0x${string}`> {
  return publicClient.sendRawTransaction({ serializedTransaction: signedTx });
}

export async function getTxStatus(txHash: `0x${string}`): Promise<{
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
}> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (!receipt) return { status: 'pending', confirmations: 0 };

    const block = await publicClient.getBlockNumber();
    const confirmations = Number(block - receipt.blockNumber);

    return {
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      confirmations,
    };
  } catch {
    return { status: 'pending', confirmations: 0 };
  }
}
