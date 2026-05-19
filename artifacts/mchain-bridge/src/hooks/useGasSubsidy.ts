import { useState, useCallback } from 'react';

const API_BASE = '/api';

export type GasSubsidyStep =
  | 'idle'
  | 'checking'
  | 'funding'
  | 'waiting-bnb'   // waiting for BNB to land (~1 block)
  | 'ready'         // gas is ready, proceed with wallet signing
  | 'error';

export type CheckResult = {
  usdtBalance: string;
  bnbBalance: string;
  needsGas: boolean;
  minimumAmount: string;
  sufficient: boolean;
};

export function useGasSubsidy() {
  const [step, setStep] = useState<GasSubsidyStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gasTxHash, setGasTxHash] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setGasTxHash(null);
    setCheckResult(null);
  }, []);

  /**
   * Ensure the user has enough BNB gas before bridging.
   * Returns true if ready to proceed with wallet signing.
   */
  const ensureGas = useCallback(async (bscAddress: string, amount: string): Promise<boolean> => {
    setError(null);

    try {
      // Step 1: Check balances
      setStep('checking');
      const checkRes = await fetch(`${API_BASE}/bridge/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bscAddress, amount }),
      });

      if (!checkRes.ok) {
        const body = await checkRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Balance check failed');
      }

      const check = await checkRes.json() as CheckResult;
      setCheckResult(check);

      if (!check.sufficient) {
        setError(`Insufficient USDT balance. You need at least ${check.minimumAmount} USDT.`);
        setStep('error');
        return false;
      }

      // Step 2: Fund gas if needed
      if (check.needsGas) {
        setStep('funding');
        const fundRes = await fetch(`${API_BASE}/bridge/fund-gas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bscAddress }),
        });

        if (!fundRes.ok) {
          const body = await fundRes.json().catch(() => ({})) as { error?: string; message?: string };
          // If admin wallet not configured, skip gas funding and proceed anyway
          if (fundRes.status === 503) {
            setStep('ready');
            return true;
          }
          // Rate limited
          if (fundRes.status === 429) {
            // User was already funded recently — they have gas, proceed
            setStep('ready');
            return true;
          }
          throw new Error(body.message ?? body.error ?? 'Gas funding failed');
        }

        const fundData = await fundRes.json() as { funded: boolean; gasTxHash: string; waitMs: number };
        setGasTxHash(fundData.gasTxHash);

        // Step 3: Wait for BNB to land
        setStep('waiting-bnb');
        await new Promise((resolve) => setTimeout(resolve, fundData.waitMs ?? 4000));
      }

      setStep('ready');
      return true;
    } catch (err) {
      const e = err as Error;
      setError(e.message ?? 'Gas preparation failed');
      setStep('error');
      return false;
    }
  }, []);

  return {
    step,
    error,
    gasTxHash,
    checkResult,
    ensureGas,
    reset,
    isActive: step !== 'idle' && step !== 'ready' && step !== 'error',
  };
}
