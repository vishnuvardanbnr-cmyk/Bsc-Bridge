import { createPublicClient, createWalletClient, http, formatEther, formatUnits } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getGasWalletKey } from './config.js';

const BSC_RPC = 'https://bsc.publicnode.com';

// Minimum BNB heuristic used only by /bridge/check to show the "needs gas" warning.
// Actual funding uses a live gas-price calculation (see calculateGasNeeded).
export const GAS_THRESHOLD_BNB = 0.001;
export const MIN_BRIDGE_USDT = 1;

// Gas units for the two user-side BSC transactions (approve + deposit), +20% buffer.
const GAS_APPROVE  = 60_000n;
const GAS_DEPOSIT  = 180_000n;
const GAS_BUFFER   = 120n; // multiply total by 120/100

/**
 * Returns the exact BNB (in wei) needed to cover approve + deposit on BSC
 * at the current gas price, with a 20% safety buffer.
 */
export async function calculateGasNeeded(): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice();
  const totalGas = (GAS_APPROVE + GAS_DEPOSIT) * GAS_BUFFER / 100n;
  return gasPrice * totalGas;
}

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(BSC_RPC),
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

/** User's USDT balance on BSC */
export async function getUsdtBalance(address: `0x${string}`, tokenAddress = '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`): Promise<string> {
  const raw = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return formatUnits(raw, 18);
}

/** BNB balance of any address */
export async function getBnbBalance(address: `0x${string}`): Promise<string> {
  const raw = await publicClient.getBalance({ address });
  return formatEther(raw);
}

/** USDT balance held inside the BSC bridge contract — used for liquidity cap enforcement */
export async function getBridgeUsdtBalance(
  bridgeAddress: `0x${string}`,
  tokenAddress: `0x${string}` = '0x55d398326f99059fF775485246999027B3197955',
): Promise<string> {
  const raw = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [bridgeAddress],
  });
  return formatUnits(raw, 18);
}

/**
 * Send an exact amount of BNB (in wei) from the admin wallet to a user.
 * Returns the tx hash and the human-readable BNB amount sent.
 */
export async function sendBnbFromAdmin(
  toAddress: `0x${string}`,
  amountWei: bigint,
): Promise<{ hash: `0x${string}`; bnbSent: string }> {
  const adminKey = getGasWalletKey();
  if (!adminKey) throw new Error('BRIDGE_ADMIN_PRIVATE_KEY not configured');

  const account = privateKeyToAccount(adminKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(BSC_RPC),
  });

  const hash = await walletClient.sendTransaction({
    to: toAddress,
    value: amountWei,
  });

  return { hash, bnbSent: formatEther(amountWei) };
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
