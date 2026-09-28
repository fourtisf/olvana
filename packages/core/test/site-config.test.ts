import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAINS, STABLECOINS } from '../src/config';

// docs/olvana-prototype.html carries its own copy of the network config (it is a single static file).
// Every address in packages/core must appear, in the same network block, in the site.
const html = readFileSync(new URL('../../../docs/olvana-prototype.html', import.meta.url), 'utf8');
const block = (id: number) => {
  const start = html.indexOf(`{ id: ${id},`);
  const next = html.indexOf('{ id: ', start + 8);
  return start < 0 ? '' : html.slice(start, next < 0 ? start + 2000 : next);
};

describe('site CONFIG matches packages/core CHAINS', () => {
  for (const c of CHAINS) {
    it(`${c.name} (${c.id})`, () => {
      const b = block(c.id);
      expect(b).not.toBe('');
      for (const a of [c.vaultV2Factory, c.morphoBlue, ...c.metaMorphoFactories, ...Object.values(c.stablecoinPins)]) expect(b).toContain(a);
      const v1 = /metaMorphoFactories: \[([^\]]*)\]/.exec(b)?.[1] ?? '';
      expect((v1.match(/0x[0-9a-fA-F]{40}/g) ?? []).length).toBe(c.metaMorphoFactories.length);
    });
  }
  it('same stablecoin list', () => {
    expect(html).toContain(`stablecoins: [${STABLECOINS.map((x) => `'${x}'`).join(',')}]`);
  });
});
