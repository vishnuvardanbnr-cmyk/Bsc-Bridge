import { useMemo } from 'react';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { bsc } from 'wagmi/chains';
import { mchain } from '../lib/chains';
import { CONTRACTS, bscBridgeAbi, mchainBridgeAbi, TX_STATUS_MAP, RPC_URLS } from '../lib/contracts';
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

type RawTx = {
  transactionId: `0x${string}`;
  user: Address;
  transactionType: string;
  amount: bigint;
  sourceChain: string;
  destinationChain: string;
  destinationAddress: string;
  status: number;
  timestamp: bigint;
  linkedId: `0x${string}`;
};

async function fetchChainTxs(chainId: number, userAddress: Address): Promise<FormattedTx[]> {
  const rpc = RPC_URLS[chainId];
  const chain = chainId === bsc.id ? bsc : mchain;
  const bridgeAddress = chainId === bsc.id ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;
  const abi = chainId === bsc.id ? (bscBridgeAbi as typeof bscBridgeAbi) : (mchainBridgeAbi as typeof mchainBridgeAbi);
  const timeRange = BigInt(30 * 24 * 60 * 60);

  try {
    const client = createPublicClient({ chain, transport: http(rpc) });
    const raw = await client.readContract({
      address: bridgeAddress,
      abi,
      functionName: 'getUserTransactionsByTimeRange',
      args: [userAddress, timeRange],
    }) as readonly RawTx[];

    return raw.map((tx) => {
      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const hasLinked = tx.linkedId !== zeroHash;
      const statusCode = hasLinked ? 1 : Number(tx.status);
      const decimals = tx.amount > BigInt('1000000000000') ? 18 : 6;

      return {
        id: tx.transactionId,
        type: tx.transactionType,
        amount: formatUnits(tx.amount, decimals),
        sourceChain: tx.sourceChain,
        destinationChain: tx.destinationChain,
        destinationAddress: tx.destinationAddress,
        status: TX_STATUS_MAP[statusCode] ?? 'Pending',
        timestamp: Number(tx.timestamp) * 1000,
        linkedId: tx.linkedId,
      };
    });
  } catch {
    return [];
  }
}

export function useTxHistory(userAddress?: Address) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['txHistory', userAddress],
    queryFn: async () => {
      if (!userAddress) return [];
      const [bscTxs, mchainTxs] = await Promise.all([
        fetchChainTxs(bsc.id, userAddress),
        fetchChainTxs(mchain.id, userAddress),
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
