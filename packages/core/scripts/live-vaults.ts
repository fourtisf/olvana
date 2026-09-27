/**
 * Runs the website's Morpho API queries (list → detail + allocation) and prints what the site would list.
 *
 *   pnpm --filter @olvana/core live:vaults                                  # api.morpho.org directly
 *   pnpm --filter @olvana/core live:vaults https://olvana.org/api/morpho    # through the nginx proxy
 */
import { MORPHO_API_URL, MIN_TVL_USD, STABLECOINS, USDG_ADDRESS, VAULT_V2_FACTORY_ADDRESS } from '../src/config';
import { fetchVaultDetail, gqlClient, keepVault, listVaults, toLiveVault, tvlOf, type LiveVault } from '../src/morpho';

const url = process.argv[2] ?? MORPHO_API_URL;
const gql = gqlClient(url, fetch);
const eq = (a?: string, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

async function main() {
  console.log(`POST ${url}`);
  const all = await listVaults(gql);
  console.log(`list: ${all.length} Vault V2s on the chain`);

  // Why each stablecoin vault is in or out.
  for (const v of all.filter((x) => STABLECOINS.includes(x.asset?.symbol)).sort((a, b) => tvlOf(b) - tvlOf(a))) {
    const why: string[] = [];
    if (!v.listed) why.push('not Morpho-listed');
    if (!eq(v.factory?.address, VAULT_V2_FACTORY_ADDRESS)) why.push('other factory');
    if (v.asset.symbol === 'USDG' && !eq(v.asset.address, USDG_ADDRESS)) why.push('not the verified USDG');
    if (tvlOf(v) < MIN_TVL_USD) why.push(`TVL < ${usd(MIN_TVL_USD)}`);
    const tvlSrc = v.totalAssetsUsd == null ? ' (from token amount)' : '';
    console.log(`  ${keepVault(v) ? 'KEEP' : 'skip'}  ${v.asset.symbol.padEnd(5)} ${v.name.slice(0, 32).padEnd(32)} ${usd(tvlOf(v)).padStart(14)}${tvlSrc}  ${why.join(', ')}`);
  }

  const kept = all.filter((v) => keepVault(v));
  console.log(`\ndetail + allocation for ${kept.length} vault(s):`);
  const out: LiveVault[] = [];
  for (const c of kept) {
    try {
      const v = await fetchVaultDetail(gql, c.address);
      if (v) out.push(toLiveVault(v));
    } catch (e) {
      console.log(`  ${c.name}: ${(e as Error).message}`);
    }
  }
  for (const v of out.sort((a, b) => b.tvlUsd - a.tvlUsd)) {
    console.log(
      `  ${v.asset.symbol.padEnd(5)} ${v.name.slice(0, 32).padEnd(32)} TVL ${usd(v.tvlUsd).padStart(14)}  net ${v.netApy.toFixed(2)}%  util ${v.utilization.toFixed(1)}%  ${v.collateral.length} collateral  grade ${v.risk.grade} ${v.risk.score}`,
    );
  }
  console.log(`\n${out.length} vault(s) would be shown on the site.`);
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
