/**
 * Olvana risk grade — ported exactly from the approved prototype (HANDOFF §5).
 *
 * Score out of 100:
 *   Utilization         25  (< 85% → 25 · < 95% → 15 · else 5)
 *   Collateral quality  30  (30 × Σ share_i × q_i; blue 1.0 · mid 0.6 · tail 0.2)
 *   Oracle              25  (chainlink 25 · mixed 15 · dex 8)
 *   Curator record      20  (0 incidents → 20 · ≥ 1 → 10)
 * Grade: A ≥ 80 · B 60–79 · C < 60.
 *
 * Rounding matches the prototype: the collateral part is rounded to one
 * decimal, then the total is rounded to an integer.
 */

export type CollateralQuality = 'blue' | 'mid' | 'tail';
export type OracleType = 'chainlink' | 'mixed' | 'dex';
export type RiskGrade = 'A' | 'B' | 'C';

export const COLLATERAL_QUALITY_WEIGHT: Record<CollateralQuality, number> = { blue: 1, mid: 0.6, tail: 0.2 };
export const ORACLE_POINTS: Record<OracleType, number> = { chainlink: 25, mixed: 15, dex: 8 };

/** Default blue-chip collateral (HANDOFF §5). Everything else comes from the `collateral_class` table. */
export const DEFAULT_BLUE_CHIP_SYMBOLS = ['WETH', 'WBTC', 'wstETH', 'cbBTC'] as const;

export interface RiskCollateral {
  symbol: string;
  /** Share of the vault's allocation, in percent (0–100). */
  share: number;
  quality: CollateralQuality;
}

export interface RiskInput {
  /** Vault utilization, in percent (0–100). */
  utilization: number;
  collateral: readonly RiskCollateral[];
  oracle: OracleType;
  curatorIncidents: number;
}

export interface RiskPart {
  key: 'utilization' | 'collateral' | 'oracle' | 'curator';
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface RiskResult {
  score: number;
  grade: RiskGrade;
  parts: [RiskPart, RiskPart, RiskPart, RiskPart];
}

export function utilizationPoints(utilization: number): number {
  return utilization < 85 ? 25 : utilization < 95 ? 15 : 5;
}

export function collateralPoints(collateral: readonly RiskCollateral[]): number {
  const q = collateral.reduce((t, c) => t + (c.share / 100) * COLLATERAL_QUALITY_WEIGHT[c.quality], 0);
  return Math.round(q * 30 * 10) / 10;
}

export function oraclePoints(oracle: OracleType): number {
  return ORACLE_POINTS[oracle];
}

export function curatorPoints(incidents: number): number {
  return incidents === 0 ? 20 : 10;
}

export function gradeFor(score: number): RiskGrade {
  return score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';
}

const ORACLE_NOTE: Record<OracleType, string> = {
  chainlink: 'Established push oracle',
  mixed: 'Mix of push-oracle and DEX pricing',
  dex: 'DEX-based pricing, easier to distort',
};

export function riskScore(input: RiskInput): RiskResult {
  const u = utilizationPoints(input.utilization);
  const c = collateralPoints(input.collateral);
  const o = oraclePoints(input.oracle);
  const cu = curatorPoints(input.curatorIncidents);
  const score = Math.round(u + c + o + cu);
  const n = input.curatorIncidents;
  return {
    score,
    grade: gradeFor(score),
    parts: [
      {
        key: 'utilization',
        label: 'Utilization',
        points: u,
        max: 25,
        note:
          input.utilization < 85
            ? 'Healthy room for withdrawals'
            : input.utilization < 95
              ? 'Getting tight; exits may slow'
              : 'Near full; exits can be delayed',
      },
      {
        key: 'collateral',
        label: 'Collateral quality',
        points: c,
        max: 30,
        note: input.collateral.map((x) => x.symbol).join(', '),
      },
      { key: 'oracle', label: 'Oracle', points: o, max: 25, note: ORACLE_NOTE[input.oracle] },
      {
        key: 'curator',
        label: 'Curator record',
        points: cu,
        max: 20,
        note: n === 0 ? 'No recorded incidents' : `${n} past incident${n === 1 ? '' : 's'} on record`,
      },
    ],
  };
}

/**
 * Collateral classification: explicit table entry (from `collateral_class`)
 * wins, then the default blue-chip list, otherwise tail. Symbol match is
 * case-insensitive. Tokenized stocks are marked `mid` via the table.
 */
export function classifyCollateral(
  symbol: string,
  table: ReadonlyMap<string, CollateralQuality> | Readonly<Record<string, CollateralQuality>> = {},
): CollateralQuality {
  const key = symbol.toLowerCase();
  const entries: Iterable<[string, CollateralQuality]> =
    table instanceof Map ? table.entries() : Object.entries(table as Record<string, CollateralQuality>);
  for (const [s, q] of entries) if (s.toLowerCase() === key) return q;
  if (DEFAULT_BLUE_CHIP_SYMBOLS.some((s) => s.toLowerCase() === key)) return 'blue';
  return 'tail';
}

/* ------------------------------------------------------------------ */
/* Risk flags — shown next to the grade, never change the score        */
/* ------------------------------------------------------------------ */

export type CollateralKind = 'crypto' | 'equity' | 'stable';

export interface FlagCollateral {
  symbol: string;
  /** Liquidation LTV, in percent (e.g. 86). */
  lltv: number;
  /** `equity` = tokenized stock (set in `collateral_class`). */
  kind?: CollateralKind;
}

export interface RiskFlagInput {
  collateral: readonly FlagCollateral[];
  /** Days since the vault was deployed, if known. */
  vaultAgeDays?: number | null;
  /** Current USDG price in USD, if known. */
  usdgPrice?: number | null;
}

export type RiskFlagKey = 'equity-collateral' | 'high-lltv' | 'new-vault' | 'usdg-depeg' | 'synthetic-stable';

export interface RiskFlag {
  key: RiskFlagKey;
  text: string;
}

/** LLTV above this (percent) is flagged. Morpho's common blue-chip tier is 86%. */
export const HIGH_LLTV_PCT = 86;
export const NEW_VAULT_DAYS = 90;
export const DEPEG_TOLERANCE = 0.005;

export function riskFlags(input: RiskFlagInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.collateral.some((c) => c.kind === 'equity')) {
    flags.push({
      key: 'equity-collateral',
      text: 'Tokenized stock collateral: prices can gap when stock markets are closed (nights, weekends, holidays), so liquidations may lag.',
    });
  }
  if (input.collateral.some((c) => c.kind !== 'stable' && c.lltv > HIGH_LLTV_PCT)) {
    flags.push({
      key: 'high-lltv',
      text: `High loan-to-value markets (above ${HIGH_LLTV_PCT}% LLTV) leave less room before bad debt.`,
    });
  }
  if (input.vaultAgeDays != null && input.vaultAgeDays < NEW_VAULT_DAYS) {
    flags.push({ key: 'new-vault', text: `New vault: less than ${NEW_VAULT_DAYS} days of track record.` });
  }
  if (input.usdgPrice != null && Math.abs(input.usdgPrice - 1) > DEPEG_TOLERANCE) {
    flags.push({
      key: 'usdg-depeg',
      text: `USDG is trading at $${input.usdgPrice.toFixed(4)}, away from its $1 peg.`,
    });
  }
  return flags;
}

/**
 * Landing-page headline APY: the best net APY among grade A vaults only, so
 * the headline never advertises a grade C yield. Null if no vault is grade A.
 */
export function headlineNetApy(vaults: readonly { netApy: number; grade: RiskGrade }[]): number | null {
  const a = vaults.filter((v) => v.grade === 'A').map((v) => v.netApy);
  return a.length ? Math.max(...a) : null;
}
