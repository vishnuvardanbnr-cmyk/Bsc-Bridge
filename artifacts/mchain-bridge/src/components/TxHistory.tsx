import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useTxHistory } from '../hooks/useTxHistory';
import { ChevronDown, ArrowRight, ExternalLink, RotateCw } from 'lucide-react';
import { cn, formatAmount, formatAddress } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getExplorerTxUrl } from '../lib/contracts';
import { bsc } from 'wagmi/chains';

function getChainId(chainName: string): number {
  if (chainName.toLowerCase().includes('bsc') || chainName.toLowerCase().includes('binance')) return 56;
  return 1888;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

export function TxHistory() {
  const { address } = useAccount();
  const { history, isLoading, refetch } = useTxHistory(address);
  const [isOpen, setIsOpen] = useState(false);

  if (!address) return null;

  return (
    <div className="w-full mt-4" data-testid="tx-history-panel">
      <button
        data-testid="toggle-tx-history"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors uppercase"
      >
        <span>Recent Bridges</span>
        <div className="flex items-center gap-2">
          <button
            data-testid="refresh-tx-history"
            onClick={(e) => { e.stopPropagation(); refetch(); }}
            className="hover:text-primary transition-colors"
            aria-label="Refresh history"
          >
            <RotateCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          </button>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
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
              {isLoading && (
                <div className="flex flex-col gap-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse h-16" />
                  ))}
                </div>
              )}

              {!isLoading && history.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No bridge transactions found in the last 30 days.
                </div>
              )}

              {!isLoading && history.map((tx) => {
                const srcChainId = getChainId(tx.sourceChain);
                const destChainId = getChainId(tx.destinationChain);
                const explorerUrl = getExplorerTxUrl(srcChainId, tx.id);

                return (
                  <div
                    key={tx.id}
                    data-testid={`tx-row-${tx.id.slice(0, 8)}`}
                    className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground font-mono">
                        <span>{formatAmount(tx.amount)} USDT</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{tx.destinationChain || (destChainId === bsc.id ? 'BSC' : 'MChain')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{timeAgo(tx.timestamp)}</span>
                        <span>•</span>
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
                          data-testid="tx-explorer-link"
                        >
                          {formatAddress(tx.id)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {tx.destinationAddress && (
                        <div className="text-xs text-muted-foreground font-mono truncate">
                          → {formatAddress(tx.destinationAddress)}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {tx.status === 'Completed' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-md bg-[#0D2218] border border-emerald-800 text-emerald-400">
                          Complete
                        </span>
                      )}
                      {tx.status === 'Pending' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-md bg-[#2A1E08] border border-amber-800 text-amber-400">
                          Pending
                        </span>
                      )}
                      {tx.status === 'Failed' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-md bg-[#2A0E0E] border border-red-900 text-red-400">
                          Failed
                        </span>
                      )}
                      {tx.status === 'Cancelled' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-md bg-muted/20 text-muted-foreground">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
