/**
 * Points math (HANDOFF §1, §7.2, §7.3).
 *
 *  - 1 point per $ per day held in a vault, accrued hourly by the worker on
 *    the TIME-WEIGHTED balance over the period (from indexed events), so a
 *    deposit made just before the job runs earns only for the time it was held.
 *  - A referrer earns 10% of their referee's new deposit points. Referral
 *    points are not themselves re-shared (no chains).
 *  - Anti-sybil: referral points accrue only for periods where the referee's
 *    time-weighted balance is ≥ REFERRAL_MIN_REFEREE_USD and the referrer holds
 *    a deposit themselves; a referral is voided if the referee was funded
 *    directly by the referrer.
 *  - A wallet can claim one referral, only before its first deposit, and
 *    cannot refer itself.
 */
import { HOUR_MS, integrate, type Sample } from './stats';

export const POINTS_PER_USD_PER_DAY = 1;
export const REFERRAL_SHARE = 0.1;
/** Product default — adjust here. Referee must hold at least this much for referral points to accrue. */
export const REFERRAL_MIN_REFEREE_USD = 100;

/** Deposit points for holding `balanceUsd` for `hours`. */
export function depositPoints(balanceUsd: number, hours: number): number {
  if (!(balanceUsd > 0) || !(hours > 0)) return 0;
  return (balanceUsd * POINTS_PER_USD_PER_DAY * hours) / 24;
}

/**
 * Time-weighted USD balance over [from, to]. `changes` are the balance
 * values after each deposit/withdraw (step series); `opening` is the balance
 * at `from`.
 */
export function timeWeightedBalanceUsd(changes: readonly Sample[], from: Date, to: Date, opening: number): number {
  const ms = to.getTime() - from.getTime();
  if (!(ms > 0)) return 0;
  return integrate(changes, from, to, opening) / ms;
}

/** Points credited to the referrer for a referee's new deposit points. */
export function referralPoints(refereeDepositPoints: number): number {
  if (!(refereeDepositPoints > 0)) return 0;
  return refereeDepositPoints * REFERRAL_SHARE;
}

export interface PeriodEntry {
  user: string;
  source: 'deposit' | 'referral';
  points: number;
}

export interface PeriodReferral {
  /** Referrer address (resolved from the user's `referredBy` code). */
  referrer: string;
  /** Referrer's own time-weighted balance over the same period. */
  referrerBalanceUsd: number;
  /** Set once the referral was voided (see `referralVoidReason`). */
  voided?: boolean;
}

/**
 * Ledger entries for one accrual period for one user: their deposit points
 * plus, if the referral is eligible this period, the referrer's 10% share.
 */
export function periodEntries(args: {
  user: string;
  /** Time-weighted balance over the period (see `timeWeightedBalanceUsd`). */
  balanceUsd: number;
  hours: number;
  referral?: PeriodReferral | null;
}): PeriodEntry[] {
  const pts = depositPoints(args.balanceUsd, args.hours);
  if (pts === 0) return [];
  const out: PeriodEntry[] = [{ user: args.user, source: 'deposit', points: pts }];
  const r = args.referral;
  if (
    r &&
    !r.voided &&
    r.referrer.toLowerCase() !== args.user.toLowerCase() &&
    args.balanceUsd >= REFERRAL_MIN_REFEREE_USD &&
    r.referrerBalanceUsd > 0
  ) {
    out.push({ user: r.referrer, source: 'referral', points: referralPoints(pts) });
  }
  return out;
}

export interface FundingTransfer {
  from: string;
  to: string;
}

/**
 * Sybil check run by the indexer before a referee's first deposit: if the
 * referee received USDG or gas directly from the referrer, the referral is
 * voided. Returns the reason, or null when the referral stands.
 */
export function referralVoidReason(args: {
  referrer: string;
  referee: string;
  /** Inbound USDG / native transfers to the referee up to its first deposit. */
  fundingTransfers: readonly FundingTransfer[];
}): 'funded-by-referrer' | null {
  const ref = args.referrer.toLowerCase();
  const ee = args.referee.toLowerCase();
  const funded = args.fundingTransfers.some((t) => t.from.toLowerCase() === ref && t.to.toLowerCase() === ee);
  return funded ? 'funded-by-referrer' : null;
}

/**
 * Displayed points balance: ledger total plus live accrual on the current
 * balance since the last ledger `periodEnd` (computed in the API).
 */
export function livePointsBalance(args: {
  ledgerTotal: number;
  balanceUsd: number;
  lastPeriodEnd: Date | null;
  now: Date;
}): number {
  if (args.lastPeriodEnd == null) return args.ledgerTotal;
  const hours = (args.now.getTime() - args.lastPeriodEnd.getTime()) / HOUR_MS;
  return args.ledgerTotal + depositPoints(args.balanceUsd, hours);
}

/* ------------------------------------------------------------------ */
/* Referral codes & claims                                             */
/* ------------------------------------------------------------------ */

export const REF_CODE_RE = /^OLV-[0-9A-F]{4,40}$/;

export function isRefCode(code: string): boolean {
  return REF_CODE_RE.test(code);
}

/**
 * Referral code candidates for an address, shortest first: `OLV-` + the last
 * 4 hex chars (prototype format), then 6, 8, … up to the full address. The API
 * picks the first one not already taken (`User.refCode` is unique).
 */
export function refCodeCandidates(address: string): string[] {
  const hex = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error(`Invalid address: ${address}`);
  const out: string[] = [];
  for (let n = 4; n <= 40; n += 2) out.push('OLV-' + hex.slice(-n).toUpperCase());
  return out;
}

export type ReferralClaimRejection = 'invalid-code' | 'unknown-code' | 'self-referral' | 'already-claimed' | 'already-deposited';

export interface ReferralClaimCheck {
  /** Lowercased address of the wallet claiming. */
  claimer: string;
  /** Code being claimed, as submitted. */
  code: string;
  /** Lowercased address that owns `code`, or null if no such code. */
  codeOwner: string | null;
  /** The claimer's current `referredBy`, if any. */
  existingReferredBy: string | null;
  /** Whether the claimer has any indexed deposit. */
  hasDeposited: boolean;
}

export type ReferralClaimResult = { ok: true; code: string } | { ok: false; reason: ReferralClaimRejection };

export function checkReferralClaim(c: ReferralClaimCheck): ReferralClaimResult {
  const code = c.code.trim().toUpperCase();
  if (!isRefCode(code)) return { ok: false, reason: 'invalid-code' };
  if (c.existingReferredBy) return { ok: false, reason: 'already-claimed' };
  if (c.hasDeposited) return { ok: false, reason: 'already-deposited' };
  if (c.codeOwner == null) return { ok: false, reason: 'unknown-code' };
  if (c.codeOwner.toLowerCase() === c.claimer.toLowerCase()) return { ok: false, reason: 'self-referral' };
  return { ok: true, code };
}
