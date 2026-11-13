import { describe, expect, test } from 'bun:test';
import { memoryStore, RunIndex } from '../src/lib/automation';
import { Approvals, busStore, folderKey, type BusKV } from '../src/lib/automation-state';

/** mdhouse's JSON values as the bus keeps them. */
function fakeKV(): BusKV & { names: () => string[] } {
  const m = new Map<string, Record<string, unknown>>();
  return {
    kvJson: async (n) => (m.has(n) ? structuredClone(m.get(n)!) : null),
    kvSet: async (n, v) => void m.set(n, structuredClone(v)),
    kvDelete: async (n) => m.delete(n),
    kvNames: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
    names: () => [...m.keys()].sort(),
  };
}

describe('automation state on the bus', () => {
  test('approvals: by folder and id under auto/approval/; a firing needs the same hash and schedule', async () => {
    const kv = fakeKV();
    const a = new Approvals(busStore(kv));
    expect(await a.get('/p', 'r')).toBeNull();
    await a.set('/p', 'r', { hash: 'h1', scheduleId: 's1', at: 't', by: 'local' });
    expect(kv.names()).toEqual([expect.stringMatching(/^auto\/approval\/[0-9a-f]{16}\/r$/)]);
    const again = new Approvals(busStore(kv));
    expect(await again.get('/p', 'r')).toEqual({ hash: 'h1', scheduleId: 's1', at: 't', by: 'local' });
    expect(await again.get('/q', 'r')).toBeNull();
    const check = again.check((id) => (id === 'p' ? '/p' : null));
    const ask = { rootId: 'p', registration: 'r', hash: 'h1', scheduleId: 's1' };
    expect(await check(ask)).toBe(true);
    for (const over of [{ hash: 'h2' }, { scheduleId: 's2' }, { registration: 'other' }, { rootId: 'unknown' }]) expect([over, await check({ ...ask, ...over })]).toEqual([over, false]);
    expect(await again.drop('/p', 'r')).toMatchObject({ hash: 'h1' });
    expect(await check(ask)).toBe(false);
    expect(kv.names()).toEqual([]);
  });

  test('fail-closed: a store error is no approval', async () => {
    const store = memoryStore();
    const a = new Approvals({ ...store, get: () => Promise.reject(new Error('bus down')) });
    expect(await a.check(() => '/p')({ rootId: 'p', registration: 'r', hash: 'h', scheduleId: 's' })).toBe(false);
  });

  test('RunIndex keys by rootKey: a renamed root id keeps its history', async () => {
    const store = memoryStore();
    const path = new Map([['a', '/p']]);
    const index = new RunIndex(store, Date.now, (id) => folderKey(path.get(id) ?? id));
    await index.record('a', 'reg', { requestId: 'x', outcome: 'skipped', why: 'late' });
    path.set('a-2', '/p');
    expect((await index.history('a-2', 'reg', 5)).length).toBe(1);
    expect(await store.keys(`automation/${folderKey('/p')}/reg/`)).toHaveLength(1);
  });

  test('a malformed stored value is no approval', async () => {
    const store = memoryStore();
    const a = new Approvals(store);
    await a.set('/p', 'r', { hash: 'h', scheduleId: 's', at: 't', by: 'b' });
    const [key] = await store.keys('auto/approval/');
    await store.put(key!, { hash: 'h' });
    expect(await a.get('/p', 'r')).toBeNull();
  });

  test('busStore under RunIndex: entries and state read back', async () => {
    const kv = fakeKV();
    const index = new RunIndex(busStore(kv));
    for (let i = 0; i < 3; i++) await index.record('root', 'reg', { requestId: `s:${i}`, outcome: 'skipped', why: 'late' });
    await index.outcome('root', 'reg', 'failed', {});
    const fresh = new RunIndex(busStore(kv));
    expect((await fresh.history('root', 'reg', 50)).length).toBe(4);
    expect((await fresh.state('root', 'reg')).failures).toBe(1);
  });
});
