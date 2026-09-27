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
| USDG Vault V2s from the official factory | ~30 vaults; 10 with TVL ≥ $10k (below) — the rest hold 0–230 USDG (test/empty) | onchain, `isVaultV2` = true for all, 2026-09-27 | listed on the site only if Morpho-listed and ≥ $10k TVL |
| Stock-token oracles | Chainlink, stock feeds update 24/5 | docs.robinhood.com/chain/oracles-and-price-feeds *(snippet)* | basis for the tokenized-stock risk flag |

Before filling any open item: open the official page yourself, copy the value,
then confirm onchain (bytecode exists, `symbol()` / `asset()` / factory
membership) and add the source + date as a comment next to the value.

## USDG Vault V2s with TVL ≥ $10k (onchain, 2026-09-27)

All created by the official Vault V2 factory, asset = USDG (`0x5fc5…d168`).

| TVL (USDG) | Vault | Address |
|---:|---|---|
| 514,091,259 | Steakhouse USDG (steakUSDG) | `0xBeEff033F34C046626B8D0A041844C5d1A5409dd` |
| 4,575,730 | Ethena x Steakhouse USDG (ethenaUSDG) | `0xbEeFF0fb1Dc19344A87b8479dAb60A2e16160737` |
| 1,445,506 | NetNet Credit (nnUSDG) | `0x99347d5F70D3838763f6Bddcf80304C8aa953B57` |
| 100,002 | Grove x Steakhouse USDG (groveUSDG) | `0xBEEff039907422219Fb367e525954DDC092854d9` |
| 92,204 | Longbow Core USDG (lbcoreUSDG) | `0x026df18fbd2A7639089D0a16293383ec687A5Ca1` |
| 63,735 | Longbow Frontier USDG (lbfrontUSDG) | `0x65dC90cd3a0BCDE967c8AE6019d6790b616E78F7` |
| 53,889 | Purinta USDG (PurintaUSDG) | `0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8` |
| 51,014 | MEV Capital USDG (MEV-USDG) | `0xaED8B69FBd85aB131fAbC9312D9E0BD7A08fd5Be` |
| 50,902 | Steakhouse Turbo USDG (bbqUSDGturbo) | `0xbeEfFF136E3684273e6aA75A1669B784B373A4FD` |
| 10,085 | Stable USDG (stableUSDG) | `0x002E0d4D1c23c4E5186b782A058567f21828C705` |

Addresses copied from the verify script output (screenshot); re-run
`verify:onchain` before pinning any of them in `VAULTS`.
