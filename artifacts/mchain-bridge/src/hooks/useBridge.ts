import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSimulateContract } from 'wagmi';
import { parseUnits } from 'viem';
import { CONTRACTS, erc20Abi, bridgeAbi } from '../lib/contracts';
import { bsc } from 'wagmi/chains';
import { mchain } from '../lib/chains';

export type BridgeStep = 'idle' | 'approving' | 'sending' | 'relaying' | 'done' | 'failed';

export function useBridge(fromChainId: number, toChainId: number, amount: string) {
  const { address } = useAccount();
  const [step, setStep] = useState<BridgeStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | undefined>();
  const [approveHash, setApproveHash] = useState<string | undefined>();

  const isBsc = fromChainId === bsc.id;
  const tokenAddress = isBsc ? CONTRACTS.bsc.token : CONTRACTS.mchain.token;
  const bridgeAddress = isBsc ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;

  const parsedAmount = amount ? parseUnits(amount, 18) : 0n;

  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, bridgeAddress] : undefined,
    query: { enabled: !!address && !!amount },
  });

  const needsApproval = allowance !== undefined && allowance < parsedAmount;

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeBridge } = useWriteContract();

  const handleBridge = useCallback(async () => {
    if (!amount || !address) return;
    setError(null);
    try {
      if (needsApproval) {
        setStep('approving');
        const hash = await writeApprove({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [bridgeAddress, parsedAmount],
        });
        setApproveHash(hash);
        // We'd wait for receipt here in a real app
      }

      setStep('sending');
      const hash = await writeBridge({
        address: bridgeAddress,
        abi: bridgeAbi,
        functionName: 'bridge',
        args: [parsedAmount, BigInt(toChainId)],
      });
      setTxHash(hash);
      
      setStep('relaying');
      
      // Mock relay delay
      setTimeout(() => {
        setStep('done');
      }, 15000);

    } catch (err: any) {
      console.error(err);
      setError(err.shortMessage || err.message || 'Transaction failed');
      setStep('failed');
    }
  }, [amount, address, needsApproval, writeApprove, writeBridge, tokenAddress, bridgeAddress, parsedAmount, toChainId]);

  const reset = () => {
    setStep('idle');
    setError(null);
    setTxHash(undefined);
    setApproveHash(undefined);
  };

  return {
    step,
    error,
    txHash,
    approveHash,
    needsApproval,
    handleBridge,
    reset,
  };
}
