import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, integrate, timeWeightedAverage } from '../src/stats';

const t0 = new Date('2026-01-01T00:00:00Z');
const at = (h: number) => new Date(t0.getTime() + h * HOUR_MS);

describe('integrate', () => {
  it('step function area, with initial value before the first sample', () => {
    // 10 for 2 h, then 20 for 2 h
    expect(integrate([{ ts: at(2), value: 20 }], at(0), at(4), 10)).toBe(10 * 2 * HOUR_MS + 20 * 2 * HOUR_MS);
  });
  it('uses the last sample at or before `from`', () => {
    expect(integrate([{ ts: at(-5), value: 7 }], at(0), at(1))).toBe(7 * HOUR_MS);
  });
  it('ignores samples after `to` and handles unsorted input', () => {
    const s = [
      { ts: at(3), value: 999 },
      { ts: at(1), value: 5 },
    ];
    expect(integrate(s, at(0), at(2))).toBe(5 * HOUR_MS);
  });
  it('empty window is 0', () => expect(integrate([], at(1), at(1), 5)).toBe(0));
});

describe('timeWeightedAverage', () => {
  it('24 h utilization: 23 h at 80%, 1 h spike to 99% → ~80.8%', () => {
    const s = [
      { ts: at(0), value: 80 },
      { ts: at(23), value: 99 },
    ];
    expect(timeWeightedAverage(s, at(0), at(24))).toBeCloseTo(80 + 19 / 24, 9);
  });
  it('only averages the covered part of the window (new vault)', () => {
    const s = [{ ts: at(12), value: 6 }];
    expect(timeWeightedAverage(s, new Date(at(24).getTime() - 7 * DAY_MS), at(24))).toBe(6);
  });
  it('null with no data', () => expect(timeWeightedAverage([], at(0), at(1))).toBeNull());
});
