# Olvana — notes for Claude

- Read `docs/HANDOFF.md` (spec) and `docs/olvana-prototype.html` (design source of truth) before changing product code. Port faithfully; don't redesign.
- Follow the build order in HANDOFF §10. After each step run `pnpm check` and summarize done / next.
- Never invent contract addresses, chain ids or RPC URLs. They live only in `packages/core/src/config.ts` (null = TODO) or `.env.example`.
- Non-custodial: every value transfer is a user-signed tx, simulated first, exact-amount approvals, allowlisted vaults only.
- Risk score (`packages/core/src/risk.ts`) must keep matching the prototype fixtures: Core A 97, Prime A 100, Boost C 47.
- Nothing demo-only from the prototype ships (Demo controls, localStorage state, simulated tx hashes, fake wallet, sample numbers).
- Addresses are stored lowercase in DB/API.
- Multi-network: networks live in `CHAINS` (`packages/core/src/config.ts`), values copied from Morpho's official registry. Robinhood Chain (4663) is the home network and has Morpho **Vault V2** only — use `vaultV2Abi`. Ethereum, Base and Arbitrum also list **Vault V1 (MetaMorpho)** from `metaMorphoFactories`; run `e2e/vault-v1/run.sh` and `e2e/vault-v2/run.sh` after touching the Earn flow. Every config value's source is logged in `docs/VERIFICATION.md`.
- Risk flags (`riskFlags`) sit next to the grade and never change the score. Headline APY = grade A vaults only.
