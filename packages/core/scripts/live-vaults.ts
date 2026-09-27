/**
 * Runs the website's exact Morpho API query and prints what the site would list.
 *
 *   pnpm --filter @olvana/core live:vaults                      # api.morpho.org directly
 *   pnpm --filter @olvana/core live:vaults https://olvana.org/api/morpho   # through the nginx proxy
 */
import { CHAIN_ID, MORPHO_API_URL } from '../src/config';
import { STABLE_VAULTS_QUERY, keepVault, toLiveVault, type ApiVaultV2 } from '../src/morpho';

const url = process.argv[2] ?? MORPHO_API_URL;

async function main() {
  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://olvana.org' },
    body: JSON.stringify({ query: STABLE_VAULTS_QUERY, variables: { c: [CHAIN_ID] } }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status} · content-type ${res.headers.get('content-type')}`);
  console.log(`CORS access-control-allow-origin: ${res.headers.get('access-control-allow-origin') ?? '(none)'}`);
  let json: { data?: { vaultV2s?: { items: ApiVaultV2[] | null } }; errors?: { message: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    console.log('Not JSON. First 300 chars:\n' + text.slice(0, 300));
    process.exit(1);
  }
  if (json.errors?.length) {
    console.log('GraphQL errors:');
    for (const e of json.errors) console.log('  - ' + e.message);
    await introspect(['VaultV2', 'MorphoMarketV1Adapter', 'MarketPosition', 'MarketPositionState', 'Market', 'MarketState', 'Asset']);
  }
  const items = json.data?.vaultV2s?.items ?? [];
  const kept = items.filter((v) => keepVault(v)).map((v) => toLiveVault(v));
  console.log(`\n${items.length} listed vault(s) on chain ${CHAIN_ID}; ${kept.length} shown on the site:\n`);
  for (const v of kept.sort((a, b) => b.tvlUsd - a.tvlUsd)) {
    console.log(
      `${v.asset.symbol.padEnd(6)} ${v.name.padEnd(34)} TVL $${Math.round(v.tvlUsd).toLocaleString('en-US').padStart(13)}  net ${v.netApy.toFixed(2)}%  util ${v.utilization.toFixed(1)}%  grade ${v.risk.grade} ${v.risk.score}`,
    );
  }
  const dropped = items.filter((v) => !keepVault(v));
  if (dropped.length) console.log(`\nHidden: ${dropped.map((v) => `${v.name} (${v.asset?.symbol}, $${Math.round(v.totalAssetsUsd ?? 0)})`).join(', ')}`);
}

/** Print the live schema's field names for the types the query touches. */
async function introspect(types: string[]) {
  console.log('\nLive schema fields (for fixing the query):');
  for (const name of types) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ __type(name: "${name}") { fields { name } } }` }),
    });
    const j = (await r.json()) as { data?: { __type?: { fields?: { name: string }[] } | null } };
    const f = j.data?.__type?.fields?.map((x) => x.name) ?? [];
    console.log(`  ${name}: ${f.length ? f.join(', ') : '(type not found or introspection disabled)'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
