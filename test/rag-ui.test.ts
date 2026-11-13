import { describe, expect, test } from 'bun:test';
import { EXCERPT_MAX, lastOf, searchBody, searchParams, shapeHits, sourceFor } from '../src/lib/rag-ui';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from '../src/lib/roots';
import { routeOf, RESERVED } from '../src/lib/urls';

const src = (more: Record<string, unknown> = {}) => ({ v: 1, root: { path: '/home/p/notes', dev: '1', ino: '2' }, filescan: '#filescan/n@h', rag: '#rag/n@h', namespace: 'n', table: 'm', ...more });
const entry = (name: string, value: Record<string, unknown> | null) => ({ name, value });

describe('sourceFor', () => {
  test('the entry whose folder is the root', () => {
    expect(sourceFor([entry('rag/source/x/y', src({ namespace: 'x', table: 'y', root: { path: '/other' } })), entry('rag/source/n/m', src())], '/home/p/notes')).toEqual({
      sid: 'n/m', namespace: 'n', table: 'm', rag: '#rag/n@h',
    });
  });
  test('none for another folder, a malformed entry, a key that is not its own namespace/table, or a non-source key', () => {
    expect(sourceFor([entry('rag/source/n/m', src())], '/home/p/else')).toBeNull();
    expect(sourceFor([entry('rag/source/n/m', src({ v: 2 }))], '/home/p/notes')).toBeNull();
    expect(sourceFor([entry('rag/source/n/m', src({ rag: 'not a name' }))], '/home/p/notes')).toBeNull();
    expect(sourceFor([entry('rag/source/n/m', src({ namespace: 3 }))], '/home/p/notes')).toBeNull();
    expect(sourceFor([entry('rag/source/other/key', src())], '/home/p/notes')).toBeNull();
    expect(sourceFor([entry('rag/last/n/m', src())], '/home/p/notes')).toBeNull();
    expect(sourceFor([entry('rag/source/n/m', null)], '/home/p/notes')).toBeNull();
  });
});

describe('lastOf', () => {
  const run = { v: 1, startedAt: '2026-11-06T10:00:00.000Z', endedAt: '2026-11-06T10:00:30.000Z', rounds: 2, result: 'incomplete', exit: 5, confirmed: 12, remaining: 3, sent: 4 };
  test('what the page shows of a run, nothing more', () => {
    expect(lastOf(run)).toEqual({ startedAt: run.startedAt, endedAt: run.endedAt, result: 'incomplete', confirmed: 12, remaining: 3, rounds: 2 });
  });
  test('a run without counts keeps null; one this version did not write is none', () => {
    expect(lastOf({ ...run, confirmed: undefined, remaining: -1 })).toMatchObject({ confirmed: null, remaining: null });
    expect(lastOf({ ...run, v: 2 })).toBeNull();
    expect(lastOf({ ...run, endedAt: 'yesterday' })).toBeNull();
    expect(lastOf({ ...run, result: 'x'.repeat(40) })).toBeNull();
    expect(lastOf(null)).toBeNull();
  });
});

describe('the search request', () => {
  const source = { sid: 'n/m', namespace: 'n', table: 'm', rag: '#rag/n@h' };
  test('is keyword, for the source\'s namespace and table', () => {
    expect(JSON.parse(searchBody(source, 'plan', 3))).toEqual({ method: 'search', namespace: 'n', tableName: 'm', query: 'plan', mode: 'keyword', limit: 3 });
  });
  test('q is 1–1024 characters, trimmed; limit is 1–16, default 8', () => {
    const p = (qs: string) => searchParams(new URL(`http://h/api/rag/search${qs}`));
    expect(p('?q=%20a%20')).toEqual({ q: 'a', limit: 8 });
    expect(p('')).toEqual({ q: null, limit: 8 });
    expect(p(`?q=${'x'.repeat(1024)}`).q).toHaveLength(1024);
    expect(p(`?q=${'x'.repeat(1025)}`).q).toBeNull();
    expect([p('?q=a&limit=99').limit, p('?q=a&limit=0').limit, p('?q=a&limit=-3').limit, p('?q=a&limit=x').limit, p('?q=a&limit=2.9').limit]).toEqual([16, 8, 1, 8, 2]);
  });
});

describe('shapeHits', () => {
  const rec = (more: Record<string, unknown> = {}) => ({
    namespace: 'n', tableName: 'm', id: 'a.md', source: 'a.md', content_hash: 'a'.repeat(64), indexed_at: 't', chunk_index: 0, excerpt: 'text', scores: { bm25: 1.5 }, ...more,
  }) as never;
  const docUrl = (s: string) => `/r/${s}`;
  test('a located hit links to its first line', () => {
    expect(shapeHits([rec({ lines: [5, 6], heading_path: ['A', 'B'] })], docUrl)).toEqual([{ source: 'a.md', url: '/r/a.md#L5', lines: [5, 6], heading_path: ['A', 'B'], excerpt: 'text', score: 1.5 }]);
  });
  test('without a location it links to the document; stale says so; an empty heading path is left out', () => {
    expect(shapeHits([rec({ stale: true, heading_path: [] })], docUrl)).toEqual([{ source: 'a.md', url: '/r/a.md', excerpt: 'text', stale: true, score: 1.5 }]);
  });
  test('an excerpt is cut at the limit and says so', () => {
    const [h] = shapeHits([rec({ excerpt: 'x'.repeat(EXCERPT_MAX + 1) })], docUrl);
    expect(h!.excerpt).toHaveLength(EXCERPT_MAX);
    expect(h!.truncated).toBe(true);
    expect(shapeHits([rec({ excerpt: 'x'.repeat(EXCERPT_MAX) })], docUrl)[0]).not.toHaveProperty('truncated');
  });
});

describe('the /rag address', () => {
  test('is its own route, and a project folder named rag gets another id', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mdhouse-rag-id-')));
    mkdirSync(join(dir, 'rag'));
    const registry = await Registry.create([join(dir, 'rag')]);
    expect(registry.list()[0]!.id).not.toBe('rag');
    expect(routeOf('/rag')).toEqual({ kind: 'rag' });
    expect(RESERVED.has('rag')).toBe(true);
  });
});
