/**
 * MetaMorpho (Morpho Vaults v1.x) extensions on top of ERC-4626 — the reads
 * needed for the fee display (gross − fee = net, HANDOFF §6) and for the
 * vault's market allocation (utilization, liquidity, collateral mix).
 *
 * TODO: confirm which Morpho vault version is deployed on Robinhood Chain.
 * Morpho Vaults V2 use a different fee/allocation interface.
 */
export const metaMorphoAbi = [
  { type: 'function', name: 'MORPHO', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'curator', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  /** Performance fee, WAD-scaled (1e18 = 100%). */
  { type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint96' }] },
  { type: 'function', name: 'feeRecipient', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'function',
    name: 'supplyQueueLength',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'supplyQueue',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'withdrawQueueLength',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdrawQueue',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'config',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'cap', type: 'uint184' },
      { name: 'enabled', type: 'bool' },
      { name: 'removableAt', type: 'uint64' },
    ],
  },
] as const;

/** WAD-scaled fee (1e18 = 100%) → fraction, e.g. 1e17 → 0.1. */
export function wadToFraction(wad: bigint): number {
  return Number(wad) / 1e18;
}
