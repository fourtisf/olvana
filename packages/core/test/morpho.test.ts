import { describe, expect, it } from 'vitest';
import { VAULT_V2_FACTORY_ADDRESS } from '../src/config';
import { fetchLiveUsdgVaults, keepVault, toLiveVault, type ApiMarketPosition, type ApiVaultV2 } from '../src/morpho';

const FACTORY = VAULT_V2_FACTORY_ADDRESS!;
const pos = (symbol: string | null, usd: number, util: number, lltv: string, oracle = 'ChainlinkOracleV2'): ApiMarketPosition => ({
  supplyAssetsUsd: usd,
  market: {
    uniqueKey: '0x' + (symbol ?? 'idle'),
    lltv,
    collateralAsset: symbol ? { symbol, address: '0x' + '1'.repeat(40) } : null,
    oracle: { type: oracle },
    state: { utilization: util },
  },
});

const vault = (over: Partial<ApiVaultV2> = {}): ApiVaultV2 => ({
  address: '0xBeEff033F34C046626B8D0A041844C5d1A5409dd',
  name: 'Steakhouse USDG',
  symbol: 'steakUSDG',
  listed: true,
  creationTimestamp: String(Date.parse('2026-05-29T00:00:00Z') / 1000),
  factory: { address: FACTORY.toLowerCase() },
  asset: { address: '0x' + '5'.repeat(40), symbol: 'USDG', decimals: 6, priceUsd: 1 },
  totalAssetsUsd: 48_500_000,
  liquidityUsd: 9_200_000,
  performanceFee: 0.1,
  managementFee: 0,
  apy7d: 0.0458,
  net7d: 0.0412,
  net1d: 0.04,
  curator: { address: '0x' + 'c'.repeat(40) },
  curators: { items: [{ name: 'Steakhouse Financial', verified: true }] },
  adapters: {
    items: [
      {
        address: '0x' + 'a'.repeat(40),
        type: 'MorphoMarketV1',
        assetsUsd: 46_000_000,
        positions: {
          items: [
            pos('WETH', 30_000_000, 0.88, '860000000000000000'),
            pos('TSLA', 15_000_000, 0.9, '770000000000000000'),
            pos(null, 1_000_000, 0, '0'),
          ],
        },
      },
    ],
  },
  ...over,
});

const now = new Date('2026-09-27T00:00:00Z');

describe('keepVault (safety filter)', () => {
  const opts = { usdgAddress: null, factory: FACTORY };
  it('keeps a listed USDG vault from the official factory', () => expect(keepVault(vault(), opts)).toBe(true));
  it('drops vaults from another factory', () =>
    expect(keepVault(vault({ factory: { address: '0x' + '9'.repeat(40) } }), opts)).toBe(false));
  it('drops non-USDG, unlisted and empty vaults', () => {
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDC' } }), opts)).toBe(false);
    expect(keepVault(vault({ listed: false }), opts)).toBe(false);
    expect(keepVault(vault({ totalAssetsUsd: 0 }), opts)).toBe(false);
  });
  it('enforces the USDG address once configured', () => {
    expect(keepVault(vault(), { usdgAddress: '0x' + '5'.repeat(40), factory: FACTORY })).toBe(true);
    expect(keepVault(vault(), { usdgAddress: '0x' + '6'.repeat(40), factory: FACTORY })).toBe(false);
  });
  it('drops everything when the factory is not configured', () =>
    expect(keepVault(vault(), { usdgAddress: null, factory: null })).toBe(false));
});

describe('toLiveVault', () => {
  const v = toLiveVault(vault(), { now });

  it('maps APY, fees and TVL to display units', () => {
    expect(v.netApy).toBeCloseTo(4.12, 9);
    expect(v.grossApy).toBeCloseTo(4.58, 9);
    expect(v.performanceFee).toBe(0.1);
    expect(v.tvlUsd).toBe(48_500_000);
    expect(v.curator).toBe('Steakhouse Financial');
  });

  it('weights utilization by supply and ignores the idle market', () => {
    expect(v.utilization).toBeCloseTo(((0.88 * 30 + 0.9 * 15) / 45) * 100, 9);
  });

  it('builds the collateral mix with LLTV and quality', () => {
    expect(v.collateral).toEqual([
      { symbol: 'WETH', share: 66.7, lltv: 86, quality: 'blue', kind: 'crypto' },
      { symbol: 'TSLA', share: 33.3, lltv: 77, quality: 'tail', kind: 'crypto' },
    ]);
  });

  it('admin overrides classify tokenized stocks as mid / equity', () => {
    const o = toLiveVault(vault(), { now, overrides: { TSLA: { quality: 'mid', kind: 'equity' } } });
    expect(o.collateral[1]).toMatchObject({ quality: 'mid', kind: 'equity' });
    expect(o.flags.map((f) => f.key)).toContain('equity-collateral');
    // utilization 88.7% → 15 · collateral 30 × (0.667 + 0.333 × 0.6) = 26.0 · Chainlink 25 · curator 20
    expect(o.risk).toMatchObject({ score: 86, grade: 'A' });
  });

  it('oracle: all Chainlink → chainlink, some → mixed, none → dex', () => {
    expect(v.oracle).toBe('chainlink');
    const mixed = vault();
    mixed.adapters!.items![0]!.positions!.items![1]!.market.oracle = { type: 'CustomOracle' };
    expect(toLiveVault(mixed, { now }).oracle).toBe('mixed');
    const none = vault({ adapters: { items: [] } });
    expect(toLiveVault(none, { now })).toMatchObject({ oracle: 'dex', utilization: 0, collateral: [] });
  });

  it('falls back to 1-day APY for a brand-new vault', () => {
    expect(toLiveVault(vault({ net7d: null, apy7d: null }), { now }).netApy).toBeCloseTo(4, 9);
  });

  it('age in days from creation timestamp', () => {
    expect(Math.round(v.ageDays)).toBe(121);
  });
});

describe('fetchLiveUsdgVaults', () => {
  const respond = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

  it('filters and sorts by TVL', async () => {
    const items = [
      vault({ name: 'Small', totalAssetsUsd: 1_000 }),
      vault(),
      vault({ name: 'Spam USDG', factory: { address: '0x' + '9'.repeat(40) } }),
    ];
    const out = await fetchLiveUsdgVaults({ fetchImpl: respond({ data: { vaultV2s: { items } } }) });
    expect(out.map((v) => v.name)).toEqual(['Steakhouse USDG', 'Small']);
  });

  it('throws on HTTP and GraphQL errors (never returns stale or sample data)', async () => {
    await expect(fetchLiveUsdgVaults({ fetchImpl: respond({}, 500) })).rejects.toThrow('HTTP 500');
    await expect(fetchLiveUsdgVaults({ fetchImpl: respond({ errors: [{ message: 'bad field' }] }) })).rejects.toThrow(
      'bad field',
    );
  });
});
