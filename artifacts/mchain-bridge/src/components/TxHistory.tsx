import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useTxHistory } from '../hooks/useTxHistory';
import { ChevronDown, ArrowRight, ExternalLink } from 'lucide-react';
import { cn, formatAmount, formatAddress } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { bsc } from 'wagmi/chains';

export function TxHistory() {
  const { address } = useAccount();
  const { history, clearHistory } = useTxHistory(address);
  const [isOpen, setIsOpen] = useState(false);

  if (!address || history.length === 0) return null;

  return (
    <div className="w-full mt-6">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>RECENT BRIDGES</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 flex flex-col gap-2">
              {history.map((tx) => (
                <div key={tx.id} className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span>{formatAmount(tx.amount)} MC</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span>{tx.toChainId === bsc.id ? 'BSC' : 'MChain'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(tx.timestamp).toLocaleString()}</span>
                      {tx.txHash && (
                        <>
                          <span>•</span>
                          <a href="#" className="flex items-center gap-1 hover:text-primary transition-colors font-mono">
                            {formatAddress(tx.txHash)} <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    {tx.status === 'complete' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-md bg-success/10 text-success">Complete</span>
                    )}
                    {tx.status === 'pending' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-md bg-warning/10 text-warning">Pending</span>
                    )}
                    {tx.status === 'failed' && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-md bg-danger/10 text-danger">Failed</span>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-center mt-2">
                <button 
                  onClick={clearHistory}
                  className="text-xs text-muted-foreground hover:text-danger transition-colors py-2"
                >
                  Clear history
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
