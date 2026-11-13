import { describe, expect, test } from 'bun:test';
import { HISTORY_CAP, histKey, lastKey, MAX_FILES, recordRun, registerSource, sameSource, sourceId, sourceKey, trimHistory, type RunRecord, type SourceDef } from '../src/lib/rag-registry';
import type { RagStore } from '../src/lib/rag-sync-bus';

const store = () => {
  const kv = new Map<string, Record<string, unknown>>();
  const s: RagStore = {
    get: async (n) => (kv.has(n) ? structuredClone(kv.get(n)!) : null),
    add: async (n, v) => (kv.has(n) ? false : (kv.set(n, structuredClone(v)), true)),
    set: async (n, v) => void kv.set(n, structuredClone(v)),
    delete: async (n) => kv.delete(n),
    names: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
    log: async () => {},
  };
  return { s, kv };
};

const DEF: SourceDef = { root: { path: '/home/p/notes', dev: '1', ino: '2' }, filescan: '#filescan/n@h', rag: '#rag/n@h', namespace: 'notes', table: 'md' };
const RUN = (at: string): RunRecord => ({ v: 1, startedAt: at, endedAt: at, rounds: 1, untilDone: false, result: 'confirmed', exit: 0, confirmed: 2, remaining: 0, sent: 2 });

describe('keys', () => {
  test('one source id and three key families under rag/', () => {
    expect(sourceId(DEF)).toBe('notes/md');
    expect(sourceKey('notes/md')).toBe('rag/source/notes/md');
    expect(lastKey('notes/md')).toBe('rag/last/notes/md');
    expect(histKey('notes/md', new Date('2026-11-12T23:59:58.123Z'), 'ab12')).toBe('rag/hist/notes/md/20261112T235958Z-ab12');
  });

  test('history keys sort by start time', () => {
    const a = histKey('s', new Date('2026-11-12T09:00:00Z'), 'ffff');
    const b = histKey('s', new Date('2026-11-12T10:00:00Z'), '0000');
    const c = histKey('s', new Date('2027-01-01T00:00:00Z'), '0000');
    expect([c, b, a].sort()).toEqual([a, b, c]);
  });
});

describe('sameSource', () => {
  const stored = { v: 1, root: { path: '/home/p/notes', dev: '9', ino: '9' }, filescan: DEF.filescan, rag: DEF.rag, namespace: 'notes', table: 'md', createdAt: 'x', by: 'y' };
  test('the same path, FileScan, RAG, namespace and table; the device and inode are not compared', () => {
    expect(sameSource(stored, DEF)).toBe(true);
  });
  test.each([
    ['another folder', { root: { path: '/home/p/other' } }],
    ['another FileScan', { filescan: '#filescan/x@h' }],
    ['another RAG', { rag: '#rag/x@h' }],
    ['another namespace', { namespace: 'x' }],
    ['another table', { table: 'x' }],
    ['no root', { root: undefined }],
  ])('%s is not it', (_, change) => {
    expect(sameSource({ ...stored, ...change }, DEF)).toBe(false);
  });
  test('anything that is not an object is not it', () => {
    for (const v of [null, undefined, 'x', 3, []]) expect(sameSource(v, DEF)).toBe(false);
  });
});

describe('registerSource', () => {
  const at = new Date('2026-11-12T00:00:00Z');
  test('registers a new source once, then finds it again', async () => {
    const { s, kv } = store();
    expect(await registerSource(s, DEF, at, '#mdhouse@h')).toBe('new');
    expect(kv.get('rag/source/notes/md')).toEqual({ v: 1, root: DEF.root, filescan: DEF.filescan, rag: DEF.rag, namespace: 'notes', table: 'md', createdAt: '2026-11-12T00:00:00.000Z', by: '#mdhouse@h' });
    expect(await registerSource(s, DEF, at, '#mdhouse@h')).toBe('same');
    expect(kv.size).toBe(1);
  });

  test('another folder for the same namespace/table is refused and the entry is left as it was', async () => {
    const { s, kv } = store();
    await registerSource(s, DEF, at, 'me');
    const before = structuredClone(kv.get('rag/source/notes/md'));
    expect(await registerSource(s, { ...DEF, root: { ...DEF.root, path: '/home/p/other' } }, at, 'me')).toBe('other');
    expect(kv.get('rag/source/notes/md')).toEqual(before);
  });

  test('a run that loses the race to register compares with the winner', async () => {
    const { s, kv } = store();
    let first = true;
    const racing: RagStore = {
      ...s,
      get: async (n) => {
        if (first) {
          first = false;
          return null;
        }
        return s.get(n);
      },
    };
    kv.set('rag/source/notes/md', { v: 1, root: { path: '/elsewhere' }, filescan: DEF.filescan, rag: DEF.rag, namespace: 'notes', table: 'md' });
    expect(await registerSource(racing, DEF, at, 'me')).toBe('other');
    first = true;
    kv.set('rag/source/notes/md', { v: 1, root: { path: DEF.root.path }, filescan: DEF.filescan, rag: DEF.rag, namespace: 'notes', table: 'md' });
    expect(await registerSource(racing, DEF, at, 'me')).toBe('same');
  });
});

describe('recordRun and trimHistory', () => {
  test('the latest run is overwritten, each run adds one history entry, files are capped', async () => {
    const { s, kv } = store();
    const files = Array.from({ length: MAX_FILES + 5 }, (_, i) => ({ path: `f${i}.md`, state: 'failed' }));
    await recordRun(s, 'notes/md', RUN('2026-11-12T10:00:00Z'), files, 'aaaa');
    await recordRun(s, 'notes/md', RUN('2026-11-12T11:00:00Z'), [], 'bbbb');
    expect(kv.get('rag/last/notes/md')).toMatchObject({ startedAt: '2026-11-12T11:00:00Z' });
    expect([...kv.keys()].filter((k) => k.startsWith('rag/hist/'))).toEqual(['rag/hist/notes/md/20261112T100000Z-aaaa', 'rag/hist/notes/md/20261112T110000Z-bbbb']);
    expect((kv.get('rag/hist/notes/md/20261112T100000Z-aaaa')!.files as unknown[]).length).toBe(MAX_FILES);
    expect(kv.get('rag/hist/notes/md/20261112T110000Z-bbbb')).not.toHaveProperty('files');
  });

  test('two runs that start in the same second keep both entries', async () => {
    const { s, kv } = store();
    await recordRun(s, 'x/y', RUN('2026-11-12T10:00:00Z'), [], 'aaaa');
    await recordRun(s, 'x/y', RUN('2026-11-12T10:00:00Z'), [], 'bbbb');
    expect([...kv.keys()].filter((k) => k.startsWith('rag/hist/')).length).toBe(2);
  });

  test('the oldest entries beyond the cap are deleted; another source and other names stay', async () => {
    const { s, kv } = store();
    for (let i = 0; i < 6; i++) kv.set(`rag/hist/a/b/2026111${i}T000000Z-0000`, {});
    kv.set('rag/hist/a/b/c/20260101T000000Z-0000', {});
    kv.set('rag/hist/a/b/notes', {});
    kv.set('rag/hist/z/z/20260101T000000Z-0000', {});
    kv.set('rag/last/a/b', {});
    await trimHistory(s, 'a/b', 4);
    expect([...kv.keys()].filter((k) => k.startsWith('rag/hist/a/b/2026111'))).toEqual(['rag/hist/a/b/20261112T000000Z-0000', 'rag/hist/a/b/20261113T000000Z-0000', 'rag/hist/a/b/20261114T000000Z-0000', 'rag/hist/a/b/20261115T000000Z-0000']);
    for (const kept of ['rag/hist/a/b/c/20260101T000000Z-0000', 'rag/hist/a/b/notes', 'rag/hist/z/z/20260101T000000Z-0000', 'rag/last/a/b']) expect(kv.has(kept)).toBe(true);
  });

  test('the default cap is 200', async () => {
    const { s, kv } = store();
    for (let i = 0; i < HISTORY_CAP + 3; i++) kv.set(`rag/hist/s/${String(20260000 + i).padStart(8, '0')}T000000Z-0000`, {});
    await trimHistory(s, 's');
    expect([...kv.keys()].length).toBe(HISTORY_CAP);
  });
});
