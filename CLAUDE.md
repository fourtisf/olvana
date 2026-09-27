# Olvana — notes for Claude

- Read `docs/HANDOFF.md` (spec) and `docs/olvana-prototype.html` (design source of truth) before changing product code. Port faithfully; don't redesign.
- Follow the build order in HANDOFF §10. After each step run `pnpm check` and summarize done / next.
- Never invent contract addresses, chain ids or RPC URLs. They live only in `packages/core/src/config.ts` (null = TODO) or `.env.example`.
- Non-custodial: every value transfer is a user-signed tx, simulated first, exact-amount approvals, allowlisted vaults only.
- Risk score (`packages/core/src/risk.ts`) must keep matching the prototype fixtures: Core A 97, Prime A 100, Boost C 47.
- Nothing demo-only from the prototype ships (Demo controls, localStorage state, simulated tx hashes, fake wallet, sample numbers).
- Addresses are stored lowercase in DB/API.
- Robinhood Chain (4663) has Morpho **Vault V2** only — use `vaultV2Abi`, not MetaMorpho. Every config value's source is logged in `docs/VERIFICATION.md`.
- Risk flags (`riskFlags`) sit next to the grade and never change the score. Headline APY = grade A vaults only.
