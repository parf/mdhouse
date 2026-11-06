import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EDGE_KEYS, guarded, KEPT_KEYS, unmet } from '../scripts/passive-lib';

// No real process, Chrome or server: the environment and the browser connection are fakes.

describe('guarded run lifecycle', () => {
  const quiet = () => {
    const real = console.error;
    console.error = () => {};
    return () => (console.error = real);
  };

  test('cleanup runs once after a normal body and its code is kept', async () => {
    let stops = 0;
    expect(await guarded({ stop: async () => void stops++ }, async () => 1)).toBe(1);
    expect(stops).toBe(1);
  });

  test('a throwing body is nonzero and cleanup still runs', async () => {
    const restore = quiet();
    let stops = 0;
    const code = await guarded({ stop: async () => void stops++ }, async () => {
      throw new Error('cdp down');
    });
    restore();
    expect(code).toBe(2);
    expect(stops).toBe(1);
  });

  test('a failing cleanup turns a green run nonzero', async () => {
    const restore = quiet();
    const code = await guarded({ stop: async () => Promise.reject(new Error('stuck')) }, async () => 0);
    restore();
    expect(code).toBe(2);
  });

  test('body error and cleanup error are both reported, body first', async () => {
    const lines: string[] = [];
    const real = console.error;
    console.error = (m: string) => void lines.push(m);
    const code = await guarded({ stop: async () => Promise.reject(new Error('stuck')) }, async () => {
      throw new Error('cdp down');
    });
    console.error = real;
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/cdp down; stuck/);
  });
});

describe('entrypoints clean up when the browser connection fails', () => {
  const realFetch = globalThis.fetch;
  const realExit = process.exit;
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.exit = realExit;
  });

  for (const script of ['passive-actions', 'passive-corpus']) {
    test(`${script}: stop runs once, exit is nonzero`, async () => {
      const real = await import('../scripts/passive-lib');
      let starts = 0;
      let stops = 0;
      mock.module('../scripts/passive-lib', () => ({
        ...real,
        startEnv: async () => {
          starts++;
          return { base: 'http://127.0.0.1:1/r', dir: '/nonexistent', chrome: 1, probes: [], stop: async () => void stops++ };
        },
      }));
      globalThis.fetch = (async () => {
        throw new Error('injected CDP failure');
      }) as unknown as typeof fetch;
      const exits: number[] = [];
      process.exit = ((code?: number) => void exits.push(code ?? 0)) as typeof process.exit;
      const restore = quiet();
      await import(`../scripts/${script}.ts?fake=${script}`);
      restore();
      expect({ starts, stops, exits }).toEqual({ starts: 1, stops: 1, exits: [2] });
    });
  }

  function quiet() {
    const log = console.error;
    console.error = () => {};
    return () => (console.error = log);
  }
});

describe('positive style checks are not fail-open', () => {
  for (const [name, keys] of [['kept', KEPT_KEYS], ['edge', EDGE_KEYS]] as const) {
    const full = Object.fromEntries(keys.map((k) => [k, true]));
    test(`${name}: the full expected set, all true, is accepted`, () => {
      expect(keys.length).toBeGreaterThan(0);
      expect(unmet(full, [...keys])).toEqual([]);
    });
    test(`${name}: missing, null, empty and non-object results are rejected`, () => {
      for (const bad of [undefined, null, {}, [], 'x', 1]) expect(unmet(bad, [...keys]).length).toBe(keys.length);
    });
    test(`${name}: a partial, false or non-true value is rejected, naming it`, () => {
      expect(unmet({ ...full, [keys[0]!]: false }, [...keys])).toEqual([keys[0]!]);
      expect(unmet({ ...full, [keys[1]!]: 1 }, [...keys])).toEqual([keys[1]!]);
      const { [keys[2]!]: _drop, ...partial } = full;
      expect(unmet(partial, [...keys])).toEqual([keys[2]!]);
    });
    test(`${name}: an unexpected extra key is rejected`, () => {
      expect(unmet({ ...full, surprise: true }, [...keys])).toEqual(['unexpected:surprise']);
    });
  }
});
