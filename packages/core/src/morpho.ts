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
import { CHAIN_ID, MIN_TVL_USD, MORPHO_API_URL, STABLECOINS, USDG_ADDRESS, VAULT_V2_FACTORY_ADDRESS } from './config';
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

export const STABLE_VAULTS_QUERY = `query($c:[Int!]){
  vaultV2s(first: 100, where:{chainId_in:$c, listed:true}){
    items{
      address name symbol listed creationTimestamp
      factory{ address }
      asset{ address symbol decimals priceUsd logoURI }
      totalAssetsUsd liquidityUsd performanceFee managementFee
      apy7d: avgApy(lookback: SEVEN_DAYS)
      net7d: avgNetApy(lookback: SEVEN_DAYS)
      net1d: avgNetApy(lookback: ONE_DAY)
      curator{ address }
      curators{ items{ name verified } }
      adapters{ items{
        address type assetsUsd
        ... on MorphoMarketV1Adapter { positions{ items{ supplyAssetsUsd market{ uniqueKey lltv collateralAsset{ symbol address logoURI } oracle{ type } state{ utilization } } } } }
      } }
    }
  }
}`;

export interface ApiMarketPosition {
  supplyAssetsUsd: number | null;
  market: {
    uniqueKey: string;
    lltv: string;
    collateralAsset: { symbol: string; address: string; logoURI?: string | null } | null;
    oracle: { type: string } | null;
    state: { utilization: number } | null;
  };
}

export interface ApiVaultV2 {
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  creationTimestamp: string;
  factory: { address: string };
  asset: { address: string; symbol: string; decimals: number; priceUsd: number | null; logoURI?: string | null };
  totalAssetsUsd: number | null;
  liquidityUsd: number | null;
  performanceFee: number;
  managementFee: number;
  apy7d: number | null;
  net7d: number | null;
  net1d: number | null;
  curator: { address: string };
  curators: { items: { name: string; verified: boolean }[] | null } | null;
  adapters: {
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
  performanceFee: number;
  managementFee: number;
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

const CHAINLINK = new Set(['ChainlinkOracle', 'ChainlinkOracleV2']);
/** Only pass through https URLs from the API into <img src>. */
export const safeLogo = (u: string | null | undefined): string | null => (u && /^https:\/\//i.test(u) ? u : null);
const eq = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A vault's asset must be within this distance of $1 to be listed. */
export const STABLE_PRICE_TOLERANCE = 0.02;

export function keepVault(
  v: ApiVaultV2,
  opts: { usdgAddress?: string | null; factory?: string | null; stablecoins?: readonly string[]; minTvlUsd?: number } = {
    usdgAddress: USDG_ADDRESS,
    factory: VAULT_V2_FACTORY_ADDRESS,
  },
): boolean {
  const symbols = opts.stablecoins ?? STABLECOINS;
  if (!v.asset || !symbols.includes(v.asset.symbol)) return false;
  const price = v.asset.priceUsd;
  if (typeof price !== 'number' || Math.abs(price - 1) > STABLE_PRICE_TOLERANCE) return false;
  if (v.asset.symbol === 'USDG' && opts.usdgAddress && !eq(v.asset.address, opts.usdgAddress)) return false;
  if (!v.listed) return false;
  if (!opts.factory || !eq(v.factory?.address, opts.factory)) return false;
  return (v.totalAssetsUsd ?? 0) >= (opts.minTvlUsd ?? MIN_TVL_USD);
}

export function toLiveVault(v: ApiVaultV2, opts: { now?: Date; overrides?: CollateralOverrides } = {}): LiveVault {
  const now = opts.now ?? new Date();
  const overrides = opts.overrides ?? {};

  const positions = (v.adapters?.items ?? [])
    .flatMap((a) => a.positions?.items ?? [])
    .filter((p) => (p.supplyAssetsUsd ?? 0) > 0 && p.market.collateralAsset);
  const total = positions.reduce((t, p) => t + (p.supplyAssetsUsd ?? 0), 0);

  const utilization =
    total > 0 ? (positions.reduce((t, p) => t + (p.market.state?.utilization ?? 0) * (p.supplyAssetsUsd ?? 0), 0) / total) * 100 : 0;

  const bySymbol = new Map<string, { usd: number; lltv: number; logo: string | null }>();
  for (const p of positions) {
    const sym = p.market.collateralAsset!.symbol;
    const cur = bySymbol.get(sym) ?? { usd: 0, lltv: 0, logo: safeLogo(p.market.collateralAsset!.logoURI) };
    cur.usd += p.supplyAssetsUsd ?? 0;
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
  const ageDays = (now.getTime() - Number(v.creationTimestamp) * 1000) / 86_400_000;
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
    usdgPrice: v.asset.priceUsd,
  });

  return {
    address: v.address,
    name: v.name,
    asset: { symbol: v.asset.symbol, address: v.asset.address, decimals: v.asset.decimals },
    assetLogo: safeLogo(v.asset.logoURI),
    curator: curatorItem?.name ?? `${v.curator.address.slice(0, 6)}…${v.curator.address.slice(-4)}`,
    curatorVerified: curatorItem?.verified ?? false,
    netApy: net * 100,
    grossApy: (v.apy7d ?? net) * 100,
    performanceFee: v.performanceFee,
    managementFee: v.managementFee,
    tvlUsd: v.totalAssetsUsd ?? 0,
    liquidityUsd: v.liquidityUsd ?? 0,
    utilization,
    collateral,
    oracle,
    oracleLabel,
    ageDays,
    risk,
    flags,
  };
}

/** Fetch, filter and map the live stablecoin vaults. `fetchImpl` is injectable for tests. */
export async function fetchLiveStableVaults(
  opts: { url?: string; fetchImpl?: typeof fetch; overrides?: CollateralOverrides; signal?: AbortSignal } = {},
): Promise<LiveVault[]> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(opts.url ?? MORPHO_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: STABLE_VAULTS_QUERY, variables: { c: [CHAIN_ID] } }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Morpho API HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { vaultV2s?: { items: ApiVaultV2[] | null } }; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Morpho API: ${json.errors[0]!.message}`);
  const items = json.data?.vaultV2s?.items ?? [];
  return items
    .filter((v) => keepVault(v))
    .map((v) => toLiveVault(v, { overrides: opts.overrides }))
    .sort((a, b) => (a.asset.symbol === 'USDG' ? 0 : 1) - (b.asset.symbol === 'USDG' ? 0 : 1) || b.tvlUsd - a.tvlUsd);
}
