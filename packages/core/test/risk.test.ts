import { describe, expect, it } from 'vitest';
import {
  classifyCollateral,
  collateralPoints,
  curatorPoints,
  gradeFor,
  oraclePoints,
  riskScore,
  utilizationPoints,
} from '../src/risk';
import { PROTOTYPE_VAULTS } from './fixtures';

describe('riskScore — prototype vaults', () => {
  it('USDG Core → A 97', () => {
    const r = riskScore(PROTOTYPE_VAULTS.core);
    expect(r).toMatchObject({ score: 97, grade: 'A' });
    expect(r.parts.map((p) => p.points)).toEqual([25, 27.2, 25, 20]);
  });

  it('USDG Prime → A 100', () => {
    const r = riskScore(PROTOTYPE_VAULTS.prime);
    expect(r).toMatchObject({ score: 100, grade: 'A' });
    expect(r.parts.map((p) => p.points)).toEqual([25, 30, 25, 20]);
  });

  it('USDG Boost → C 47', () => {
    const r = riskScore(PROTOTYPE_VAULTS.boost);
    expect(r).toMatchObject({ score: 47, grade: 'C' });
    expect(r.parts.map((p) => p.points)).toEqual([15, 13.8, 8, 10]);
  });

  it('breakdown carries labels, maxima and prototype copy', () => {
    const r = riskScore(PROTOTYPE_VAULTS.boost);
    expect(r.parts.map((p) => [p.label, p.max])).toEqual([
      ['Utilization', 25],
      ['Collateral quality', 30],
      ['Oracle', 25],
      ['Curator record', 20],
    ]);
    expect(r.parts[0].note).toBe('Getting tight; exits may slow');
    expect(r.parts[1].note).toBe('TSLA (tokenized), NVDA (tokenized), [Small-cap token]');
    expect(r.parts[2].note).toBe('DEX-based pricing, easier to distort');
    expect(r.parts[3].note).toBe('1 past incident on record');
    expect(riskScore(PROTOTYPE_VAULTS.core).parts[3].note).toBe('No recorded incidents');
  });

  it('stress-test Boost (util 98.6) drops utilization to 5 → C 37', () => {
    const r = riskScore({ ...PROTOTYPE_VAULTS.boost, utilization: 98.6 });
    expect(r).toMatchObject({ score: 37, grade: 'C' });
    expect(r.parts[0].note).toBe('Near full; exits can be delayed');
  });
});

describe('factor rules', () => {
  it('utilization thresholds are strict < 85 and < 95', () => {
    expect(utilizationPoints(0)).toBe(25);
    expect(utilizationPoints(84.99)).toBe(25);
    expect(utilizationPoints(85)).toBe(15);
    expect(utilizationPoints(94.99)).toBe(15);
    expect(utilizationPoints(95)).toBe(5);
    expect(utilizationPoints(100)).toBe(5);
  });

  it('collateral = 30 × Σ share × quality, rounded to 0.1', () => {
    expect(collateralPoints([{ symbol: 'X', share: 100, quality: 'blue' }])).toBe(30);
    expect(collateralPoints([{ symbol: 'X', share: 100, quality: 'mid' }])).toBe(18);
    expect(collateralPoints([{ symbol: 'X', share: 100, quality: 'tail' }])).toBe(6);
    expect(collateralPoints([])).toBe(0);
  });

  it('oracle and curator points', () => {
    expect([oraclePoints('chainlink'), oraclePoints('mixed'), oraclePoints('dex')]).toEqual([25, 15, 8]);
    expect([curatorPoints(0), curatorPoints(1), curatorPoints(3)]).toEqual([20, 10, 10]);
  });

  it('grade boundaries A ≥ 80 · B 60–79 · C < 60', () => {
    expect([gradeFor(100), gradeFor(80), gradeFor(79), gradeFor(60), gradeFor(59), gradeFor(0)]).toEqual([
      'A', 'A', 'B', 'B', 'C', 'C',
    ]);
  });

  it('plural incident note', () => {
    expect(riskScore({ ...PROTOTYPE_VAULTS.prime, curatorIncidents: 2 }).parts[3].note).toBe('2 past incidents on record');
  });
});

describe('classifyCollateral', () => {
  it('defaults blue-chip symbols case-insensitively', () => {
    for (const s of ['WETH', 'wbtc', 'wstETH', 'CBBTC']) expect(classifyCollateral(s)).toBe('blue');
  });

  it('unknown symbols are tail', () => {
    expect(classifyCollateral('PEPE')).toBe('tail');
  });

  it('table entries win over defaults', () => {
    expect(classifyCollateral('TSLA', { TSLA: 'mid' })).toBe('mid');
    expect(classifyCollateral('tsla', new Map([['TSLA', 'mid' as const]]))).toBe('mid');
    expect(classifyCollateral('WETH', { weth: 'mid' })).toBe('mid');
  });
});
