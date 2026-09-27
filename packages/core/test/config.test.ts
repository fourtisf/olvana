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

describe('verified chain values', () => {
  it('Robinhood Chain mainnet + Morpho addresses are checksummed', async () => {
    const { getAddress } = await import('viem');
    const { CHAIN_ID, MORPHO_BLUE_ADDRESS, VAULT_V2_FACTORY_ADDRESS } = await import('../src/config');
    expect(CHAIN_ID).toBe(4663);
    for (const a of [MORPHO_BLUE_ADDRESS, VAULT_V2_FACTORY_ADDRESS]) expect(a && getAddress(a)).toBe(a);
  });

  it('robinhoodChain() still needs an RPC URL from env', async () => {
    const { robinhoodChain } = await import('../src/config');
    expect(() => robinhoodChain([])).toThrow(ConfigTodoError);
    expect(robinhoodChain(['https://rpc.example']).id).toBe(4663);
  });
});

describe('networks', () => {
  it('every network address is a valid checksummed address', async () => {
    const { getAddress } = await import('viem');
    const { CHAINS } = await import('../src/config');
    for (const c of CHAINS) {
      for (const a of [c.morphoBlue, c.vaultV2Factory, ...Object.values(c.stablecoinPins)]) expect(getAddress(a)).toBe(a);
    }
  });
  it('ids are unique and include the home network', async () => {
    const { CHAINS, CHAIN_ID, chainById } = await import('../src/config');
    expect(new Set(CHAINS.map((c) => c.id)).size).toBe(CHAINS.length);
    expect(chainById(CHAIN_ID)?.key).toBe('robinhood');
    expect(chainById(8453)?.name).toBe('Base');
    expect(chainById(10)).toBeUndefined();
  });
});
