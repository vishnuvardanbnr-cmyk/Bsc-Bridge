import { useState, useCallback } from 'react';

const API_BASE = '/api';

export type GasSubsidyStep =
  | 'idle'
  | 'checking'
  | 'funding'
  | 'waiting-bnb'
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
   *
   * Logic:
   * 1. Check USDT + BNB balances
   * 2. If BNB already sufficient → skip funding entirely (proceed immediately)
   * 3. If BNB insufficient → call /bridge/fund-gas
   *    - Server also re-checks BNB live and skips if sufficient (double-guard)
   *    - Rate limit allows re-funding if the user completed a bridge since last funding
   * 4. Wait for BNB to land (~1 BSC block)
   */
  const ensureGas = useCallback(async (bscAddress: string, amount: string): Promise<boolean> => {
    setError(null);

    try {
      // ── Step 1: Check balances ───────────────────────────────────────────────
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

      // ── Step 2: If BNB already sufficient, skip funding entirely ────────────
      if (!check.needsGas) {
        setStep('ready');
        return true;
      }

      // ── Step 3: BNB low — request gas subsidy ───────────────────────────────
      setStep('funding');
      const fundRes = await fetch(`${API_BASE}/bridge/fund-gas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bscAddress }),
      });

      if (!fundRes.ok) {
        const body = await fundRes.json().catch(() => ({})) as {
          error?: string;
          message?: string;
        };

        if (fundRes.status === 503) {
          // Admin wallet not configured — skip subsidy and proceed anyway
          setStep('ready');
          return true;
        }

        if (fundRes.status === 429) {
          // Rate limited but user had gas funded previously — let them proceed
          // (their BNB might still be present from the last cycle)
          setStep('ready');
          return true;
        }

        throw new Error(body.message ?? body.error ?? 'Gas funding failed');
      }

      const fundData = await fundRes.json() as {
        funded: boolean;
        alreadyHasGas?: boolean;
        gasTxHash?: string;
        waitMs: number;
      };

      // Server confirmed wallet already has gas (live re-check) — no wait needed
      if (fundData.alreadyHasGas) {
        setStep('ready');
        return true;
      }

      if (fundData.gasTxHash) {
        setGasTxHash(fundData.gasTxHash);
      }

      // ── Step 4: Wait for BNB to land (~1 BSC block) ─────────────────────────
      setStep('waiting-bnb');
      await new Promise((resolve) => setTimeout(resolve, fundData.waitMs ?? 4000));

      setStep('ready');
      return true;
    } catch (err) {
      const e = err as Error;
      setError(e.message ?? 'Gas preparation failed');
      setStep('error');
      return false;
    }
  }, []);

  /**
   * Call after a bridge tx is confirmed to reset the rate limit for the next bridge.
   * The server will mark this address as "has successfully bridged" so the next
   * gas subsidy request is allowed through.
   */
  const notifyBridgeConfirmed = useCallback(async (txHash: string, bscAddress: string) => {
    try {
      await fetch(`${API_BASE}/bridge/status/${txHash}?bscAddress=${encodeURIComponent(bscAddress)}`, {
        method: 'GET',
      });
    } catch {
      // Non-critical — ignore silently
    }
  }, []);

  return {
    step,
    error,
    gasTxHash,
    checkResult,
    ensureGas,
    notifyBridgeConfirmed,
    reset,
    isActive: step !== 'idle' && step !== 'ready' && step !== 'error',
  };
}
