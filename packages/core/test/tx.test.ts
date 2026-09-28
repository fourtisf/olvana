import { describe, expect, it } from 'vitest';
import { encodeErrorResult, encodeFunctionData, toFunctionSelector, type Address } from 'viem';
import { vaultV2Abi } from '../src/abis';
import { UNKNOWN_REVERT, explainRevert, parseAmount, planDeposit, planWithdraw } from '../src/tx';

const VAULT = '0xbeeff033f34c046626b8d0a041844c5d1a5409dd' as Address;
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168' as Address;
const USER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;
const word = (n: bigint | string) => (typeof n === 'bigint' ? n.toString(16) : n.slice(2).toLowerCase()).padStart(64, '0');

describe('parseAmount', () => {
  it('parses exact decimal strings into token units', () => {
    expect(parseAmount('100', 6)).toBe(100_000_000n);
    expect(parseAmount('0.5', 6)).toBe(500_000n);
    expect(parseAmount('.25', 6)).toBe(250_000n);
    expect(parseAmount('1.', 6)).toBe(1_000_000n);
    expect(parseAmount('1234.567891', 6)).toBe(1_234_567_891n);
    expect(parseAmount('1.5000000', 6)).toBe(1_500_000n); // trailing zeros beyond the decimals are fine
  });
  it('rejects anything that is not a plain amount, or too precise', () => {
    for (const bad of ['', '.', 'abc', '-1', '1e6', '1,000', '1.2.3']) expect(parseAmount(bad, 6)).toBeNull();
    expect(parseAmount('0.0000001', 6)).toBeNull();
  });
});

describe('selectors the site hand-encodes (docs/olvana-prototype.html SEL)', () => {
  it('match the vendored ABIs', () => {
    expect(toFunctionSelector('deposit(uint256,address)')).toBe('0x6e553f65');
    expect(toFunctionSelector('withdraw(uint256,address,address)')).toBe('0xb460af94');
    expect(toFunctionSelector('redeem(uint256,address,address)')).toBe('0xba087652');
    expect(toFunctionSelector('approve(address,uint256)')).toBe('0x095ea7b3');
    expect(toFunctionSelector('allowance(address,address)')).toBe('0xdd62ed3e');
    expect(toFunctionSelector('isVaultV2(address)')).toBe('0x5edec50d');
    expect(toFunctionSelector('asset()')).toBe('0x38d52e0f');
    expect(encodeFunctionData({ abi: vaultV2Abi, functionName: 'deposit', args: [1n, USER] }).slice(0, 10)).toBe('0x6e553f65');
  });
});

describe('planDeposit', () => {
  it('approves the exact amount, then deposits to the user', () => {
    const steps = planDeposit({ vault: VAULT, asset: USDG, user: USER, amount: 100_000_000n, allowance: 0n });
    expect(steps.map((s) => s.kind)).toEqual(['approve', 'deposit']);
    expect(steps[0]!.tx).toEqual({ to: USDG, data: '0x095ea7b3' + word(VAULT) + word(100_000_000n) });
    expect(steps[1]!.tx).toEqual({ to: VAULT, data: '0x6e553f65' + word(100_000_000n) + word(USER) });
  });
  it('skips the approval when the allowance already covers the amount', () => {
    expect(planDeposit({ vault: VAULT, asset: USDG, user: USER, amount: 5n, allowance: 5n }).map((s) => s.kind)).toEqual(['deposit']);
  });
  it('resets a leftover allowance first for USDT-style tokens', () => {
    const steps = planDeposit({ vault: VAULT, asset: USDG, user: USER, amount: 20n, allowance: 5n, approveNeedsReset: true });
    expect(steps.map((s) => s.kind)).toEqual(['reset-approval', 'approve', 'deposit']);
    expect(steps[0]!.tx.data.endsWith(word(0n))).toBe(true);
    expect(steps[1]!.tx.data.endsWith(word(20n))).toBe(true);
  });
  it('never approves more than the amount', () => {
    for (const s of planDeposit({ vault: VAULT, asset: USDG, user: USER, amount: 7n, allowance: 3n }))
      if (s.kind === 'approve') expect(BigInt('0x' + s.tx.data.slice(-64))).toBe(7n);
  });
  it('rejects a zero amount', () => {
    expect(() => planDeposit({ vault: VAULT, asset: USDG, user: USER, amount: 0n, allowance: 0n })).toThrow();
  });
});

describe('planWithdraw', () => {
  const base = { vault: VAULT, user: USER, positionAssets: 120_000_000n, shares: 119_000_000_000_000_000_000n };
  it('partial amount → withdraw(assets, user, user)', () => {
    const p = planWithdraw({ ...base, amount: 30_000_000n });
    expect(p.kind).toBe('withdraw');
    expect(p.tx).toEqual({ to: VAULT, data: '0xb460af94' + word(30_000_000n) + word(USER) + word(USER) });
  });
  it('MAX or the whole position → redeem(allShares) so no dust is left', () => {
    for (const p of [planWithdraw({ ...base, amount: 0n, max: true }), planWithdraw({ ...base, amount: 120_000_000n })]) {
      expect(p.kind).toBe('redeem');
      expect(p.assets).toBe(120_000_000n);
      expect(p.tx.data).toBe('0xba087652' + word(base.shares) + word(USER) + word(USER));
    }
  });
  it('refuses when there is nothing in the vault', () => {
    expect(() => planWithdraw({ ...base, shares: 0n, amount: 1n })).toThrow();
  });
});

describe('explainRevert', () => {
  it('maps Vault V2 custom errors to plain English', () => {
    expect(explainRevert(encodeErrorResult({ abi: vaultV2Abi, errorName: 'AbsoluteCapExceeded' }))).toMatch(/vault is full/);
    expect(explainRevert(encodeErrorResult({ abi: vaultV2Abi, errorName: 'CannotReceiveShares' }))).toMatch(/approved addresses/);
    expect(explainRevert('0x4616e4af')).toMatch(/vault is full/); // selector the site maps by hand
  });
  it("decodes Error(string), e.g. Morpho Blue's 'insufficient liquidity'", () => {
    const data = ('0x08c379a0' + word(32n) + word(22n) + Buffer.from('insufficient liquidity').toString('hex').padEnd(64, '0')) as `0x${string}`;
    expect(explainRevert(data)).toMatch(/Not enough liquidity/);
  });
  it('decodes Panic as more than the position', () => {
    expect(explainRevert(('0x4e487b71' + word(0x11n)) as `0x${string}`)).toMatch(/more than this wallet holds/);
  });
  it('falls back when there is no reason', () => {
    expect(explainRevert(undefined)).toBe(UNKNOWN_REVERT);
    expect(explainRevert('0x')).toBe(UNKNOWN_REVERT);
    expect(explainRevert('0xdeadbeef')).toBe(UNKNOWN_REVERT);
  });
});
