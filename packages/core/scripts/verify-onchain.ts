/**
 * Onchain verification for the values in src/config.ts.
 *
 *   RPC_URL=<robinhood chain rpc> pnpm --filter @olvana/core verify:onchain [--asset 0x…]
 *
 * Read-only. Checks the chain id, that Morpho Blue and the Vault V2 factory
 * have code, then lists every Vault V2 created by the official factory for the
 * given asset (candidate USDG) and reads each vault's asset, name, fees,
 * curator and TVL. Output is meant to be pasted into docs/VERIFICATION.md.
 */
import { createPublicClient, erc20Abi, getAddress, http, isAddress, parseAbiItem, type Address } from 'viem';
import { vaultV2Abi, vaultV2FactoryAbi } from '../src/abis/vaultV2';
import { CHAIN_ID, MORPHO_BLUE_ADDRESS, VAULTS, VAULT_V2_FACTORY_ADDRESS } from '../src/config';

const rpc = process.env.RPC_URL;
if (!rpc) {
  console.error('Set RPC_URL to a Robinhood Chain RPC endpoint.');
  process.exit(1);
}
const argAsset = process.argv[process.argv.indexOf('--asset') + 1];
const client = createPublicClient({ transport: http(rpc, { retryCount: 3 }) });

const ok = (b: boolean) => (b ? 'OK  ' : 'FAIL');
const fmt = (v: bigint, d: number) => (Number(v) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function hasCode(a: Address) {
  const code = await client.getCode({ address: a });
  return !!code && code !== '0x';
}

async function tokenInfo(a: Address) {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address: a, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address: a, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: a, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { name, symbol, decimals };
}

/** getLogs in shrinking chunks — public RPCs cap the block range. */
async function createdVaults(factory: Address, asset: Address, fromBlock: bigint) {
  const event = parseAbiItem(
    'event CreateVaultV2(address indexed owner, address indexed asset, bytes32 salt, address indexed newVaultV2)',
  );
  const latest = await client.getBlockNumber();
  const out: Address[] = [];
  let step = 2_000_000n;
  for (let from = fromBlock; from <= latest; ) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    try {
      const logs = await client.getLogs({ address: factory, event, args: { asset }, fromBlock: from, toBlock: to });
      for (const l of logs) if (l.args.newVaultV2) out.push(l.args.newVaultV2);
      from = to + 1n;
    } catch (e) {
      if (step <= 10_000n) throw e;
      step /= 4n;
    }
  }
  return out;
}

async function main() {
  const chainId = await client.getChainId();
  console.log(`${ok(chainId === CHAIN_ID)} chain id ${chainId} (config ${CHAIN_ID})`);
  const blue = MORPHO_BLUE_ADDRESS!;
  const factory = VAULT_V2_FACTORY_ADDRESS!;
  console.log(`${ok(await hasCode(blue))} Morpho Blue has code at ${blue}`);
  console.log(`${ok(await hasCode(factory))} Vault V2 factory has code at ${factory}`);

  const configured = VAULTS.filter((v) => v.address).map((v) => v.address!) as Address[];
  const asset: Address | undefined = argAsset && isAddress(argAsset) ? getAddress(argAsset) : undefined;

  if (asset) {
    const t = await tokenInfo(asset);
    console.log(`\nAsset ${asset}: ${t.name} (${t.symbol}), ${t.decimals} decimals`);
    console.log('Searching official factory for Vault V2s with this asset (block 288 → latest)…');
    const found = await createdVaults(factory, asset, 288n);
    console.log(`Found ${found.length} vault(s).`);
    configured.push(...found.filter((f) => !configured.includes(f)));
  }

  for (const v of configured) {
    const [isV2, vAsset, name, symbol, totalAssets, perfFee, perfRecipient, mgmtFee, curator, owner] = await Promise.all([
      client.readContract({ address: factory, abi: vaultV2FactoryAbi, functionName: 'isVaultV2', args: [v] }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'asset' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'name' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'symbol' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'totalAssets' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'performanceFee' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'performanceFeeRecipient' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'managementFee' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'curator' }),
      client.readContract({ address: v, abi: vaultV2Abi, functionName: 'owner' }),
    ]);
    const t = await tokenInfo(vAsset);
    console.log(`\n${ok(isV2)} vault ${v} — created by official factory: ${isV2}`);
    console.log(`     name ${name} (${symbol})`);
    console.log(`     asset ${vAsset} = ${t.symbol}, ${t.decimals} decimals`);
    console.log(`     TVL ${fmt(totalAssets, t.decimals)} ${t.symbol}`);
    console.log(`     performance fee ${Number(perfFee) / 1e16}% → ${perfRecipient}`);
    console.log(`     management fee ${((Number(mgmtFee) * 31_536_000) / 1e16).toFixed(2)}%/year (raw per-second WAD ${mgmtFee})`);
    console.log(`     curator ${curator} · owner ${owner}`);
  }
  if (!configured.length) console.log('\nNo vaults configured. Pass --asset <USDG candidate> to discover vaults.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
