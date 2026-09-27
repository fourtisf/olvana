/**
 * Time-weighted averages over step series, used to smooth values that are
 * shown or scored: utilization for the risk score (24 h), net APY for display
 * (7 d), and balances for points (per accrual period).
 *
 * A series is a list of samples; each sample's value holds from its `ts` until
 * the next sample (step function). The value in force at `from` is the last
 * sample at or before `from`.
 */

export interface Sample {
  ts: Date;
  value: number;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * ∫ value dt over [from, to], in value·milliseconds. Time before the first
 * sample counts as `initial` (default 0).
 */
export function integrate(samples: readonly Sample[], from: Date, to: Date, initial = 0): number {
  const start = from.getTime();
  const end = to.getTime();
  if (!(end > start)) return 0;
  const sorted = [...samples].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  let current = initial;
  let cursor = start;
  let total = 0;
  for (const s of sorted) {
    const t = s.ts.getTime();
    if (t <= start) {
      current = s.value;
      continue;
    }
    if (t >= end) break;
    total += current * (t - cursor);
    cursor = t;
    current = s.value;
  }
  total += current * (end - cursor);
  return total;
}

/**
 * Time-weighted average over [from, to]. Only the covered part of the window
 * (from the first sample on) is averaged, so a new vault isn't dragged to 0.
 * Returns null when no sample covers the window.
 */
export function timeWeightedAverage(samples: readonly Sample[], from: Date, to: Date): number | null {
  if (samples.length === 0) return null;
  const first = Math.min(...samples.map((s) => s.ts.getTime()));
  const start = Math.max(from.getTime(), first);
  if (!(to.getTime() > start)) {
    // Window is a single instant or entirely before the data: value in force at `to`.
    const before = samples.filter((s) => s.ts.getTime() <= to.getTime());
    if (before.length === 0) return null;
    return before.reduce((a, b) => (b.ts.getTime() >= a.ts.getTime() ? b : a)).value;
  }
  return integrate(samples, new Date(start), to) / (to.getTime() - start);
}
