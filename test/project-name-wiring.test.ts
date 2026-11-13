import { describe, expect, test } from 'bun:test';
import { chmodSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askDaemon, askRemove, controlDir, controlPath } from '../src/lib/control';
import { CONFIG_DIR, Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));
const onDisk = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

describe('prefs names — saved directories only', () => {
  test('an old file has none; junk, unsaved and non-normal entries are dropped; unknown keys kept', async () => {
    const dir = await tmp('mdhouse-names-');
    try {
      const path = join(dir, 'prefs.json');
      await writeFile(path, JSON.stringify({ saved: ['/a'] }));
      expect((await Prefs.load(path)).savedName('/a')).toBeUndefined();

      await writeFile(
        path,
        JSON.stringify({
          saved: ['/a', '/b', '/c', '/d', '/e'],
          names: { '/a': 'Alpha', '/b': ' padded ', '/c': 'x'.repeat(81), '/d': 'a‮b', '/e': 5, '/unsaved': 'Gone' },
          future: { kept: true },
        }),
      );
      const prefs = await Prefs.load(path);
      expect(['/a', '/b', '/c', '/d', '/e', '/unsaved'].map((d) => prefs.savedName(d))).toEqual(['Alpha', undefined, undefined, undefined, undefined, undefined]);
      await prefs.setSavedName('/a', 'Alpha 2');
      const written = await onDisk(path);
      expect(written.names).toEqual({ '/a': 'Alpha 2' });
      expect(written.future).toEqual({ kept: true }); // a newer mdhouse's key survives a save
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('set needs a saved directory; clear deletes; forgetting the directory forgets its name', async () => {
    const dir = await tmp('mdhouse-names-');
    try {
      const path = join(dir, 'prefs.json');
      const prefs = await Prefs.load(path);
      expect(await prefs.setSavedName('/x', 'X')).toBe(false);
      expect((await onDisk(path).catch((): Record<string, unknown> => ({}))).names ?? {}).toEqual({});
      await prefs.addSaved('/x');
      expect(await prefs.setSavedName('/x', 'X')).toBe(true);
      expect(prefs.savedName('/x')).toBe('X');
      expect(await prefs.setSavedName('/x', null)).toBe(true);
      expect(prefs.savedName('/x')).toBeUndefined();
      await prefs.setSavedName('/x', 'X');
      await prefs.removeSaved('/x');
      expect(prefs.savedName('/x')).toBeUndefined();
      expect((await onDisk(path)).names).toEqual({});
      expect(prefs.isWritableSaved('/x')).toBe(false); // naming never made it writable
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a name belongs to the canonical directory: stored by real path, never carried by a retargeted symlink', async () => {
    const dir = await tmp('mdhouse-names-');
    try {
      await mkdir(join(dir, 'a'));
      await mkdir(join(dir, 'b'));
      const alias = join(dir, 'alias');
      await symlink(join(dir, 'a'), alias);
      const path = join(dir, 'prefs.json');
      const prefs = await Prefs.load(path);
      await prefs.addSaved(alias); // a legacy saved entry that is a symlink
      expect(await prefs.setSavedName(join(dir, 'a'), 'Alpha')).toBe(true);
      expect((await onDisk(path)).names).toEqual({ [join(dir, 'a')]: 'Alpha' });

      await rm(alias);
      await symlink(join(dir, 'b'), alias);
      expect(prefs.savedName(join(dir, 'b'))).toBeUndefined();
      expect(prefs.savedName(alias)).toBeUndefined();
      expect(prefs.savedName(join(dir, 'a'))).toBeUndefined(); // a is no longer a saved directory
      expect((await Prefs.load(path)).savedName(join(dir, 'b'))).toBeUndefined(); // nor after a reload

      // naming b now stores b, and drops the stale a
      expect(await prefs.setSavedName(join(dir, 'b'), 'Beta')).toBe(true);
      expect((await onDisk(path)).names).toEqual({ [join(dir, 'b')]: 'Beta' });
      await prefs.removeSaved(alias);
      expect((await onDisk(path)).names).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a directory saved through a symlink answers by its real path too', async () => {
    const dir = await tmp('mdhouse-names-');
    try {
      await mkdir(join(dir, 'real'));
      await symlink(join(dir, 'real'), join(dir, 'link'));
      const prefs = await Prefs.load(join(dir, 'prefs.json'));
      await prefs.addSaved(join(dir, 'link'));
      expect(await prefs.setSavedName(join(dir, 'real'), 'Real')).toBe(true);
      expect(prefs.savedName(join(dir, 'link'))).toBe('Real');
      expect(prefs.savedName(join(dir, 'real'))).toBe('Real');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** An in-process server with two project roots (`one` saved, `two` not) and the reference root. */
async function start(port: number, base?: string) {
  const dir = base ?? (await tmp('mdhouse-name-srv-'));
  const one = join(dir, 'one');
  const two = join(dir, 'two');
  await mkdir(one, { recursive: true });
  await mkdir(two, { recursive: true });
  await writeFile(join(one, 'a.md'), '# a\n');
  await writeFile(join(two, 'b.md'), '# b\n');
  const prefsPath = join(dir, 'prefs.json');
  const prefs = await Prefs.load(prefsPath);
  if (!prefs.isSaved(one)) await prefs.addSaved(one);
  const registry = await Registry.create([one, two]);
  await registry.addReference(join(import.meta.dir, '../doc'), '_mdhouse', 'mdhouse reference');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const [oneId, twoId] = registry.list().map((r) => r.id);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/roots/name`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  type RootJson = { id: string; name: string; customName?: string; path: string; kind: string; writable: boolean; saved: boolean };
  const roots = async () => ((await (await fetch(`${origin}/api/roots`)).json()) as { roots: RootJson[] }).roots;
  const stop = () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
  };
  return { ...s, dir, one, two, oneId: oneId!, twoId: twoId!, prefs, prefsPath, registry, origin, post, roots, stop };
}

describe('POST /api/roots/name and the root payloads', () => {
  test('administrator renames: label + customName everywhere; identity, marks and access unchanged; tabs told', async () => {
    const t = await start(testPort(61751));
    try {
      await t.prefs.set(t.one, 'a.md', 'favorite', true);
      const before = await t.roots();
      const cookie = await adminLogin(testPort(61751));

      const ws = new WebSocket(`ws://127.0.0.1:${testPort(61751)}/ws`, { headers: { origin: t.origin } } as unknown as string[]);
      const told = new Promise<unknown>((resolve) => {
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { t: string };
          if (m.t === 'roots') resolve(m);
        };
      });
      await new Promise((r) => (ws.onopen = r));

      const res = await t.post({ id: t.oneId, name: '  All MDHouse Projects ' }, { cookie });
      expect(res.status).toBe(200);
      const answer = (await res.json()) as { roots: Array<{ id: string; name: string; customName?: string }> };
      expect(answer.roots.find((r) => r.id === t.oneId)).toMatchObject({ name: 'All MDHouse Projects', customName: 'All MDHouse Projects' });
      expect(await told).toEqual({ t: 'roots', roots: before.map((r) => r.id) });
      ws.close();

      const after = await t.roots();
      const strip = (r: Record<string, unknown>) => ({ ...r, name: undefined, customName: undefined });
      expect(after.map(strip)).toEqual(before.map(strip)); // id, path, kind, writable, saved
      expect(after.find((r) => r.id === t.oneId)).toMatchObject({ name: 'All MDHouse Projects', customName: 'All MDHouse Projects', path: t.one });
      expect(after.find((r) => r.id === t.twoId)!.customName).toBeUndefined();
      expect(t.prefs.get(t.one).favorite).toEqual(['a.md']);
      expect((await fetch(`${t.origin}/${t.oneId}/a.md`)).status).toBe(200); // URL unchanged

      const tree = (await (await fetch(`${t.origin}/api/tree?root=${t.oneId}`)).json()) as { root: Record<string, unknown> };
      expect(tree.root).toMatchObject({ id: t.oneId, name: 'All MDHouse Projects', customName: 'All MDHouse Projects', path: t.one });

      // duplicates are fine; the empty name restores the directory's own
      expect((await t.post({ id: t.twoId, name: 'All MDHouse Projects' }, { cookie })).status).toBe(200);
      expect((await t.roots()).filter((r) => r.name === 'All MDHouse Projects').map((r) => r.id)).toEqual([t.oneId, t.twoId]);
      expect((await t.post({ id: t.oneId, name: '' }, { cookie })).status).toBe(200);
      const reset = (await t.roots()).find((r) => r.id === t.oneId)!;
      expect(reset.name).toBe('one');
      expect('customName' in reset).toBe(false);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('refusals change nothing: no admin 401, cross-origin 403, bad body 400, unknown 404, reference 403', async () => {
    const t = await start(testPort(61752));
    try {
      const cookie = await adminLogin(testPort(61752));
      const before = await readFile(t.prefsPath, 'utf8');
      const cases: Array<[unknown, Record<string, string>, number]> = [
        [{ id: t.oneId, name: 'X' }, {}, 401],
        [{ id: t.oneId, name: 'X' }, { cookie: `mdhouse-admin-${testPort(61752)}=` + 'A'.repeat(43) }, 401],
        [{ id: t.oneId, name: 'X' }, { cookie, 'sec-fetch-site': 'cross-site' }, 403],
        [{ id: t.oneId, name: 'X', writable: true }, { cookie }, 400],
        [{ id: t.oneId, name: 'X', save: true }, { cookie }, 400],
        [{ id: t.oneId, name: 'a\nb' }, { cookie }, 400],
        [{ id: t.oneId, name: 'x'.repeat(81) }, { cookie }, 400],
        [{ id: t.oneId }, { cookie }, 400],
        [{ id: 'nope', name: 'X' }, { cookie }, 404],
        [{ id: '_mdhouse', name: 'X' }, { cookie }, 403],
      ];
      for (const [body, headers, status] of cases) expect((await t.post(body, headers)).status).toBe(status);
      expect(await (await t.post({ id: t.oneId, name: 'X' })).json()).toEqual({ error: 'administrator session required', reason: 'admin' });
      expect(await readFile(t.prefsPath, 'utf8')).toBe(before);
      expect((await t.roots()).some((r) => 'customName' in r)).toBe(false);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('lifetime: a saved root keeps its name in prefs across a restart; an unsaved one only in memory', async () => {
    const dir = await tmp('mdhouse-name-life-');
    let t = await start(testPort(61753), dir);
    try {
      const cookie = await adminLogin(testPort(61753));
      await t.post({ id: t.oneId, name: 'Saved Name' }, { cookie });
      await t.post({ id: t.twoId, name: 'Session Name' }, { cookie });
      expect((await t.roots()).map((r) => r.customName)).toEqual(['Saved Name', 'Session Name', undefined]);
      expect((await onDisk(t.prefsPath)).names).toEqual({ [t.one]: 'Saved Name' });
      expect(t.prefs.isSaved(t.two)).toBe(false); // naming did not save it
      expect(t.registry.get(t.twoId)!.writable).toBe(false); // nor make it writable
    } finally {
      t.stop();
    }
    t = await start(testPort(61753), dir);
    try {
      expect((await t.roots()).map((r) => r.customName)).toEqual(['Saved Name', undefined, undefined]);
    } finally {
      t.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('names over the control socket', () => {
  test('handoff names a session root in memory; saving carries it to prefs; removing forgets it', async () => {
    const t = await start(testPort(61754));
    try {
      const three = join(t.dir, 'three');
      await mkdir(three);
      const reply = await askDaemon(testPort(61754), { dirs: [three], name: 'Temp' });
      if (!reply || 'error' in reply) throw new Error('add failed');
      expect(reply.roots.find((r) => r.path === three)).toMatchObject({ name: 'Temp', saved: false, writable: false });
      expect((await onDisk(t.prefsPath)).names).toEqual({});

      const saved = await askDaemon(testPort(61754), { dirs: [three], save: true });
      if (!saved || 'error' in saved) throw new Error('save failed');
      expect(saved.roots.find((r) => r.path === three)).toMatchObject({ name: 'Temp', saved: true, writable: false });
      expect((await onDisk(t.prefsPath)).names).toEqual({ [three]: 'Temp' });

      expect(await askDaemon(testPort(61754), { dirs: [three], name: null })).not.toHaveProperty('error');
      expect((await onDisk(t.prefsPath)).names).toEqual({});
      await askDaemon(testPort(61754), { dirs: [three], name: 'Again' });
      expect((await onDisk(t.prefsPath)).names).toEqual({ [three]: 'Again' });

      const removed = await askRemove(testPort(61754), { dirs: [three] });
      if (!removed || 'error' in removed) throw new Error('remove failed');
      expect(removed.results).toMatchObject([{ removed: true, unsaved: true }]);
      expect((await onDisk(t.prefsPath)).names).toEqual({});
      const back = await askDaemon(testPort(61754), { dirs: [three] });
      if (!back || 'error' in back) throw new Error('add failed');
      expect(back.roots.find((r) => r.path === three)!.name).toBe('three');

      // a name-only request on a writable root keeps it writable and unsaved
      await askDaemon(testPort(61754), { dirs: [t.two], rw: true });
      const renamed = await askDaemon(testPort(61754), { dirs: [t.two], name: 'Still RW' });
      if (!renamed || 'error' in renamed) throw new Error('rename failed');
      expect(renamed.roots.find((r) => r.path === t.two)).toMatchObject({ name: 'Still RW', writable: true, saved: false });
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('a bad name or several directories are refused whole; an unprivate transport refuses a name', async () => {
    const t = await start(testPort(61755));
    try {
      const four = join(t.dir, 'four');
      await mkdir(four);
      for (const req of [
        { dirs: [four], name: 'a\u0000b' },
        { dirs: [four], name: 'x'.repeat(81) },
        { dirs: [four, t.two], name: 'X' },
      ]) {
        expect(await askDaemon(testPort(61755), req)).toHaveProperty('error');
      }
      expect(t.registry.list().some((r) => r.path === four)).toBe(false); // refused before adding

      chmodSync(controlDir(), 0o755);
      try {
        expect(await askDaemon(testPort(61755), { dirs: [t.two], name: 'X' })).toMatchObject({ error: expect.stringContaining('not private') });
        const raw = await fetch('http://localhost/add', { unix: controlPath(testPort(61755)), method: 'POST', body: JSON.stringify({ dirs: [t.two], name: 'X' }) });
        expect(raw.status).toBe(403);
        expect(await askDaemon(testPort(61755), { dirs: [t.two] })).not.toHaveProperty('error'); // unnamed add as before
      } finally {
        chmodSync(controlDir(), 0o700);
      }
      expect((await t.roots()).some((r) => 'customName' in r)).toBe(false);
    } finally {
      t.stop();
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  test('the last project, unsaved but still served, keeps its name in memory', async () => {
    const dir = await tmp('mdhouse-name-last-');
    const only = join(dir, 'only');
    await mkdir(only);
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    await prefs.addSaved(only);
    await prefs.setSavedName(only, 'Only');
    const registry = await Registry.create([only]);
    const s = await serve({ registry, prefs, port: testPort(61756), hostname: '127.0.0.1', noGit: true });
    try {
      const removed = await askRemove(testPort(61756), { dirs: [only] });
      if (!removed || 'error' in removed) throw new Error('remove failed');
      expect(removed.results).toMatchObject([{ kept: true, unsaved: true }]);
      expect(removed.roots[0]!.name).toBe('Only');
      expect((await onDisk(join(dir, 'prefs.json'))).names).toEqual({});
    } finally {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
