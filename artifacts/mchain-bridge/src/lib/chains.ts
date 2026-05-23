import { getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { bsc } from 'wagmi/chains';
import { defineChain } from 'viem';

export const mchain = defineChain({
  id: 1888,
  name: 'MChain',
  nativeCurrency: { name: 'MChain', symbol: 'MC', decimals: 18 },
  rpcUrls: { default: { http: ['https://node.mymchain.com'] } },
  blockExplorers: { default: { name: 'MChain Explorer', url: 'https://explorer.mchain.network' } },
});

export const wagmiConfig = getDefaultConfig({
  appName: 'MChain Bridge',
  projectId: 'mchain-bridge-placeholder',
  chains: [bsc, mchain],
});

export const rainbowTheme = darkTheme({
  accentColor: '#0EA5E9',
  accentColorForeground: 'white',
  borderRadius: 'large',
  overlayBlur: 'small',
});

export const SUPPORTED_CHAINS = [bsc, mchain] as const;
