import { Link2, Wallet } from 'lucide-react';
import { useWeb3Bridge } from '../hooks/useWeb3Bridge';
import { BSC_CHAIN_ID, MCHAIN_CHAIN_ID } from '../lib/chains';

function chainName(chainId: number | null): string {
  if (chainId === BSC_CHAIN_ID) return 'BSC';
  if (chainId === MCHAIN_CHAIN_ID) return 'MChain';
  return 'Unknown';
}

export function TopBar() {
  const { account, currentChainId, connect } = useWeb3Bridge();

  const shortAddr = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-lg">
        <div className="flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary" data-testid="logo-icon" />
          <span className="font-bold text-lg text-foreground tracking-tight" data-testid="logo-text">
            MChain Bridge
          </span>
        </div>

        {account ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              {chainName(currentChainId)}
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-raised border border-border text-xs font-mono text-foreground"
              data-testid="wallet-address"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              {shortAddr}
            </div>
          </div>
        ) : (
          <button
            data-testid="topbar-connect-btn"
            onClick={connect}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
