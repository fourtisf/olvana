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

## Networks (multi-chain) — from Morpho's official registry

Source: morpho-org/sdks `packages/morpho-ts/src/addresses.ts` and `chain.ts` @ `61a904b`
(read directly, 2026-09-27). Stablecoin pins are the only token address accepted
for that symbol on that network; symbols without a pin rely on the official
factory + Morpho listing.

| Network | Chain id | Explorer | Morpho Blue | Vault V2 factory | Stablecoin pins |
|---|---:|---|---|---|---|
| Robinhood Chain | 4663 | robinhoodchain.blockscout.com | `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010` | `0x0FBad98595b0186dA120E41f77C102beb49f803c` | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (onchain) |
| Ethereum | 1 | etherscan.io | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | `0xA1D94F746dEfa1928926b84fB2596c06926C0405` | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7`, DAI `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| Base | 8453 | basescan.org | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | `0x4501125508079A99ebBebCE205DeC9593C2b5857` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arbitrum One | 42161 | arbiscan.io | `0x6c247b1F6182318877311737BaC0844bAa518F5e` | `0x6b46fa3cc9EBF8aB230aBAc664E37F2966Bf7971` | USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

Only Morpho **Vault V2** vaults are listed. Large USDC/USDT vaults on Ethereum/Base
that are still MetaMorpho (V1) are not included yet.

## Deposit / withdraw calls (checked 2026-09-28)

Read from Morpho's Vault V2 source, morpho-org/vault-v2 `src/VaultV2.sol`,
`src/VaultV2Factory.sol` and `src/libraries/ErrorsLib.sol` @ `9ee4dbdcc9b261eef60768e3997e328224b68395`.
Selectors computed with viem and pinned by `packages/core/test/tx.test.ts`.

| Call | Selector | Notes |
|---|---|---|
| `deposit(uint256 assets, address onBehalf)` | `0x6e553f65` | pulls `assets` with `transferFrom`, so an allowance ≥ assets is needed |
| `withdraw(uint256 assets, address receiver, address onBehalf)` | `0xb460af94` | partial exit |
| `redeem(uint256 shares, address receiver, address onBehalf)` | `0xba087652` | full exit (all shares, no dust) |
| `approve(address,uint256)` on the asset | `0x095ea7b3` | exact amount only; reset to 0 first when the token refuses non-zero → non-zero (USDT) |
| `VaultV2Factory.isVaultV2(address)` | `0x5edec50d` | onchain allowlist check before any transaction |
| `asset()` | `0x38d52e0f` | must equal the pinned stablecoin address |
| `maxDeposit` / `maxWithdraw` / `maxRedeem` | — | **always return 0 in Vault V2** ("gross underestimation"), so HANDOFF §4.2's `maxWithdraw` cap cannot be used; the exact call is simulated with `eth_call` instead |

Tested end to end on a local chain (id 4663) running this exact source at the
mainnet factory address: `e2e/vault-v2/run.sh` (25 checks: exact approval,
deposit, rejection + retry, partial withdraw, MAX redeem, USDT-style token,
lookalike vault blocked). **Not yet tested on mainnet**: do one deposit and one
withdrawal of ~$1 from the owner's wallet before announcing.

## Morpho Vault V1 (MetaMorpho) — checked 2026-09-28

| Network | Factory | Source |
|---|---|---|
| Ethereum (1) | `0x1897A8997241C1cD4bD0698647e4EB7213535c24` (v1.1) | morpho-org/sdks `packages/morpho-ts/src/addresses.ts` @ `61a904b`, `metaMorphoFactory` |
| Ethereum (1) | `0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101` (v1.0) | same commit, `packages/blue-sdk-viem/contracts/GetVault.sol`: "MetaMorpho factory V1.0 only exists on Ethereum (1) and Base (8453)" |
| Base (8453) | `0xFf62A7c278C62eD665133147129245053Bbf5918` (v1.1) and the v1.0 factory above | same two files |
| Arbitrum One (42161) | `0x878988f5f561081deEa117717052164ea1Ef0c82` (v1.1) | addresses.ts |
| Robinhood Chain (4663) | none (Vault V2 only) | addresses.ts has no `metaMorphoFactory` for 4663 |

Onchain allowlist check: `isMetaMorpho(address)` = `0x29b5352c` on each factory of the vault's network
(`IMetaMorphoV1_1Factory.sol`, morpho-org/metamorpho-v1.1 @ `3b17547ee464d00370d1e5e7cd997c3cdb8b0fb7`).
V1 vaults are plain ERC-4626: same `deposit` / `withdraw` / `redeem` selectors as Vault V2. Unlike V2, V1's
`maxDeposit(address)` (`0x402d267d`) is real, so a full vault is blocked before any approval.
Errors mapped to plain English: `AllCapsReached`, `NotEnoughLiquidity` (ErrorsLib.sol), OpenZeppelin
`ERC4626ExceededMax{Deposit,Withdraw,Redeem}`, `ERC20Insufficient{Balance,Allowance}`.

API fields (`vaults`, `vaultByAddress`, `VaultState.weeklyApy/dailyApy/fee/allocation`, `Vault.liquidity`) come
from the API types in morpho-org/sdks `packages/liquidity-sdk-viem/src/api/types.ts` @ `61a904b`. **Not yet run
against the live API** (it is unreachable from the build environment): run
`pnpm --filter @olvana/core live:vaults` on the VPS and check the "Vault V1" lines. If the V1 query fails there,
the site still shows every V2 vault (V1 is loaded separately and failures are skipped).

Net APY for V1 = `weeklyApy × (1 − fee)`: the vault's own yield after the curator fee, **without** reward tokens.

Tested end to end on a local chain (id 1) running Morpho Blue + MetaMorpho v1.1 compiled from source, factory at
its Ethereum address: `e2e/vault-v1/run.sh` (14 checks).
