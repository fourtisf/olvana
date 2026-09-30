/**
 * Morpho Vault V2 gates (morpho-org/vault-v2 src/VaultV2.sol, src/interfaces/IGate.sol): a curator can restrict who
 * may deposit (receiveSharesGate, sendAssetsGate) or withdraw (sendSharesGate, receiveAssetsGate). 0 = open.
 * Olvana lists only vaults anyone can enter and leave, so the server snapshot drops every Vault V2 with any gate set
 * (e.g. "Flowdesk Confidential High Yield USDT" on Ethereum: sendAssetsGate set, deposits refused for other addresses).
 * The Morpho API does not expose gates, so they are read onchain with plain eth_call over JSON-RPC.
 */
import { CHAINS } from './config';

/** Gate getters on the vault (selectors = keccak256 of the signature, first 4 bytes). */
export const GATE_GETTERS = {
  receiveSharesGate: '0x7e729ac4',
  sendAssetsGate: '0x8eede801',
  sendSharesGate: '0x93ab2ab7',
  receiveAssetsGate: '0x54cde13e',
} as const;

/**
 * JSON-RPC endpoint per network for these reads: `OLVANA_RPC_<chainId>` from the environment, else the chain's
 * `rpcUrl` from config.ts (Robinhood Chain). Networks with neither are not checked (their vaults stay listed; the
 * site still refuses a gated deposit at review, before any approval).
 */
export function gateRpcUrls(env: Record<string, string | undefined> = process.env): Record<number, string> {
  const out: Record<number, string> = {};
  for (const c of CHAINS) {
    const u = env[`OLVANA_RPC_${c.id}`] || c.rpcUrl;
    if (u) out[c.id] = u;
  }
  return out;
}

const ZERO = /^0x0{40}$/;
/** Last 20 bytes of an ABI word as a lowercase address; null when the result is not a 32-byte word. */
const wordToAddress = (w: unknown): string | null =>
  typeof w === 'string' && /^0x[0-9a-fA-F]{64}$/.test(w) ? ('0x' + w.slice(-40)).toLowerCase() : null;

/**
 * For each vault: true = at least one gate is set (restricted), false = all four are 0 (open to everyone),
 * null = could not be read (left to the caller; the snapshot keeps such a vault).
 */
export async function readGates(
  rpcUrl: string,
  vaults: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>(vaults.map((v) => [v.toLowerCase(), null]));
  const getters = Object.values(GATE_GETTERS);
  const reqs = vaults.flatMap((v, i) =>
    getters.map((data, k) => ({ jsonrpc: '2.0', id: i * 4 + k, method: 'eth_call', params: [{ to: v, data }, 'latest'] })),
  );
  const res = new Map<number, unknown>();
  for (let i = 0; i < reqs.length; i += 100) {
    try {
      const r = await fetchImpl(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqs.slice(i, i + 100)) });
      const body: unknown = await r.json();
      if (Array.isArray(body)) for (const x of body) if (x && typeof x.id === 'number') res.set(x.id, x.result);
    } catch {
      /* this chunk stays unknown */
    }
  }
  vaults.forEach((v, i) => {
    const words = getters.map((_, k) => wordToAddress(res.get(i * 4 + k)));
    if (words.some((w) => w && !ZERO.test(w))) out.set(v.toLowerCase(), true);
    else if (words.every((w) => w && ZERO.test(w))) out.set(v.toLowerCase(), false);
  });
  return out;
}
