import { describe, expect, test } from 'bun:test';
import { chmodSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askAdminRevoke, askDaemon } from '../src/lib/control';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));

/**
 * Takes `<prefs>.lock` the way another mdhouse process would (exclusive create), so a save in this
 * process waits; returns the release, which removes only the lock it created.
 */
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

describe('Prefs.saveRoot — one write, guarded by the file as it is under the lock', () => {
  test('saved, writable and name land together; the guard sees the locked file, not this process memory', async () => {
    const dir = await tmp('mdhouse-save-unit-');
    try {
      const path = join(dir, 'prefs.json');
      const prefs = await Prefs.load(path);
      await prefs.addSaved('/keep');
      const seen: unknown[] = [];
      expect(await prefs.saveRoot('/p', { writable: true, name: 'P' }, (fresh) => (seen.push(fresh), null))).toBeNull();
      expect(seen).toEqual([{ saved: false, auto: false }]);
      const disk = JSON.parse(readFileSync(path, 'utf8'));
      expect([disk.saved, disk.writable, disk.names]).toEqual([['/keep', '/p'], ['/p'], { '/p': 'P' }]);
      expect([prefs.isSaved('/p'), prefs.isWritableSaved('/p'), prefs.savedName('/p')]).toEqual([true, true, 'P']);

      // RO and no name: nothing writable, no name entry
      expect(await prefs.saveRoot('/q', { writable: false, name: null }, () => null)).toBeNull();
      const after = JSON.parse(readFileSync(path, 'utf8'));
      expect([after.writable, after.names]).toEqual([['/p'], { '/p': 'P' }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a save or auto-rw change made under the lock by another process is what the guard sees; refused, nothing written', async () => {
    const dir = await tmp('mdhouse-save-unit-');
    try {
      const path = join(dir, 'prefs.json');
      const stale = await Prefs.load(path);
      await stale.addSaved('/keep'); // this process's memory: /p unsaved, auto-rw off for it

      for (const external of [
        { version: 1, saved: ['/keep', '/p'], writable: [] },
        { version: 1, saved: ['/keep'], writable: [], autoRw: ['/'], settings: { autoRw: true } },
      ]) {
        const release = await holdLock(path);
        const seen: Array<{ saved: boolean; auto: boolean }> = [];
        const pending = stale.saveRoot('/p', { writable: false, name: 'P' }, (fresh) => {
          seen.push(fresh);
          return fresh.saved || fresh.auto ? 'stale' : null;
        });
        await Bun.sleep(50); // the save is waiting for the lock now; the outcome does not depend on it
        const text = await replaceFile(path, external);
        await release();
        expect(await pending).toBe('stale');
        expect(seen).toHaveLength(1);
        expect(seen[0]!.saved || seen[0]!.auto).toBe(true);
        expect(readFileSync(path, 'utf8')).toBe(text); // byte-identical: the refused save wrote nothing
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

type RootJson = {
  id: string;
  name: string;
  customName?: string;
  path: string;
  kind: string;
  writable: boolean;
  writableBy?: string;
  configuredWritable: boolean;
  saved: boolean;
  saveRev?: string;
};

/** A server with a saved project `keep`, an unsaved `ses`, and the reference root. */
async function start(port: number, o: { dir?: string; sesRw?: boolean; auto?: boolean; prefsPath?: string } = {}) {
  const dir = o.dir ?? (await tmp('mdhouse-save-srv-'));
  const keep = join(dir, 'keep');
  const ses = join(dir, 'ses');
  await mkdir(keep, { recursive: true });
  await mkdir(ses, { recursive: true });
  await writeFile(join(keep, 'a.md'), '# a\n');
  await writeFile(join(ses, 'b.md'), '# b\n');
  const prefsPath = o.prefsPath ?? join(dir, 'prefs.json');
  const prefs = await Prefs.load(prefsPath);
  if (!prefs.isSaved(keep)) await prefs.addSaved(keep);
  if (o.auto) {
    await prefs.setAutoRw([ses]);
    await prefs.updateSettings({ autoRw: true });
  }
  const registry = await Registry.create([
    { path: keep, writable: prefs.isWritableSaved(keep) },
    { path: ses, writable: !!o.sesRw || prefs.isWritableSaved(ses) },
  ]);
  registry.autoRw = (d) => prefs.autoRwCovers(d);
  await registry.addReference(join(import.meta.dir, '../doc'), '_mdhouse', 'mdhouse reference');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const roots = async () => ((await (await fetch(`${origin}/api/roots`)).json()) as { roots: RootJson[] }).roots;
  const ses_ = async () => (await roots()).find((r) => r.path === ses)!;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  const stop = () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
  };
  return { ...s, dir, keep, ses, prefs, prefsPath, registry, origin, roots, ses_, post, stop };
}

const disk = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { saved: string[]; writable: string[]; names?: Record<string, string> };

describe('POST /api/roots/save', () => {
  test('payload: saveRev only on unsaved projects; configuredWritable apart from effective access', async () => {
    const t = await start(61721, { auto: true });
    try {
      const all = await t.roots();
      const [keep, ses, ref] = all;
      expect(keep!.saveRev).toBeUndefined();
      expect(ref!.saveRev).toBeUndefined();
      expect(ref!.configuredWritable).toBe(false);
      expect(ses!.saveRev).toMatch(/^[0-9a-f]{64}$/);
      expect([ses!.writable, ses!.writableBy, ses!.configuredWritable]).toEqual([true, 'auto', false]);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('RO, explicit RW and auto-only RW: saved as configured, reloaded without escalation; name B carried', async () => {
    for (const [mode, port] of [['ro', 61722], ['rw', 61723], ['auto', 61724]] as const) {
      const dir = await tmp('mdhouse-save-mode-');
      let t = await start(port, { dir, sesRw: mode === 'rw', auto: mode === 'auto' });
      const cookie = await adminLogin(port);
      try {
        await t.prefs.set(t.ses, 'b.md', 'favorite', true);
        expect((await t.post('/api/roots/name', { id: 'ses', name: 'Session B' }, { cookie })).status).toBe(200);
        const before = await t.ses_();
        const res = await t.post('/api/roots/save', { id: before.id, rev: before.saveRev }, { cookie });
        expect([mode, res.status]).toEqual([mode, 200]);
        const after = await t.ses_();
        expect(after).toMatchObject({ id: before.id, path: t.ses, saved: true, name: 'Session B', customName: 'Session B', writable: before.writable });
        expect(after.saveRev).toBeUndefined();
        const d = disk(t.prefsPath);
        expect(d.saved).toContain(t.ses);
        expect([mode, d.writable.includes(t.ses)]).toEqual([mode, mode === 'rw']);
        expect(d.names).toEqual({ [t.ses]: 'Session B' });
        expect(t.prefs.get(t.ses).favorite).toEqual(['b.md']);
        expect((await fetch(`${t.origin}/ses/b.md`)).status).toBe(200);
      } finally {
        t.stop();
      }
      // a restart reads only prefs; auto-rw switched off shows what was saved as configured
      const prefs = await Prefs.load(join(dir, 'prefs.json'));
      if (mode === 'auto') await prefs.updateSettings({ autoRw: false });
      t = await start(port, { dir });
      try {
        expect([mode, (await t.ses_()).writable]).toEqual([mode, mode === 'rw']);
        expect((await t.ses_()).name).toBe('Session B');
      } finally {
        t.stop();
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test('refusals: nothing on disk, in memory or in the session changes', async () => {
    const t = await start(61725);
    try {
      const cookie = await adminLogin(61725);
      await t.post('/api/roots/name', { id: 'ses', name: 'Kept In Memory' }, { cookie });
      const { saveRev } = await t.ses_();
      const before = readFileSync(t.prefsPath, 'utf8');
      const other = 'f'.repeat(64);
      const cases: Array<[unknown, Record<string, string>, number]> = [
        [{ id: 'ses', rev: saveRev }, {}, 401],
        [{ id: 'ses', rev: saveRev }, { cookie: 'mdhouse-admin-61725=' + 'A'.repeat(43) }, 401],
        [{ id: 'ses', rev: saveRev }, { cookie, 'sec-fetch-site': 'cross-site' }, 403],
        [{ id: 'ses' }, { cookie }, 400],
        [{ id: 'ses', rev: saveRev, writable: true }, { cookie }, 400],
        [{ id: 'ses', rev: saveRev, name: 'X' }, { cookie }, 400],
        [{ id: 'ses', rev: saveRev!.slice(0, 16) }, { cookie }, 400],
        [{ id: 'ses', rev: saveRev!.toUpperCase() }, { cookie }, 400],
        [{ id: '', rev: saveRev }, { cookie }, 400],
        ['ses', { cookie }, 400],
        [{ id: 'nope', rev: saveRev }, { cookie }, 404],
        [{ id: '_mdhouse', rev: other }, { cookie }, 403],
        [{ id: 'keep', rev: other }, { cookie }, 409], // already saved
        [{ id: 'ses', rev: other }, { cookie }, 409],
      ];
      for (const [body, headers, status] of cases) expect([body, (await t.post('/api/roots/save', body, headers)).status]).toEqual([body, status]);
      expect(await (await t.post('/api/roots/save', { id: 'ses', rev: other }, { cookie })).json()).toMatchObject({ reason: 'stale' });
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(before);
      expect(await t.ses_()).toMatchObject({ saved: false, customName: 'Kept In Memory', saveRev });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('stale snapshots: a rename, an access change, an auto-rw change or an external save since the confirm', async () => {
    const t = await start(61726);
    try {
      const cookie = await adminLogin(61726);
      const save = async (rev: string) => (await t.post('/api/roots/save', { id: 'ses', rev }, { cookie })).status;

      let rev = (await t.ses_()).saveRev!;
      await t.post('/api/roots/name', { id: 'ses', name: 'Renamed' }, { cookie });
      expect(await save(rev)).toBe(409);

      rev = (await t.ses_()).saveRev!;
      await askDaemon(61726, { dirs: [t.ses], rw: true }); // access changed by a terminal
      expect(await save(rev)).toBe(409);

      rev = (await t.ses_()).saveRev!;
      await t.prefs.setAutoRw([t.ses]); // auto-rw policy changed (the settings switch is on by default)
      expect(await save(rev)).toBe(409);

      rev = (await t.ses_()).saveRev!;
      const external = await Prefs.load(t.prefsPath); // another mdhouse process saves it
      await external.addSaved(t.ses);
      expect(await save(rev)).toBe(409);
      expect(disk(t.prefsPath).names ?? {}).toEqual({}); // the session name was not written by the refused save
      expect(disk(t.prefsPath).writable).toEqual([]); // nor the RW the terminal asked for
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('changes under the prefs lock while the save waits: 409, or 401 when the administrator is signed out; no partial write', async () => {
    const t = await start(61727);
    try {
      const cookie = await adminLogin(61727);
      await t.post('/api/roots/name', { id: 'ses', name: 'Waiting' }, { cookie });

      // another process saves the project and turns auto-rw on while this save waits for the lock
      let { saveRev } = await t.ses_();
      let release = await holdLock(t.prefsPath);
      let pending = t.post('/api/roots/save', { id: 'ses', rev: saveRev }, { cookie });
      await Bun.sleep(100);
      const current = disk(t.prefsPath);
      const text = await replaceFile(t.prefsPath, { ...current, saved: [...current.saved, t.ses].sort(), settings: { autoRw: true }, autoRw: [t.ses] });
      await release();
      let res = await pending;
      expect(res.status).toBe(409);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      expect(disk(t.prefsPath).names ?? {}).toEqual({});
      await replaceFile(t.prefsPath, current); // back to unsaved for the next case

      // the administrator is signed out while the save waits
      saveRev = (await t.ses_()).saveRev;
      const back = readFileSync(t.prefsPath, 'utf8');
      release = await holdLock(t.prefsPath);
      pending = t.post('/api/roots/save', { id: 'ses', rev: saveRev }, { cookie });
      await Bun.sleep(100);
      expect(await askAdminRevoke(61727)).toEqual({ revoked: 1 });
      await release();
      res = await pending;
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'administrator session required', reason: 'admin' });
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(back);
      expect(await t.ses_()).toMatchObject({ saved: false, customName: 'Waiting' });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a rename or removal racing a save: one wins whole; prefs, memory and runtime agree', async () => {
    const t = await start(61728);
    try {
      const cookie = await adminLogin(61728);
      let { saveRev } = await t.ses_();
      const [save, name] = await Promise.all([
        t.post('/api/roots/save', { id: 'ses', rev: saveRev }, { cookie }),
        t.post('/api/roots/name', { id: 'ses', name: 'Raced' }, { cookie }),
      ]);
      expect(name.status).toBe(200);
      const ses = await t.ses_();
      if (save.status === 200) {
        expect(ses).toMatchObject({ saved: true, name: 'Raced' }); // saved first, then renamed in prefs
        expect(disk(t.prefsPath).names).toEqual({ [t.ses]: 'Raced' });
      } else {
        expect(save.status).toBe(409); // renamed first: the confirmed snapshot changed
        expect(ses).toMatchObject({ saved: false, name: 'Raced' });
        expect(disk(t.prefsPath).names ?? {}).toEqual({});
      }

      // a fresh unsaved root, then save and remove at once
      if (ses.saved) await t.post('/api/roots/remove', { id: 'ses' }, { cookie });
      const re = await askDaemon(61728, { dirs: [t.ses] });
      if (!re || 'error' in re) throw new Error('re-add failed');
      saveRev = (await t.ses_()).saveRev;
      const [save2, removed] = await Promise.all([
        t.post('/api/roots/save', { id: 'ses', rev: saveRev }, { cookie }),
        t.post('/api/roots/remove', { id: 'ses' }, { cookie }),
      ]);
      expect(removed.status).toBe(200);
      expect([200, 404]).toContain(save2.status);
      expect((await t.roots()).some((r) => r.path === t.ses)).toBe(false);
      expect(disk(t.prefsPath).saved).not.toContain(t.ses); // removal after a save forgets it too
      expect(disk(t.prefsPath).names ?? {}).toEqual({});
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a write failure or a newer prefs file: 500, and disk, memory, session name and runtime are as before', async () => {
    const dir = await tmp('mdhouse-save-io-');
    const store = join(dir, 'store');
    await mkdir(store);
    const target = join(store, 'prefs.json');
    await writeFile(target, '{"version":1}\n');
    const link = join(dir, 'prefs.json');
    await symlink(target, link); // the lock goes beside the link, the write beside the target
    const t = await start(61729, { dir, prefsPath: link });
    try {
      const cookie = await adminLogin(61729);
      await t.post('/api/roots/name', { id: 'ses', name: 'Not Lost' }, { cookie });
      const before = await t.ses_();
      const text = await readFile(target, 'utf8');
      chmodSync(store, 0o500);
      let res: Response;
      try {
        res = await t.post('/api/roots/save', { id: 'ses', rev: before.saveRev }, { cookie });
      } finally {
        chmodSync(store, 0o700);
      }
      expect(res.status).toBe(500);
      expect(await readFile(target, 'utf8')).toBe(text);
      expect([t.prefs.isSaved(t.ses), t.prefs.savedName(t.ses)]).toEqual([false, undefined]);
      expect(await t.ses_()).toEqual(before); // same name, still unsaved, same saveRev
      expect((await t.post('/api/roots/save', { id: 'ses', rev: before.saveRev }, { cookie })).status).toBe(200);

      // a prefs file from a newer mdhouse is never written
      await t.post('/api/roots/remove', { id: 'ses' }, { cookie });
      await askDaemon(61729, { dirs: [t.ses], name: 'Again' });
      const newer = `{"version":2,"saved":${JSON.stringify([t.keep])}}\n`;
      await writeFile(target, newer);
      t.prefs.refresh();
      const rev = (await t.ses_()).saveRev;
      expect((await t.post('/api/roots/save', { id: 'ses', rev }, { cookie })).status).toBe(500);
      expect(await readFile(target, 'utf8')).toBe(newer);
      expect(await t.ses_()).toMatchObject({ saved: false, customName: 'Again' });
    } finally {
      t.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
