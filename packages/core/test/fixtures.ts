import type { RiskInput } from '../src/risk';

/** The three vaults from the approved prototype, with their prototype inputs. */
export const PROTOTYPE_VAULTS: Record<'core' | 'prime' | 'boost', RiskInput> = {
  core: {
    utilization: 82,
    oracle: 'chainlink',
    curatorIncidents: 0,
    collateral: [
      { symbol: 'WETH', share: 46, quality: 'blue' },
      { symbol: 'WBTC', share: 31, quality: 'blue' },
      { symbol: 'TSLA (tokenized)', share: 23, quality: 'mid' },
    ],
  },
  prime: {
    utilization: 61,
    oracle: 'chainlink',
    curatorIncidents: 0,
    collateral: [
      { symbol: 'WETH', share: 60, quality: 'blue' },
      { symbol: 'WBTC', share: 40, quality: 'blue' },
    ],
  },
  boost: {
    utilization: 93,
    oracle: 'dex',
    curatorIncidents: 1,
    collateral: [
      { symbol: 'TSLA (tokenized)', share: 40, quality: 'mid' },
      { symbol: 'NVDA (tokenized)', share: 25, quality: 'mid' },
      { symbol: '[Small-cap token]', share: 35, quality: 'tail' },
    ],
  },
};
