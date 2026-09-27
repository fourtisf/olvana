# Chain & contract verification log

Every value in `packages/core/src/config.ts` must come from an official source.
This file records what was checked, where, and what is still open.

Checked 2026-09-27. Network note: the research environment could not load
docs.robinhood.com, docs.morpho.org, api.morpho.org or globaldollar.com directly;
items marked *(snippet)* were seen only in search-result excerpts of those official
pages and must be re-opened by a human before launch.

| Item | Value | Source | Status |
|---|---|---|---|
| Robinhood Chain mainnet | live since 2026-07-01 (Arbitrum Orbit) | Robinhood newsroom *(snippet)* | confirmed |
| Chain id | `4663` (testnet `46630`) | Morpho SDK `packages/morpho-ts/src/chain.ts` (read); docs.robinhood.com/chain/connecting *(snippet)* | **in config** |
| Gas token | ETH, 18 decimals | Morpho SDK chain.ts (read); Robinhood docs *(snippet)* | **in config** |
| Explorer | `https://robinhoodchain.blockscout.com` | Robinhood docs *(snippet)*; Morpho SDK `explorerUrl` (read) | **in config** |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` | docs.robinhood.com/chain/connecting *(snippet)*; answered the verify script from the VPS 2026-09-27 | works — use as fallback, a paid provider as primary |
| USDG on Robinhood Chain | live, 6 decimals, LayerZero OFT | Global Dollar newsroom, Robinhood/Paxos docs *(snippet)* | confirmed |
| USDG address | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | onchain (`verify-onchain.ts` from the VPS): `asset()` of Vault V2s created by the official factory; `symbol()` USDG, `decimals()` 6 | **in config** |
| Morpho Blue | `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010` | morpho-org/sdks `packages/morpho-ts/src/addresses.ts` @ `61a904b` (read) | **in config** |
| Vault V2 factory | `0x0FBad98595b0186dA120E41f77C102beb49f803c` | same | **in config** |
| MetaMorpho (V1) factory | none for chain 4663 | same | vaults on this chain are V2 → `vaultV2Abi` |
| Morpho API coverage | Robinhood Chain listed | docs.morpho.org API get-started *(snippet)* | likely — verify with a real query |
| Existing USDG vault | Steakhouse USDG (Steakhouse Financial) | app.morpho.org *(snippet)*, Morpho blog | open — confirm address and that it was created by the V2 factory |
| USDG Vault V2s from the official factory | e.g. `0x653c7102D4c4d76ab83e6Bd26c8780F3B125C700` "Ravenhood Flock Credit USDG" (TVL 0 on 2026-09-27) | onchain, `isVaultV2` = true | discovered — full list pending the complete script output |
| Stock-token oracles | Chainlink, stock feeds update 24/5 | docs.robinhood.com/chain/oracles-and-price-feeds *(snippet)* | basis for the tokenized-stock risk flag |

Before filling any open item: open the official page yourself, copy the value,
then confirm onchain (bytecode exists, `symbol()` / `asset()` / factory
membership) and add the source + date as a comment next to the value.
