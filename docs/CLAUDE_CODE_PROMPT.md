# Prompt for Claude Code

Copy everything below the line into Claude Code, from the folder that contains `HANDOFF.md` and `olvana-prototype.html`.

---

You are building **Olvana** (olvana.org), a non-custodial USDG earn app on Robinhood Chain using Morpho vaults, with an A/B/C risk grade on every vault.

Read these two files first, fully, before writing any code:
1. `HANDOFF.md` — the production spec (stack, contracts, risk formula, backend, API, build order, acceptance checklist).
2. `olvana-prototype.html` — the approved design and UX. Open it and treat it as the source of truth for layout, copy, colors, spacing, flows and formulas. Port it faithfully; don't redesign.

Rules:
- Stack is fixed: Next.js 14 (App Router, TypeScript), wagmi v2 + viem + RainbowKit, Fastify, Prisma + PostgreSQL, Redis + BullMQ, grammY for Telegram. Monorepo layout as in HANDOFF §2.
- **Never invent contract addresses, chain IDs or RPC URLs.** Put every one in `packages/core/config.ts` / `.env.example` as a clearly marked TODO, and list them for me at the end. If a step can't proceed without one, build it against config and stub the value.
- Olvana never takes custody. Every value transfer is a user-signed transaction, simulated first, with exact-amount approvals.
- Port the risk score formula exactly (HANDOFF §5) with unit tests using the three prototype vaults as fixtures (expected scores 97 / 100 / 47).
- Remove everything demo-only from the prototype: Demo controls, localStorage state, simulated tx hashes, fake wallet fallback, hardcoded sample numbers.
- Follow the build order in HANDOFF §10. After each step: run typecheck, lint and tests, then give me a short summary of what's done and what's next before continuing.

Start with step 1: scaffold the monorepo, `packages/core` (config, ABIs for ERC-20 / ERC-4626 / Morpho Blue, risk.ts with tests, points math with tests) and `packages/db` (Prisma schema from HANDOFF §7.1). Then stop and show me the list of config TODOs.
