import { useState, useCallback } from 'react';

const API_BASE = '/api';

export type GasSubsidyStep =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'error';

export type CheckResult = {
  usdtBalance: string;
  bnbBalance: string;
  needsGas: boolean;
  minimumAmount: string;
  sufficient: boolean;
  liquidityCapReached: boolean;
  bridgeBalance: string;
  maxLiquidityUsd: number;
};

export function useGasSubsidy() {
  const [step, setStep] = useState<GasSubsidyStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setCheckResult(null);
  }, []);

  /**
   * Check that the user has sufficient USDT and BNB before bridging.
   * BNB is the user's own gas — we do not auto-fund it.
   * Returns true if ready to proceed with wallet signing.
   */
  const ensureGas = useCallback(async (bscAddress: string, amount: string): Promise<boolean> => {
    setError(null);

    try {
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

      setStep('ready');
      return true;
    } catch (err) {
      const e = err as Error;
      setError(e.message ?? 'Balance check failed');
      setStep('error');
      return false;
    }
  }, []);

  return {
    step,
    error,
    gasTxHash: null,
    checkResult,
    ensureGas,
    notifyBridgeConfirmed: async () => {},
    reset,
    isActive: step === 'checking',
  };
}
