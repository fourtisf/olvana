/**
 * Olvana chain & contract configuration — the ONLY place these values live.
 *
 * Every `null` below is a TODO that ALFA/Michael must fill from official
 * Robinhood Chain / Morpho sources (HANDOFF §3). Never guess an address,
 * chain id or RPC URL. Run `pnpm config:todos` to list what is still missing.
 *
 * Secrets and deployment-specific values (RPC URLs, DB/Redis URLs, bot token,
 * WalletConnect id) come from the environment — see `.env.example`.
 */
import { defineChain, getAddress, isAddress, type Address, type Chain } from 'viem';

export type VaultId = 'core' | 'prime' | 'boost';

export interface VaultConfig {
  id: VaultId;
  name: string;
  /** Morpho vault (ERC-4626) address on Robinhood Chain. TODO until verified. */
  address: Address | null;
  /** Curator display name. Placeholder until ALFA supplies it (HANDOFF §9). */
  curator: string;
}

export const CHAIN_NAME = 'Robinhood Chain';

/**
 * Robinhood Chain mainnet id. Verified 2026-09-27: `RobinhoodMainnet = 4663`
 * in Morpho's official SDK (morpho-org/sdks packages/morpho-ts/src/chain.ts)
 * and docs.robinhood.com/chain/connecting (testnet: 46630).
 */
export const CHAIN_ID: number | null = 4663;

/** Native gas token. Verified 2026-09-27: ETH, 18 decimals (Morpho SDK chain.ts, Robinhood docs). */
export const NATIVE_CURRENCY: { name: string; symbol: string; decimals: number } | null = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18,
};

/** Block explorer. Confirmed 2026-09-27 (Robinhood docs; Morpho SDK `explorerUrl`). */
export const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';

/**
 * TODO: USDG token address on Robinhood Chain. USDG is live there (6 decimals),
 * but the address has not yet been read from an official Robinhood / Paxos
 * page — see docs/VERIFICATION.md. Do not fill from third-party lists.
 */
export const USDG_ADDRESS: Address | null = null;

/** USDG decimals (Robinhood docs / Paxos docs). Still read `decimals()` onchain at startup and assert. */
export const USDG_DECIMALS = 6;

/**
 * Morpho Blue core on Robinhood Chain. Verified 2026-09-27 from Morpho's
 * official address registry (morpho-org/sdks packages/morpho-ts/src/addresses.ts,
 * commit 61a904b, `[ChainId.RobinhoodMainnet].blue`).
 */
export const MORPHO_BLUE_ADDRESS: Address | null = '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010';

/**
 * Morpho Vault V2 factory on Robinhood Chain (same source as above). Used to
 * check that every listed vault was deployed by the official factory. Robinhood
 * Chain has no MetaMorpho (V1) factory — vaults there are Vault V2.
 */
export const VAULT_V2_FACTORY_ADDRESS: Address | null = '0x0FBad98595b0186dA120E41f77C102beb49f803c';

/**
 * Morpho GraphQL API. Morpho's API docs list Robinhood Chain as supported
 * (seen 2026-09-27); still keep the onchain-read fallback.
 */
export const MORPHO_API_URL = 'https://api.morpho.org/graphql';

export const SITE_URL = 'https://olvana.org';

/**
 * Listed vaults. The UI may only ever call addresses in this list (allowlist,
 * HANDOFF §4.4). TODO: fill `address` (and curator names) for each vault.
 */
export const VAULTS: readonly VaultConfig[] = [
  { id: 'core', name: 'USDG Core', address: null, curator: '[Curator A]' },
  { id: 'prime', name: 'USDG Prime', address: null, curator: '[Curator B]' },
  { id: 'boost', name: 'USDG Boost', address: null, curator: '[Curator C]' },
];

/**
 * Intended performance fee (HANDOFF §6). Display math must use the fee READ
 * FROM THE VAULT CONTRACT; this is only the target for vaults Olvana deploys.
 */
export const TARGET_PERF_FEE = 0.1;

/**
 * Pre-flight "oracle in range" check: max % deviation of the collateral oracle
 * price vs a reference DEX price before warning. TODO: HANDOFF leaves X open.
 */
export const ORACLE_MAX_DEVIATION_PCT: number | null = null;

/** A snapshot older than this shows the "Stale" badge instead of "Live". */
export const SNAPSHOT_STALE_AFTER_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export class ConfigTodoError extends Error {
  constructor(key: string) {
    super(`Config TODO: ${key} is not set. Fill it in packages/core/src/config.ts from an official source.`);
    this.name = 'ConfigTodoError';
  }
}

/** Throws a clear error while a TODO value is still unset. */
export function required<T>(key: string, value: T | null | undefined): T {
  if (value == null || value === '') throw new ConfigTodoError(key);
  return value;
}

export function vaultById(id: string): VaultConfig | undefined {
  return VAULTS.find((v) => v.id === id);
}

/** Allowlist check: true only for a configured (non-TODO) vault address. */
export function isAllowlistedVault(address: string): boolean {
  if (!isAddress(address)) return false;
  const a = address.toLowerCase();
  return VAULTS.some((v) => v.address != null && v.address.toLowerCase() === a);
}

/** Canonical lowercase form used for all DB / API storage (HANDOFF §7.3). */
export function lower(address: string): string {
  return getAddress(address).toLowerCase();
}

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

/**
 * viem chain definition. Throws until CHAIN_ID is filled; RPC URLs come from
 * env (they may carry API keys) — pass them in from the app.
 */
export function robinhoodChain(rpcUrls: readonly string[]): Chain {
  const id = required('CHAIN_ID', CHAIN_ID);
  const [primary, ...fallbacks] = rpcUrls.filter(Boolean);
  const http = [required('RPC_URL', primary), ...fallbacks];
  return defineChain({
    id,
    name: CHAIN_NAME,
    nativeCurrency: required('NATIVE_CURRENCY', NATIVE_CURRENCY),
    rpcUrls: { default: { http } },
    blockExplorers: { default: { name: 'Blockscout', url: EXPLORER_URL } },
  });
}

export interface ConfigTodo {
  key: string;
  note: string;
}

/** Everything in this file that still blocks a production build. */
export function configTodos(): ConfigTodo[] {
  const todos: ConfigTodo[] = [];
  if (CHAIN_ID == null) todos.push({ key: 'CHAIN_ID', note: 'Robinhood Chain id — official Robinhood Chain docs' });
  if (NATIVE_CURRENCY == null) todos.push({ key: 'NATIVE_CURRENCY', note: 'Robinhood Chain gas token (name/symbol/decimals)' });
  if (USDG_ADDRESS == null) todos.push({ key: 'USDG_ADDRESS', note: 'USDG token on Robinhood Chain' });
  if (MORPHO_BLUE_ADDRESS == null) todos.push({ key: 'MORPHO_BLUE_ADDRESS', note: 'Morpho Blue core — Morpho docs' });
  if (VAULT_V2_FACTORY_ADDRESS == null) todos.push({ key: 'VAULT_V2_FACTORY_ADDRESS', note: 'Morpho Vault V2 factory' });
  for (const v of VAULTS) {
    if (v.address == null) todos.push({ key: `VAULTS.${v.id}.address`, note: `${v.name} Morpho vault address` });
    if (/^\[.*\]$/.test(v.curator)) todos.push({ key: `VAULTS.${v.id}.curator`, note: `${v.name} curator name` });
  }
  if (ORACLE_MAX_DEVIATION_PCT == null)
    todos.push({ key: 'ORACLE_MAX_DEVIATION_PCT', note: 'Oracle-vs-DEX deviation threshold for the pre-flight warning' });
  return todos;
}
