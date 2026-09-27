# Olvana

Non-custodial USDG earn app on Robinhood Chain, built on Morpho vaults, with an A/B/C risk grade on every vault — [olvana.org](https://olvana.org).

- Spec: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- Approved design / UX (source of truth for layout, copy, colors, flows, formulas): [`docs/olvana-prototype.html`](docs/olvana-prototype.html)

## Layout

```
apps/web        Next.js 14 frontend              (build step 2+)
apps/api        Fastify API                      (step 2+)
apps/worker     indexer + cron jobs              (step 4+)
apps/bot        Telegram bot (grammY)            (step 6)
packages/core   chain config, ABIs, risk score, points math
packages/db     Prisma schema + client (PostgreSQL)
```

## Getting started

Requires Node ≥ 22.12 and pnpm 10.

```sh
pnpm install
cp .env.example .env
pnpm check          # typecheck + lint + tests
pnpm config:todos   # chain/contract values still to be filled in
```

Database (needs `DATABASE_URL`):

```sh
pnpm --filter @olvana/db migrate:deploy
pnpm --filter @olvana/db seed
```

## Configuration

Chain id, USDG, Morpho Blue and vault addresses live **only** in
`packages/core/src/config.ts`. Unverified ones are `null` until confirmed from official
Robinhood Chain / Morpho sources — never guessed. Code that needs one calls
`required(...)`, which throws a clear `ConfigTodoError` while it's unset.
Secrets and deployment values are env vars, documented in `.env.example`.
Where each verified value came from is logged in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
Security contact: [`SECURITY.md`](SECURITY.md).
