import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, ExternalLink, Clock } from 'lucide-react';
import { formatAmount, formatAddress } from '../lib/utils';
import { BridgeStep } from '../hooks/useBridge';
import { getExplorerTxUrl } from '../lib/contracts';
import { bsc } from 'wagmi/chains';

const BRIDGE_FEE = 0.01; // 1%

interface BridgeProgressProps {
  step: BridgeStep;
  amount: string;
  fromChainId: number;
  toChainId: number;
  txHash?: string;
  error?: string | null;
  destinationAddress?: string;
  onReset: () => void;
}

export function BridgeProgress({
  step,
  amount,
  fromChainId,
  toChainId,
  txHash,
  error,
  destinationAddress,
  onReset,
}: BridgeProgressProps) {
  const fromChainName = fromChainId === bsc.id ? 'BSC' : 'MChain';
  const toChainName = toChainId === bsc.id ? 'BSC' : 'MChain';
  const isBsc = fromChainId === bsc.id;

  const steps = [
    { id: 'approving', label: 'Approve' },
    { id: 'sending', label: isBsc ? 'Deposit' : 'Withdraw' },
    { id: 'relaying', label: 'Relay' },
    { id: 'done', label: 'Done' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);
  const estimatedReceive = Number(amount) * (1 - BRIDGE_FEE);
  const explorerUrl = txHash ? getExplorerTxUrl(fromChainId, txHash) : '#';

  if (step === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col items-center py-8 text-center"
        data-testid="bridge-failed-state"
      >
        <XCircle className="w-16 h-16 text-danger mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">Bridge Failed</h3>
        <p className="text-sm text-danger mb-6 max-w-[280px] break-words">
          {error || 'Transaction failed. Please try again.'}
        </p>
        <button
          data-testid="try-again-btn"
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
        data-testid="bridge-done-state"
      >
        <CheckCircle2 className="w-16 h-16 text-success mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-1">Bridge Complete</h3>
        <p className="text-sm text-muted-foreground mb-6">Your USDT has been bridged successfully</p>
        <div className="w-full bg-background rounded-xl p-4 mb-6 text-left flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sent</span>
            <span className="font-semibold font-mono">{formatAmount(amount)} USDT on {fromChainName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Received</span>
            <span className="font-semibold font-mono">~{formatAmount(estimatedReceive)} USDT on {toChainName}</span>
          </div>
          {destinationAddress && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Destination</span>
              <span className="font-mono text-xs">{formatAddress(destinationAddress)}</span>
            </div>
          )}
          {txHash && (
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <span className="text-muted-foreground">Tx</span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline font-mono text-xs"
              >
                {formatAddress(txHash)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
        <div className="flex w-full gap-3">
          <button
            data-testid="bridge-again-btn"
            onClick={onReset}
            className="flex-1 rounded-xl py-3 font-bold bg-surface-raised border border-border hover:border-muted text-foreground transition-all"
          >
            Bridge Again
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="view-tx-btn"
            className="flex-1 rounded-xl py-3 font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all text-center"
          >
            View Tx
          </a>
        </div>
      </motion.div>
    );
  }

  const stepLabels: Record<string, string> = {
    approving: 'Approving USDT spend…',
    sending: isBsc ? 'Depositing to BSC bridge…' : 'Withdrawing from MChain…',
    relaying: 'Waiting for relayer…',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col py-4"
      data-testid="bridge-progress-state"
    >
      <h3 className="text-lg font-bold text-foreground text-center mb-1">
        Bridging {formatAmount(amount)} USDT
      </h3>
      <p className="text-sm text-muted-foreground text-center mb-6">
        {fromChainName} → {toChainName}
      </p>

      {/* Step indicators */}
      <div className="flex items-center justify-between mb-8 px-4 relative">
        <div className="absolute top-4 left-8 right-8 h-0.5 bg-border -z-10" />
        {steps.map((s, idx) => {
          const isCompleted = currentStepIndex > idx || step === 'done';
          const isCurrent = currentStepIndex === idx && step !== 'done';
          return (
            <div key={s.id} className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-surface relative">
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-primary bg-surface rounded-full" />
                ) : isCurrent ? (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.35, 1] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      className="absolute inset-0 rounded-full border-2 border-primary opacity-40"
                    />
                    <div className="w-3 h-3 rounded-full bg-primary relative z-10" />
                  </>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-border" />
                )}
              </div>
              <span className={`text-[11px] font-medium ${isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current step info */}
      <div className="bg-background rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-foreground">
            {stepLabels[step] ?? step}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>~3 min</span>
          </div>
        </div>
        {txHash && (
          <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground">Tx Hash</span>
            <a
              href={getExplorerTxUrl(fromChainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline font-mono"
            >
              {formatAddress(txHash)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
}
