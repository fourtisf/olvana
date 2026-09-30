/**
 * Writes the vault snapshot the website loads first (/vaults.json), so every vault appears at once
 * instead of network by network. Run it every few minutes on the server:
 *
 *   pnpm --filter @olvana/core snapshot /var/www/olvana/vaults.json
 *
 * The file is replaced atomically. If nothing could be fetched, the previous file is left in place
 * (the site falls back to live API calls once it is older than 20 minutes).
 *
 * Vault V2s with a gate (curator allowlist for deposits or withdrawals) are left out: set OLVANA_RPC_1,
 * OLVANA_RPC_8453 and OLVANA_RPC_42161 (any JSON-RPC endpoint of that network) so those networks are checked;
 * Robinhood Chain uses its rpcUrl from config.ts. See src/gates.ts.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { MORPHO_API_URL } from '../src/config';
import { buildSnapshot } from '../src/morpho';

const out = process.argv[2] ?? 'vaults.json';
const url = process.argv[3] ?? MORPHO_API_URL;
const t0 = Date.now();

buildSnapshot({ url })
  .then((snap) => {
    if (!snap.items.length) {
      console.error(`snapshot: no vaults fetched, keeping the previous ${out}`);
      process.exit(1);
    }
    writeFileSync(out + '.tmp', JSON.stringify(snap));
    renameSync(out + '.tmp', out);
    const v1 = snap.items.filter((v) => v.kind === 'v1').length;
    const hidden = snap.restricted?.length ? `, ${snap.restricted.length} restricted hidden` : '';
    const unchecked = snap.gatesUnchecked?.length ? `, gates not checked on chains ${snap.gatesUnchecked.join(', ')} (set OLVANA_RPC_<chainId>)` : '';
    console.log(`snapshot: ${snap.items.length} vaults (${v1} V1) → ${out} in ${Date.now() - t0} ms${hidden}${snap.failed.length ? `, failed chains: ${snap.failed.join(', ')}` : ''}${unchecked}`);
  })
  .catch((e) => {
    console.error(`snapshot: failed (${(e as Error).message}), keeping the previous ${out}`);
    process.exit(1);
  });
