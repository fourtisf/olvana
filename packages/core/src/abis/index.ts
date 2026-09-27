export { erc20Abi } from './erc20';
export { erc4626Abi } from './erc4626';
export { morphoBlueAbi, morphoOracleAbi, morphoIrmAbi } from './morphoBlue';
export { vaultV2Abi, vaultV2FactoryAbi, morphoMarketV1AdapterV2Abi } from './vaultV2';

/** WAD-scaled fee (1e18 = 100%) → fraction, e.g. 1e17 → 0.1. */
export function wadToFraction(wad: bigint): number {
  return Number(wad) / 1e18;
}
