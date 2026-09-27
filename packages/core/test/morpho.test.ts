import { describe, expect, it } from 'vitest';
import { USDG_ADDRESS, VAULT_V2_FACTORY_ADDRESS } from '../src/config';
import { fetchLiveStableVaults, keepVault, toLiveVault, type ApiMarketPosition, type ApiVaultV2 } from '../src/morpho';

const FACTORY = VAULT_V2_FACTORY_ADDRESS!;
const pos = (symbol: string | null, usd: number, util: number, lltv: string, oracle = 'ChainlinkOracleV2'): ApiMarketPosition => ({
  state: { supplyAssetsUsd: usd },
  market: {
    lltv,
    collateralAsset: symbol
      ? { symbol, address: '0x' + '1'.repeat(40), logoURI: symbol === 'WETH' ? 'https://cdn.example/weth.png' : 'javascript:alert(1)' }
      : null,
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
  asset: { address: USDG_ADDRESS!.toLowerCase(), symbol: 'USDG', decimals: 6, priceUsd: 1, logoURI: 'https://cdn.example/usdg.png' },
  totalAssetsUsd: 48_500_000,
  liquidityUsd: 9_200_000,
  performanceFee: 0.1,
  managementFee: 0,
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
  it('keeps other allowlisted stablecoins near $1, drops the rest', () => {
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDC' } }), opts)).toBe(true);
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDX' } }), opts)).toBe(false);
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDC', priceUsd: 0.93 } }), opts)).toBe(false);
    // price unknown (the list query doesn't carry it) → symbol / factory / listed rules still apply
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDC', priceUsd: null } }), opts)).toBe(true);
  });

  it('drops unlisted and empty vaults', () => {
    expect(keepVault(vault({ listed: false }), opts)).toBe(false);
    expect(keepVault(vault({ totalAssetsUsd: 0 }), opts)).toBe(false);
    expect(keepVault(vault({ totalAssetsUsd: 101 }), opts)).toBe(false); // dust / test vaults
    expect(keepVault(vault({ totalAssetsUsd: 10_000 }), opts)).toBe(true);
  });
  it('enforces the USDG address once configured', () => {
    expect(keepVault(vault(), { usdgAddress: USDG_ADDRESS, factory: FACTORY })).toBe(true);
    expect(keepVault(vault(), { usdgAddress: '0x' + '6'.repeat(40), factory: FACTORY })).toBe(false);
    // the USDG pin doesn't apply to other stablecoins
    expect(keepVault(vault({ asset: { ...vault().asset, symbol: 'USDC' } }), { usdgAddress: '0x' + '6'.repeat(40), factory: FACTORY })).toBe(true);
  });
  it('drops everything when the factory is not configured', () =>
    expect(keepVault(vault(), { usdgAddress: null, factory: null })).toBe(false));
});

describe('toLiveVault', () => {
  const v = toLiveVault(vault(), { now });

  it('maps APY, fees and TVL to display units', () => {
    expect(v.netApy).toBeCloseTo(4.12, 9);
    expect(v.grossApy).toBeCloseTo(4.12 / 0.9, 9); // net / (1 − 10% fee)
    expect(v.performanceFee).toBe(0.1);
    expect(v.tvlUsd).toBe(48_500_000);
    expect(v.curator).toBe('Steakhouse Financial');
  });

  it('passes through https logos only', () => {
    expect(v.assetLogo).toBe('https://cdn.example/usdg.png');
    expect(toLiveVault(vault({ asset: { ...vault().asset, logoURI: null } }), { now }).assetLogo).toBeNull();
  });

  it('weights utilization by supply and ignores the idle market', () => {
    expect(v.utilization).toBeCloseTo(((0.88 * 30 + 0.9 * 15) / 45) * 100, 9);
  });

  it('builds the collateral mix with LLTV and quality', () => {
    expect(v.collateral).toEqual([
      { symbol: 'WETH', share: 66.7, lltv: 86, quality: 'blue', kind: 'crypto', logo: 'https://cdn.example/weth.png' },
      { symbol: 'TSLA', share: 33.3, lltv: 77, quality: 'tail', kind: 'crypto', logo: null },
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
    expect(toLiveVault(vault({ net7d: null }), { now }).netApy).toBeCloseTo(4, 9);
  });

  it('age in days from creation timestamp', () => {
    expect(Math.round(v.ageDays)).toBe(121);
  });
});

describe('fetchLiveStableVaults (list → detail)', () => {
  /** Fake API: answers the list query with `items`, the detail query by address. */
  const api = (items: ApiVaultV2[], opt: { failDetail?: boolean; status?: number; errors?: string } = {}) => {
    const calls: string[] = [];
    const f = (async (_url: string, init: { body: string }) => {
      const { query, variables } = JSON.parse(init.body);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (opt.status) return json({}, opt.status);
      if (opt.errors) return json({ errors: [{ message: opt.errors }] });
      if (query.includes('vaultV2s(')) {
        calls.push('list');
        return json({ data: { vaultV2s: { items: items.slice(variables.s, variables.s + 50) } } });
      }
      calls.push('detail:' + variables.a);
      if (opt.failDetail) return json({ errors: [{ message: 'Query is too complex' }] });
      return json({ data: { vaultV2ByAddress: items.find((v) => v.address === variables.a) ?? null } });
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  it('lists, filters, then fetches details only for kept vaults; USDG first, then TVL', async () => {
    const items = [
      vault({ address: '0x' + '1'.repeat(40), name: 'Big USDC', totalAssetsUsd: 90_000_000, asset: { ...vault().asset, symbol: 'USDC' } }),
      vault({ address: '0x' + '2'.repeat(40), name: 'Small', totalAssetsUsd: 20_000 }),
      vault({ address: '0x' + '3'.repeat(40), name: 'Dust', totalAssetsUsd: 1 }),
      vault(),
      vault({ address: '0x' + '4'.repeat(40), name: 'Spam USDG', factory: { address: '0x' + '9'.repeat(40) } }),
    ];
    const { f, calls } = api(items);
    const out = await fetchLiveStableVaults({ fetchImpl: f });
    expect(out.map((v) => v.name)).toEqual(['Steakhouse USDG', 'Small', 'Big USDC']);
    expect(calls.filter((c) => c.startsWith('detail')).length).toBe(3); // Dust and Spam never fetched
  });

  it('paginates the list 50 at a time', async () => {
    const many = Array.from({ length: 120 }, (_, k) => vault({ address: '0x' + k.toString(16).padStart(40, '0'), totalAssetsUsd: 1 }));
    const { f, calls } = api(many);
    await fetchLiveStableVaults({ fetchImpl: f });
    expect(calls.filter((c) => c === 'list').length).toBe(3);
  });

  it('rejects a USDG-named token at another address (default config pin)', async () => {
    const { f } = api([vault({ asset: { ...vault().asset, address: '0x' + '6'.repeat(40) } })]);
    expect(await fetchLiveStableVaults({ fetchImpl: f })).toEqual([]);
  });

  it('throws on HTTP / GraphQL errors and when every detail call fails', async () => {
    await expect(fetchLiveStableVaults({ fetchImpl: api([], { status: 500 }).f })).rejects.toThrow('HTTP 500');
    await expect(fetchLiveStableVaults({ fetchImpl: api([], { errors: 'bad field' }).f })).rejects.toThrow('bad field');
    await expect(fetchLiveStableVaults({ fetchImpl: api([vault()], { failDetail: true }).f })).rejects.toThrow('too complex');
  });
});
