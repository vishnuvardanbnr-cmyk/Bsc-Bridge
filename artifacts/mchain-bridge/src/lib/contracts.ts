export const CONTRACTS = {
  bsc: {
    bridge: '0x0000000000000000000000000000000000000003' as const,
    token: '0x0000000000000000000000000000000000000001' as const,
  },
  mchain: {
    bridge: '0x0000000000000000000000000000000000000004' as const,
    token: '0x0000000000000000000000000000000000000002' as const,
  }
};

export const erc20Abi = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  }
] as const;

export const bridgeAbi = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' }
    ],
    name: 'bridge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  }
] as const;
