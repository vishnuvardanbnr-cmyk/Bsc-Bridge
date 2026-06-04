import { useMemo } from 'react';
import { ethers } from 'ethers';
import { BSC_CHAIN_ID, MCHAIN_CHAIN_ID, BSC_RPC, getMchainRpc } from '../lib/chains';
import { CONTRACTS, TX_STATUS_MAP } from '../lib/contracts';
import { useQuery } from '@tanstack/react-query';

export type FormattedTx = {
  id: string;
  type: string;
  amount: string;
  sourceChain: string;
  destinationChain: string;
  destinationAddress: string;
  status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled';
  timestamp: number;
  linkedId: string;
};

const TX_ABI = [
  'function getUserTransactionsByTimeRange(address user, uint256 timeRange) view returns (tuple(bytes32 transactionId, address user, string transactionType, uint256 amount, string sourceChain, string destinationChain, string destinationAddress, uint8 status, uint256 timestamp, bytes32 linkedId)[])',
];

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

async function fetchChainTxs(chainId: number, userAddress: string): Promise<FormattedTx[]> {
  const rpcUrl = chainId === MCHAIN_CHAIN_ID ? getMchainRpc() : BSC_RPC;
  const bridgeAddress = chainId === BSC_CHAIN_ID ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;
  const timeRange = BigInt(30 * 24 * 60 * 60);

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(bridgeAddress, TX_ABI, provider);
    const raw: any[] = await contract.getUserTransactionsByTimeRange(userAddress, timeRange);

    return raw.map((tx: any) => {
      const linkedId: string = tx.linkedId ?? ZERO_HASH;
      const hasLinked = linkedId !== ZERO_HASH;
      const statusCode = hasLinked ? 1 : Number(tx.status);
      const amount: bigint = BigInt(tx.amount ?? 0n);
      const decimals = amount > BigInt('1000000000000') ? 18 : 6;

      return {
        id: tx.transactionId as string,
        type: tx.transactionType as string,
        amount: ethers.formatUnits(amount, decimals),
        sourceChain: tx.sourceChain as string,
        destinationChain: tx.destinationChain as string,
        destinationAddress: tx.destinationAddress as string,
        status: TX_STATUS_MAP[statusCode] ?? 'Pending',
        timestamp: Number(tx.timestamp) * 1000,
        linkedId,
      };
    });
  } catch {
    return [];
  }
}

export function useTxHistory(userAddress?: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['txHistory', userAddress],
    queryFn: async () => {
      if (!userAddress) return [];
      const [bscTxs, mchainTxs] = await Promise.all([
        fetchChainTxs(BSC_CHAIN_ID, userAddress),
        fetchChainTxs(MCHAIN_CHAIN_ID, userAddress),
      ]);
      return [...bscTxs, ...mchainTxs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    },
    enabled: !!userAddress,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const history = useMemo(() => data ?? [], [data]);
  return { history, isLoading, refetch };
}
