import { useState, useEffect } from 'react';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, Clock, ExternalLink, ChevronDown, AlertTriangle, Fuel, CheckCircle2 } from 'lucide-react';
import { bsc } from 'wagmi/chains';
import { mchain } from '../lib/chains';
import { CONTRACTS, getExplorerAddressUrl } from '../lib/contracts';
import { useBridge } from '../hooks/useBridge';
import { useGasSubsidy } from '../hooks/useGasSubsidy';
import { BridgeProgress } from './BridgeProgress';
import { formatAmount, formatAddress, cn } from '../lib/utils';
import { SiBinance } from 'react-icons/si';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const BRIDGE_FEE = 0.01;
const MC_USD_PRICE = 1;
const MIN_AMOUNT = 1;

function ChainBadge({ chainId }: { chainId: number }) {
  const isBsc = chainId === bsc.id;
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-background border border-border overflow-hidden flex-shrink-0">
        {isBsc ? (
          <SiBinance className="text-[#F3BA2F] w-4 h-4" />
        ) : (
          <div className="text-[9px] font-bold text-white bg-primary w-full h-full rounded-full flex items-center justify-center">
            MC
          </div>
        )}
      </div>
      <span className="font-semibold text-foreground text-sm">{isBsc ? 'BSC' : 'MChain'}</span>
    </div>
  );
}

const GAS_STEP_LABELS: Record<string, string> = {
  checking: 'Checking your balance…',
  funding: 'Sending gas to your wallet…',
  'waiting-bnb': 'Waiting for BNB to confirm…',
};

export function BridgeWidget() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [fromChainId, setFromChainId] = useState(bsc.id);
  const [toChainId, setToChainId] = useState(mchain.id);
  const [amount, setAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Auto-set direction whenever the connected chain changes
  useEffect(() => {
    if (!chain) return;
    if (chain.id === bsc.id) {
      setFromChainId(bsc.id);
      setToChainId(mchain.id);
    } else if (chain.id === mchain.id) {
      setFromChainId(mchain.id);
      setToChainId(bsc.id);
    }
  }, [chain?.id]);

  const gasSubsidy = useGasSubsidy();
  const { step, error, txHash, handleBridge, reset: resetBridge, needsApproval } = useBridge(
    fromChainId, toChainId, amount, destinationAddress
  );

  const isBsc = fromChainId === bsc.id;
  const tokenAddress = isBsc ? CONTRACTS.bsc.token : CONTRACTS.mchain.token;
  const bridgeAddress = isBsc ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;

  const { data: balanceData } = useBalance({
    address,
    token: tokenAddress,
    chainId: fromChainId,
    query: { enabled: !!address },
  });

  const balance = balanceData ? Number(balanceData.formatted) : 0;
  const numAmount = Number(amount) || 0;

  const hasInsufficientBalance = numAmount > balance && balance > 0;
  const isBelowMin = numAmount > 0 && numAmount < MIN_AMOUNT;
  const isDestinationInvalid = destinationAddress.length > 0 && !destinationAddress.startsWith('0x');

  const estimatedReceive = numAmount > 0 ? numAmount * (1 - BRIDGE_FEE) : 0;
  const usdValue = (numAmount * MC_USD_PRICE).toFixed(2);
  const feeAmount = (numAmount * BRIDGE_FEE).toFixed(4);

  const handleSwap = () => {
    const newFrom = toChainId;
    setFromChainId(newFrom);
    setToChainId(fromChainId);
    if (switchChain) switchChain({ chainId: newFrom });
  };

  const handleReset = () => {
    resetBridge();
    gasSubsidy.reset();
  };

  // Main bridge action — runs gas check/fund first (BSC only), then bridge
  const handleStart = async () => {
    if (!address) return;

    // Only do gas subsidy check on BSC side (MChain has native gas)
    if (isBsc) {
      const ready = await gasSubsidy.ensureGas(address, amount);
      if (!ready) return;
    }

    handleBridge();
  };

  const isGasLoading = gasSubsidy.isActive;
  const bridgeInProgress = step !== 'idle';

  const getButtonState = () => {
    if (!isConnected) return { label: 'Connect Wallet', disabled: false, action: 'connect' as const };
    if (!amount || numAmount === 0) return { label: 'Enter Amount', disabled: true, action: 'none' as const };
    if (isBelowMin) return { label: `Minimum ${MIN_AMOUNT} USDT`, disabled: true, action: 'none' as const };
    if (hasInsufficientBalance) return { label: 'Insufficient Balance', disabled: true, action: 'none' as const };
    if (!destinationAddress || destinationAddress.length < 10) return { label: 'Enter Destination Address', disabled: true, action: 'none' as const };
    if (isDestinationInvalid) return { label: 'Invalid Destination Address', disabled: true, action: 'none' as const };
    if (isGasLoading) return { label: GAS_STEP_LABELS[gasSubsidy.step] ?? 'Preparing…', disabled: true, action: 'none' as const };
    if (needsApproval) return { label: 'Approve & Bridge', disabled: false, action: 'bridge' as const };
    return { label: `Bridge ${formatAmount(numAmount)} USDT`, disabled: false, action: 'bridge' as const };
  };

  const btnState = getButtonState();

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl shadow-black/40 w-full max-w-lg mx-auto relative overflow-hidden">
      <AnimatePresence mode="wait">

        {/* Gas subsidy loading overlay */}
        {isGasLoading && (
          <motion.div
            key="gas-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-surface/95 rounded-2xl z-20 flex flex-col items-center justify-center gap-4 p-8"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Fuel className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground mb-1">
                {GAS_STEP_LABELS[gasSubsidy.step] ?? 'Preparing…'}
              </p>
              {gasSubsidy.step === 'funding' && (
                <p className="text-xs text-muted-foreground">
                  Admin wallet is sending BNB for gas fees
                </p>
              )}
              {gasSubsidy.step === 'waiting-bnb' && (
                <p className="text-xs text-muted-foreground">
                  Waiting ~1 block for BNB to confirm before signing
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              {['checking', 'funding', 'waiting-bnb'].map((s, i) => {
                const steps = ['checking', 'funding', 'waiting-bnb'];
                const idx = steps.indexOf(gasSubsidy.step);
                return (
                  <div
                    key={s}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      i <= idx ? 'bg-primary' : 'bg-border'
                    )}
                  />
                );
              })}
            </div>
            {gasSubsidy.gasTxHash && (
              <p className="text-[10px] font-mono text-muted-foreground">
                Gas tx: {formatAddress(gasSubsidy.gasTxHash)}
              </p>
            )}
          </motion.div>
        )}

        {/* Gas subsidy error banner */}
        {gasSubsidy.step === 'error' && gasSubsidy.error && (
          <motion.div
            key="gas-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 right-4 z-20 bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 text-danger text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {gasSubsidy.error}
            </div>
            <button onClick={gasSubsidy.reset} className="text-danger hover:text-danger/70 text-xs underline flex-shrink-0">
              Dismiss
            </button>
          </motion.div>
        )}

        {bridgeInProgress ? (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BridgeProgress
              step={step}
              amount={amount}
              fromChainId={fromChainId}
              toChainId={toChainId}
              txHash={txHash}
              error={error}
              destinationAddress={destinationAddress}
              onReset={handleReset}
            />
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* FROM + TO rows */}
            <div className="relative flex flex-col gap-2 mb-5">
              {/* FROM */}
              <div className={cn(
                'bg-surface-raised border rounded-xl p-4 transition-colors',
                hasInsufficientBalance ? 'border-danger' : 'border-border focus-within:border-primary'
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">From</span>
                    <ChainBadge chainId={fromChainId} />
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-1">
                    <input
                      data-testid="amount-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        if (val.split('.').length > 2) return;
                        setAmount(val);
                      }}
                      className="bg-transparent text-right text-2xl font-bold font-mono text-foreground outline-none w-full placeholder:text-muted-foreground/40"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {numAmount > 0 ? `~$${usdValue}` : '$0.00'}
                      </span>
                      {isConnected && (
                        <button
                          data-testid="max-btn"
                          onClick={() => setAmount(balance.toFixed(6))}
                          className="text-[10px] font-bold text-primary hover:text-primary-hover bg-primary/10 px-2 py-0.5 rounded transition-colors"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isConnected && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                    <span className="text-[10px] text-muted-foreground">USDT Balance</span>
                    <span data-testid="from-balance" className="text-[11px] font-semibold text-foreground font-mono">
                      {formatAmount(balance)} USDT
                    </span>
                  </div>
                )}
              </div>

              {/* TO */}
              <div className="bg-surface-raised border border-border rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">To</span>
                  <ChainBadge chainId={toChainId} />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-2xl font-bold font-mono text-muted-foreground/50">
                    {estimatedReceive > 0 ? formatAmount(estimatedReceive) : '0.00'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {estimatedReceive > 0 ? `~$${(estimatedReceive * MC_USD_PRICE).toFixed(2)}` : '$0.00'}
                  </span>
                </div>
              </div>
            </div>

            {hasInsufficientBalance && (
              <p className="text-danger text-xs font-semibold mb-3 text-right flex items-center justify-end gap-1">
                <AlertTriangle className="w-3 h-3" /> Insufficient balance
              </p>
            )}
            {isBelowMin && !hasInsufficientBalance && (
              <p className="text-warning text-xs font-semibold mb-3 text-right flex items-center justify-end gap-1">
                <AlertTriangle className="w-3 h-3" /> Minimum bridge amount is {MIN_AMOUNT} USDT
              </p>
            )}

            {/* Destination Address */}
            <div className={cn(
              'bg-surface-raised border rounded-xl p-4 mb-5 transition-colors',
              isDestinationInvalid
                ? 'border-danger focus-within:border-danger'
                : 'border-border focus-within:border-primary'
            )}>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Your {isBsc ? 'MChain' : 'BSC'} address (destination)
                </span>
                <input
                  data-testid="destination-address-input"
                  type="text"
                  placeholder={`0x... (your ${isBsc ? 'MChain' : 'BSC'} wallet address)`}
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value.trim())}
                  className="bg-transparent text-sm font-mono text-foreground outline-none w-full placeholder:text-muted-foreground/40"
                />
                {isConnected && address && (
                  <button
                    data-testid="use-connected-address-btn"
                    onClick={() => setDestinationAddress(address)}
                    className="self-start text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
                  >
                    Use connected address
                  </button>
                )}
              </div>
            </div>
            {isDestinationInvalid && (
              <p className="text-danger text-xs font-semibold -mt-3 mb-3 text-right flex items-center justify-end gap-1">
                <AlertTriangle className="w-3 h-3" /> Invalid EVM address
              </p>
            )}

            {/* Gas subsidy info — shown when connected on BSC */}
            {isConnected && isBsc && gasSubsidy.checkResult && !gasSubsidy.checkResult.needsGas && (
              <div className="flex items-center gap-2 text-xs text-success mb-4">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Gas balance OK — you have enough BNB</span>
              </div>
            )}

            {/* Bridge Details accordion */}
            <div className="mb-5">
              <button
                data-testid="bridge-details-toggle"
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
                    <div className="pt-2 flex flex-col gap-3 pb-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Bridge Fee</span>
                        <span className="text-[13px] font-semibold text-foreground">
                          1% · {feeAmount} USDT
                        </span>
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
                          {isBsc ? 'BSC → MChain' : 'MChain → BSC'}
                        </span>
                      </div>
                      {isBsc && (
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] text-muted-foreground">Gas Subsidy</span>
                          <span className="text-[13px] font-semibold text-success flex items-center gap-1">
                            <Fuel className="w-3 h-3" /> Auto-funded if needed
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Contract</span>
                        <a
                          href={getExplorerAddressUrl(fromChainId, bridgeAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-semibold text-primary hover:underline flex items-center gap-1 font-mono"
                        >
                          {formatAddress(bridgeAddress)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-muted-foreground">Token</span>
                        <span className="text-[13px] font-semibold text-foreground">USDT</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Button */}
            {btnState.action === 'connect' ? (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button
                    data-testid="connect-wallet-btn"
                    onClick={openConnectModal}
                    className="w-full rounded-xl py-4 font-bold bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:opacity-90 transition-all"
                  >
                    Connect Wallet
                  </button>
                )}
              </ConnectButton.Custom>
            ) : (
              <button
                data-testid="bridge-action-btn"
                disabled={btnState.disabled}
                onClick={handleStart}
                className={cn(
                  'w-full rounded-xl py-4 font-bold transition-all shadow-lg',
                  btnState.disabled
                    ? hasInsufficientBalance
                      ? 'bg-danger/10 text-danger border border-danger/30 shadow-none cursor-not-allowed'
                      : 'bg-surface-raised text-muted-foreground shadow-none cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-br from-primary to-primary-hover text-white shadow-primary/20 hover:shadow-primary/40 hover:opacity-90'
                )}
              >
                {isGasLoading && (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 align-middle" />
                )}
                {btnState.label}
              </button>
            )}

            <p className="text-xs text-muted-foreground text-center mt-4 px-4 leading-relaxed">
              By bridging you agree to the terms of the smart contract. Transactions are irreversible.
            </p>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
