import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { bech32 } from "bech32";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Convert an EVM 0x address to MXC bech32 format (mxc1...).
 * MChain uses the same 20-byte public key hash as Ethereum, just encoded differently.
 */
export function evmToMxcAddress(evmAddress: string): string {
  try {
    const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
    const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
    const words = bech32.toWords(bytes);
    return bech32.encode('mxc', words);
  } catch {
    return evmAddress;
  }
}

/**
 * Convert a MXC bech32 address back to 0x EVM format.
 */
export function mxcToEvmAddress(mxcAddress: string): string {
  try {
    const { words } = bech32.decode(mxcAddress);
    const bytes = bech32.fromWords(words);
    return '0x' + Buffer.from(bytes).toString('hex');
  } catch {
    return mxcAddress;
  }
}

export function formatAmount(amount: string | number, decimals = 2) {
  const num = Number(amount);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
