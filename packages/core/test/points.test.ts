import { describe, expect, it } from 'vitest';
import {
  checkReferralClaim,
  depositPoints,
  isRefCode,
  livePointsBalance,
  periodEntries,
  refCodeCandidates,
  referralPoints,
  referralVoidReason,
  timeWeightedBalanceUsd,
  type ReferralClaimCheck,
} from '../src/points';

const ALICE = '0x1111111111111111111111111111111111117a3f';
const BOB = '0x2222222222222222222222222222222222222222';

describe('deposit points: 1 pt per $ per day', () => {
  it('$1,000 for 24 h = 1,000 pts', () => expect(depositPoints(1000, 24)).toBe(1000));
  it('$1,000 for 1 h = 41.67 pts', () => expect(depositPoints(1000, 1)).toBeCloseTo(41.6667, 4));
  it('24 hourly accruals equal one daily accrual', () => {
    const hourly = Array.from({ length: 24 }, () => depositPoints(2500, 1)).reduce((a, b) => a + b, 0);
    expect(hourly).toBeCloseTo(depositPoints(2500, 24), 9);
  });
  it('zero or negative inputs earn nothing', () => {
    expect(depositPoints(0, 24)).toBe(0);
    expect(depositPoints(-5, 24)).toBe(0);
    expect(depositPoints(100, 0)).toBe(0);
    expect(depositPoints(Number.NaN, 1)).toBe(0);
  });
});

describe('referral points: 10% of referee deposit points', () => {
  it('10% share', () => expect(referralPoints(1000)).toBeCloseTo(100, 9));
  it('nothing for zero', () => expect(referralPoints(0)).toBe(0));

  const referral = { referrer: ALICE, referrerBalanceUsd: 500 };

  it('periodEntries credits referee and referrer', () => {
    expect(periodEntries({ user: BOB, balanceUsd: 1500, hours: 24, referral })).toEqual([
      { user: BOB, source: 'deposit', points: 1500 },
      { user: ALICE, source: 'referral', points: 150 },
    ]);
  });

  it('periodEntries: no referral entry without referrer, or when self-referred', () => {
    expect(periodEntries({ user: BOB, balanceUsd: 200, hours: 24 })).toHaveLength(1);
    expect(periodEntries({ user: BOB, balanceUsd: 200, hours: 24, referral: { ...referral, referrer: BOB } })).toHaveLength(1);
  });

  it('anti-sybil: referee under $100, referrer with no deposit, or voided → no referral points', () => {
    expect(periodEntries({ user: BOB, balanceUsd: 99, hours: 24, referral })).toHaveLength(1);
    expect(periodEntries({ user: BOB, balanceUsd: 100, hours: 24, referral })).toHaveLength(2);
    expect(periodEntries({ user: BOB, balanceUsd: 500, hours: 24, referral: { ...referral, referrerBalanceUsd: 0 } })).toHaveLength(1);
    expect(periodEntries({ user: BOB, balanceUsd: 500, hours: 24, referral: { ...referral, voided: true } })).toHaveLength(1);
  });

  it('periodEntries: empty when nothing accrued', () => {
    expect(periodEntries({ user: BOB, balanceUsd: 0, hours: 1, referral })).toEqual([]);
  });

  it('referralVoidReason: referee funded directly by referrer', () => {
    const upper = ALICE.toUpperCase().replace('0X', '0x');
    expect(referralVoidReason({ referrer: ALICE, referee: BOB, fundingTransfers: [{ from: upper, to: BOB }] })).toBe(
      'funded-by-referrer',
    );
    expect(
      referralVoidReason({ referrer: ALICE, referee: BOB, fundingTransfers: [{ from: '0x3333333333333333333333333333333333333333', to: BOB }] }),
    ).toBeNull();
  });
});

describe('time-weighted balance (no snapshot gaming)', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-01T01:00:00Z');

  it('$1M deposited 1 minute before the hourly job earns 1/60 of an hour', () => {
    const twab = timeWeightedBalanceUsd([{ ts: new Date('2026-01-01T00:59:00Z'), value: 1_000_000 }], from, to, 0);
    expect(twab).toBeCloseTo(1_000_000 / 60, 6);
    expect(depositPoints(twab, 1)).toBeCloseTo(1_000_000 / 60 / 24, 6);
  });

  it('withdrawing mid-hour earns only for the time held', () => {
    const twab = timeWeightedBalanceUsd([{ ts: new Date('2026-01-01T00:30:00Z'), value: 0 }], from, to, 1000);
    expect(twab).toBeCloseTo(500, 9);
  });

  it('constant balance = balance', () => {
    expect(timeWeightedBalanceUsd([], from, to, 250)).toBe(250);
  });
});

describe('livePointsBalance', () => {
  it('ledger + accrual since last periodEnd', () => {
    const lastPeriodEnd = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T12:00:00Z');
    expect(livePointsBalance({ ledgerTotal: 500, balanceUsd: 1000, lastPeriodEnd, now })).toBe(1000);
  });
  it('ledger only when there is no period yet', () => {
    expect(livePointsBalance({ ledgerTotal: 0, balanceUsd: 1000, lastPeriodEnd: null, now: new Date() })).toBe(0);
  });
});

describe('referral codes', () => {
  it('first candidate is prototype format OLV-XXXX from the last 4 hex chars', () => {
    const c = refCodeCandidates(ALICE);
    expect(c[0]).toBe('OLV-7A3F');
    expect(c[1]).toBe('OLV-117A3F');
    expect(c.at(-1)).toBe('OLV-' + ALICE.slice(2).toUpperCase());
    expect(c.every(isRefCode)).toBe(true);
  });
  it('rejects invalid addresses', () => {
    expect(() => refCodeCandidates('0x1234')).toThrow();
  });
  it('isRefCode', () => {
    expect(isRefCode('OLV-7A3F')).toBe(true);
    expect(isRefCode('OLV-7a3f')).toBe(false);
    expect(isRefCode('OLV-7A3')).toBe(false);
    expect(isRefCode('ABC-7A3F')).toBe(false);
  });
});

describe('checkReferralClaim', () => {
  const base: ReferralClaimCheck = {
    claimer: BOB,
    code: 'OLV-7A3F',
    codeOwner: ALICE,
    existingReferredBy: null,
    hasDeposited: false,
  };

  it('accepts a valid first claim before deposit (normalises case)', () => {
    expect(checkReferralClaim({ ...base, code: ' olv-7a3f ' })).toEqual({ ok: true, code: 'OLV-7A3F' });
  });
  it('no self-referral', () => {
    expect(checkReferralClaim({ ...base, codeOwner: BOB })).toEqual({ ok: false, reason: 'self-referral' });
    expect(checkReferralClaim({ ...base, codeOwner: BOB.toUpperCase().replace('0X', '0x') })).toEqual({
      ok: false,
      reason: 'self-referral',
    });
  });
  it('no double claim', () => {
    expect(checkReferralClaim({ ...base, existingReferredBy: 'OLV-9999' })).toEqual({
      ok: false,
      reason: 'already-claimed',
    });
  });
  it('only before first deposit', () => {
    expect(checkReferralClaim({ ...base, hasDeposited: true })).toEqual({ ok: false, reason: 'already-deposited' });
  });
  it('rejects malformed and unknown codes', () => {
    expect(checkReferralClaim({ ...base, code: 'hello' })).toEqual({ ok: false, reason: 'invalid-code' });
    expect(checkReferralClaim({ ...base, codeOwner: null })).toEqual({ ok: false, reason: 'unknown-code' });
  });
});
