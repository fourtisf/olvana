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
 * USDG on Robinhood Chain. Verified onchain 2026-09-27 (scripts/verify-onchain.ts
 * run from the VPS): it is the `asset()` of Vault V2s created by the official
 * factory, `symbol()` = USDG, `decimals()` = 6. Also listed in Robinhood's
 * contracts docs. See docs/VERIFICATION.md.
 */
export const USDG_ADDRESS: Address | null = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

/** USDG decimals (Robinhood docs / Paxos docs). Still read `decimals()` onchain at startup and assert. */
export const USDG_DECIMALS = 6;

/**
 * Stablecoins Olvana lists. A vault's asset must match one of these symbols
 * AND trade within 2% of $1 (see morpho.ts `keepVault`). Only USDG is pinned
 * to an address so far — pin the others here as they are verified.
 */
export const STABLECOINS: readonly string[] = ['USDG', 'USDC', 'USDT', 'USDT0', 'USDe', 'PYUSD', 'DAI', 'USDS'];

/**
 * Stablecoins that are not backed 1:1 by cash/treasuries (e.g. USDe is a
 * synthetic dollar backed by hedged crypto positions). Shown with a flag.
 */
export const SYNTHETIC_STABLECOINS: readonly string[] = ['USDe'];

/**
 * Vaults below this TVL are not listed. Robinhood Chain has many empty or
 * test Vault V2s (TVL 0–101 USDG seen onchain on 2026-09-27); their APY is
 * meaningless and they add noise. Product default — adjust here.
 */
export const MIN_TVL_USD = 10_000;

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

/* ------------------------------------------------------------------ */
/* Networks (multi-chain)                                              */
/* ------------------------------------------------------------------ */

export type ChainKey = 'robinhood' | 'ethereum' | 'base' | 'arbitrum';

export interface ChainConfig {
  id: number;
  key: ChainKey;
  name: string;
  short: string;
  explorer: string;
  morphoBlue: Address;
  /** Only vaults created by this factory are listed on this chain. */
  vaultV2Factory: Address;
  /** Stablecoin symbol → the one token address accepted for it on this chain. */
  stablecoinPins: Readonly<Record<string, Address>>;
  /** Only for chains wallets may not know yet (used by wallet_addEthereumChain). */
  rpcUrl?: string;
}

/**
 * Networks Olvana lists vaults on. Morpho Blue, Vault V2 factory, explorer and
 * stablecoin addresses come from Morpho's official registry (morpho-org/sdks
 * packages/morpho-ts/src/{addresses,chain}.ts @ 61a904b); USDG on Robinhood
 * Chain was verified onchain. See docs/VERIFICATION.md. Robinhood Chain is the
 * home network. To add a chain: copy its values from the same registry.
 */
export const CHAINS: readonly ChainConfig[] = [
  {
    id: 4663,
    key: 'robinhood',
    name: 'Robinhood Chain',
    short: 'Robinhood',
    explorer: 'https://robinhoodchain.blockscout.com',
    morphoBlue: '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010',
    vaultV2Factory: '0x0FBad98595b0186dA120E41f77C102beb49f803c',
    stablecoinPins: { USDG: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' },
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  },
  {
    id: 1,
    key: 'ethereum',
    name: 'Ethereum',
    short: 'Ethereum',
    explorer: 'https://etherscan.io',
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    vaultV2Factory: '0xA1D94F746dEfa1928926b84fB2596c06926C0405',
    stablecoinPins: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
  },
  {
    id: 8453,
    key: 'base',
    name: 'Base',
    short: 'Base',
    explorer: 'https://basescan.org',
    morphoBlue: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    vaultV2Factory: '0x4501125508079A99ebBebCE205DeC9593C2b5857',
    stablecoinPins: { USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  },
  {
    id: 42161,
    key: 'arbitrum',
    name: 'Arbitrum One',
    short: 'Arbitrum',
    explorer: 'https://arbiscan.io',
    morphoBlue: '0x6c247b1F6182318877311737BaC0844bAa518F5e',
    vaultV2Factory: '0x6b46fa3cc9EBF8aB230aBAc664E37F2966Bf7971',
    stablecoinPins: { USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  },
];

export const CHAIN_IDS: readonly number[] = CHAINS.map((c) => c.id);
export function chainById(id: number | null | undefined): ChainConfig | undefined {
  return CHAINS.find((c) => c.id === id);
}

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
