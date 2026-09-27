/**
 * Runs the website's Morpho API queries (list → detail) and prints what the site would list.
 *
 *   pnpm --filter @olvana/core live:vaults                                  # api.morpho.org directly
 *   pnpm --filter @olvana/core live:vaults https://olvana.org/api/morpho    # through the nginx proxy
 */
import { CHAIN_ID, MORPHO_API_URL } from '../src/config';
import { VAULT_DETAIL_QUERY, VAULT_LIST_QUERY, keepVault, toLiveVault, type ApiVaultV2, type LiveVault } from '../src/morpho';

const url = process.argv[2] ?? MORPHO_API_URL;

async function post(query: string, variables: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://olvana.org' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json: { data?: Record<string, unknown>; errors?: { message: string }[] } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { res, text, json };
}

async function main() {
  console.log(`POST ${url}`);
  const all: ApiVaultV2[] = [];
  for (let page = 0; page < 10; page++) {
    const { res, text, json } = await post(VAULT_LIST_QUERY, { c: [CHAIN_ID], s: page * 50 });
    if (page === 0) {
      console.log(`list: HTTP ${res.status} · CORS ${res.headers.get('access-control-allow-origin') ?? '(none)'}`);
    }
    if (!json) return fail(`list: not JSON — ${text.slice(0, 200)}`);
    if (json.errors?.length) return fail('list', json.errors);
    const items = ((json.data?.vaultV2s as { items?: ApiVaultV2[] })?.items ?? []) as ApiVaultV2[];
    all.push(...items);
    if (items.length < 50) break;
  }
  const kept = all.filter((v) => keepVault(v));
  console.log(`list: ${all.length} Vault V2s on chain ${CHAIN_ID}; ${kept.length} pass the filter\n`);

  const out: LiveVault[] = [];
  for (const c of kept) {
    const { json } = await post(VAULT_DETAIL_QUERY, { a: c.address, c: CHAIN_ID });
    if (json?.errors?.length) return fail(`detail ${c.name}`, json.errors);
    const v = json?.data?.vaultV2ByAddress as ApiVaultV2 | null | undefined;
    if (v) out.push(toLiveVault(v));
  }
  for (const v of out.sort((a, b) => b.tvlUsd - a.tvlUsd)) {
    console.log(
      `${v.asset.symbol.padEnd(6)} ${v.name.slice(0, 34).padEnd(34)} TVL $${Math.round(v.tvlUsd).toLocaleString('en-US').padStart(13)}  net ${v.netApy.toFixed(2)}%  util ${v.utilization.toFixed(1)}%  grade ${v.risk.grade} ${v.risk.score}`,
    );
  }
  console.log(`\n${out.length} vault(s) would be shown on the site.`);
}

async function fail(where: string, errors?: { message: string }[] | string) {
  console.log(`\n${where}: GraphQL errors:`);
  for (const e of Array.isArray(errors) ? errors : []) console.log('  - ' + e.message);
  // Field names + types of everything the queries touch, for fixing them.
  console.log('\nLive schema (field: type):');
  for (const name of ['Query', 'VaultV2', 'Asset', 'MarketPosition', 'MarketPositionState', 'Market', 'MarketState']) {
    const { json } = await post(`{ __type(name: "${name}") { fields { name type { name kind ofType { name } } } } }`, {});
    const t = (json?.data?.__type as { fields?: { name: string; type: { name: string | null; ofType?: { name: string | null } } }[] } | null)
      ?.fields;
    const wanted =
      name === 'Query' ? /^vault/i : name === 'VaultV2' ? /apy|price|asset|adapter|listed|factory|curator|total|liquid|fee|creation/i : /./;
    const f = (t ?? []).filter((x) => wanted.test(x.name)).map((x) => `${x.name}: ${x.type.name ?? x.type.ofType?.name ?? '?'}`);
    console.log(`  ${name}: ${f.length ? f.join(', ') : '(not found)'}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
