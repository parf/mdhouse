import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

const DOC = resolve(import.meta.dir, '../doc');
const PKG = 'recent-commits-review';

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

let dir = '';
beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-flow-routes-')));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

let n = 0;
/** A served git project with two commits and the reference catalog. */
async function start(opts: { mode?: 'rw' | 'ro'; noGit?: boolean; reference?: boolean } = {}) {
  const at = join(dir, `s${++n}`);
  const proj = join(at, 'proj');
  await mkdir(proj, { recursive: true });
  git(proj, 'init', '-q', '-b', 'main');
  const c: string[] = [];
  for (const i of [1, 2]) {
    await writeFile(join(proj, `n${i}.md`), `# ${i}\n`);
    git(proj, 'add', '-A');
    git(proj, 'commit', '-qm', `c${i}`);
    c.push(git(proj, 'rev-parse', 'HEAD'));
  }
  const prefs = await Prefs.load(join(at, 'prefs.json'));
  const registry = await Registry.create([{ path: proj, mode: opts.mode ?? 'rw' }]);
  if (opts.reference !== false) await registry.addReference(DOC);
  const root = registry.list().find((r) => r.kind === 'project')!;
  const port = testPort(61900 + n);
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: opts.noGit, localAdmin: true });
  const origin = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  const get = (path: string) => fetch(origin + path);
  const preview = (range: unknown = { kind: 'baseline', commit: c[0] }) => post('/api/flow/preview', { rootId: root.id, packageId: PKG, range });
  const stop = () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
  };
  return { ...s, proj, prefs, registry, root, c, origin, post, get, preview, stop };
}

const body = async (res: Response) => [res.status, await res.json()] as const;

describe('/api/flow routes', () => {
  test('catalog → preview → start → catalog shows the open run; a second preview+start is open-run', async () => {
    const t = await start();
    try {
      const [st, cat] = await body(await t.get(`/api/flow/catalog?root=${t.root.id}`));
      expect(st).toBe(200);
      expect(cat).toEqual({
        packages: [
          {
            id: PKG,
            family: 'commit-review',
            title: expect.any(String),
            ranges: ['since-last-run', 'baseline'],
            defaults: expect.objectContaining({ destination: 'Plans/flows/recent-commits-review.md' }),
            lastRun: null,
            openRun: null,
          },
        ],
      });

      expect(await body(await t.preview({ kind: 'since-last-run' }))).toEqual([409, { error: expect.any(String), reason: 'no-baseline', why: 'first-run' }]);

      const res = await t.preview();
      expect(res.headers.get('cache-control')).toBe('no-store');
      const pv = (await res.json()) as { token: string; runPath: string; base: string; target: string; dirty: string[]; warnings: string[]; html: string };
      expect(res.status).toBe(200);
      expect(Object.keys(pv).sort()).toEqual(['base', 'dirty', 'html', 'runPath', 'target', 'token', 'warnings']);
      expect([pv.base, pv.target, pv.dirty, pv.warnings]).toEqual([t.c[0]!, t.c[1]!, [], []]);
      expect(pv.html).toContain('<h');
      expect(pv.html).not.toMatch(/<script/i);
      expect(await Bun.file(join(t.proj, pv.runPath)).exists()).toBe(false);

      const [s2, started] = await body(await t.post('/api/flow/start', { token: pv.token }));
      expect([s2, started]).toEqual([200, { status: 'held', runPath: pv.runPath, url: t.registry.docUrl(t.root, pv.runPath) }]);
      const doc = await readFile(join(t.proj, pv.runPath), 'utf8');
      expect(doc).toContain(`<!-- last-commit-id: ${t.c[0]} -->`);
      // The trigger is the server's: manual, by the request's author; a body field is ignored.
      expect(doc).toMatch(/"trigger": {\n    "kind": "manual",\n    "actor": "[^"]+"\n  }/);
      const forged = (await (await t.post('/api/flow/preview', { rootId: t.root.id, packageId: PKG, range: { kind: 'baseline', commit: t.c[1] }, trigger: { kind: 'schedule', id: 'someone', slot: 's' } })).json()) as { html: string };
      expect(forged.html).toContain('manual');
      expect(forged.html).not.toContain('someone');

      const [, cat2] = await body(await t.get(`/api/flow/catalog?root=${t.root.id}`));
      const url = t.registry.docUrl(t.root, pv.runPath);
      expect(cat2.packages[0]).toMatchObject({ lastRun: { url, status: 'held', at: expect.any(String) }, openRun: { url, status: 'held' } });

      const pv2 = (await (await t.preview()).json()) as { token: string };
      expect(await body(await t.post('/api/flow/start', { token: pv2.token }))).toEqual([409, { error: expect.any(String), reason: 'open-run', run: { url, status: 'held' } }]);
    } finally {
      t.stop();
    }
  });

  test('stale after a change; forged token invalid; malformed bodies invalid', async () => {
    const t = await start();
    try {
      const pv = (await (await t.preview()).json()) as { token: string };
      await writeFile(join(t.proj, 'x.md'), '# x\n');
      expect(await body(await t.post('/api/flow/start', { token: pv.token }))).toEqual([409, { error: expect.any(String), reason: 'stale' }]);
      expect((await body(await t.post('/api/flow/start', { token: 'a.b' })))[1]).toMatchObject({ reason: 'invalid' });
      expect((await body(await t.post('/api/flow/start', {})))[1]).toMatchObject({ reason: 'invalid' });
      expect((await body(await t.post('/api/flow/preview', null)))[1]).toMatchObject({ reason: 'invalid' });
      expect(await body(await t.preview({ kind: 'baseline', commit: 'HEAD' }))).toEqual([400, { error: expect.any(String), reason: 'bad-baseline' }]);
      expect((await t.get('/api/flow/preview')).status).toBe(405);
    } finally {
      t.stop();
    }
  });

  test('cross-origin preview and start are refused', async () => {
    const t = await start();
    try {
      const pv = (await (await t.preview()).json()) as { token: string };
      const evil = { origin: 'http://evil.example' };
      expect((await t.post('/api/flow/preview', { rootId: t.root.id, packageId: PKG, range: { kind: 'baseline', commit: t.c[0] } }, evil)).status).toBe(403);
      expect((await t.post('/api/flow/start', { token: pv.token }, evil)).status).toBe(403);
      expect((await t.post('/api/flow/start', { token: pv.token }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    } finally {
      t.stop();
    }
  });

  test('read-only project: preview works, start is 403 not-writable', async () => {
    const t = await start({ mode: 'ro' });
    try {
      const pv = (await (await t.preview()).json()) as { token: string; runPath: string };
      expect(await body(await t.post('/api/flow/start', { token: pv.token }))).toEqual([403, { error: expect.any(String), reason: 'not-writable' }]);
      expect(await Bun.file(join(t.proj, pv.runPath)).exists()).toBe(false);
    } finally {
      t.stop();
    }
  });

  test('a Viewer previews; start is refused before it reads anything', async () => {
    const t = await start();
    try {
      const pv = (await (await t.preview()).json()) as { token: string };
      expect((await t.post('/api/settings', { mode: 'viewer' })).status).toBe(200);
      expect((await t.preview()).status).toBe(200);
      expect(await body(await t.post('/api/flow/start', { token: pv.token }))).toEqual([403, { error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' }]);
    } finally {
      t.stop();
    }
  });

  test('--no-git: preview and start are 404 no-git', async () => {
    const t = await start({ noGit: true });
    try {
      expect(await body(await t.preview())).toEqual([404, { error: 'git is off', reason: 'no-git' }]);
      expect(await body(await t.post('/api/flow/start', { token: 'x' }))).toEqual([404, { error: 'git is off', reason: 'no-git' }]);
    } finally {
      t.stop();
    }
  });

  test('packages come only from the reference: none without it, a project package is never run', async () => {
    const t = await start({ reference: false });
    try {
      // A project's own catalog is not read.
      await mkdir(join(t.proj, 'flows'), { recursive: true });
      await writeFile(join(t.proj, 'flows/catalog.json'), await readFile(join(DOC, 'flows/catalog.json'), 'utf8'));
      expect(await body(await t.get(`/api/flow/catalog?root=${t.root.id}`))).toEqual([200, { packages: [] }]);
      expect(await body(await t.preview())).toEqual([404, { error: expect.any(String), reason: 'unknown-package' }]);
      expect(await body(await t.get('/api/flow/catalog?root=nope'))).toEqual([404, { error: expect.any(String), reason: 'no-root' }]);
    } finally {
      t.stop();
    }
  });

  test('the reference root is no project', async () => {
    const t = await start();
    try {
      expect((await body(await t.get('/api/flow/catalog?root=_mdhouse')))[1]).toMatchObject({ reason: 'no-root' });
      expect((await body(await t.post('/api/flow/preview', { rootId: '_mdhouse', packageId: PKG, range: { kind: 'baseline', commit: t.c[0] } })))[1]).toMatchObject({ reason: 'no-root' });
    } finally {
      t.stop();
    }
  });
});
