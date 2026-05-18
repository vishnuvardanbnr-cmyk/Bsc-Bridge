import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SUPPORTED_CHAINS } from '../lib/chains';
import { SiBinance } from 'react-icons/si';
import { cn } from '../lib/utils';

interface ChainSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChainId: number;
  onSelectChain: (chainId: number) => void;
}

export function ChainSelectorModal({ open, onOpenChange, selectedChainId, onSelectChain }: ChainSelectorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Select Network</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          {SUPPORTED_CHAINS.map((chain) => {
            const isSelected = chain.id === selectedChainId;
            const isBsc = chain.id === 56;
            return (
              <button
                key={chain.id}
                onClick={() => {
                  onSelectChain(chain.id);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex items-center justify-between p-4 rounded-xl border transition-all",
                  isSelected 
                    ? "border-primary bg-primary/10" 
                    : "border-border bg-surface-raised hover:border-muted"
                )}
                data-testid={`chain-select-${chain.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-surface border border-border">
                    {isBsc ? (
                      <SiBinance className="text-[#F3BA2F] w-5 h-5" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
                        MC
                      </div>
                    )}
                  </div>
                  <span className="font-semibold text-foreground">{chain.name}</span>
                </div>
                <div className="px-2 py-1 rounded-md bg-background border border-border text-xs text-muted-foreground font-mono">
                  {chain.id}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
