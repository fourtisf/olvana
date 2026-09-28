# Deposit / withdraw end-to-end test

`./run.sh` tests the site's real transaction code (`docs/olvana-prototype.html`)
against Morpho's real Vault V2 contracts on a local chain. No mainnet RPC or funds.

What it checks (25 checks):
- the exact-amount approval, then `deposit(assets, user)`: calldata, onchain balances, allowance used up
- a rejected wallet prompt, then retry
- partial `withdraw(assets, user, user)` and MAX → `redeem(allShares, user, user)` (no dust)
- a USDT-style token with a leftover allowance → reset to 0, approve, deposit
- a vault the API lists but the factory did not create → blocked, nothing sent

Needs: Linux x86-64, Node 22, python3, git, curl, `playwright-core` (set
`PLAYWRIGHT_CORE` to its path if it is not resolvable) and Chromium (`CHROMIUM`,
default `/opt/pw-browsers/chromium`). Tools are downloaded into `.tools/` (ignored
by git): Foundry stable, solc 0.8.28, morpho-org/vault-v2 @ `9ee4dbd`.

Run it before every deploy that touches the Earn page.
