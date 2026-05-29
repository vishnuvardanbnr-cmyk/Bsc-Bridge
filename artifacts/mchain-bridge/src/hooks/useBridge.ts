import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, type Address } from 'viem';
import { CONTRACTS, usdtAbi, bscBridgeAbi, mchainBridgeAbi } from '../lib/contracts';
import { bsc } from 'wagmi/chains';

export type BridgeStep = 'idle' | 'approving' | 'sending' | 'relaying' | 'done' | 'failed';

export function useBridge(fromChainId: number, toChainId: number, amount: string, destinationAddress: string) {
  const { address } = useAccount();
  const [step, setStep] = useState<BridgeStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | undefined>();

  const isBsc = fromChainId === bsc.id;
  const tokenAddress: Address = isBsc ? CONTRACTS.bsc.token : CONTRACTS.mchain.token;
  const bridgeAddress: Address = isBsc ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;

  const parsedAmount = amount && !isNaN(Number(amount)) && Number(amount) > 0
    ? parseUnits(amount, 18)
    : 0n;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: usdtAbi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', bridgeAddress],
    query: { enabled: !!address && parsedAmount > 0n },
  });

  const needsApproval = allowance !== undefined && allowance < parsedAmount;

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeBridgeContract } = useWriteContract();

  const { data: approveReceipt } = useWaitForTransactionReceipt({ hash: txHash as `0x${string}` | undefined });

  const handleBridge = useCallback(async () => {
    if (!amount || !address || !destinationAddress) return;
    setError(null);

    try {
      if (needsApproval) {
        setStep('approving');
        const approveHash = await writeApprove({
          address: tokenAddress,
          abi: usdtAbi,
          functionName: 'approve',
          args: [bridgeAddress, parsedAmount],
        });
        setTxHash(approveHash);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Approval timeout')), 120_000);
          const interval = setInterval(async () => {
            try {
              await refetchAllowance();
              clearInterval(interval);
              clearTimeout(timeout);
              resolve();
            } catch {
              // still waiting
            }
          }, 3000);
        });
      }

      setStep('sending');

      let sendHash: string;
      if (isBsc) {
        sendHash = await writeBridgeContract({
          address: bridgeAddress,
          abi: bscBridgeAbi,
          functionName: 'deposit',
          args: [parsedAmount, destinationAddress],
        });
      } else {
        sendHash = await writeBridgeContract({
          address: bridgeAddress,
          abi: mchainBridgeAbi,
          functionName: 'withdraw',
          args: [parsedAmount, destinationAddress],
        });
      }

      setTxHash(sendHash);
      setStep('relaying');

      // Notify the server immediately so it triggers the relay as soon as
      // the tx is confirmed, rather than waiting for the 30s scheduled poll.
      fetch('/api/bridge/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: sendHash }),
      }).catch(() => {}); // fire-and-forget

      // Poll for relay completion (relay fires server-side within ~5-10s of confirmation)
      setTimeout(() => {
        setStep('done');
      }, 15_000);

    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e.shortMessage ?? e.message ?? 'Transaction failed');
      setStep('failed');
    }
  }, [
    amount, address, destinationAddress, needsApproval,
    writeApprove, writeBridgeContract,
    tokenAddress, bridgeAddress, parsedAmount, isBsc,
    refetchAllowance,
  ]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return {
    step,
    error,
    txHash,
    needsApproval,
    handleBridge,
    reset,
    approveReceipt,
  };
}
