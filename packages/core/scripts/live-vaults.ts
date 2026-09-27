/**
 * Runs the website's Morpho API queries (list → detail + allocation) and prints what the site would list.
 *
 *   pnpm --filter @olvana/core live:vaults                                  # api.morpho.org directly
 *   pnpm --filter @olvana/core live:vaults https://olvana.org/api/morpho    # through the nginx proxy
 */
import { CHAINS, CHAIN_ID, MORPHO_API_URL, MIN_TVL_USD, STABLECOINS, chainById } from '../src/config';
import type { ApiVaultV2 } from '../src/morpho';
import { fetchVaultDetail, gqlClient, keepVault, listVaults, toLiveVault, tvlOf, type LiveVault } from '../src/morpho';

const url = process.argv[2] ?? MORPHO_API_URL;
const gql = gqlClient(url, fetch);
const eq = (a?: string, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

async function main() {
  console.log(`POST ${url}`);
  const all: ApiVaultV2[] = [];
  for (const c of CHAINS) {
    try {
      const l = await listVaults(gql, c.id);
      all.push(...l);
      console.log(`list: ${c.name.padEnd(16)} ${String(l.length).padStart(4)} Vault V2s`);
    } catch (e) {
      console.log(`list: ${c.name.padEnd(16)} FAILED — ${(e as Error).message}`);
    }
  }

  // Every asset that has a Vault V2 on this chain — shows which stablecoins actually exist here.
  const byAsset = new Map<string, { n: number; listed: number; tvl: number; big: number }>();
  for (const v of all) {
    const k = `${chainById(v.chainId)?.short ?? v.chainId}:${v.asset?.symbol ?? '?'}`;
    const e = byAsset.get(k) ?? { n: 0, listed: 0, tvl: 0, big: 0 };
    e.n++;
    if (v.listed) e.listed++;
    e.tvl += tvlOf(v);
    if (tvlOf(v) >= MIN_TVL_USD) e.big++;
    byAsset.set(k, e);
  }
  console.log('\nstablecoin vaults per network (network:symbol · vaults · listed · ≥$10k · total TVL):');
  for (const [k, e] of [...byAsset].sort((a, b) => b[1].tvl - a[1].tvl)) {
    if (!STABLECOINS.includes(k.split(':')[1]!)) continue;   // stablecoins only
    const tag = '';
    console.log(`  ${k.padEnd(18)} ${String(e.n).padStart(3)} · ${String(e.listed).padStart(2)} listed · ${String(e.big).padStart(2)} ≥$10k · ${usd(e.tvl).padStart(15)}${tag}`);
  }
  console.log('');

  // Why each stablecoin vault is in or out.
  for (const v of all.filter((x) => STABLECOINS.includes(x.asset?.symbol) && tvlOf(x) >= 1_000).sort((a, b) => tvlOf(b) - tvlOf(a)).slice(0, 40)) {
    const chain = chainById(v.chainId);
    const why: string[] = [];
    if (!v.listed) why.push('not Morpho-listed');
    if (!eq(v.factory?.address, chain?.vaultV2Factory)) why.push('other factory');
    const pin = chain?.stablecoinPins[v.asset.symbol];
    if (pin && !eq(v.asset.address, pin)) why.push(`not the verified ${v.asset.symbol}`);
    if (tvlOf(v) < MIN_TVL_USD) why.push(`TVL < ${usd(MIN_TVL_USD)}`);
    const tvlSrc = v.totalAssetsUsd == null ? ' (from token amount)' : '';
    console.log(`  ${keepVault(v) ? 'KEEP' : 'skip'}  ${(chain?.short ?? '?').padEnd(9)} ${v.asset.symbol.padEnd(5)} ${v.name.slice(0, 32).padEnd(32)} ${usd(tvlOf(v)).padStart(14)}${tvlSrc}  ${why.join(', ')}`);
  }

  const kept = all.filter((v) => keepVault(v));
  console.log(`\ndetail + allocation for ${kept.length} vault(s):`);
  const out: LiveVault[] = [];
  for (const c of kept) {
    try {
      const v = await fetchVaultDetail(gql, c.address, c.chainId);
      if (v) out.push(toLiveVault(v));
    } catch (e) {
      console.log(`  ${c.name}: ${(e as Error).message}`);
    }
  }
  for (const v of out.sort((a, b) => b.tvlUsd - a.tvlUsd)) {
    console.log(
      `  ${(chainById(v.chainId)?.short ?? '?').padEnd(9)} ${v.asset.symbol.padEnd(5)} ${v.name.slice(0, 32).padEnd(32)} TVL ${usd(v.tvlUsd).padStart(14)}  net ${v.netApy.toFixed(2)}%  util ${v.utilization.toFixed(1)}%  ${v.collateral.length} collateral  grade ${v.risk.grade} ${v.risk.score}`,
    );
  }
  // Risk inputs for the largest vaults, so a surprising grade can be traced to its cause.
  for (const v of out.slice(0, 5)) {
    console.log(`\n${v.name} — score ${v.risk.score} = ${v.risk.parts.map((p) => `${p.label} ${p.points}/${p.max}`).join(' + ')}`);
    console.log(`  oracle: ${v.oracleLabel}  ·  liquidity ${usd(v.liquidityUsd)} (${((v.liquidityUsd / (v.tvlUsd || 1)) * 100).toFixed(1)}% of TVL)`);
    const extra = await collateralInfo(v.address, v.chainId).catch(() => new Map<string, { tags: string[]; oracle: string; util: number }[]>());
    for (const c of v.collateral) {
      const markets = extra.get(c.symbol) ?? [];
      const tags = [...new Set(markets.flatMap((m) => m.tags))].join('/') || '—';
      const oracles = [...new Set(markets.map((m) => m.oracle))].join('/') || '—';
      const utils = markets.map((m) => (m.util * 100).toFixed(0) + '%').join(' ');
      console.log(`  ${c.symbol.padEnd(10)} ${c.share.toFixed(1).padStart(5)}%  LLTV ${String(c.lltv).padStart(4)}%  quality ${c.quality.padEnd(4)}  tags ${tags.padEnd(20)} oracle ${oracles.padEnd(18)} util ${utils}`);
    }
  }
  console.log(`\n${out.length} vault(s) would be shown on the site.`);
}

/** Script-only extras (asset tags, per-market oracle / utilization) — not used by the site. */
async function collateralInfo(address: string, chainId: number = CHAIN_ID!) {
  const d = await gql<{ vaultV2ByAddress: { adapters: { items: { positions?: { items: { state: { supplyAssetsUsd: number | null } | null; market: { collateralAsset: { symbol: string; tags: string[] | null } | null; oracle: { type: string } | null; state: { utilization: number } | null } }[] } }[] } } | null }>(
    `query($a:String!,$c:Int!){ vaultV2ByAddress(address:$a, chainId:$c){ adapters(first: 5){ items{ ... on MorphoMarketV1Adapter { positions(first: 30){ items{ state{ supplyAssetsUsd } market{ collateralAsset{ symbol tags } oracle{ type } state{ utilization } } } } } } } } }`,
    { a: address, c: chainId },
  );
  const out = new Map<string, { tags: string[]; oracle: string; util: number }[]>();
  for (const a of d.vaultV2ByAddress?.adapters.items ?? [])
    for (const p of a.positions?.items ?? []) {
      const ca = p.market.collateralAsset;
      if (!ca || !((p.state?.supplyAssetsUsd ?? 0) > 0)) continue;
      const list = out.get(ca.symbol) ?? [];
      list.push({ tags: ca.tags ?? [], oracle: p.market.oracle?.type ?? 'none', util: p.market.state?.utilization ?? 0 });
      out.set(ca.symbol, list);
    }
  return out;
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
