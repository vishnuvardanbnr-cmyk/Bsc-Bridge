import { useState, useEffect } from 'react';

export type TxStatus = 'pending' | 'complete' | 'failed';

export interface BridgeTx {
  id: string;
  fromChainId: number;
  toChainId: number;
  amount: string;
  status: TxStatus;
  timestamp: number;
  txHash?: string;
}

export function useTxHistory(address?: string) {
  const [history, setHistory] = useState<BridgeTx[]>([]);

  useEffect(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    const stored = localStorage.getItem(`bridge_txs_${address}`);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse tx history', e);
      }
    } else {
      setHistory([]);
    }
  }, [address]);

  const addTx = (tx: BridgeTx) => {
    if (!address) return;
    setHistory((prev) => {
      const updated = [tx, ...prev].slice(0, 20);
      localStorage.setItem(`bridge_txs_${address}`, JSON.stringify(updated));
      return updated;
    });
  };

  const updateTx = (id: string, updates: Partial<BridgeTx>) => {
    if (!address) return;
    setHistory((prev) => {
      const updated = prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx));
      localStorage.setItem(`bridge_txs_${address}`, JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    if (!address) return;
    localStorage.removeItem(`bridge_txs_${address}`);
    setHistory([]);
  };

  return { history, addTx, updateTx, clearHistory };
}
