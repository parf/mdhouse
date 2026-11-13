import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle, FAMILIES, inventory, mutation, read, type Family } from '../src/lib/authz';
import { testPort } from './ports';

const h = () => () => new Response('');

describe('tags', () => {
  test('mutation, read and bundle return the same value', () => {
    const fn = h();
    expect(mutation('doc-write', fn)).toBe(fn);
    const r = h();
    expect(read(r)).toBe(r);
    const b = { index: 'x' };
    expect(bundle(b)).toBe(b);
  });

  test('an unknown family is refused', () => {
    expect(() => mutation('admin' as Family, h())).toThrow('unknown mutation family: admin');
  });

  test('conflicting tags are refused; one read or bundle may be tagged again', () => {
    const m = mutation('doc-write', h());
    expect(() => mutation('root-admin', m)).toThrow('route already classified as doc-write, not root-admin');
    expect(() => mutation('doc-write', m)).toThrow('route already classified as doc-write, not doc-write');
    expect(() => read(m)).toThrow('route already classified as doc-write, not read');
    const r = read(h());
    expect(read(r)).toBe(r);
    expect(() => mutation('doc-write', r)).toThrow('route already classified as read, not doc-write');
    const b = bundle({ index: 'x' });
    expect(bundle(b)).toBe(b);
  });

  test('read takes a handler; bundle takes an object', () => {
    expect(() => read({} as never)).toThrow('read() takes a handler');
    expect(() => bundle(h() as never)).toThrow('bundle() takes an HTML import');
  });
});

describe('inventory', () => {
  test('every route method with its family; reads are null, bare handlers and bundles answer every method', () => {
    const r = read(h());
    const routes = {
      '/a': r,
      '/b': r, // one read handler at two paths is fine
      '/bundle': bundle({ index: 'x' }),
      '/c': { GET: h(), POST: mutation('instance-config', h()) },
      '/d': { HEAD: h(), OPTIONS: h(), PUT: mutation('root-admin', h()), DELETE: mutation('root-admin', h()) },
    };
    expect(inventory(routes)).toEqual([
      { path: '/a', method: '*', family: null },
      { path: '/b', method: '*', family: null },
      { path: '/bundle', method: '*', family: null },
      { path: '/c', method: 'GET', family: null },
      { path: '/c', method: 'POST', family: 'instance-config' },
      { path: '/d', method: 'HEAD', family: null },
      { path: '/d', method: 'OPTIONS', family: null },
      { path: '/d', method: 'PUT', family: 'root-admin' },
      { path: '/d', method: 'DELETE', family: 'root-admin' },
    ]);
  });

  test('an untagged bare handler is refused — it answers POST too', () => {
    const writes = (req: Request) => new Response(req.method === 'POST' ? 'written' : 'read');
    expect(() => inventory({ '/x': writes })).toThrow('/x: unclassified route — read() or a method map');
  });

  test('an untagged or malformed object is refused', () => {
    expect(() => inventory({ '/x': { POST: h(), extra: 1 } })).toThrow('/x: unclassified route');
    expect(() => inventory({ '/x': { POST: mutation('doc-write', h()), extra: 1 } })).toThrow('/x: unclassified route');
    expect(() => inventory({ '/x': { index: 'x' } })).toThrow('/x: unclassified route');
    expect(() => inventory({ '/x': {} })).toThrow('/x: unclassified route');
    expect(() => inventory({ '/x': new Response('') })).toThrow('/x: unclassified route');
    expect(() => inventory({ '/x': 'text' })).toThrow('/x: unclassified route');
  });

  test('an unclassified write method is refused, whatever the method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => inventory({ '/x': { GET: h(), [method]: h() } })).toThrow(`${method} /x: unclassified write method`);
    }
  });

  test('a family on a read method is refused', () => {
    expect(() => inventory({ '/x': { GET: mutation('doc-write', h()) } })).toThrow('GET /x: a read method cannot be a mutation');
  });

  test('read() inside a method map is refused, on any method', () => {
    expect(() => inventory({ '/x': { POST: read(h()) } })).toThrow('POST /x: read() belongs on a bare route');
    expect(() => inventory({ '/x': { GET: read(h()) } })).toThrow('GET /x: read() belongs on a bare route');
  });

  test('a mutation as a bare handler is refused — it would answer GET too', () => {
    expect(() => inventory({ '/x': mutation('doc-write', h()) })).toThrow('/x: a doc-write mutation must be a method');
  });

  test('one mutation registered at two places is refused', () => {
    const fn = mutation('git-write', h());
    expect(() => inventory({ '/x': { POST: fn }, '/y': { POST: fn } })).toThrow('mutation registered twice: POST /x and POST /y');
    expect(() => inventory({ '/x': { POST: fn, PUT: fn } })).toThrow('mutation registered twice: POST /x and PUT /x');
  });
});

/** Every route `serve()` registers, written out independently of the source. */
const EXPECTED: [path: string, method: string, family: Family | null][] = [
  ['/__app/', '*', null],
  ['/', '*', null],
  ['/d', '*', null],
  ['/d/*', '*', null],
  ['/settings', '*', null],
  ['/rag', '*', null],
  ['/vendor/mermaid/*', '*', null],
  ['/api/roots', '*', null],
  ['/api/task', 'POST', 'doc-write'],
  ['/api/qa', 'GET', null],
  ['/api/qa', 'POST', 'doc-write'],
  ['/api/insert', 'POST', 'doc-write'],
  ['/api/source', 'GET', null],
  ['/api/source', 'POST', 'doc-write'],
  ['/api/admin', '*', null],
  ['/api/admin/session', 'POST', 'admin-session'],
  ['/api/admin/logout', 'POST', 'admin-session'],
  ['/api/settings', 'GET', null],
  ['/api/settings', 'POST', 'instance-config'],
  ['/api/author', 'GET', null],
  ['/api/author', 'POST', 'attribution'],
  ['/api/ab', '*', null],
  ['/api/ab/config', '*', null],
  ['/api/ab/default', 'POST', 'instance-config'],
  ['/api/ab/filter', 'POST', 'instance-config'],
  ['/api/ab/send', 'POST', 'external-send'],
  ['/api/ab/job', '*', null],
  ['/api/rag', '*', null],
  ['/api/rag/search', '*', null],
  ['/api/roots/name', 'POST', 'root-admin'],
  ['/api/roots/add', 'POST', 'root-admin'],
  ['/api/roots/mode', 'POST', 'root-admin'],
  ['/api/roots/save', 'POST', 'root-admin'],
  ['/api/roots/ab', 'POST', 'root-admin'],
  ['/api/roots/remove', 'POST', 'root-admin'],
  ['/api/git', '*', null],
  ['/api/git/commits', '*', null],
  ['/api/git/files', '*', null],
  ['/api/git/remote', '*', null],
  ['/api/git/commit', 'POST', 'git-write'],
  ['/api/git/commit-file', 'POST', 'git-write'],
  ['/api/git/reset', 'POST', 'git-write'],
  ['/api/git/pull', 'POST', 'git-sync'],
  ['/api/git/push', 'POST', 'git-sync'],
  ['/api/tree', '*', null],
  ['/api/doc', '*', null],
  ['/api/raw', '*', null],
  ['/api/asset', '*', null],
  ['/api/files', '*', null],
  ['/api/search', '*', null],
  ['/api/recents', '*', null],
  ['/api/digest', '*', null],
  ['/api/git/log', '*', null],
  ['/api/git/diff', '*', null],
  ['/api/marks', 'GET', null],
  ['/api/marks', 'POST', 'shared-prefs'],
];

describe('serve() route inventory', () => {
  test('matches the expected list exactly — a new route or write fails here until classified', async () => {
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-authz-'));
    await writeFile(join(dir, 'a.md'), '# a\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const registry = await Registry.create([dir]);
    const { server, watcher, control, routes } = await serve({ registry, prefs, port: testPort(61804), hostname: '127.0.0.1', noGit: true });
    try {
      expect(routes.map((r) => [r.path, r.method, r.family])).toEqual(EXPECTED);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('flow and control are families with no HTTP route; every family is known', () => {
    const used = new Set(EXPECTED.map(([, , f]) => f).filter(Boolean));
    expect(used.has('flow')).toBe(false);
    expect(used.has('control')).toBe(false);
    for (const f of used) expect(FAMILIES).toContain(f!);
  });

  test('the actor module reads no author cookie or display name', async () => {
    const src = await readFile(join(import.meta.dir, '../src/lib/authz.ts'), 'utf8');
    expect(src).not.toMatch(/from '\.\/author'|authorCookie|readAuthorCookie/);
  });
});
