import { useState } from 'react';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, Clock, ExternalLink, ChevronDown } from 'lucide-react';
import { bsc } from 'wagmi/chains';
import { mchain } from '../lib/chains';
import { CONTRACTS } from '../lib/contracts';
import { useBridge } from '../hooks/useBridge';
import { ChainSelectorModal } from './ChainSelectorModal';
import { BridgeProgress } from './BridgeProgress';
import { formatAmount, formatAddress, cn } from '../lib/utils';
import { SiBinance } from 'react-icons/si';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function BridgeWidget() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  
  const [fromChainId, setFromChainId] = useState(bsc.id);
  const [toChainId, setToChainId] = useState(mchain.id);
  const [amount, setAmount] = useState('');
  
  const [isFromModalOpen, setIsFromModalOpen] = useState(false);
  const [isToModalOpen, setIsToModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { step, error, txHash, handleBridge, reset, needsApproval } = useBridge(fromChainId, toChainId, amount);

  const isBsc = fromChainId === bsc.id;
  const tokenAddress = isBsc ? CONTRACTS.bsc.token : CONTRACTS.mchain.token;
  
  const { data: balanceData } = useBalance({
    address,
    token: tokenAddress,
    chainId: fromChainId,
    query: { enabled: !!address }
  });

  const balance = balanceData ? Number(balanceData.formatted) : 0;
  const numAmount = Number(amount) || 0;
  
  const hasInsufficientBalance = numAmount > balance;
  const isBelowMin = numAmount > 0 && numAmount < 1;
  const isWrongNetwork = chain?.id !== fromChainId;

  const estimatedAmount = numAmount > 0 ? numAmount * 0.997 : 0;
  const usdValue = (numAmount * 0.05).toFixed(2);
  const feeInMC = (numAmount * 0.003).toFixed(4);

  const handleSwap = () => {
    setFromChainId(toChainId);
    setToChainId(fromChainId);
  };

  const getButtonState = () => {
    if (!isConnected) return { label: 'Connect Wallet', disabled: false, action: 'connect' };
    if (isWrongNetwork) return { label: `Switch to ${isBsc ? 'BSC' : 'MChain'}`, disabled: false, action: 'switch' };
    if (!amount || numAmount === 0) return { label: 'Enter Amount', disabled: true, action: 'none' };
    if (hasInsufficientBalance) return { label: 'Insufficient Balance', disabled: true, action: 'none' };
    if (isBelowMin) return { label: 'Minimum 1 MC', disabled: true, action: 'none' };
    if (step === 'approving') return { label: 'Approving...', disabled: true, action: 'none' };
    if (step === 'sending') return { label: 'Bridging...', disabled: true, action: 'none' };
    if (step === 'relaying') return { label: 'Waiting for Confirmation...', disabled: true, action: 'none' };
    if (needsApproval) return { label: `Approve & Bridge`, disabled: false, action: 'bridge' };
    return { label: `Bridge ${formatAmount(numAmount)} MC`, disabled: false, action: 'bridge' };
  };

  const btnState = getButtonState();

  const handleMainAction = () => {
    if (btnState.action === 'switch' && switchChain) {
      switchChain({ chainId: fromChainId });
    } else if (btnState.action === 'bridge') {
      handleBridge();
    }
  };

  const renderChainSelect = (type: 'from' | 'to') => {
    const chainId = type === 'from' ? fromChainId : toChainId;
    const isBscSel = chainId === bsc.id;
    return (
      <button
        onClick={() => type === 'from' ? setIsFromModalOpen(true) : setIsToModalOpen(true)}
        className="flex items-center gap-2 hover:bg-surface-raised px-2 py-1 rounded-lg transition-colors"
      >
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-background border border-border">
          {isBscSel ? (
            <SiBinance className="text-[#F3BA2F] w-3 h-3" />
          ) : (
            <div className="text-[10px] font-bold text-white bg-primary w-full h-full rounded-full flex items-center justify-center">
              MC
            </div>
          )}
        </div>
        <span className="font-semibold text-foreground text-sm">{isBscSel ? 'BSC' : 'MChain'}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl shadow-black/40 w-full max-w-lg mx-auto relative overflow-hidden">
      <AnimatePresence mode="wait">
        {step !== 'idle' ? (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BridgeProgress 
              step={step} 
              amount={amount} 
              fromChainId={fromChainId} 
              toChainId={toChainId} 
              txHash={txHash}
              error={error}
              onReset={reset}
            />
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            
            {/* Chain Selector */}
            <div className="relative flex flex-col gap-2 mb-6">
              <div className="bg-surface-raised border border-border rounded-xl p-4 flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">FROM</span>
                  {renderChainSelect('from')}
                </div>
                {isConnected && (
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block mb-1">Balance</span>
                    <span className="text-sm font-semibold text-foreground font-mono">{formatAmount(balance)}</span>
                  </div>
                )}
              </div>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <motion.button
                  whileTap={{ rotate: 180 }}
                  onClick={handleSwap}
                  className="w-10 h-10 rounded-full bg-surface-raised border-4 border-surface flex items-center justify-center hover:border-primary/50 transition-colors"
                >
                  <ArrowLeftRight className="w-4 h-4 text-primary" />
                </motion.button>
              </div>

              <div className="bg-surface-raised border border-border rounded-xl p-4 flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">TO</span>
                  {renderChainSelect('to')}
                </div>
              </div>
            </div>

            {/* Input */}
            <div className={cn(
              "bg-surface-raised border rounded-xl p-4 mb-4 transition-colors",
              hasInsufficientBalance ? "border-danger focus-within:border-danger" : "border-border focus-within:border-primary"
            )}>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-lg border border-border">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">MC</div>
                  <span className="font-semibold text-sm">MC</span>
                </div>
                <input
                  type="text"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    if (val.split('.').length > 2) return;
                    setAmount(val);
                  }}
                  className="bg-transparent text-right text-2xl font-bold font-mono text-foreground outline-none w-1/2"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {numAmount > 0 ? `~$${usdValue}` : '$0.00'}
                </span>
                <button
                  onClick={() => setAmount(balance.toString())}
                  className="text-xs font-bold text-primary hover:text-primary-hover bg-primary/10 px-2 py-1 rounded-md transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {hasInsufficientBalance && (
              <p className="text-danger text-xs font-semibold mt- -mb-2 text-right">Insufficient balance</p>
            )}
            {isBelowMin && !hasInsufficientBalance && (
              <p className="text-warning text-xs font-semibold mt- -mb-2 text-right">Minimum bridge amount is 1 MC</p>
            )}

            {/* You Receive */}
            <div className="bg-background border border-border/50 rounded-xl p-4 my-6">
              <span className="text-xs font-semibold text-muted-foreground block mb-1">YOU RECEIVE (estimated)</span>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold text-foreground font-mono">
                  ~ {formatAmount(estimatedAmount)} MC
                </span>
              </div>
              <span className="text-xs text-muted-foreground mt-2 block">0.3% bridge fee applied</span>
            </div>

            {/* Details Accordion */}
            <div className="mb-6">
              <button 
                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                className="flex items-center justify-between w-full py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Bridge Details</span>
                <motion.div animate={{ rotate: isDetailsOpen ? 180 : 0 }}>
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>
              <AnimatePresence>
                {isDetailsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Bridge Fee</span>
                        <span className="text-[13px] font-semibold text-foreground">0.3% ({feeInMC} MC)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Estimated Time</span>
                        <span className="text-[13px] font-semibold text-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> ~3 minutes
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Route</span>
                        <span className="text-[13px] font-semibold text-foreground">
                          {isBsc ? 'BSC to MChain' : 'MChain to BSC'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Contract</span>
                        <a href="#" className="text-[13px] font-semibold text-primary hover:underline flex items-center gap-1 font-mono">
                          {formatAddress(isBsc ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Button */}
            {btnState.action === 'connect' ? (
              <div className="w-full flex justify-center [&_button]:w-full [&_button]:py-4 [&_button]:rounded-xl [&_button]:font-bold">
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="w-full rounded-xl py-4 font-bold bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
            ) : (
              <button
                disabled={btnState.disabled}
                onClick={handleMainAction}
                className={cn(
                  "w-full rounded-xl py-4 font-bold transition-all shadow-lg",
                  btnState.disabled 
                    ? (hasInsufficientBalance 
                        ? "bg-danger/20 text-danger border border-danger/50 shadow-none cursor-not-allowed" 
                        : "bg-surface-raised text-muted-foreground shadow-none cursor-not-allowed")
                    : btnState.action === 'switch'
                      ? "bg-gradient-to-br from-warning to-amber-600 text-white shadow-warning/20 hover:shadow-warning/40"
                      : "bg-gradient-to-br from-primary to-primary-hover text-white shadow-primary/20 hover:shadow-primary/40"
                )}
              >
                {btnState.label}
              </button>
            )}

            <p className="text-xs text-muted-foreground text-center mt-4 px-4">
              By bridging you agree to the terms of the smart contract. Transactions are irreversible.
            </p>

          </motion.div>
        )}
      </AnimatePresence>

      <ChainSelectorModal
        open={isFromModalOpen}
        onOpenChange={setIsFromModalOpen}
        selectedChainId={fromChainId}
        onSelectChain={(id) => {
          if (id === toChainId) handleSwap();
          else setFromChainId(id);
        }}
      />
      
      <ChainSelectorModal
        open={isToModalOpen}
        onOpenChange={setIsToModalOpen}
        selectedChainId={toChainId}
        onSelectChain={(id) => {
          if (id === fromChainId) handleSwap();
          else setToChainId(id);
        }}
      />
    </div>
  );
}
