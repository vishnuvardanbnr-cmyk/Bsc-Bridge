import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, Clock, ExternalLink, AlertTriangle, Fuel, CheckCircle2, RotateCcw, Wallet } from 'lucide-react';
import { BSC_CHAIN_ID, MCHAIN_CHAIN_ID, getRpcUrl } from '../lib/chains';
import { CONTRACTS, getExplorerAddressUrl } from '../lib/contracts';
import { useWeb3Bridge } from '../hooks/useWeb3Bridge';
import { useBridge } from '../hooks/useBridge';
import { useGasSubsidy } from '../hooks/useGasSubsidy';
import { BridgeProgress } from './BridgeProgress';
import { formatAmount, formatAddress, cn, evmToMxcAddress } from '../lib/utils';
import { SiBinance } from 'react-icons/si';

const BRIDGE_FEE = 0.01;
const MC_USD_PRICE = 1;
const MIN_AMOUNT = 5;

const USDT_ABI = [
  'function balanceOf(address account) view returns (uint256)',
];

// ── Recovery panel for stuck bridge transactions ──────────────────────────────
function RecoveryPanel() {
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<'mchain' | 'bsc'>('mchain');
  const [txHash, setTxHash] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleRecover = useCallback(async () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      setStatus('error');
      setMessage('Please enter a valid 0x transaction hash (66 characters)');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/bridge/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, chain }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setStatus('ok');
        setMessage(data.message ?? 'Recovery submitted — check your wallet shortly');
      } else {
        setStatus('error');
        setMessage(data.error ?? 'Recovery failed');
      }
    } catch {
      setStatus('error');
      setMessage('Network error — please try again');
    }
  }, [txHash, chain]);

  const descriptions = {
    mchain: 'Submitted a MChain → BSC withdrawal but didn\'t receive USDT on BSC.',
    bsc:    'Submitted a BSC → MChain deposit but didn\'t receive mUSDT on MChain.',
  };
  const placeholders = {
    mchain: '0x... (MChain withdrawal tx hash)',
    bsc:    '0x... (BSC deposit tx hash)',
  };

  return (
    <div className="mt-4 border-t border-border/40 pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        Transaction stuck? Recover it here
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 flex flex-col gap-2">
              <div className="flex rounded-lg overflow-hidden border border-border text-xs font-semibold">
                <button
                  onClick={() => { setChain('mchain'); setStatus('idle'); setMessage(''); }}
                  className={cn('flex-1 py-1.5 transition-colors', chain === 'mchain' ? 'bg-primary text-white' : 'bg-surface-raised text-muted-foreground hover:text-foreground')}
                >
                  MChain → BSC
                </button>
                <button
                  onClick={() => { setChain('bsc'); setStatus('idle'); setMessage(''); }}
                  className={cn('flex-1 py-1.5 transition-colors', chain === 'bsc' ? 'bg-primary text-white' : 'bg-surface-raised text-muted-foreground hover:text-foreground')}
                >
                  BSC → MChain
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{descriptions[chain]}</p>
              <input
                type="text"
                placeholder={placeholders[chain]}
                value={txHash}
                onChange={e => { setTxHash(e.target.value.trim()); setStatus('idle'); }}
                className="bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary w-full placeholder:text-muted-foreground/50"
              />
              {status === 'ok' && (
                <p className="text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {message}
                </p>
              )}
              {status === 'error' && (
                <p className="text-xs text-danger flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {message}
                </p>
              )}
              <button
                onClick={handleRecover}
                disabled={status === 'loading' || !txHash}
                className={cn(
                  'rounded-lg py-2 text-xs font-bold transition-all',
                  status === 'loading' || !txHash
                    ? 'bg-surface-raised text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-primary text-white hover:opacity-90'
                )}
              >
                {status === 'loading' ? 'Processing…' : 'Recover Transaction'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChainBadge({ chainId }: { chainId: number }) {
  const isBsc = chainId === BSC_CHAIN_ID;
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
};

export function BridgeWidget() {
  const { account, currentChainId, isConnected, connect, switchChain } = useWeb3Bridge();

  const [fromChainId, setFromChainId] = useState(BSC_CHAIN_ID);
  const [toChainId, setToChainId] = useState(MCHAIN_CHAIN_ID);
  const [amount, setAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [balance, setBalance] = useState(0);

  const numAmount = Number(amount) || 0;

  // Auto-set direction when connected chain changes
  useEffect(() => {
    if (!currentChainId) return;
    if (currentChainId === BSC_CHAIN_ID) {
      setFromChainId(BSC_CHAIN_ID);
      setToChainId(MCHAIN_CHAIN_ID);
    } else if (currentChainId === MCHAIN_CHAIN_ID) {
      setFromChainId(MCHAIN_CHAIN_ID);
      setToChainId(BSC_CHAIN_ID);
    }
  }, [currentChainId]);

  // Pre-fill destination address
  useEffect(() => {
    if (!account) return;
    if (toChainId === MCHAIN_CHAIN_ID) {
      setDestinationAddress(evmToMxcAddress(account));
    } else {
      setDestinationAddress(account);
    }
  }, [account, toChainId]);

  // Read USDT balance from direct RPC
  useEffect(() => {
    if (!account) { setBalance(0); return; }
    const tokenAddress = fromChainId === BSC_CHAIN_ID ? CONTRACTS.bsc.token : CONTRACTS.mchain.token;
    const rpcUrl = getRpcUrl(fromChainId);
    let cancelled = false;

    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(tokenAddress, USDT_ABI, provider);
        const raw: bigint = await contract.balanceOf(account);
        if (!cancelled) setBalance(Number(ethers.formatUnits(raw, 18)));
      } catch {
        if (!cancelled) setBalance(0);
      }
    })();

    return () => { cancelled = true; };
  }, [account, fromChainId]);

  // ── MChain → BSC liquidity pre-check ────────────────────────────────────────
  const [bscLiquidity, setBscLiquidity] = useState<{ sufficient: boolean; bridgeBalance: string } | null>(null);
  const liquidityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fromChainId === MCHAIN_CHAIN_ID && numAmount >= MIN_AMOUNT) {
      if (liquidityDebounce.current) clearTimeout(liquidityDebounce.current);
      setBscLiquidity(null);
      liquidityDebounce.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/bridge/bsc-liquidity?amount=${numAmount}`);
          if (res.ok) {
            const data = await res.json() as { sufficient: boolean; bridgeBalance: string };
            setBscLiquidity(data);
          }
        } catch {
          // silently ignore
        }
      }, 600);
    } else {
      setBscLiquidity(null);
    }
    return () => { if (liquidityDebounce.current) clearTimeout(liquidityDebounce.current); };
  }, [fromChainId, numAmount]);

  const insufficientBscLiquidity = fromChainId === MCHAIN_CHAIN_ID && bscLiquidity !== null && !bscLiquidity.sufficient;

  const gasSubsidy = useGasSubsidy();
  const { step, error, txHash, handleBridge, reset: resetBridge } = useBridge(
    fromChainId, toChainId, amount, destinationAddress, account
  );

  const isBsc = fromChainId === BSC_CHAIN_ID;
  const bridgeAddress = isBsc ? CONTRACTS.bsc.bridge : CONTRACTS.mchain.bridge;

  const hasInsufficientBalance = numAmount > balance && balance > 0;
  const isBelowMin = numAmount > 0 && numAmount < MIN_AMOUNT;

  // Destination is always auto-filled and valid when present
  const isDestinationInvalid = false;

  const estimatedReceive = numAmount > 0 ? numAmount * (1 - BRIDGE_FEE) : 0;
  const usdValue = (numAmount * MC_USD_PRICE).toFixed(2);
  const feeAmount = (numAmount * BRIDGE_FEE).toFixed(4);

  const handleSwap = () => {
    const newFrom = toChainId;
    setFromChainId(newFrom);
    setToChainId(fromChainId);
    switchChain(newFrom);
  };

  const handleReset = () => {
    resetBridge();
    gasSubsidy.reset();
  };

  const handleStart = async () => {
    if (!account) return;
    if (isBsc) {
      const ready = await gasSubsidy.ensureGas(account, amount);
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
    if (insufficientBscLiquidity) return { label: 'Insufficient BSC Liquidity', disabled: true, action: 'none' as const };
    if (isGasLoading) return { label: GAS_STEP_LABELS[gasSubsidy.step] ?? 'Preparing…', disabled: true, action: 'none' as const };
    return { label: `Bridge ${formatAmount(numAmount)} USDT`, disabled: false, action: 'bridge' as const };
  };

  const btnState = getButtonState();

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl shadow-black/40 w-full max-w-lg mx-auto relative overflow-hidden">
      <AnimatePresence mode="wait">

        {/* Balance checking overlay */}
        {isGasLoading && (
          <motion.div
            key="gas-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#111827] rounded-2xl z-20 flex flex-col items-center justify-center gap-4 p-8"
          >
            <div className="w-14 h-14 rounded-full bg-[#0c2a3f] border border-primary/60 flex items-center justify-center">
              <Fuel className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground mb-1">Checking your balance…</p>
              <p className="text-xs text-muted-foreground">Verifying USDT and BNB balances</p>
            </div>
          </motion.div>
        )}

        {/* Gas subsidy error banner */}
        {gasSubsidy.step === 'error' && gasSubsidy.error && (
          <motion.div
            key="gas-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 right-4 z-20 bg-[#2A0E0E] border border-red-900 rounded-xl p-3 flex items-center justify-between gap-2"
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

              {/* Swap button */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <button
                  data-testid="swap-chains-btn"
                  onClick={handleSwap}
                  className="w-8 h-8 rounded-full bg-surface border-2 border-border flex items-center justify-center hover:border-primary hover:text-primary transition-all shadow-md"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
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
            {insufficientBscLiquidity && (
              <div className="mb-3 bg-[#2A1A00] border border-amber-800 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-400 text-xs font-semibold">Insufficient BSC liquidity</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">
                    The BSC bridge currently holds only ${bscLiquidity?.bridgeBalance} USDT — not enough to cover your withdrawal. Please try again later.
                  </p>
                </div>
              </div>
            )}

            {/* Destination Address */}
            <div className="bg-surface-raised border border-border rounded-xl p-4 mb-5">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Your {isBsc ? 'MChain' : 'BSC'} address (destination)
                </span>
                <input
                  data-testid="destination-address-input"
                  type="text"
                  placeholder={isBsc ? 'mxc1... (your MChain wallet address)' : '0x... (your BSC wallet address)'}
                  value={destinationAddress}
                  readOnly
                  onChange={() => {}}
                  className="bg-transparent text-sm font-mono text-foreground outline-none w-full placeholder:text-muted-foreground/40 cursor-default select-all"
                />
              </div>
            </div>

            {/* Bridge Details */}
            <div className="mb-5">
              <p className="py-2 text-sm font-semibold text-muted-foreground">Bridge Details</p>
              <div className="flex flex-col gap-3 pb-1">
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
            </div>

            {/* Action Button */}
            {btnState.action === 'connect' ? (
              <button
                data-testid="connect-wallet-btn"
                onClick={connect}
                className="w-full rounded-xl py-4 font-bold bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <Wallet className="w-5 h-5" />
                Connect Wallet
              </button>
            ) : (
              <button
                data-testid="bridge-action-btn"
                disabled={btnState.disabled}
                onClick={handleStart}
                className={cn(
                  'w-full rounded-xl py-4 font-bold transition-all shadow-lg',
                  btnState.disabled
                    ? hasInsufficientBalance
                      ? 'bg-[#2A0E0E] text-red-400 border border-red-900 shadow-none cursor-not-allowed'
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

            <RecoveryPanel />

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
