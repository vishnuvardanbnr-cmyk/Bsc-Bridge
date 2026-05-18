import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, ExternalLink, Clock } from 'lucide-react';
import { formatAmount, formatAddress } from '../lib/utils';
import { BridgeStep } from '../hooks/useBridge';
import { bsc } from 'wagmi/chains';

interface BridgeProgressProps {
  step: BridgeStep;
  amount: string;
  fromChainId: number;
  toChainId: number;
  txHash?: string;
  approveHash?: string;
  error?: string | null;
  onReset: () => void;
}

export function BridgeProgress({
  step,
  amount,
  fromChainId,
  toChainId,
  txHash,
  approveHash,
  error,
  onReset,
}: BridgeProgressProps) {
  const fromChainName = fromChainId === bsc.id ? 'BSC' : 'MChain';
  const toChainName = toChainId === bsc.id ? 'BSC' : 'MChain';

  const steps = [
    { id: 'approving', label: 'Approve' },
    { id: 'sending', label: 'Send' },
    { id: 'relaying', label: 'Relay' },
    { id: 'done', label: 'Done' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);
  
  if (step === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col items-center py-8 text-center"
      >
        <XCircle className="w-16 h-16 text-danger mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">Bridge Failed</h3>
        <p className="text-sm text-danger mb-6 max-w-[280px] break-words">
          {error || 'Transaction failed. Please try again.'}
        </p>
        <button
          onClick={onReset}
          className="w-full rounded-xl py-4 font-bold bg-surface-raised border border-border hover:border-muted text-foreground transition-all"
        >
          Try Again
        </button>
      </motion.div>
    );
  }

  if (step === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col items-center py-8 text-center"
      >
        <CheckCircle2 className="w-16 h-16 text-success mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">Bridge Complete</h3>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-8">
          <p>Sent {formatAmount(amount)} MC on {fromChainName}</p>
          <p>Received ~{formatAmount(Number(amount) * 0.997)} MC on {toChainName}</p>
          {txHash && (
            <a 
              href="#"
              className="flex items-center justify-center gap-1 text-primary hover:underline mt-2 font-mono"
            >
              {formatAddress(txHash)} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={onReset}
            className="flex-1 rounded-xl py-3 font-bold bg-surface-raised border border-border hover:border-muted text-foreground transition-all"
          >
            Bridge Again
          </button>
          <button
            onClick={() => {}} // In real app, open explorer
            className="flex-1 rounded-xl py-3 font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all"
          >
            View Tx
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col py-4"
    >
      <h3 className="text-lg font-bold text-foreground text-center mb-6">
        Bridging {formatAmount(amount)} MC to {toChainName}
      </h3>

      <div className="flex items-center justify-between mb-8 px-4 relative">
        <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-border -z-10 -translate-y-1/2" />
        
        {steps.map((s, idx) => {
          const isCompleted = currentStepIndex > idx || step === 'done';
          const isCurrent = currentStepIndex === idx && step !== 'done';
          
          return (
            <div key={s.id} className="flex flex-col items-center gap-2 bg-surface">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-surface relative">
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-primary bg-surface rounded-full" />
                ) : isCurrent ? (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute inset-0 rounded-full border-2 border-primary opacity-50"
                    />
                    <div className="w-3 h-3 rounded-full bg-primary relative z-10" />
                  </>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-border" />
                )}
              </div>
              <span className={`text-xs ${isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="bg-background rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-foreground capitalize">{step}...</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>~3 min remaining</span>
          </div>
        </div>
        
        {txHash && (
          <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground">Tx Hash</span>
            <a href="#" className="flex items-center gap-1 text-primary hover:underline font-mono">
              {formatAddress(txHash)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

    </motion.div>
  );
}
