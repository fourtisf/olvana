import { describe, expect, it } from 'vitest';
import { ConfigTodoError, VAULTS, configTodos, isAllowlistedVault, required, vaultById } from '../src/config';

describe('config', () => {
  it('lists the three prototype vaults', () => {
    expect(VAULTS.map((v) => v.id)).toEqual(['core', 'prime', 'boost']);
    expect(vaultById('prime')?.name).toBe('USDG Prime');
    expect(vaultById('nope')).toBeUndefined();
  });

  it('allowlist rejects anything not configured (and junk)', () => {
    expect(isAllowlistedVault('0x0000000000000000000000000000000000000001')).toBe(false);
    expect(isAllowlistedVault('not-an-address')).toBe(false);
  });

  it('required() throws a ConfigTodoError for unset values', () => {
    expect(() => required('CHAIN_ID', null)).toThrow(ConfigTodoError);
    expect(required('X', 1)).toBe(1);
  });

  it('configTodos reports every unset chain/contract value', () => {
    const keys = configTodos().map((t) => t.key);
    // While unverified, these must stay TODOs rather than guessed values.
    for (const v of VAULTS) if (v.address == null) expect(keys).toContain(`VAULTS.${v.id}.address`);
  });
});
