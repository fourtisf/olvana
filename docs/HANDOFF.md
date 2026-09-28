# Olvana — Production Handoff

**Product:** Olvana (olvana.org) — non-custodial USDG earn app on Robinhood Chain, built on Morpho vaults, with an A/B/C risk grade on every vault.
**Owner:** ALFA · **Developer:** Michael (MichaelCoinsult)
**Reference prototype:** `olvana-prototype.html` (single file, open in a browser). It is the source of truth for **layout, copy, colors, flows and formulas**. Everything in it marked "sample data", "simulated" or "Demo controls" must be replaced with real data / real transactions.

---

## 1. What the product does

1. User connects a wallet (no account, no email).
2. User picks a vault (e.g. USDG Core / Prime / Boost). Each vault shows net APY, TVL, utilization, withdrawable liquidity, collateral mix, oracle, curator and a **risk grade (A/B/C, score /100)**.
3. User deposits USDG → funds go **directly from the wallet into a Morpho vault (ERC-4626)**. Olvana never holds funds.
4. User earns interest paid by overcollateralized borrowers, plus **points** (1 pt per $ per day).
5. User can withdraw any time, subject to vault liquidity.
6. Optional: Telegram alerts (daily report, utilization warning, collateral change) and a referral link (referrer gets 10% of referee's points).

Revenue: **10% performance fee on yield**, set in the vault contract (see §6 — this requires Olvana to own/curate its vaults).

---

## 2. Stack (match ALFA's standard)

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind or CSS modules — port styles from prototype |
| Wallet | wagmi v2 + viem + RainbowKit (injected, WalletConnect, Coinbase Wallet) |
| API | Fastify (TypeScript) |
| DB | PostgreSQL + Prisma |
| Cache / jobs | Redis (+ BullMQ for scheduled jobs) |
| Indexer | Node worker using viem `watchContractEvent` + backfill via `getLogs` |
| Telegram bot | grammY (Node) |
| Hosting | Hostinger VPS, PM2, Nginx (reverse proxy + TLS) |

Monorepo suggestion:
```
apps/web        Next.js frontend
apps/api        Fastify API
apps/worker     indexer + cron jobs (points, snapshots, alerts)
apps/bot        Telegram bot
packages/core   shared types, risk-score, points math, chain config, ABIs
packages/db     Prisma schema + client
```

---

## 3. Chain & contract config — **TODO: ALFA/Michael must fill before build**

Everything below lives in `packages/core/config.ts` (and `.env`). Do **not** hardcode elsewhere.

| Key | Value | Status |
|---|---|---|
| `CHAIN_ID` | `4663` (mainnet; testnet 46630) | **verified 2026-09-27** — see `docs/VERIFICATION.md` |
| `RPC_URL` | Robinhood Chain RPC (+ fallback) | **TODO** — env; documented public RPC listed in `docs/VERIFICATION.md` |
| `EXPLORER_URL` | `https://robinhoodchain.blockscout.com` | **confirmed** |
| `USDG_ADDRESS` | USDG token on Robinhood Chain (6 decimals) | **TODO — address not yet read from an official page** |
| `MORPHO_BLUE_ADDRESS` | `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010` | **verified** (Morpho official address registry) |
| `VAULT_V2_FACTORY_ADDRESS` | `0x0FBad98595b0186dA120E41f77C102beb49f803c` | **verified** (same source) — Robinhood Chain has **Vault V2 only**, no MetaMorpho |
| `VAULTS[]` | `{ id, name, address, curator }` for each listed vault | **TODO** — depends on §6 decision |
| `MORPHO_API` | `https://api.morpho.org/graphql` | Morpho docs list Robinhood Chain as supported; keep onchain fallback |
| `PERF_FEE` | `0.10` | read from vault contract, not hardcoded, once vaults exist |
| `TELEGRAM_BOT_TOKEN` | from @BotFather | **TODO** |
| `SITE_URL` | `https://olvana.org` | |

**Never guess addresses.** If an address can't be verified from official Morpho / Robinhood Chain sources, stop and ask.

---

## 4. Onchain integration

### 4.1 Deposit (ERC-4626)
1. Read `USDG.allowance(user, vault)`. If `< amount` → `USDG.approve(vault, amount)` (exact amount, not max).
2. `simulateContract` → `vault.deposit(assets, receiver = user)`.
3. Send, wait for receipt, show tx link to explorer.

### 4.2 Withdraw
1. `vault.maxWithdraw(user)` → cap input. Also show vault-level liquidity.
   **Vault V2:** `maxWithdraw` / `maxDeposit` always return 0 (see `VaultV2.sol`), so cap the input at the user's position (`convertToAssets(balanceOf)`) and let the simulation of the exact call decide; show the vault's free liquidity from the API.
2. Partial: `vault.withdraw(assets, receiver = user, owner = user)`.
   Full exit: `vault.redeem(vault.balanceOf(user), user, user)` (avoids dust).
3. Simulate first, then send.

### 4.2b Vault version
Olvana lists both **Morpho Vault V2** and **Vault V1 (MetaMorpho)**. Both are ERC-4626 with the same deposit / withdraw / redeem selectors. Each network's official factories are in `CHAINS` (`vaultV2Factory`, `metaMorphoFactories`); a vault is listed only if created by one of them (checked in the API data and again onchain before every transaction: `isVaultV2` / `isMetaMorpho`). V1 net APY = `weeklyApy × (1 − fee)` (no reward tokens). V1's `maxDeposit` is real and is checked before any approval.

Robinhood Chain only has **Morpho Vault V2**. Use `vaultV2Abi` from `packages/core` (vendored from Morpho's SDK): fee = `performanceFee()` (WAD), recipient = `performanceFeeRecipient()`, also `managementFee()`. Market exposure comes from the vault's adapters (`adapters()`, `liquidityAdapter()`, `morphoMarketV1AdapterV2Abi`). Before allowlisting a vault, check it was created by `VAULT_V2_FACTORY_ADDRESS`.

### 4.3 Reads
- User balance in assets: `vault.convertToAssets(vault.balanceOf(user))`
- Wallet USDG: `USDG.balanceOf(user)`
- Vault TVL: `vault.totalAssets()`
- Market state for utilization / liquidity: Morpho API, or onchain `morpho.market(id)` → `totalSupplyAssets`, `totalBorrowAssets`.

### 4.4 Pre-flight checks (shown in the Review step, must all run before the wallet prompt)
| Check | Implementation | On fail |
|---|---|---|
| Contract allowlist | target vault address ∈ `VAULTS[]` config, `VaultV2Factory.isVaultV2(vault)` and `vault.asset()` = pinned token, read onchain | block |
| Transaction simulated | `publicClient.simulateContract` succeeds | block, show revert reason |
| Liquidity available (withdraw) | simulation of the exact `withdraw`/`redeem` succeeds (Vault V2 `maxWithdraw` is always 0) | block, show available amount |
| Vault accepting deposits | simulate succeeds / not paused / cap not hit | block |
| Oracle in range | collateral oracle price vs reference DEX price, deviation ≤ X% (config) | **warn**, don't block (v1 may treat non-Chainlink oracles as warn, like the prototype) |

Grade C vault → show the extra warning box before confirm (copy in prototype).

### 4.5 Wallet & network UX
- Wrong network → banner with **Switch to Robinhood Chain** (`wallet_switchEthereumChain`, add-chain fallback); Review/Confirm blocked until switched.
- Wallet has no USDG (or amount > balance) → **Get USDG** help box (buy / bridge / keep a little ETH for gas; links TBD by ALFA).
- Vault not accepting deposits (paused / cap hit / `StatusNotice` for the vault) → deposit disabled with explanation; withdraw still available.

---

## 5. Risk grade (port exactly — `packages/core/risk.ts`)

Score out of 100:

| Factor | Max | Rule |
|---|---|---|
| Utilization | 25 | `< 92%` → 25 · `< 97%` → 15 · else 5 — Morpho's rate curve targets 90%, so thresholds sit just above it (owner-approved 2026-09-27; was 85 / 95). Fixtures unchanged. |
| Collateral quality | 30 | `30 × Σ(share_i × q_i)` where q = blue 1.0, mid 0.6, tail 0.2 |
| Oracle | 25 | Chainlink (or equivalent push oracle) 25 · mixed 15 · DEX/TWAP 8 |
| Curator record | 20 | 0 incidents → 20 · ≥1 → 10 |

Grade: **A ≥ 80 · B 60–79 · C < 60**.

- Collateral classification lives in a DB table `collateral_class (symbol, address, quality)`. Default blue: WETH, WBTC, wstETH, cbBTC. Tokenized stocks = mid. Anything unknown = tail.
- Default rows (owner-approved 2026-09-27, `DEFAULT_COLLATERAL_CLASS` in `risk.ts`): cash-backed stablecoins (USDC, USDT, USDG, PYUSD, DAI, USDS) = blue/stable; synthetic or yield-bearing dollars (USDe, sUSDe, syrupUSDG, syrupUSDC, spUSDG, sUSDS, mGLO) = mid/stable. `stable` collateral is exempt from the high-LLTV flag. Collateral under 0.5% of the allocation is hidden in the UI but still scored.
- **Deductions** (owner-approved 2026-09-27, `riskDeductions()`): one collateral > 80% of the allocation −10 · vault younger than 90 days −5 · TVL under $1M −5. Shown under the 4-part breakdown; these risks are no longer shown as flags. Fixtures carry none, so they stay 97 / 100 / 47.
- Oracle type per market: DB table, set manually by admin at listing time.
- Curator incidents: DB table, set manually.
- Recompute every snapshot (§7). Store score history.
- Show the 4-part breakdown everywhere a grade appears (Earn page, landing "grades" section).
- **Utilization input = 24 h time-weighted average** (`timeWeightedAverage` in `packages/core/stats.ts`), so a short spike doesn't flip the grade. Utilization *alerts* still use the live value.
- **Risk flags** (`riskFlags()` in `risk.ts`) are shown under the breakdown and **do not change the score** (fixtures stay 97/100/47): tokenized-stock collateral (Chainlink stock feeds update 24/5, so prices go stale on weekends/holidays), LLTV > 86%, vault < 90 days old, USDG off peg by > 0.5%. `collateral_class.kind` marks `equity` / `stable`.
- **Displayed "Net APY" = 7-day time-weighted average after fee**, labelled as such.
- **Landing headline APY = best grade A vault only** (`headlineNetApy()`), never a grade B/C yield.

---

## 6. Performance fee — important decision

A 10% fee is only possible if **Olvana deploys and owns its own Morpho vaults** (vault owner sets `fee` and `feeRecipient`; Olvana or a hired curator sets allocations).
If Olvana just points users at someone else's vault, Olvana **cannot** take a fee onchain.

**TODO ALFA:** choose one:
- **A)** Olvana deploys its own vaults (Core / Prime / Boost) via Morpho's vault factory, sets fee = 10%, acts as or hires a curator. → real revenue, more responsibility.
- **B)** v1 lists existing third-party vaults with **no fee**; show gross = net. Revenue comes later.

Facts for this decision (2026-09-27, see `docs/VERIFICATION.md`): Robinhood Chain has an official Morpho **Vault V2 factory**, so (A) is technically possible (V2 has `performanceFee` + `managementFee`). For (B), an existing USDG vault is **Steakhouse USDG** (curator Steakhouse Financial) — its address still needs onchain confirmation that it came from the V2 factory.

Frontend must read the actual fee from the vault contract and display `gross − fee = net`.

---

## 7. Backend

### 7.1 Prisma schema (starting point)
```prisma
model User {
  address      String   @id            // lowercase
  refCode      String   @unique        // "OLV-XXXX"
  referredBy   String?                 // refCode of referrer
  createdAt    DateTime @default(now())
  alerts       AlertSettings?
  telegram     TelegramLink?
}

model VaultEvent {                     // indexed Deposit/Withdraw
  id        String   @id               // txHash:logIndex
  vault     String
  user      String
  kind      String                     // deposit | withdraw
  assets    Decimal  @db.Decimal(38,6)
  shares    Decimal  @db.Decimal(38,18)
  block     BigInt
  ts        DateTime
  @@index([user]) @@index([vault])
}

model VaultSnapshot {                  // every 5 min
  id          Int      @id @default(autoincrement())
  vault       String
  ts          DateTime
  grossApy    Float
  netApy      Float
  tvl         Decimal  @db.Decimal(38,6)
  utilization Float
  liquidity   Decimal  @db.Decimal(38,6)
  collateral  Json                     // [{symbol, share, lltv, quality}]
  oracle      String
  riskScore   Int
  riskGrade   String
  @@index([vault, ts])
}

model PointsLedger {
  id        Int      @id @default(autoincrement())
  user      String
  source    String                     // deposit | referral | boost
  points    Decimal  @db.Decimal(38,4)
  periodEnd DateTime
  @@index([user])
}

model AlertSettings {
  user        String  @id
  daily       Boolean @default(true)
  utilization Boolean @default(true)
  collateral  Boolean @default(true)
  threshold   Int     @default(95)
  lastUtilAlert Json?                  // {vaultId: ts} to avoid spam
  U           User    @relation(fields: [user], references: [address])
}

model TelegramLink {
  user     String @id
  chatId   String @unique
  linkedAt DateTime @default(now())
  U        User   @relation(fields: [user], references: [address])
}

model CollateralClass { symbol String @id  address String?  quality String }  // blue|mid|tail
model MarketOracle    { marketId String @id  type String }                     // chainlink|mixed|dex
model CuratorIncident { id Int @id @default(autoincrement())  curator String  note String  at DateTime }
```

### 7.2 Worker jobs
| Job | Schedule | Does |
|---|---|---|
| Indexer | live + backfill | ERC-4626 `Deposit` / `Withdraw` events for all configured vaults → `VaultEvent` |
| Vault snapshot | every 5 min | read APY/TVL/util/liquidity/collateral → compute risk → `VaultSnapshot`; cache latest in Redis |
| Points | hourly | per user per vault: **time-weighted** balance over the hour (from `VaultEvent`s, `timeWeightedBalanceUsd`) `× hours / 24` → `PointsLedger (deposit)`; referrer gets 10% of referee's new points → `(referral)` only if referee TWAB ≥ $100, referrer holds a deposit, and the referral isn't voided (`periodEntries`) |
| Referral sybil check | on referee's first deposit | index USDG `Transfer` + native transfers into the referee before its first deposit; if any came from the referrer → set `User.referralVoidReason = "funded-by-referrer"` (`referralVoidReason`) |
| Utilization alerts | every 5 min | for each vault a user holds: `decideUtilAlert()` in `packages/core/alerts.ts` — "high" at `utilization ≥ threshold` (max 1 per vault per user per 6 h), **"liquidity back"** once utilization drops below `threshold − 2` (toggle `AlertSettings.liquidity`) |
| Status | on change | admin `StatusNotice` rows → site / vault banner; snapshot job also raises one automatically when data is stale > 15 min or the vault rejects deposits |
| Collateral alerts | on snapshot diff | new collateral symbol or share change > 10 pts → notify holders |
| Daily report | 09:00 WIB (UTC+7), configurable | balance, earned (24 h), points → Telegram |

Points balance for display = ledger sum + live accrual since last `periodEnd` (computed in API).

### 7.2b Vault snapshot (live today)
Until the worker/API exist, the server runs `pnpm --filter @olvana/core snapshot /var/www/olvana/vaults.json` every 2 minutes (cron). `buildSnapshot()` fetches every network's Vault V2 + V1 lists and details once and writes them atomically; the site loads `/vaults.json` first so every vault appears at once. The site still applies `keepVault`, ignores a snapshot older than 20 minutes and then falls back to live Morpho API calls. A failed run keeps the previous file.

### 7.3 API (Fastify)
```
GET  /vaults                         latest snapshot per vault + grade breakdown
GET  /vaults/:id/history?range=7d|30d|90d   APY series
GET  /users/:address/portfolio       positions (onchain read), earned, blended APY, balance history
GET  /users/:address/history         VaultEvent list (for table + CSV)
GET  /users/:address/points          totals by source, refCode, invite count
POST /auth/siwe                      Sign-In With Ethereum → session (needed for writes below)
POST /referral/claim  {refCode}      once per wallet, only before first deposit, can't self-refer
GET  /alerts  PUT /alerts            AlertSettings (auth)
GET  /status                         active StatusNotice rows (site-wide + per vault)
POST /telegram/link-code             returns one-time code; user opens t.me/<bot>?start=<code>
```
Rate-limit everything (Redis). Lowercase all addresses.

### 7.4 Telegram bot
- `/start <code>` → validate one-time code (Redis, 10 min TTL) → save `TelegramLink`.
- `/stop` → unlink.
- `/status` → balance, earned, points, grades of held vaults.
- Message formats: copy from the prototype's Alerts preview.

---

## 8. Frontend

Routes (prototype uses hashes; production uses real routes):
```
/            landing
/app         Earn (vault picker, deposit/withdraw, review + checks, done)
/vaults      compare cards + table
/portfolio   KPIs, balance chart, positions, history table + CSV export
/rewards     points, referral link (copy), how points work
/alerts      Telegram connect, toggles, threshold slider, message preview
/risk        risk disclosure
/terms       terms of use
/privacy     privacy policy (draft)
/security    security & transparency: contract addresses, fee + recipient, audits, pre-flight checks, anti-phishing, vulnerability reporting
```
- **Language:** English only.
- **Status banner** from `GET /status` on every app route.
- `?ref=OLV-XXXX` on any page → store in cookie → call `/referral/claim` after SIWE.
- Mobile: bottom tab bar in app, hamburger menu on landing (already in prototype).
- Remove: Demo controls, `localStorage` state, simulated tx hashes, fake wallet fallback, all hardcoded sample numbers.
- Keep "Sample data" badge logic as a **"Live" / "Stale"** badge (stale if last snapshot > 15 min).
- Respect `prefers-reduced-motion` (already handled in prototype CSS).

### Design tokens (from prototype)
```
bg #05050A · surface #0A0A12 · ink #EEF0FF · muted #9A9CB8 · faint #72749A
line rgba(255,255,255,.08)
accent #A99BFF · primary gradient 135deg #7B5CFF → #3A6BFF (white text)
text gradient 90deg #C4B5FF → #7CC4FF
grade A #7EE0B8 · B #F5D06F · C #FF9270 (also warning)
fonts: Instrument Sans (UI/headings), Instrument Serif italic (rare accent), Geist Mono (numbers)
radius: pills 999px · cards 24–28px · inputs 14–18px
```

### Logo — "Strata" (`docs/brand/`)
Three bands in one circle (a nod to the A/B/C grades, in brand violets). Wordmark: `OLVANA`, Instrument Sans 600, uppercase, letter-spacing .22em.
| File | Use |
|---|---|
| `olvana-mark.svg` / `olvana-mark-light.svg` | mark on dark / light backgrounds (≥ 32 px) |
| `olvana-mark-small.svg` | ≤ 32 px (nav, tab bar): wider gaps so bands don't blur |
| `olvana-lockup-dark.svg` / `-light.svg` | mark + outlined wordmark |
| `favicon.svg` | favicon, follows the browser's light/dark theme |
| `app-icon-512.png` | PWA / social avatar (derive 180 px apple-touch-icon in step 7) |
| `og-image.png` | 1200×630 Open Graph / Twitter card |
Band colours: dark bg `#C4B5FF · #8B7BFF · #4D6BFF`; light bg `#A99BFF · #7B5CFF · #3A6BFF`. Keep clear space ≥ half the mark's height; don't recolour the bands to grade colours.

---

## 9. Legal / content

- `/risk` and `/terms` in the prototype are **drafts**. Must be reviewed by a lawyer before launch.
- `$[TICKER]`, Season 1 end date, boost multiplier, curator names, contact email are placeholders — ALFA to supply.
- Token copy must stay as written: token **boosts points and votes on listings; it does not pay out vault revenue**.

---

### 9.1 Frontend security (non-custodial apps are attacked through the site, not the contracts)
- Strict CSP (no inline scripts except hashed), `frame-ancestors 'none'`, HSTS preload, no third-party scripts beyond wallet SDKs.
- Pinned dependencies + lockfile, `pnpm audit` in CI, Renovate with review.
- Domain: registrar lock, DNSSEC, 2FA on registrar/DNS/VPS/GitHub, CAA record.
- Optional IPFS mirror of the static build, with its hash published on `/security`.
- Uptime monitoring for web/API/worker/bot, alert on indexer lag and stale snapshots.
- `SECURITY.md` + `security@` contact; bug bounty when budget allows.

## 10. Build order

1. **Config + contracts:** chain, USDG, Morpho, vault addresses verified. ABIs in `packages/core`.
2. **Read-only app:** vaults page + Earn page with live data and risk grades (no transactions yet).
3. **Transactions:** deposit / withdraw with pre-flight checks on testnet or with tiny amounts.
4. **Indexer + portfolio + history + CSV.**
5. **Points + referral + SIWE.**
6. **Telegram bot + alerts.**
7. **Landing page** port, SEO/meta/OG image, deploy to VPS (PM2 + Nginx + TLS).
8. Security pass (see below) → launch.

## 11. Acceptance checklist

- [ ] No private keys or custody anywhere; every value transfer is a user-signed tx.
- [ ] Only allowlisted vault addresses can be called from the UI.
- [ ] Every tx is simulated before the wallet prompt; revert reasons shown in plain English.
- [ ] Approvals are exact-amount, not unlimited.
- [ ] Numbers match onchain reads (balance, TVL, fee) within rounding.
- [ ] Risk score matches `packages/core/risk.ts` unit tests (include the three prototype vaults as fixtures: expected A 97, A 100, C 47 with prototype inputs).
- [ ] Points math unit-tested (1 pt/$/day, 10% referral, no self-referral, no double claim).
- [ ] Alerts de-duplicated (max 1 per vault per user per 6 h).
- [ ] Works at 360 px, 390 px, 768 px, 1024 px, 1440 px; no horizontal scroll.
- [ ] Lighthouse accessibility ≥ 90; visible focus states.
- [ ] `.env.example` documents every variable.
- [ ] Headline APY only from grade A vaults; displayed Net APY is 7-day average after fee.
- [ ] Risk flags shown next to grades; score unchanged (97/100/47 fixtures).
- [ ] Points use time-weighted balances; referral anti-sybil rules unit-tested.
- [ ] "Liquidity back" alert works and is de-duplicated.
- [ ] Wrong-network banner, Get-USDG helper, status banner, paused-vault state.
- [ ] `/privacy` and `/security` pages live; `/risk`, `/terms`, `/privacy` reviewed by counsel.
- [ ] Every listed vault verified as created by the official Vault V2 factory.
- [ ] Frontend security items in §9.1 done.
