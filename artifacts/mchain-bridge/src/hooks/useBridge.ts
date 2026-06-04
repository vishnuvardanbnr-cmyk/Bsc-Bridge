import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { BSC_CHAIN_ID, MCHAIN_CHAIN_ID, getMchainRpc, BSC_RPC } from '../lib/chains';
import { CONTRACTS } from '../lib/contracts';

export type BridgeStep = 'idle' | 'approving' | 'sending' | 'relaying' | 'done' | 'failed';

const USDT_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const BRIDGE_ABI = [
  'function deposit(uint256 amount, string destinationAddress)',
  'function withdraw(uint256 amount, string destinationAddress)',
];

function toHex(n: number | bigint): string {
  return '0x' + BigInt(n).toString(16);
}

async function waitForTx(txHash: string, chainId: number): Promise<void> {
  const rpcUrl = chainId === MCHAIN_CHAIN_ID ? getMchainRpc() : BSC_RPC;
  for (let i = 0; i < 120; i++) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_getTransactionReceipt',
        params: [txHash], id: 1,
      }),
    });
    const data = await res.json() as { result?: { status: string } | null };
    if (data.result) {
      if (data.result.status === '0x0') throw new Error('Transaction reverted on-chain');
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error('Timeout waiting for transaction confirmation');
}

// Builds and sends a raw type-0 transaction on MChain, bypassing the wallet's
// broken eth_estimateGas / gasPrice calls.  Signs via eth_signTransaction and
// broadcasts directly, with eth_sendTransaction as fallback for wallets that
// don't support signing without broadcasting.
async function sendRawTxOnMchain(
  signer: ethers.JsonRpcSigner,
  to: string,
  data: string,
  gasLimit = 300_000,
): Promise<string> {
  const rpcUrl = getMchainRpc();
  const addr = await signer.getAddress();

  const [nonceRes, gasPriceRes] = await Promise.all([
    fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [addr, 'pending'], id: 1 }),
    }).then(r => r.json()),
    fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 }),
    }).then(r => r.json()),
  ]);

  const nonce = parseInt((nonceRes as any).result, 16);
  const gasPriceBn = (gasPriceRes as any).result
    ? BigInt((gasPriceRes as any).result)
    : 1_000_000_000n;

  const txParams = {
    from: addr, to, data,
    gas: toHex(gasLimit),
    gasPrice: toHex(gasPriceBn),
    nonce: toHex(nonce),
    value: '0x0',
    chainId: toHex(MCHAIN_CHAIN_ID),
  };

  const ethereum = (window as any).ethereum;

  try {
    const signed: string = await ethereum.request({
      method: 'eth_signTransaction',
      params: [txParams],
    });
    const resp = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_sendRawTransaction',
        params: [signed], id: 1,
      }),
    });
    const rpcData = await resp.json() as { result?: string; error?: { message?: string } };
    if (rpcData.error) throw new Error(rpcData.error.message ?? 'Broadcast failed');
    return rpcData.result as string;
  } catch (signErr: any) {
    if (signErr?.code === 4001 || signErr?.code === 'ACTION_REJECTED') throw signErr;
  }

  return await ethereum.request({ method: 'eth_sendTransaction', params: [txParams] }) as string;
}

export function useBridge(
  fromChainId: number,
  toChainId: number,
  amount: string,
  destinationAddress: string,
  account: string | null,
) {
  const [step, setStep] = useState<BridgeStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | undefined>();

  const isMchain = fromChainId === MCHAIN_CHAIN_ID;
  const tokenAddress = isMchain ? CONTRACTS.mchain.token : CONTRACTS.bsc.token;
  const bridgeAddress = isMchain ? CONTRACTS.mchain.bridge : CONTRACTS.bsc.bridge;

  const parsedAmount = amount && !isNaN(Number(amount)) && Number(amount) > 0
    ? ethers.parseUnits(amount, 18)
    : 0n;

  const handleBridge = useCallback(async () => {
    if (!amount || !account || !destinationAddress) return;
    setError(null);

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError('No wallet found. Please install MetaMask.');
      setStep('failed');
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const rpcUrl = isMchain ? getMchainRpc() : BSC_RPC;
      const readProvider = new ethers.JsonRpcProvider(rpcUrl);
      const usdt = new ethers.Contract(tokenAddress, USDT_ABI, readProvider);

      const allowance: bigint = await usdt.allowance(account, bridgeAddress);

      if (allowance < parsedAmount) {
        setStep('approving');
        const usdtIface = new ethers.Interface(USDT_ABI);
        const approveData = usdtIface.encodeFunctionData('approve', [bridgeAddress, ethers.MaxUint256]);

        let approveHash: string;
        if (isMchain) {
          approveHash = await sendRawTxOnMchain(signer, tokenAddress, approveData, 100_000);
        } else {
          const bscUsdt = new ethers.Contract(tokenAddress, USDT_ABI, signer);
          const tx = await (bscUsdt.approve as any)(bridgeAddress, ethers.MaxUint256);
          approveHash = tx.hash;
        }
        setTxHash(approveHash);
        await waitForTx(approveHash, fromChainId);
      }

      setStep('sending');
      const bridgeIface = new ethers.Interface(BRIDGE_ABI);
      let sendHash: string;

      if (isMchain) {
        const withdrawData = bridgeIface.encodeFunctionData('withdraw', [parsedAmount, destinationAddress]);
        sendHash = await sendRawTxOnMchain(signer, bridgeAddress, withdrawData, 300_000);
      } else {
        const bscBridge = new ethers.Contract(bridgeAddress, BRIDGE_ABI, signer);
        const tx = await (bscBridge.deposit as any)(parsedAmount, destinationAddress);
        sendHash = tx.hash;
      }

      setTxHash(sendHash);
      setStep('relaying');

      fetch('/api/bridge/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: sendHash, chain: isMchain ? 'mchain' : 'bsc' }),
      }).catch(() => {});

      setTimeout(() => setStep('done'), 15_000);
    } catch (err: any) {
      const msg: string = err?.shortMessage ?? err?.message ?? 'Transaction failed';
      const isRejected = msg.includes('user rejected') ||
        msg.includes('ACTION_REJECTED') ||
        err?.code === 4001 ||
        err?.code === 'ACTION_REJECTED';
      setError(isRejected ? 'Transaction cancelled by user' : msg);
      setStep('failed');
    }
  }, [amount, account, destinationAddress, parsedAmount, tokenAddress, bridgeAddress, isMchain, fromChainId]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return { step, error, txHash, handleBridge, reset };
}
