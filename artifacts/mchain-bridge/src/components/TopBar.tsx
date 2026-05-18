import { Link2 } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-lg">
        <div className="flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary" data-testid="logo-icon" />
          <span className="font-bold text-lg text-foreground tracking-tight" data-testid="logo-text">
            MChain Bridge
          </span>
        </div>
        <ConnectButton accountStatus="address" chainStatus="icon" />
      </div>
    </header>
  );
}
