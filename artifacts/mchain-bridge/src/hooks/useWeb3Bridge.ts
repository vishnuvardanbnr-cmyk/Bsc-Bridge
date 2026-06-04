import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { BSC_NETWORK, MCHAIN_NETWORK, BSC_CHAIN_ID, MCHAIN_CHAIN_ID } from '../lib/chains';

export function useWeb3Bridge() {
  const [account, setAccount] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);

  const getSigner = useCallback(async (): Promise<ethers.JsonRpcSigner> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) throw new Error('No wallet found. Please install MetaMask.');
    const provider = new ethers.BrowserProvider(ethereum);
    return provider.getSigner();
  }, []);

  const readChainId = useCallback(async (): Promise<number | null> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return null;
    try {
      const hex: string = await ethereum.request({ method: 'eth_chainId' });
      return parseInt(hex, 16);
    } catch {
      return null;
    }
  }, []);

  const switchChain = useCallback(async (chainId: number): Promise<void> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    const network = chainId === MCHAIN_CHAIN_ID ? MCHAIN_NETWORK : BSC_NETWORK;
    const chainHex = network.chainId;
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
    } catch (err: any) {
      if (err?.code === 4902) {
        try {
          await ethereum.request({ method: 'wallet_addEthereumChain', params: [network] });
        } catch { }
      }
      try {
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [network] });
      } catch { }
    }
    const newId = await readChainId();
    if (newId !== null) setCurrentChainId(newId);
  }, [readChainId]);

  const connect = useCallback(async (): Promise<void> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert('No wallet found. Please install MetaMask or another Web3 wallet.');
      return;
    }
    try {
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        const chainId = await readChainId();
        if (chainId !== null) setCurrentChainId(chainId);
      }
    } catch (err) {
      console.error('Connect error:', err);
    }
  }, [readChainId]);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        readChainId().then(id => { if (id !== null) setCurrentChainId(id); });
      }
    });

    const onAccountsChanged = (accounts: string[]) => {
      setAccount(accounts.length > 0 ? accounts[0] : null);
    };
    const onChainChanged = (chainHex: string) => {
      setCurrentChainId(parseInt(chainHex, 16));
    };

    ethereum.on('accountsChanged', onAccountsChanged);
    ethereum.on('chainChanged', onChainChanged);
    return () => {
      ethereum.removeListener('accountsChanged', onAccountsChanged);
      ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, [readChainId]);

  return {
    account,
    currentChainId,
    isConnected: !!account,
    connect,
    switchChain,
    getSigner,
  };
}
