import { describe, expect, test } from 'bun:test';
import { chmodSync, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askAdminRevoke, askDaemon } from '../src/lib/control';
import { run } from '../src/lib/gitpage';
import { Prefs, PREFS_VERSION } from '../src/lib/prefs';
import { lineHash } from '../src/lib/qa';
import { ReadOnlyError, Registry, type AccessMode } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));
const disk = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

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
async function replaceFile(path: string, data: unknown): Promise<string> {
  const text = JSON.stringify(data, null, 2) + '\n';
  await writeFile(`${path}.ext.tmp`, text);
  await rename(`${path}.ext.tmp`, path);
  return text;
}

/**
 * Effective writability of `dirs` as a fresh daemon would serve them from `prefsPath`: each saved
 * one in its stored mode, each other one as asked (`rw` for a session `--rw`), auto-rw from prefs.
 */
async function effective(prefsPath: string, dirs: Array<{ path: string; session?: AccessMode }>, reference?: string): Promise<boolean[]> {
  const prefs = await Prefs.load(prefsPath);
  const registry = await Registry.create(dirs.map((d) => ({ path: d.path, mode: d.session ?? prefs.savedMode(d.path) ?? 'inherit' })));
  registry.autoRw = (d) => prefs.autoRwCovers(d);
  registry.accessBlocked = () => prefs.accessBlocked() !== null;
  if (reference) await registry.addReference(reference, '_ref');
  return dirs.map((d) => registry.list().find((r) => r.path === d.path)!.writable);
}

describe('version 2: conservative migration on the first write', () => {
  test('reading never rewrites; the first write moves auto-rw to autoRwRules, empties autoRw, keeps everything else; later writes are idempotent', async () => {
    const dir = await tmp('mdhouse-access-mig-');
    try {
      const f = join(dir, 'prefs.json');
      const v1 = JSON.stringify({ version: 1, saved: ['/a', '/b'], writable: ['/a'], autoRw: ['/b'], settings: { autoRw: true }, theme: 'dark' });
      await writeFile(f, v1);
      const prefs = await Prefs.load(f);
      expect([prefs.savedMode('/a'), prefs.savedMode('/b'), prefs.autoRwCovers('/b'), prefs.autoRw]).toEqual(['rw', 'inherit', true, ['/b']]);
      prefs.refresh();
      expect(readFileSync(f, 'utf8')).toBe(v1); // a read is never a migration

      await prefs.set('/a', 'x.md', 'favorite', true); // any write
      const once = disk(f);
      expect(once).toMatchObject({ version: PREFS_VERSION, saved: ['/a', '/b'], writable: ['/a'], readonly: [], autoRwRules: ['/b'], autoRw: [], theme: 'dark' });
      expect([prefs.savedMode('/a'), prefs.autoRwCovers('/b')]).toEqual(['rw', true]);

      await prefs.set('/a', 'x.md', 'favorite', true);
      const { roots: _r1, ...a } = once;
      const { roots: _r2, ...b } = disk(f);
      expect(b).toEqual(a);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('legacy saved/session × RW/inherit × auto on/off × reference: effective access is the same after the upgrade', async () => {
    const dir = await tmp('mdhouse-access-matrix-');
    try {
      const ref = join(dir, 'ref');
      await mkdir(join(ref, 'inside'), { recursive: true });
      const names = ['savedRw', 'savedInherit', 'sessionRw', 'sessionInherit', 'outsideAuto'];
      for (const n of names) await mkdir(join(dir, 'auto', n), { recursive: true });
      const at = (n: string) => join(dir, 'auto', n);
      const dirs = [
        { path: at('savedRw') },
        { path: at('savedInherit') },
        { path: at('sessionRw'), session: 'rw' as const },
        { path: at('sessionInherit') },
        { path: join(ref, 'inside'), session: 'rw' as const }, // capped by reference
      ];
      for (const auto of [true, false]) {
        const f = join(dir, `prefs-${auto}.json`);
        await writeFile(f, JSON.stringify({ version: 1, saved: [at('savedRw'), at('savedInherit')], writable: [at('savedRw')], autoRw: [join(dir, 'auto')], settings: { autoRw: auto } }));
        const before = await effective(f, dirs, ref);
        expect(before).toEqual([true, auto, true, auto, false]);
        await (await Prefs.load(f)).set('/x', 'a.md', 'muted', true);
        expect(disk(f).version).toBe(2);
        expect(await effective(f, dirs, ref)).toEqual(before);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('explicit RO beats auto-rw and survives a reload; RW restores writes; -p without --rw keeps RO, --rw clears it', async () => {
    const dir = await tmp('mdhouse-access-ro-');
    try {
      const f = join(dir, 'prefs.json');
      const p = join(dir, 'p');
      await mkdir(p);
      const prefs = await Prefs.load(f);
      await prefs.addSaved(p);
      await prefs.setAutoRw([dir]);
      expect(await effective(f, [{ path: p }])).toEqual([true]);
      expect(await prefs.commitMode(p, 'ro', () => null)).toBeNull();
      expect(disk(f)).toMatchObject({ readonly: [p], writable: [] });
      expect(await effective(f, [{ path: p }])).toEqual([false]);
      await prefs.addSaved(p); // `-p` without `--rw`
      expect((await Prefs.load(f)).savedMode(p)).toBe('ro');
      await prefs.addSaved(p, 'rw'); // `-p --rw`
      expect(disk(f)).toMatchObject({ readonly: [], writable: [p] });
      expect(await prefs.commitMode(p, 'ro', () => null)).toBeNull();
      expect(await prefs.commitMode(p, 'rw', () => null)).toBeNull();
      expect(disk(f)).toMatchObject({ readonly: [], writable: [p] });
      expect(await effective(f, [{ path: p }])).toEqual([true]);
      await prefs.commitMode(p, 'ro', () => null);
      await prefs.removeSaved(p);
      expect(disk(f)).toMatchObject({ saved: [], readonly: [], writable: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a saved symlink: the mode is found by the canonical path, and set on the saved entry', async () => {
    const dir = await tmp('mdhouse-access-alias-');
    try {
      const f = join(dir, 'prefs.json');
      const real = join(dir, 'real');
      await mkdir(real);
      await symlink(real, join(dir, 'link'));
      const prefs = await Prefs.load(f);
      await prefs.addSaved(join(dir, 'link'));
      expect(await prefs.commitMode(real, 'ro', () => null)).toBeNull();
      expect(disk(f)).toMatchObject({ saved: [join(dir, 'link')], readonly: [join(dir, 'link')] });
      expect((await Prefs.load(f)).savedMode(real)).toBe('ro');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('commitMode on an unsaved directory writes nothing — a version-1 file stays as it is', async () => {
    const dir = await tmp('mdhouse-access-unsaved-');
    try {
      const f = join(dir, 'prefs.json');
      const v1 = JSON.stringify({ version: 1, saved: ['/keep'], autoRw: ['/'] });
      await writeFile(f, v1);
      const prefs = await Prefs.load(f);
      const seen: unknown[] = [];
      expect(await prefs.commitMode('/x', 'ro', (v) => (seen.push(v), null))).toBeNull();
      expect(seen).toEqual([{ saved: false, auto: true, stored: null }]);
      expect(readFileSync(f, 'utf8')).toBe(v1);
      expect(await prefs.commitMode('/keep', 'ro', () => 'stale')).toBe('stale');
      expect(readFileSync(f, 'utf8')).toBe(v1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('unsupported or malformed access data fails closed', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['newer version', { version: 9, saved: ['/s'], writable: ['/s'], readonly: [], autoRwRules: ['/'] }],
    ['unknown version', { version: '2', saved: ['/s'], writable: ['/s'], autoRw: ['/'] }],
    ['v2 without readonly', { version: 2, saved: ['/s'], writable: ['/s'], autoRwRules: ['/'] }],
    ['v2 without autoRwRules', { version: 2, saved: ['/s'], writable: ['/s'], readonly: [] }],
    ['v2 malformed readonly', { version: 2, saved: ['/s'], writable: ['/s'], readonly: '/s', autoRwRules: ['/'] }],
    ['v2 with legacy autoRw', { version: 2, saved: ['/s'], writable: ['/s'], readonly: [], autoRwRules: [], autoRw: ['/'] }],
    ['v1 with autoRwRules', { version: 1, saved: ['/s'], writable: ['/s'], autoRw: ['/'], autoRwRules: [] }],
    ['writable and read-only at once', { version: 2, saved: ['/s'], writable: ['/s'], readonly: ['/s'], autoRwRules: ['/'] }],
  ];
  for (const [what, data] of cases) {
    test(`${what}: kept byte for byte, no write accepted, no auto-rw, no saved RW, no root writable`, async () => {
      const dir = await tmp('mdhouse-access-blocked-');
      try {
        const f = join(dir, 'prefs.json');
        const s = join(dir, 's');
        await mkdir(s);
        const text = JSON.stringify(data).replaceAll('"/s"', JSON.stringify(s));
        await writeFile(f, text);
        const prefs = await Prefs.load(f);
        expect(prefs.accessBlocked()).not.toBeNull();
        expect([prefs.autoRwCovers(s), prefs.isWritableSaved(s)]).toEqual([false, false]);
        for (const change of [
          () => prefs.addSaved('/x'),
          () => prefs.set(s, 'a.md', 'favorite', true),
          () => prefs.commitMode('/unsaved', 'rw', () => null),
          () => prefs.saveRoot('/unsaved', { mode: 'inherit', name: null }, () => null),
        ]) {
          await expect(change()).rejects.toThrow(/not changed/);
        }
        expect(readFileSync(f, 'utf8')).toBe(text);
        const registry = await Registry.create([{ path: s, mode: 'rw' }]); // `--rw` on the command line too
        registry.accessBlocked = () => prefs.accessBlocked() !== null;
        expect(registry.list()[0]!.writable).toBe(false);
        await expect(registry.writeFile(`${registry.list()[0]!.id}/a.md`, 'x')).rejects.toBeInstanceOf(ReadOnlyError);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  test('a read-only entry in a blocked file still reads as RO', async () => {
    const dir = await tmp('mdhouse-access-blocked-ro-');
    try {
      const f = join(dir, 'prefs.json');
      await writeFile(f, JSON.stringify({ version: 9, saved: ['/s', '/w'], readonly: ['/s'], writable: ['/w'] }));
      const prefs = await Prefs.load(f);
      expect([prefs.savedMode('/s'), prefs.savedMode('/w')]).toEqual(['ro', 'inherit']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Is `rev` in this clone's history? A shallow clone or an exported tree has none. */
const hasRev = (rev: string): boolean =>
  Bun.spawnSync(['git', 'cat-file', '-e', `${rev}^{commit}`], { cwd: import.meta.dir, stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;

describe('an older mdhouse reading a version-2 file (base code eec91ac)', () => {
  test.skipIf(!hasRev('eec91ac'))('never broadens effective writes: no auto-rw, only explicit RW kept, and it refuses to write the file', async () => {
    const dir = await tmp('mdhouse-access-old-');
    try {
      const old = join(dir, 'old');
      await mkdir(old);
      for (const file of ['prefs.ts', 'urls.ts', 'project-name.ts']) {
        const shown = await run(import.meta.dir, ['show', `eec91ac:src/lib/${file}`]);
        if (shown.code !== 0) throw new Error(`git show eec91ac:src/lib/${file}: ${shown.err}`);
        await writeFile(join(old, file), shown.out);
      }
      const { Prefs: OldPrefs } = (await import(join(old, 'prefs.ts'))) as { Prefs: typeof Prefs };

      const at = (n: string) => join(dir, 'auto', n);
      for (const n of ['rw', 'inherit', 'ro', 'session']) await mkdir(at(n), { recursive: true });
      const f = join(dir, 'prefs.json');
      const prefs = await Prefs.load(f);
      for (const n of ['rw', 'inherit', 'ro']) await prefs.addSaved(at(n));
      await prefs.addSaved(at('rw'), 'rw');
      await prefs.commitMode(at('ro'), 'ro', () => null);
      await prefs.setAutoRw([join(dir, 'auto')]);
      const text = readFileSync(f, 'utf8');
      expect(disk(f)).toMatchObject({ version: 2, autoRw: [], autoRwRules: [join(dir, 'auto')], readonly: [at('ro')], writable: [at('rw')] });

      const dirs = ['rw', 'inherit', 'ro', 'session'].map((n) => at(n));
      const now = await effective(f, dirs.map((path) => ({ path })));
      expect(now).toEqual([true, true, false, true]);
      const reader = await OldPrefs.load(f);
      const before = dirs.map((d) => reader.isWritableSaved(d) || reader.autoRwCovers(d));
      expect(before).toEqual([true, false, false, false]);
      for (let i = 0; i < dirs.length; i++) if (before[i]) expect(now[i]).toBe(true);
      await expect(reader.addSaved('/x')).rejects.toThrow(/version 2/);
      expect(readFileSync(f, 'utf8')).toBe(text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

type RootJson = { id: string; path: string; kind: string; writable: boolean; mode?: AccessMode; accessRev?: string; saveRev?: string; saved: boolean; customName?: string };

/** A server with a saved project `keep` (auto-rw covers it), an unsaved `ses`, and the reference root. */
async function start(port: number, o: { dir?: string; prefsPath?: string; git?: boolean } = {}) {
  const dir = o.dir ?? (await tmp('mdhouse-access-srv-'));
  const keep = join(dir, 'keep');
  const ses = join(dir, 'ses');
  await mkdir(keep, { recursive: true });
  await mkdir(ses, { recursive: true });
  await writeFile(join(keep, 'a.md'), '- [ ] k\n');
  await writeFile(join(ses, 'b.md'), '- [ ] s\n');
  const prefsPath = o.prefsPath ?? join(dir, 'prefs.json');
  const prefs = await Prefs.load(prefsPath);
  if (!prefs.isSaved(keep)) await prefs.addSaved(keep);
  await prefs.setAutoRw([keep]);
  const registry = await Registry.create([
    { path: keep, mode: prefs.savedMode(keep) ?? 'inherit' },
    { path: ses, mode: 'inherit' },
  ]);
  await registry.addReference(join(import.meta.dir, '../doc'), '_mdhouse', 'mdhouse reference');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: !o.git });
  const origin = `http://127.0.0.1:${port}`;
  const roots = async () => ((await (await fetch(`${origin}/api/roots`)).json()) as { roots: RootJson[] }).roots;
  const root = async (path: string) => (await roots()).find((r) => r.path === path)!;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  const stop = () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
  };
  return { ...s, dir, keep, ses, prefs, prefsPath, registry, origin, roots, root, post, stop };
}

describe('POST /api/roots/mode', () => {
  test('payload: mode and a full accessRev on projects only, apart from saveRev and the name', async () => {
    const t = await start(testPort(61731));
    try {
      const cookie = await adminLogin(testPort(61731));
      const all = await t.roots();
      expect(all.find((r) => r.kind === 'reference')).not.toHaveProperty('mode');
      expect(all.find((r) => r.kind === 'reference')).not.toHaveProperty('accessRev');
      const ses = await t.root(t.ses);
      expect(ses).toMatchObject({ mode: 'inherit', writable: false });
      expect(ses.accessRev).toMatch(/^[0-9a-f]{64}$/);
      expect(ses.accessRev).not.toBe(ses.saveRev);
      expect((await t.post('/api/roots/name', { id: ses.id, name: 'Named' }, { cookie })).status).toBe(200);
      const named = await t.root(t.ses);
      expect(named.accessRev).toBe(ses.accessRev); // the name is not access
      expect(named.saveRev).not.toBe(ses.saveRev);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('refusals change nothing: schema 400, cross-origin 403, no or spoofed admin 401, unknown 404, reference 403, stale 409', async () => {
    const t = await start(testPort(61732));
    try {
      const cookie = await adminLogin(testPort(61732));
      const keep = await t.root(t.keep);
      const text = readFileSync(t.prefsPath, 'utf8');
      const rev = keep.accessRev!;
      for (const bad of [
        null,
        [],
        { id: keep.id, mode: 'ro' },
        { id: keep.id, rev },
        { id: keep.id, mode: 'inherit', rev },
        { id: keep.id, mode: 'RO', rev },
        { id: keep.id, mode: 'ro', rev: rev.slice(0, 63) },
        { id: keep.id, mode: 'ro', rev, writable: false },
        { id: '', mode: 'ro', rev },
      ]) {
        expect((await t.post('/api/roots/mode', bad, { cookie })).status).toBe(400);
      }
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev }, { cookie, origin: 'http://evil.example' })).status).toBe(403);
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev })).status).toBe(401);
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev }, { cookie: `${cookie.split('=')[0]}=forged` })).status).toBe(401);
      expect((await t.post('/api/roots/mode', { id: 'nope', mode: 'ro', rev }, { cookie })).status).toBe(404);
      const ref = (await t.roots()).find((r) => r.kind === 'reference')!;
      expect((await t.post('/api/roots/mode', { id: ref.id, mode: 'rw', rev }, { cookie })).status).toBe(403);
      const stale = await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev: '0'.repeat(64) }, { cookie });
      expect([stale.status, ((await stale.json()) as { reason: string }).reason]).toEqual([409, 'stale']);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      expect(await t.root(t.keep)).toEqual(keep);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('saved: RO beats auto-rw, is written to prefs and denies document writes; RW restores them', async () => {
    const t = await start(testPort(61733));
    try {
      const cookie = await adminLogin(testPort(61733));
      let keep = await t.root(t.keep);
      expect([keep.mode, keep.writable]).toEqual(['inherit', true]);
      const res = await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev: keep.accessRev }, { cookie });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { roots: RootJson[] }).roots.find((r) => r.path === t.keep)).toMatchObject({ mode: 'ro', writable: false });
      expect(disk(t.prefsPath)).toMatchObject({ readonly: [t.keep], writable: [] });
      const task = { p: `${keep.id}/a.md`, line: 1, hash: lineHash('- [ ] k') };
      expect((await t.post('/api/task', task)).status).toBe(403);
      expect(await readFile(join(t.keep, 'a.md'), 'utf8')).toBe('- [ ] k\n');
      // the old revision is stale now
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'rw', rev: keep.accessRev }, { cookie })).status).toBe(409);
      keep = await t.root(t.keep);
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'rw', rev: keep.accessRev }, { cookie })).status).toBe(200);
      expect(disk(t.prefsPath)).toMatchObject({ readonly: [], writable: [t.keep] });
      expect((await t.post('/api/task', task)).status).toBe(200);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('session: the mode lives in memory, the file is untouched; save carries mode and name together; each invalidates the other revision', async () => {
    const t = await start(testPort(61734));
    try {
      const cookie = await adminLogin(testPort(61734));
      const text = readFileSync(t.prefsPath, 'utf8');
      let ses = await t.root(t.ses);
      expect((await t.post('/api/roots/name', { id: ses.id, name: 'Session RO' }, { cookie })).status).toBe(200);
      ses = await t.root(t.ses);
      const res = await t.post('/api/roots/mode', { id: ses.id, mode: 'ro', rev: ses.accessRev }, { cookie });
      expect(res.status).toBe(200);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      const after = await t.root(t.ses);
      expect(after).toMatchObject({ mode: 'ro', saved: false });
      expect(after.saveRev).not.toBe(ses.saveRev); // a mode change invalidates the save snapshot
      expect((await t.post('/api/roots/save', { id: ses.id, rev: ses.saveRev }, { cookie })).status).toBe(409);
      expect((await t.post('/api/roots/save', { id: ses.id, rev: after.saveRev }, { cookie })).status).toBe(200);
      expect(disk(t.prefsPath)).toMatchObject({ readonly: [t.ses], names: { [t.ses]: 'Session RO' } });
      const saved = await t.root(t.ses);
      expect(saved).toMatchObject({ mode: 'ro', saved: true, customName: 'Session RO' });
      expect(saved.accessRev).not.toBe(after.accessRev); // a save invalidates the access snapshot
      expect((await t.post('/api/roots/mode', { id: ses.id, mode: 'rw', rev: after.accessRev }, { cookie })).status).toBe(409);

      // a session RO carried by `mdhouse <dir> -p` (no --rw) from the CLI too
      await t.post('/api/roots/remove', { id: ses.id }, { cookie });
      await askDaemon(testPort(61734), { dirs: [t.ses] });
      const again = await t.root(t.ses);
      expect(again).toMatchObject({ mode: 'inherit', saved: false });
      expect((await t.post('/api/roots/mode', { id: again.id, mode: 'ro', rev: again.accessRev }, { cookie })).status).toBe(200);
      await askDaemon(testPort(61734), { dirs: [t.ses], save: true });
      expect(disk(t.prefsPath)).toMatchObject({ readonly: [t.ses] });
      expect(await t.root(t.ses)).toMatchObject({ mode: 'ro', saved: true });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('under the lock: an external save, auto-rw or mode change is 409; an administrator signed out meanwhile is 401; nothing changes', async () => {
    const t = await start(testPort(61735));
    try {
      let cookie = await adminLogin(testPort(61735));
      type Change = (c: Record<string, unknown>) => Record<string, unknown>;
      const cases: Array<[string, Change]> = [
        [t.ses, (c) => ({ ...c, saved: [...(c.saved as string[]), t.ses].sort() })], // saved by another process
        [t.ses, (c) => ({ ...c, autoRwRules: [t.keep, t.ses] })], // auto-rw now covers it
        [t.keep, (c) => ({ ...c, autoRwRules: [] })], // auto-rw no longer covers it
        [t.keep, (c) => ({ ...c, readonly: [t.keep] })], // set RO by another process
      ];
      for (const [target, external] of cases) {
        const r = await t.root(target);
        const current = disk(t.prefsPath);
        const release = await holdLock(t.prefsPath);
        const pending = t.post('/api/roots/mode', { id: r.id, mode: 'ro', rev: r.accessRev }, { cookie });
        await Bun.sleep(100);
        const text = await replaceFile(t.prefsPath, external(current));
        await release();
        const res = await pending;
        expect(res.status).toBe(409);
        expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
        expect(t.registry.list().find((x) => x.path === target)!.mode).toBe(r.mode!);
        await replaceFile(t.prefsPath, current);
        t.prefs.refresh();
      }
      const keep = await t.root(t.keep);
      const text = readFileSync(t.prefsPath, 'utf8');
      const release = await holdLock(t.prefsPath);
      const pending = t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev: keep.accessRev }, { cookie });
      await Bun.sleep(100);
      await askAdminRevoke(testPort(61735));
      await release();
      expect((await pending).status).toBe(401);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      expect(await t.root(t.keep)).toEqual(keep);
      cookie = await adminLogin(testPort(61735));
      expect((await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev: keep.accessRev }, { cookie })).status).toBe(200);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a failed write is 500 and changes nothing; a blocked file refuses saved and session modes alike and serves nothing writable', async () => {
    const dir = await tmp('mdhouse-access-io-');
    const store = join(dir, 'store');
    await mkdir(store);
    const target = join(store, 'prefs.json');
    await writeFile(target, '{"version":1}\n');
    const link = join(dir, 'prefs.json');
    await symlink(target, link);
    const t = await start(testPort(61736), { dir, prefsPath: link });
    try {
      const cookie = await adminLogin(testPort(61736));
      const keep = await t.root(t.keep);
      const text = readFileSync(target, 'utf8');
      chmodSync(store, 0o500);
      let res: Response;
      try {
        res = await t.post('/api/roots/mode', { id: keep.id, mode: 'ro', rev: keep.accessRev }, { cookie });
      } finally {
        chmodSync(store, 0o700);
      }
      expect(res.status).toBe(500);
      expect(readFileSync(target, 'utf8')).toBe(text);
      expect(await t.root(t.keep)).toEqual(keep);

      await askDaemon(testPort(61736), { dirs: [t.ses], rw: true }); // a session `--rw`
      expect((await t.root(t.ses)).writable).toBe(true);
      const newer = JSON.stringify({ version: 9, saved: [t.keep], writable: [t.keep] }) + '\n';
      await writeFile(target, newer);
      const before = await t.roots();
      expect(before.filter((r) => r.writable)).toEqual([]);
      for (const r of before.filter((x) => x.kind === 'project')) {
        for (const mode of ['ro', 'rw']) {
          const refused = await t.post('/api/roots/mode', { id: r.id, mode, rev: r.accessRev }, { cookie });
          expect(refused.status).toBe(500);
          expect(((await refused.json()) as { error: string }).error).toMatch(/version 9/);
        }
      }
      expect(await t.roots()).toEqual(before);
      expect(readFileSync(target, 'utf8')).toBe(newer);
      const ses = before.find((r) => r.path === t.ses)!;
      expect((await t.post('/api/task', { p: `${ses.id}/b.md`, line: 1, hash: lineHash('- [ ] s') })).status).toBe(403);
      expect(await readFile(join(t.ses, 'b.md'), 'utf8')).toBe('- [ ] s\n');
    } finally {
      t.stop();
      await chmod(store, 0o700).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('writes queued while RW are checked again before they run', () => {
  test('git commit-file / commit / reset / pull and a document write behind a slow commit: denied once the project is RO, files unchanged', async () => {
    const dir = await tmp('mdhouse-access-queue-');
    const t = await start(testPort(61737), { dir, git: true });
    try {
      const repo = t.ses;
      const git = (args: string[]) => run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
      await writeFile(join(repo, 'c.md'), 'c\n');
      await git(['init', '-q']);
      await git(['add', '.']);
      await git(['commit', '-qm', 'first']);
      await git(['config', 'user.name', 't']);
      await git(['config', 'user.email', 't@t']);
      await writeFile(join(repo, '.git/hooks/pre-commit'), '#!/bin/sh\nsleep 1.5\n');
      await chmod(join(repo, '.git/hooks/pre-commit'), 0o755);
      const head = async () => (await git(['rev-parse', 'HEAD'])).out.trim();
      const first = await head();

      const cookie = await adminLogin(testPort(61737));
      let ses = await t.root(t.ses);
      expect((await t.post('/api/roots/mode', { id: ses.id, mode: 'rw', rev: ses.accessRev }, { cookie })).status).toBe(200);
      ses = await t.root(t.ses);
      await writeFile(join(repo, 'b.md'), '- [ ] s\nedited\n');
      await writeFile(join(repo, 'c.md'), 'c edited\n');
      const p = `${ses.id}/`;

      const slow = t.post('/api/git/commit-file', { p: `${ses.id}/b.md`, message: 'slow' });
      await Bun.sleep(300); // the hook is running: the repo's and b.md's queues are held
      const queued = {
        commitFile: t.post('/api/git/commit-file', { p: `${ses.id}/c.md`, message: 'm' }),
        commit: t.post('/api/git/commit', { p, message: 'm', files: ['b.md', 'c.md'] }),
        reset: t.post('/api/git/reset', { p: `${ses.id}/c.md`, hash: lineHash('c edited\n') }),
        pull: t.post('/api/git/pull', { p, confirmed: true }),
        task: t.post('/api/task', { p: `${ses.id}/b.md`, line: 1, hash: lineHash('- [ ] s') }),
      };
      await Bun.sleep(200);
      const ro = await t.post('/api/roots/mode', { id: ses.id, mode: 'ro', rev: ses.accessRev }, { cookie });
      expect(ro.status).toBe(200);

      expect((await slow).status).toBe(200); // already running: never cancelled
      const statuses = Object.fromEntries(await Promise.all(Object.entries(queued).map(async ([k, r]) => [k, (await r).status])));
      expect(statuses).toEqual({ commitFile: 403, commit: 403, reset: 403, pull: 403, task: 403 });
      expect(await readFile(join(repo, 'c.md'), 'utf8')).toBe('c edited\n');
      expect(await readFile(join(repo, 'b.md'), 'utf8')).toBe('- [ ] s\nedited\n');
      expect((await git(['log', '--format=%s', `${first}..HEAD`])).out.trim()).toBe('slow');
      expect((await git(['status', '--porcelain', '--', 'c.md'])).out.trim()).toBe('M c.md');
    } finally {
      t.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('Registry.writeFile checks the root at the final write: RO or blocked after the route check refuses', async () => {
    const dir = await tmp('mdhouse-access-final-');
    try {
      await writeFile(join(dir, 'a.md'), 'a\n');
      const registry = await Registry.create([{ path: dir, mode: 'rw' }]);
      const id = registry.list()[0]!.id;
      await registry.writeFile(`${id}/a.md`, 'b\n');
      registry.setMode(id, 'ro');
      await expect(registry.writeFile(`${id}/a.md`, 'c\n')).rejects.toBeInstanceOf(ReadOnlyError);
      registry.setMode(id, 'rw');
      registry.accessBlocked = () => true;
      await expect(registry.writeFile(`${id}/a.md`, 'd\n')).rejects.toBeInstanceOf(ReadOnlyError);
      expect(await readFile(join(dir, 'a.md'), 'utf8')).toBe('b\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
