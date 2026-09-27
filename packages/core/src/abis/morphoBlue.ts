/**
 * Morpho Blue core — the subset Olvana reads (HANDOFF §4.3).
 * Market ids are bytes32 hashes of MarketParams.
 */
const marketParamsComponents = [
  { name: 'loanToken', type: 'address' },
  { name: 'collateralToken', type: 'address' },
  { name: 'oracle', type: 'address' },
  { name: 'irm', type: 'address' },
  { name: 'lltv', type: 'uint256' },
] as const;

const marketComponents = [
  { name: 'totalSupplyAssets', type: 'uint128' },
  { name: 'totalSupplyShares', type: 'uint128' },
  { name: 'totalBorrowAssets', type: 'uint128' },
  { name: 'totalBorrowShares', type: 'uint128' },
  { name: 'lastUpdate', type: 'uint128' },
  { name: 'fee', type: 'uint128' },
] as const;

export const morphoBlueAbi = [
  {
    type: 'function',
    name: 'market',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: marketComponents,
  },
  {
    type: 'function',
    name: 'idToMarketParams',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: marketParamsComponents,
  },
  {
    type: 'function',
    name: 'position',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint128' },
      { name: 'collateral', type: 'uint128' },
    ],
  },
] as const;

/** Morpho oracle interface: collateral price scaled by 1e36 (adjusted for decimals). */
export const morphoOracleAbi = [
  {
    type: 'function',
    name: 'price',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/** Morpho IRM interface: per-second borrow rate (WAD) for a market. */
export const morphoIrmAbi = [
  {
    type: 'function',
    name: 'borrowRateView',
    stateMutability: 'view',
    inputs: [
      { name: 'marketParams', type: 'tuple', components: marketParamsComponents },
      { name: 'market', type: 'tuple', components: marketComponents },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
