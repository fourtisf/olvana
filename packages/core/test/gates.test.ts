import { describe, expect, it } from 'vitest';
import { GATE_GETTERS, gateRpcUrls, readGates } from '../src/gates';
import { CHAINS } from '../src/config';

const word = (addr: string) => '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const ZERO = '0x' + '0'.repeat(40);
// JSON-RPC batch mock: gates[vault][selector] = gate address (default 0); `fail` vaults answer with an error
function rpc(gates: Record<string, Record<string, string>>, fail: string[] = []) {
  const calls: unknown[] = [];
  const f = (async (_url: string, init: { body: string }) => {
    const reqs = JSON.parse(init.body) as { id: number; params: [{ to: string; data: string }] }[];
    calls.push(reqs);
    return { json: async () => reqs.map((r) => fail.includes(r.params[0].to.toLowerCase())
      ? { id: r.id, error: { code: -32000, message: 'execution reverted' } }
      : { id: r.id, result: word(gates[r.params[0].to.toLowerCase()]?.[r.params[0].data] ?? ZERO) }) };
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('Vault V2 gates', () => {
  it('selectors match VaultV2.sol getters', () => {
    expect(GATE_GETTERS).toEqual({ receiveSharesGate: '0x7e729ac4', sendAssetsGate: '0x8eede801', sendSharesGate: '0x93ab2ab7', receiveAssetsGate: '0x54cde13e' });
  });
  it('open (all four gates 0) / restricted (any gate set) / unknown (reads failed), in one batch request', async () => {
    const open = '0x' + 'a'.repeat(40), deposits = '0x' + 'b'.repeat(40), exits = '0x' + 'c'.repeat(40), broken = '0x' + 'd'.repeat(40);
    const { f, calls } = rpc({ [deposits]: { '0x8eede801': '0x2bbba2fd0ae8976c798499477c03b47b88fba9fa' }, [exits]: { '0x54cde13e': '0x' + '9'.repeat(40) } }, [broken]);
    const g = await readGates('https://rpc.test', [open, deposits, exits, broken], f);
    expect([...g]).toEqual([[open, false], [deposits, true], [exits, true], [broken, null]]);
    expect(calls.length).toBe(1);
  });
  it('a network that is down leaves every vault unknown', async () => {
    const f = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const g = await readGates('https://rpc.test', ['0x' + 'a'.repeat(40)], f);
    expect([...g.values()]).toEqual([null]);
  });
  it('RPC per network: OLVANA_RPC_<chainId> first, else config rpcUrl (Robinhood Chain), else none', () => {
    const urls = gateRpcUrls({ OLVANA_RPC_1: 'https://eth.example' });
    const rh = CHAINS.find((c) => c.id === 4663)!;
    expect(urls[1]).toBe('https://eth.example');
    expect(urls[4663]).toBe(rh.rpcUrl);
    expect(urls[8453]).toBeUndefined();
  });
});
