import { describe, expect, it } from 'vitest';
import { EMPTY_UTIL_ALERT_STATE, decideUtilAlert, type UtilAlertState } from '../src/alerts';

const t0 = new Date('2026-01-01T00:00:00Z');
const h = (n: number) => new Date(t0.getTime() + n * 3600_000);
const on = { utilizationEnabled: true, liquidityEnabled: true, threshold: 95 };

function run(steps: [number, number][], opts = on) {
  let state: UtilAlertState = EMPTY_UTIL_ALERT_STATE;
  const sent: string[] = [];
  for (const [hour, utilization] of steps) {
    const d = decideUtilAlert({ ...opts, utilization, state, now: h(hour) });
    state = d.state;
    if (d.send) sent.push(`${hour}:${d.send}`);
  }
  return sent;
}

describe('decideUtilAlert', () => {
  it('max one "high" per vault per 6 h while utilization stays high', () => {
    expect(run([[0, 96], [1, 97], [5.9, 98], [6, 98], [11, 99], [12, 99]])).toEqual(['0:high', '6:high', '12:high']);
  });

  it('"recovered" once, only below threshold − 2 (hysteresis)', () => {
    expect(run([[0, 96], [1, 94], [2, 93.5], [3, 92.9], [4, 90]])).toEqual(['0:high', '3:recovered']);
  });

  it('no recovered message without a prior high episode', () => {
    expect(run([[0, 80], [1, 60]])).toEqual([]);
  });

  it('flapping around the threshold does not bypass the cooldown', () => {
    expect(run([[0, 96], [1, 92], [2, 96], [3, 92], [6, 96], [7, 90]])).toEqual([
      '0:high',
      '1:recovered',
      '6:high',
      '7:recovered',
    ]);
  });

  it('liquidity-only subscribers still get "recovered"', () => {
    expect(run([[0, 96], [1, 90]], { ...on, utilizationEnabled: false })).toEqual(['1:recovered']);
  });

  it('toggles off → nothing sent', () => {
    expect(run([[0, 96], [1, 90]], { ...on, utilizationEnabled: false, liquidityEnabled: false })).toEqual([]);
  });
});
