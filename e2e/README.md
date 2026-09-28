# End-to-end transaction tests

These drive the site's real deposit / withdraw code (`docs/olvana-prototype.html`) in Chromium, with a test wallet
wired to a local anvil chain that runs **Morpho's own contracts compiled from source**. No mainnet RPC or funds.

| Suite | Contracts (source, pinned commit) | Chain | Checks |
|---|---|---|---|
| `vault-v2/run.sh` | VaultV2 + VaultV2Factory — morpho-org/vault-v2 `9ee4dbd` | id 4663, factory at `0x0FBa…803c`, USDG stand-in at `0x5fc5…d168` | 25 |
| `vault-v1/run.sh` | MetaMorpho v1.1 + factory — morpho-org/metamorpho-v1.1 `3b17547`; Morpho Blue from its submodule | id 1, factory at `0x1897…5c24`, USDC stand-in at `0xA0b8…eB48` | 14 |

Covered: exact-amount approval then deposit (calldata and onchain balances), wallet rejection and retry, partial
withdraw, MAX → redeem all shares, a USDT-style token with a leftover allowance, a V1 vault at its cap (blocked before
any approval), a cap cut between review and signing (stopped by the simulation), and lookalike vaults that the API lists
but no official factory created (blocked, nothing sent).

Needs Linux x86-64, Node 22, python3, git, curl, `playwright-core` (set `PLAYWRIGHT_CORE` to its path if it is not
resolvable) and Chromium (`CHROMIUM`, default `/opt/pw-browsers/chromium`). `tools.sh` downloads Foundry, solc
0.8.19 / 0.8.26 / 0.8.28 and the Morpho sources into `e2e/.tools/` (ignored by git).

Run both before every deploy that touches the Earn page.
