/**
 * Points math (HANDOFF §1, §7.2, §7.3).
 *
 *  - 1 point per $ per day held in a vault, accrued hourly by the worker:
 *    `balance_usd × hours / 24`.
 *  - A referrer earns 10% of their referee's new deposit points. Referral
 *    points are not themselves re-shared (no chains).
 *  - A wallet can claim one referral, only before its first deposit, and
 *    cannot refer itself.
 */

export const POINTS_PER_USD_PER_DAY = 1;
export const REFERRAL_SHARE = 0.1;

const HOUR_MS = 60 * 60 * 1000;

/** Deposit points for holding `balanceUsd` for `hours`. */
export function depositPoints(balanceUsd: number, hours: number): number {
  if (!(balanceUsd > 0) || !(hours > 0)) return 0;
  return (balanceUsd * POINTS_PER_USD_PER_DAY * hours) / 24;
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

/**
 * Ledger entries for one accrual period for one user: their deposit points
 * plus, if they were referred, the referrer's 10% share.
 */
export function periodEntries(args: {
  user: string;
  balanceUsd: number;
  hours: number;
  /** Referrer address (resolved from the user's `referredBy` code), if any. */
  referrer?: string | null;
}): PeriodEntry[] {
  const pts = depositPoints(args.balanceUsd, args.hours);
  if (pts === 0) return [];
  const out: PeriodEntry[] = [{ user: args.user, source: 'deposit', points: pts }];
  if (args.referrer && args.referrer !== args.user) {
    out.push({ user: args.referrer, source: 'referral', points: referralPoints(pts) });
  }
  return out;
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
