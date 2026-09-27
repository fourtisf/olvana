/**
 * Live vault data from Morpho's public GraphQL API (HANDOFF §4.3, §7.2).
 *
 * Field names come from the API types in Morpho's official SDK
 * (morpho-org/sdks packages/liquidity-sdk-viem/src/api/types.ts). Units: APYs,
 * utilization and fees are fractions (0.05 = 5%); `lltv` is a WAD string.
 *
 * `toLiveVault` turns one API vault into the shape the risk score and UI use.
 * `keepVault` is the safety filter: anyone can deploy a vault called "USDG",
 * so only listed vaults from the official Vault V2 factory whose asset is an
 * allowlisted stablecoin trading near $1 are kept.
 */
import { CHAINS, CHAIN_ID, MIN_TVL_USD, MORPHO_API_URL, STABLECOINS, SYNTHETIC_STABLECOINS, chainById } from './config';
import {
  classifyCollateral,
  riskFlags,
  riskScore,
  type CollateralKind,
  type CollateralQuality,
  type OracleType,
  type RiskFlag,
  type RiskResult,
} from './risk';

/**
 * Two light queries instead of one heavy one — the API rejects a single
 * vault list with nested adapters/positions as "Query is too complex".
 *  1. VAULT_LIST_QUERY: every Vault V2 on the chain, few fields, paginated.
 *  2. VAULT_DETAIL_QUERY: full data for each vault that passes `keepVault`.
 */
export const VAULT_LIST_QUERY = `query($c:[Int!],$s:Int){
  vaultV2s(first: 50, skip: $s, where:{chainId_in:$c}){
    items{ address name listed factory{ address } asset{ address symbol decimals } totalAssets totalAssetsUsd }
  }
}`;

/** Vault-level fields (no nested market data). */
export const VAULT_DETAIL_QUERY = `query($a:String!,$c:Int!){
  vaultV2ByAddress(address:$a, chainId:$c){
    address name symbol listed creationTimestamp
    factory{ address }
    asset{ address symbol decimals logoURI }
    totalAssets totalAssetsUsd liquidity liquidityUsd performanceFee managementFee
    net7d: avgNetApy(lookback: SEVEN_DAYS)
    net1d: avgNetApy(lookback: ONE_DAY)
    curator{ address }
    curators(first: 3){ items{ name verified } }
  }
}`;

/** Market allocation, fetched separately and page-limited to stay under the API's complexity limit. */
export const VAULT_ALLOCATION_QUERY = `query($a:String!,$c:Int!){
  vaultV2ByAddress(address:$a, chainId:$c){
    adapters(first: 5){ items{
      address type
      ... on MorphoMarketV1Adapter { positions(first: 30){ items{ state{ supplyAssetsUsd } market{ lltv collateralAsset{ symbol address logoURI } oracle{ type } state{ utilization } } } } }
    } }
  }
}`;

/** Kept for the website copy and older callers: the per-vault detail query. */
export const STABLE_VAULTS_QUERY = VAULT_DETAIL_QUERY;

export interface ApiMarketPosition {
  state: { supplyAssetsUsd: number | null } | null;
  market: {
    lltv: string;
    collateralAsset: { symbol: string; address: string; logoURI?: string | null } | null;
    oracle: { type: string } | null;
    state: { utilization: number } | null;
  };
}

export interface ApiVaultV2 {
  /** Set by us from the query's chain (the list query is run per chain). */
  chainId?: number;
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  creationTimestamp?: string;
  factory: { address: string };
  asset: { address: string; symbol: string; decimals: number; priceUsd?: number | null; logoURI?: string | null };
  totalAssets?: string | null;
  totalAssetsUsd: number | null;
  liquidity?: string | null;
  liquidityUsd?: number | null;
  performanceFee?: number;
  managementFee?: number;
  net7d?: number | null;
  net1d?: number | null;
  curator?: { address: string };
  curators?: { items: { name: string; verified: boolean }[] | null } | null;
  adapters?: {
    items: { address: string; type: string; assetsUsd: number | null; positions?: { items: ApiMarketPosition[] | null } }[] | null;
  } | null;
}

export interface LiveCollateral {
  symbol: string;
  /** Share of market allocation, percent (1 decimal). */
  share: number;
  /** Highest LLTV among this collateral's markets, percent. */
  lltv: number;
  quality: CollateralQuality;
  kind: CollateralKind;
  /** Token logo (https only), from Morpho's asset list. */
  logo: string | null;
}

export interface LiveVault {
  chainId: number;
  address: string;
  name: string;
  /** The stablecoin deposited into the vault. */
  asset: { symbol: string; address: string; decimals: number };
  /** Asset logo (https only), from Morpho's asset list. */
  assetLogo: string | null;
  curator: string;
  curatorVerified: boolean;
  /** Net APY after fees, percent (7-day realized, falls back to 1-day). */
  netApy: number;
  /** Gross APY, percent. */
  grossApy: number;
  performanceFee?: number;
  managementFee?: number;
  tvlUsd: number;
  liquidityUsd: number;
  /** Allocation-weighted utilization, percent. */
  utilization: number;
  collateral: LiveCollateral[];
  oracle: OracleType;
  oracleLabel: string;
  ageDays: number;
  risk: RiskResult;
  flags: RiskFlag[];
}

export type CollateralOverrides = Readonly<Record<string, { quality: CollateralQuality; kind?: CollateralKind }>>;

/**
 * USD value of a stablecoin amount: the API's USD figure when it has one,
 * else the raw token amount (stablecoins ≈ $1 — the API has no USDG price yet).
 */
export function stableUsd(usd: number | null | undefined, raw: string | null | undefined, decimals: number): number {
  if (typeof usd === 'number' && Number.isFinite(usd)) return usd;
  if (raw == null || raw === '') return 0;
  return Number(raw) / 10 ** decimals;
}
export const tvlOf = (v: ApiVaultV2) => stableUsd(v.totalAssetsUsd, v.totalAssets, v.asset?.decimals ?? 18);

const usdOf = (p: ApiMarketPosition) => p.state?.supplyAssetsUsd ?? 0;
const CHAINLINK = new Set(['ChainlinkOracle', 'ChainlinkOracleV2']);
/** Only pass through https URLs from the API into <img src>. */
export const safeLogo = (u: string | null | undefined): string | null => (u && /^https:\/\//i.test(u) ? u : null);
const eq = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A vault's asset must be within this distance of $1 to be listed. */
export const STABLE_PRICE_TOLERANCE = 0.02;

/**
 * Safety filter. Defaults come from the vault's network in CHAINS: its official
 * Vault V2 factory and its stablecoin address pins. Options override them (tests).
 */
export function keepVault(
  v: ApiVaultV2,
  opts: {
    factory?: string | null;
    pins?: Readonly<Record<string, string>>;
    /** Shorthand for pins.USDG (back-compat). */
    usdgAddress?: string | null;
    stablecoins?: readonly string[];
    minTvlUsd?: number;
    allowUnlisted?: boolean;
  } = {},
): boolean {
  const chain = chainById(v.chainId ?? CHAIN_ID);
  const factory = 'factory' in opts ? opts.factory : chain?.vaultV2Factory;
  const pins: Record<string, string | null | undefined> = { ...(opts.pins ?? chain?.stablecoinPins ?? {}) };
  if ('usdgAddress' in opts) pins.USDG = opts.usdgAddress;
  const symbols = opts.stablecoins ?? STABLECOINS;
  if (!v.asset || !symbols.includes(v.asset.symbol)) return false;
  // Price is optional: the list query doesn't carry it. When present, enforce the peg.
  const price = v.asset.priceUsd;
  if (typeof price === 'number' && Math.abs(price - 1) > STABLE_PRICE_TOLERANCE) return false;
  const pin = pins[v.asset.symbol];
  if (pin && !eq(v.asset.address, pin)) return false;
  if (!v.listed && !opts.allowUnlisted) return false;
  if (!factory || !eq(v.factory?.address, factory)) return false;
  return tvlOf(v) >= (opts.minTvlUsd ?? MIN_TVL_USD);
}

export function toLiveVault(v: ApiVaultV2, opts: { now?: Date; overrides?: CollateralOverrides } = {}): LiveVault {
  const now = opts.now ?? new Date();
  const overrides = opts.overrides ?? {};

  const positions = (v.adapters?.items ?? [])
    .flatMap((a) => a.positions?.items ?? [])
    .filter((p) => usdOf(p) > 0 && p.market.collateralAsset);
  const total = positions.reduce((t, p) => t + usdOf(p), 0);

  const utilization =
    total > 0 ? (positions.reduce((t, p) => t + (p.market.state?.utilization ?? 0) * usdOf(p), 0) / total) * 100 : 0;

  const bySymbol = new Map<string, { usd: number; lltv: number; logo: string | null }>();
  for (const p of positions) {
    const sym = p.market.collateralAsset!.symbol;
    const cur = bySymbol.get(sym) ?? { usd: 0, lltv: 0, logo: safeLogo(p.market.collateralAsset!.logoURI) };
    cur.usd += usdOf(p);
    cur.lltv = Math.max(cur.lltv, Number(p.market.lltv) / 1e16);
    bySymbol.set(sym, cur);
  }
  const collateral: LiveCollateral[] = [...bySymbol.entries()]
    .map(([symbol, { usd, lltv, logo }]) => {
      const o = Object.entries(overrides).find(([s]) => s.toLowerCase() === symbol.toLowerCase())?.[1];
      return {
        symbol,
        share: Math.round((usd / total) * 1000) / 10,
        lltv: Math.round(lltv * 10) / 10,
        quality: o?.quality ?? classifyCollateral(symbol),
        kind: o?.kind ?? 'crypto',
        logo,
      };
    })
    .sort((a, b) => b.share - a.share);

  const types = positions.map((p) => p.market.oracle?.type ?? 'Unknown');
  const chainlink = types.filter((t) => CHAINLINK.has(t)).length;
  const oracle: OracleType = types.length > 0 && chainlink === types.length ? 'chainlink' : chainlink > 0 ? 'mixed' : 'dex';
  const oracleLabel = oracle === 'chainlink' ? 'Chainlink' : oracle === 'mixed' ? 'Mixed' : 'Custom / unverified';

  const curatorItem = v.curators?.items?.[0];
  const ageDays = v.creationTimestamp ? (now.getTime() - Number(v.creationTimestamp) * 1000) / 86_400_000 : 0;
  const net = v.net7d ?? v.net1d ?? 0;

  const risk = riskScore({
    utilization,
    oracle,
    curatorIncidents: 0,
    collateral: collateral.map((c) => ({ symbol: c.symbol, share: c.share, quality: c.quality })),
  });
  const flags = riskFlags({
    collateral: collateral.map((c) => ({ symbol: c.symbol, lltv: c.lltv, kind: c.kind })),
    vaultAgeDays: ageDays,
    usdgPrice: v.asset.priceUsd ?? null,
  });
  if (SYNTHETIC_STABLECOINS.includes(v.asset.symbol)) {
    flags.push({
      key: 'synthetic-stable',
      text: `${v.asset.symbol} is a synthetic dollar backed by hedged crypto positions, not cash. It can lose its peg in extreme markets.`,
    });
  }

  return {
    chainId: v.chainId ?? CHAIN_ID!,
    address: v.address,
    name: v.name,
    asset: { symbol: v.asset.symbol, address: v.asset.address, decimals: v.asset.decimals },
    assetLogo: safeLogo(v.asset.logoURI),
    curator: curatorItem?.name ?? (v.curator ? `${v.curator.address.slice(0, 6)}…${v.curator.address.slice(-4)}` : 'Unknown curator'),
    curatorVerified: curatorItem?.verified ?? false,
    netApy: net * 100,
    // Gross on the same 7-day basis: net / (1 − performance fee).
    grossApy: ((v.performanceFee ?? 0) < 1 ? net / (1 - (v.performanceFee ?? 0)) : net) * 100,
    performanceFee: v.performanceFee ?? 0,
    managementFee: v.managementFee ?? 0,
    tvlUsd: tvlOf(v),
    liquidityUsd: stableUsd(v.liquidityUsd, v.liquidity, v.asset.decimals),
    utilization,
    collateral,
    oracle,
    oracleLabel,
    ageDays,
    risk,
    flags,
  };
}

export type Gql = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export function gqlClient(url: string, f: typeof fetch, signal?: AbortSignal): Gql {
  return async <T>(query: string, variables: Record<string, unknown>) => {
    const res = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
    if (json?.errors?.length) throw new Error(`Morpho API: ${json.errors[0]!.message}`);
    if (!res.ok || !json?.data) throw new Error(`Morpho API HTTP ${res.status}`);
    return json.data;
  };
}

/** Stage 1: all Vault V2s on one chain (light fields), paginated; items are tagged with chainId. */
export async function listVaults(gql: Gql, chainId: number = CHAIN_ID!, maxPages = 10): Promise<ApiVaultV2[]> {
  const out: ApiVaultV2[] = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await gql<{ vaultV2s: { items: ApiVaultV2[] | null } }>(VAULT_LIST_QUERY, { c: [chainId], s: page * 50 });
    const items = d.vaultV2s?.items ?? [];
    out.push(...items.map((v) => ({ ...v, chainId })));
    if (items.length < 50) break;
  }
  return out;
}

/** Stage 2: vault fields + market allocation for one vault (two queries, merged). */
export async function fetchVaultDetail(gql: Gql, address: string, chainId: number = CHAIN_ID!): Promise<ApiVaultV2 | null> {
  const [base, alloc] = await Promise.all([
    gql<{ vaultV2ByAddress: ApiVaultV2 | null }>(VAULT_DETAIL_QUERY, { a: address, c: chainId }),
    gql<{ vaultV2ByAddress: Pick<ApiVaultV2, 'adapters'> | null }>(VAULT_ALLOCATION_QUERY, { a: address, c: chainId }),
  ]);
  if (!base.vaultV2ByAddress) return null;
  return { ...base.vaultV2ByAddress, chainId, adapters: alloc.vaultV2ByAddress?.adapters ?? { items: [] } };
}

/**
 * Fetch, filter and map the live stablecoin vaults on every network in CHAINS.
 * A network whose API call fails is skipped; only if every network fails does
 * this throw. `fetchImpl` is injectable for tests.
 */
export async function fetchLiveStableVaults(
  opts: {
    url?: string;
    fetchImpl?: typeof fetch;
    overrides?: CollateralOverrides;
    signal?: AbortSignal;
    chainIds?: readonly number[];
  } = {},
): Promise<LiveVault[]> {
  const gql = gqlClient(opts.url ?? MORPHO_API_URL, opts.fetchImpl ?? fetch, opts.signal);
  const chainIds = opts.chainIds ?? CHAINS.map((c) => c.id);
  const lists = await Promise.allSettled(chainIds.map((id) => listVaults(gql, id)));
  const listFailures = lists.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  if (listFailures.length === lists.length && lists.length) throw listFailures[0]!.reason;
  const candidates = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((v) => keepVault(v));
  const details = await Promise.allSettled(candidates.map((c) => fetchVaultDetail(gql, c.address, c.chainId)));
  const ok = details.flatMap((r) => (r.status === 'fulfilled' && r.value && keepVault(r.value) ? [r.value] : []));
  const failed = details.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  if (candidates.length && !ok.length && failed.length) throw failed[0]!.reason;
  return ok
    .map((v) => toLiveVault(v, { overrides: opts.overrides }))
    .sort((a, b) => (a.asset.symbol === 'USDG' ? 0 : 1) - (b.asset.symbol === 'USDG' ? 0 : 1) || b.tvlUsd - a.tvlUsd);
}
