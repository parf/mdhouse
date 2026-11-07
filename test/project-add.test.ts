import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askAdminRevoke, askDaemon } from '../src/lib/control';
import { Prefs } from '../src/lib/prefs';
import { lineHash } from '../src/lib/qa';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));

/** Takes `<prefs>.lock` as another mdhouse process would; returns the release. */
async function holdLock(prefsPath: string): Promise<() => Promise<void>> {
  const lock = `${prefsPath}.lock`;
  const fh = await open(lock, 'wx', 0o600);
  await fh.writeFile(`${process.pid}\n`);
  const ino = (await fh.stat()).ino;
  await fh.close();
  return async () => {
    if ((await stat(lock).catch(() => null))?.ino === ino) await unlink(lock);
  };
}

/** Replaces the prefs file whole, as another process's save does. */
async function replaceFile(path: string, text: string): Promise<void> {
  await writeFile(`${path}.ext.tmp`, text);
  await rename(`${path}.ext.tmp`, path);
}

type RootJson = { id: string; path: string; kind: string; writable: boolean; mode?: string; saved: boolean; customName?: string };

/**
 * A server with a saved project `keep`, auto-rw over `<dir>/auto`, and a reference root `<dir>/ref`.
 * `new`, `auto/new`, `ref/inside`, a file and a symlink to `new` are there to add.
 */
async function start(port: number, o: { prefsText?: string } = {}) {
  const dir = await tmp('mdhouse-add-');
  const keep = join(dir, 'keep');
  const fresh = join(dir, 'new');
  const autoNew = join(dir, 'auto', 'new');
  const ref = join(dir, 'ref');
  for (const d of [keep, fresh, autoNew, join(ref, 'inside')]) await mkdir(d, { recursive: true });
  await writeFile(join(keep, 'a.md'), '# keep\n');
  await writeFile(join(fresh, 'b.md'), '- [ ] new\n');
  await writeFile(join(autoNew, 'c.md'), '- [ ] auto\n');
  await writeFile(join(dir, 'file.md'), '# a file\n');
  await symlink(fresh, join(dir, 'link'));
  const prefsPath = join(dir, 'prefs.json');
  const prefs = await Prefs.load(prefsPath);
  await prefs.addSaved(keep);
  await prefs.setAutoRw([join(dir, 'auto')]);
  if (o.prefsText !== undefined) await writeFile(prefsPath, o.prefsText);
  const registry = await Registry.create([{ path: keep, mode: 'inherit' }]);
  await registry.addReference(ref, '_ref', 'reference');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const roots = async () => ((await (await fetch(`${origin}/api/roots`)).json()) as { roots: RootJson[] }).roots;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const add = (body: unknown, cookie: string, headers: Record<string, string> = {}) => post('/api/roots/add', body, { cookie, ...headers });
  const stop = () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
  };
  /** Roots, prefs bytes and the config dir listing: what a refused add must leave as it was. */
  const snapshot = async () => ({
    roots: await roots(),
    registry: registry.list().map((r) => [r.id, r.path, r.mode]),
    prefs: existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : null,
    files: readdirSync(dir).sort(),
  });
  return { ...s, dir, keep, fresh, autoNew, ref, prefs, prefsPath, registry, origin, roots, post, add, stop, snapshot };
}

const task = (id: string, file: string, line: string) => ({ p: `${id}/${file}`, line: 1, hash: lineHash(line) });

describe('POST /api/roots/add', () => {
  test('RW: a session project, mode rw, writable at once; the add itself writes no file and no prefs', async () => {
    const t = await start(61772);
    try {
      const cookie = await adminLogin(61772);
      const before = await t.snapshot();
      const res = await t.add({ path: t.fresh, mode: 'rw' }, cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { roots: RootJson[]; id: string };
      const added = body.roots.find((r) => r.id === body.id)!;
      expect(added).toMatchObject({ path: t.fresh, kind: 'project', mode: 'rw', writable: true, saved: false });
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(before.prefs!);
      expect(readdirSync(t.dir).sort()).toEqual(before.files);
      expect(await readFile(join(t.fresh, 'b.md'), 'utf8')).toBe('- [ ] new\n');
      expect((await t.post('/api/task', task(body.id, 'b.md', '- [ ] new'))).status).toBe(200);
      expect(await readFile(join(t.fresh, 'b.md'), 'utf8')).toBe('- [x] new\n');
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('RO under auto-rw: never writable, from the first payload; a write right after is refused', async () => {
    const t = await start(61773);
    try {
      const cookie = await adminLogin(61773);
      const res = await t.add({ path: t.autoNew, mode: 'ro' }, cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { roots: RootJson[]; id: string };
      expect(body.roots.find((r) => r.id === body.id)).toMatchObject({ mode: 'ro', writable: false, saved: false });
      expect((await t.post('/api/task', task(body.id, 'c.md', '- [ ] auto'))).status).toBe(403);
      expect(await readFile(join(t.autoNew, 'c.md'), 'utf8')).toBe('- [ ] auto\n');
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('bad input is refused and changes nothing: 400 shape/relative/tilde/NUL/length/mode, 400 a file, 404 missing', async () => {
    const t = await start(61774);
    try {
      const cookie = await adminLogin(61774);
      const before = await t.snapshot();
      const cases: Array<[unknown, number]> = [
        ['not json', 400],
        [null, 400],
        [[t.fresh, 'rw'], 400],
        [{ path: t.fresh }, 400],
        [{ mode: 'rw' }, 400],
        [{ path: t.fresh, mode: 'rw', save: true }, 400],
        [{ path: t.fresh, mode: 'rw', name: 'x' }, 400],
        [{ path: t.fresh, mode: 'inherit' }, 400],
        [{ path: t.fresh, mode: 'RW' }, 400],
        [{ path: 5, mode: 'rw' }, 400],
        [{ path: '', mode: 'rw' }, 400],
        [{ path: 'new', mode: 'rw' }, 400],
        [{ path: './new', mode: 'rw' }, 400],
        [{ path: '~/new', mode: 'rw' }, 400],
        [{ path: `${t.fresh}\u0000x`, mode: 'rw' }, 400],
        [{ path: `/${'a'.repeat(5000)}`, mode: 'rw' }, 400],
        [{ path: join(t.dir, 'file.md'), mode: 'rw' }, 400],
        [{ path: join(t.dir, 'missing'), mode: 'rw' }, 404],
      ];
      for (const [body, status] of cases) {
        const res = await t.add(body, cookie);
        expect([JSON.stringify(body)?.slice(0, 60), res.status]).toEqual([JSON.stringify(body)?.slice(0, 60), status]);
      }
      expect(await t.snapshot()).toEqual(before);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('already served — by its path or a symlink to it — is 409 served with its id; its mode, name and save stay', async () => {
    const t = await start(61775);
    try {
      const cookie = await adminLogin(61775);
      const first = (await (await t.add({ path: t.fresh, mode: 'ro' }, cookie)).json()) as { id: string };
      const before = await t.snapshot();
      for (const path of [t.fresh, join(t.dir, 'link'), t.keep]) {
        const res = await t.add({ path, mode: 'rw' }, cookie);
        expect(res.status).toBe(409);
        const body = (await res.json()) as { reason: string; id: string };
        expect(body.reason).toBe('served');
        expect(body.id).toBe(path === t.keep ? t.registry.list()[0]!.id : first.id);
      }
      expect(await t.snapshot()).toEqual(before);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a reference root or anything inside it is 403 in either mode; the CLI path keeps serving a descendant read-only as before', async () => {
    const t = await start(61776);
    try {
      const cookie = await adminLogin(61776);
      const before = await t.snapshot();
      for (const path of [t.ref, join(t.ref, 'inside')]) {
        for (const mode of ['rw', 'ro']) expect((await t.add({ path, mode }, cookie)).status).toBe(403);
      }
      expect(await t.snapshot()).toEqual(before);
      // control / CLI compatibility: a descendant is served, never writable
      const reply = await askDaemon(61776, { dirs: [join(t.ref, 'inside')], rw: true });
      expect(reply && 'roots' in reply).toBe(true);
      expect((await t.roots()).find((r) => r.path === join(t.ref, 'inside'))).toMatchObject({ writable: false });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('no admin, a forged cookie, cross-origin, or an administrator signed out while the lock waits: refused, nothing changes', async () => {
    const t = await start(61739);
    try {
      const cookie = await adminLogin(61739);
      const before = await t.snapshot();
      expect((await t.post('/api/roots/add', { path: t.fresh, mode: 'rw' })).status).toBe(401);
      expect((await t.add({ path: t.fresh, mode: 'rw' }, `${cookie.split('=')[0]}=forged`)).status).toBe(401);
      expect((await t.add({ path: t.fresh, mode: 'rw' }, cookie, { origin: 'http://evil.example' })).status).toBe(403);
      expect((await t.add({ path: t.fresh, mode: 'rw' }, cookie, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      const release = await holdLock(t.prefsPath);
      const pending = t.add({ path: t.fresh, mode: 'rw' }, cookie);
      await Bun.sleep(100);
      await askAdminRevoke(61739);
      await release();
      expect((await pending).status).toBe(401);
      expect(await t.snapshot()).toEqual(before);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('saved by another process (before, or while the lock waits) is 409 stale with no write', async () => {
    const t = await start(61777);
    try {
      const cookie = await adminLogin(61777);
      const original = readFileSync(t.prefsPath, 'utf8');
      const savedText = JSON.stringify({ ...JSON.parse(original), saved: [t.fresh, t.keep].sort() }, null, 2) + '\n';

      const release = await holdLock(t.prefsPath);
      const pending = t.add({ path: t.fresh, mode: 'rw' }, cookie);
      await Bun.sleep(100);
      await replaceFile(t.prefsPath, savedText);
      await release();
      const res = await pending;
      expect([res.status, ((await res.json()) as { reason: string }).reason]).toEqual([409, 'stale']);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(savedText);
      expect((await t.roots()).some((r) => r.path === t.fresh)).toBe(false);

      // already saved when asked
      const again = await t.add({ path: t.fresh, mode: 'ro' }, cookie);
      expect(again.status).toBe(409);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(savedText);
      expect((await t.roots()).some((r) => r.path === t.fresh)).toBe(false);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('the path now leads elsewhere once the queue and the lock are through: 409 stale, nothing added', async () => {
    const t = await start(61778);
    try {
      const cookie = await adminLogin(61778);
      const other = join(t.dir, 'other');
      await mkdir(other);
      const link = join(t.dir, 'link');
      const before = await t.snapshot();
      const release = await holdLock(t.prefsPath);
      const pending = t.add({ path: link, mode: 'rw' }, cookie);
      await Bun.sleep(100);
      await unlink(link);
      await symlink(other, link); // retargeted while the add waits
      await release();
      const res = await pending;
      expect([res.status, ((await res.json()) as { reason: string }).reason]).toEqual([409, 'stale']);
      const after = await t.snapshot();
      expect([after.roots, after.registry, after.prefs]).toEqual([before.roots, before.registry, before.prefs]);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a newer or broken prefs file refuses (500) and is left byte for byte — not set aside, not migrated; nothing added', async () => {
    for (const [port, text] of [
      [61779, JSON.stringify({ version: 3, saved: [] }) + '\n'],
      [61780, '{ "version": 2, "saved": [ \n'],
    ] as const) {
      const t = await start(port);
      try {
        const cookie = await adminLogin(port);
        await writeFile(t.prefsPath, text);
        const before = await t.snapshot();
        const res = await t.add({ path: t.fresh, mode: 'ro' }, cookie);
        expect(res.status).toBe(500);
        expect(await t.snapshot()).toEqual(before);
        expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      } finally {
        t.stop();
        await rm(t.dir, { recursive: true, force: true });
      }
    }
  });

  test('an unexpected failure installing the watcher removes the new root before the reply', async () => {
    const t = await start(61787);
    try {
      const cookie = await adminLogin(61787);
      const before = await t.snapshot();
      const watchRoot = t.watcher.watchRoot.bind(t.watcher);
      t.watcher.watchRoot = () => {
        throw new Error('injected watcher failure');
      };
      const res = await t.add({ path: t.fresh, mode: 'rw' }, cookie);
      t.watcher.watchRoot = watchRoot;
      expect(res.status).toBe(500);
      expect(await t.snapshot()).toEqual(before);
      expect((await t.add({ path: t.fresh, mode: 'rw' }, cookie)).status).toBe(200); // nothing left behind
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('save after add keeps the explicit mode and the session name; another tab hears about the add', async () => {
    const t = await start(61788);
    try {
      const cookie = await adminLogin(61788);
      const ws = new WebSocket(`ws://127.0.0.1:61788/ws`);
      const events: unknown[] = [];
      ws.onmessage = (e) => events.push(JSON.parse(String(e.data)));
      await new Promise((r) => (ws.onopen = r));
      const { id } = (await (await t.add({ path: t.autoNew, mode: 'ro' }, cookie)).json()) as { id: string };
      await Bun.sleep(100);
      expect(events.some((e) => (e as { t: string; roots?: string[] }).t === 'roots' && (e as { roots: string[] }).roots.includes(id))).toBe(true);
      ws.close();
      expect((await t.post('/api/roots/name', { id, name: 'Added RO' }, { cookie })).status).toBe(200);
      const root = (await t.roots()).find((r) => r.id === id) as RootJson & { saveRev: string };
      expect((await t.post('/api/roots/save', { id, rev: root.saveRev }, { cookie })).status).toBe(200);
      expect(JSON.parse(readFileSync(t.prefsPath, 'utf8'))).toMatchObject({ readonly: [t.autoNew], names: { [t.autoNew]: 'Added RO' } });
      expect((await t.roots()).find((r) => r.id === id)).toMatchObject({ mode: 'ro', saved: true, writable: false, customName: 'Added RO' });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });
});

describe('Registry.prepare / install — the shared canonical add path', () => {
  test('prepare: the canonical directory, or a typed refusal; nothing registered', async () => {
    const dir = await tmp('mdhouse-add-unit-');
    try {
      await mkdir(join(dir, 'a'));
      await writeFile(join(dir, 'f.md'), 'x');
      await symlink(join(dir, 'a'), join(dir, 'l'));
      const registry = await Registry.create([]);
      await registry.addReference(join(dir, 'a'), '_ref');
      await mkdir(join(dir, 'b'));
      expect(await registry.prepare(join(dir, 'b'))).toBe(join(dir, 'b'));
      await expect(registry.prepare(join(dir, 'nope'))).rejects.toMatchObject({ code: 'missing' });
      await expect(registry.prepare(join(dir, 'f.md'))).rejects.toMatchObject({ code: 'not-a-directory' });
      await expect(registry.prepare(join(dir, 'l'))).rejects.toMatchObject({ code: 'reference' });
      expect(registry.projects()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('install: synchronous, the mode set before the root is visible; a duplicate returns the served root unchanged', async () => {
    const dir = await tmp('mdhouse-add-unit2-');
    try {
      await mkdir(join(dir, 'a'));
      const registry = await Registry.create([]);
      registry.autoRw = () => true;
      const abs = await registry.prepare(join(dir, 'a'));
      const root = registry.install(abs, 'ro');
      expect(root instanceof Promise).toBe(false);
      expect([root.mode, root.writable]).toEqual(['ro', false]);
      expect(registry.install(abs, 'rw')).toBe(root);
      expect(root.mode).toBe('ro');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Prefs.check — a fresh read under the lock, never a write', () => {
  test('sees the file as it is; leaves a broken or newer file byte for byte, not set aside; memory unchanged on refusal', async () => {
    const dir = await tmp('mdhouse-add-check-');
    try {
      const f = join(dir, 'prefs.json');
      await writeFile(f, JSON.stringify({ version: 1, saved: ['/s'], autoRw: ['/'] }));
      const prefs = await Prefs.load(f);
      const v1 = readFileSync(f, 'utf8');
      const seen: unknown[] = [];
      expect(await prefs.check('/s', (v) => (seen.push(v), null))).toBeNull();
      expect(await prefs.check('/x', (v) => (seen.push(v), 'stale'))).toBe('stale');
      expect(seen).toEqual([
        { saved: true, auto: true, stored: 'inherit' },
        { saved: false, auto: true, stored: null },
      ]);
      expect(readFileSync(f, 'utf8')).toBe(v1); // never migrated
      for (const text of ['{ broken', JSON.stringify({ version: 3, saved: ['/n'] })]) {
        await writeFile(f, text);
        await expect(prefs.check('/s', () => null)).rejects.toThrow();
        expect(readFileSync(f, 'utf8')).toBe(text);
        expect(readdirSync(dir).filter((n) => n.includes('broken'))).toEqual([]);
        expect(prefs.savedDirs()).toEqual(['/s']);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
