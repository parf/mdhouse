import { describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, renameSync, statSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newFileName } from '../src/lib/filetypes';
import { Prefs } from '../src/lib/prefs';
import { ExistsError, ReadOnlyError, Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

/** A server over a writable project `rw`, a read-only project `ro` and the reference root `_ref`. */
async function start(port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-newfile-')));
  const rw = join(dir, 'rw');
  const ro = join(dir, 'ro');
  const ref = join(dir, 'ref');
  const outside = join(dir, 'outside');
  for (const d of [rw, ro, ref, outside, join(rw, 'sub'), join(rw, '.git'), join(rw, 'drafts'), join(rw, 'taken.md')]) await mkdir(d, { recursive: true });
  await writeFile(join(ro, 'r.md'), '# ro\n');
  await writeFile(join(rw, 'note.md'), '# kept\r\nbytes\n');
  await writeFile(join(rw, '.mdhouseignore'), 'drafts\n');
  await symlink(join(rw, 'nowhere.md'), join(rw, 'dangling.md'));
  await writeFile(join(outside, 'secret.md'), '# secret\n');
  await symlink(join(outside, 'secret.md'), join(rw, 'escape.md'));
  await symlink(outside, join(rw, 'out'));
  const prefs = await Prefs.load(join(dir, 'prefs.json'));
  const registry = await Registry.create([rw, ro]);
  const rwId = registry.list().find((r) => r.path === rw)!.id;
  const roId = registry.list().find((r) => r.path === ro)!.id;
  registry.setMode(rwId, 'rw');
  registry.setMode(roId, 'ro');
  await registry.addReference(ref, '_ref');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/new-file`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, rw, ro, ref, outside, prefs, registry, rwId, roId, origin, post, stop };
}

describe('newFileName', () => {
  test('one segment, no leading dot, at most 255 UTF-8 bytes, a Markdown suffix', () => {
    for (const ok of ['a.md', 'Notes 2026.md', 'x.MDX', 'ü.md', `${'é'.repeat(126)}.md`]) expect([ok, newFileName(ok)]).toEqual([ok, null]);
    for (const bad of ['', '.', '..', '.hidden.md', 'a/b.md', 'a\\b.md', 'a\0.md', 'a\n.md', 'a\x7f.md', 'a.txt', 'a', 'a.md.txt', `${'é'.repeat(127)}.md`, `${'a'.repeat(253)}.md`]) {
      expect([bad, typeof newFileName(bad)]).toEqual([bad, 'string']);
    }
  });
});

describe('Registry.createFile', () => {
  test('creates an empty file in an existing folder; never folders, never over anything; refuses a read-only root', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-create-')));
    try {
      await mkdir(join(dir, 'p', 'sub'), { recursive: true });
      await writeFile(join(dir, 'p', 'x.md'), 'x');
      const registry = await Registry.create([join(dir, 'p')], 'rw');
      const id = registry.list()[0]!.id;
      expect(await registry.createFile(id, 'a.md')).toMatchObject({ rel: 'a.md', abs: join(dir, 'p', 'a.md') });
      expect(await registry.createFile(`${id}/sub`, 'b.md')).toMatchObject({ rel: 'sub/b.md' });
      expect(readFileSync(join(dir, 'p', 'sub', 'b.md'), 'utf8')).toBe('');
      expect(await registry.createFile(`${id}/missing`, 'c.md')).toBeNull();
      expect(existsSync(join(dir, 'p', 'missing'))).toBe(false);
      expect(await registry.createFile(`${id}/x.md`, 'c.md')).toBeNull();
      await expect(registry.createFile(id, 'x.md')).rejects.toBeInstanceOf(ExistsError);
      await expect(registry.createFile(id, 'sub')).rejects.toBeInstanceOf(ExistsError);
      expect(readFileSync(join(dir, 'p', 'x.md'), 'utf8')).toBe('x');
      for (const bad of ['', '.', '..', 'sub/c.md', 'a\\c.md']) await expect(registry.createFile(id, bad)).rejects.toThrow('not one file name');
      registry.setMode(id, 'ro');
      await expect(registry.createFile(id, 'd.md')).rejects.toBeInstanceOf(ReadOnlyError);
      expect(existsSync(join(dir, 'p', 'd.md'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a write revoked while the folder is checked is refused at the create', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-create-')));
    try {
      await mkdir(join(dir, 'p'));
      const registry = await Registry.create([join(dir, 'p')], 'rw');
      const id = registry.list()[0]!.id;
      // The second check is the last one before the create: writable for the first, not for the second.
      let asked = 0;
      const writableAt = registry.writableAt.bind(registry);
      registry.writableAt = (loc) => ++asked < 2 && writableAt(loc);
      await expect(registry.createFile(id, 'a.md')).rejects.toBeInstanceOf(ReadOnlyError);
      expect([asked, existsSync(join(dir, 'p', 'a.md'))]).toEqual([2, false]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['another folder inside the jail', 'p/other'],
    ['a folder outside the jail', 'outside'],
  ])('a folder swapped for a link to %s right before the create: refused, logged, nothing removed', async (_what, to) => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-create-')));
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const d of ['p/sub', 'p/other', 'outside']) await mkdir(join(dir, d), { recursive: true });
      await writeFile(join(dir, 'p/sub/kept.md'), 'kept');
      const registry = await Registry.create([join(dir, 'p')], 'rw');
      const id = registry.list()[0]!.id;
      // The last check before the create (the second) swaps the checked folder for a link.
      let asked = 0;
      const writableAt = registry.writableAt.bind(registry);
      registry.writableAt = (loc) => {
        if (++asked === 2) {
          renameSync(join(dir, 'p/sub'), join(dir, 'p/sub-old'));
          symlinkSync(join(dir, to), join(dir, 'p/sub'));
        }
        return writableAt(loc);
      };
      expect(await registry.createFile(`${id}/sub`, 'n.md')).toBeNull();
      expect(asked).toBe(2);
      // The stray file stays where it landed, the original folder and the link are untouched.
      expect(readFileSync(join(dir, to, 'n.md'), 'utf8')).toBe('');
      expect(readFileSync(join(dir, 'p/sub-old/kept.md'), 'utf8')).toBe('kept');
      expect(existsSync(join(dir, 'p/sub-old/n.md'))).toBe(false);
      expect(readlinkSync(join(dir, 'p/sub'))).toBe(join(dir, to));
      expect(String(errors.mock.calls[0]?.[0])).toContain(join(dir, to, 'n.md'));
    } finally {
      errors.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('POST /api/new-file', () => {
  test('creates an empty Markdown file and answers its path and editor URL; /api/source reads it', async () => {
    const t = await start(testPort(61980));
    try {
      const res = await t.post({ dir: `${t.rwId}/sub`, name: 'First note.md' });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ p: `${t.rwId}/sub/First note.md`, url: `/${t.rwId}/sub/First%20note.md?edit` });
      expect(statSync(join(t.rw, 'sub', 'First note.md')).size).toBe(0);
      const src = await (await fetch(`${t.origin}/api/source?p=${encodeURIComponent(body.p)}`)).json();
      expect(src).toMatchObject({ text: '', hash: createHash('sha256').update('').digest('hex'), writable: true });
      // the project root, and a folder written with a trailing slash
      expect((await (await t.post({ dir: t.rwId, name: 'top.md' })).json()).p).toBe(`${t.rwId}/top.md`);
      expect((await t.post({ dir: `${t.rwId}/sub/`, name: 'slash.md' })).status).toBe(201);
    } finally {
      await t.stop();
    }
  });

  test('400: the body is exactly {dir, name} of well-formed strings, and the name is valid', async () => {
    const t = await start(testPort(61981));
    try {
      const dir = t.rwId;
      for (const body of [
        'not json',
        [],
        {},
        { dir },
        { name: 'a.md' },
        { dir, name: 'a.md', extra: 1 },
        { dir: '', name: 'a.md' },
        { dir: 1, name: 'a.md' },
        { dir, name: 2 },
        { dir: `${dir}\ud800`, name: 'a.md' },
        { dir, name: 'a\ud800.md' },
        { dir, name: 'a.txt' },
        { dir, name: 'a' },
        { dir, name: '.a.md' },
        { dir, name: '..' },
        { dir, name: 'sub/a.md' },
        { dir, name: '../a.md' },
        { dir, name: 'a\\b.md' },
        { dir, name: 'a\0.md' },
        { dir, name: 'a\tb.md' },
        { dir, name: `${'a'.repeat(253)}.md` },
      ]) {
        const res = await t.post(body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
        expect((await res.json()).reason).toBe('name');
      }
      expect(existsSync(join(t.dir, 'a.md'))).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('404 before 403: a folder that is gone, a file (in a read-only root too), outside the jail, under .git or excluded', async () => {
    const t = await start(testPort(61982));
    try {
      for (const dir of [
        `${t.rwId}/missing`,
        `${t.rwId}/note.md`,
        `${t.rwId}/../outside`,
        `${t.rwId}/sub/../..`,
        `${t.rwId}/out`,
        `${t.rwId}/.git`,
        `${t.rwId}/drafts`,
        `${t.roId}/r.md`,
        'nosuchroot',
        'nosuchroot/sub',
      ]) {
        const res = await t.post({ dir, name: 'n.md' });
        expect([dir, res.status]).toEqual([dir, 404]);
      }
      expect([existsSync(join(t.outside, 'n.md')), existsSync(join(t.rw, '.git', 'n.md')), existsSync(join(t.rw, 'drafts', 'n.md'))]).toEqual([false, false, false]);
      expect(existsSync(join(t.rw, 'missing'))).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('403: cross-origin, a read-only root, the reference root, a Viewer', async () => {
    const t = await start(testPort(61983));
    try {
      expect((await t.post({ dir: t.rwId, name: 'x.md' }, { origin: 'http://evil.example' })).status).toBe(403);
      expect((await t.post({ dir: t.roId, name: 'x.md' })).status).toBe(403);
      expect((await t.post({ dir: '_ref', name: 'x.md' })).status).toBe(403);
      await t.prefs.setMode('viewer');
      try {
        expect((await t.post({ dir: t.rwId, name: 'x.md' })).status).toBe(403);
      } finally {
        await t.prefs.setMode('workspace');
      }
      expect([existsSync(join(t.rw, 'x.md')), existsSync(join(t.ro, 'x.md')), existsSync(join(t.ref, 'x.md'))]).toEqual([false, false, false]);
      expect((await t.post({ dir: t.rwId, name: 'x.md' })).status).toBe(201);
    } finally {
      await t.stop();
    }
  });

  test('409: anything at the name stays as it was — a file, a folder, a dangling link, a link out of the tree', async () => {
    const t = await start(testPort(61984));
    try {
      const before = readFileSync(join(t.rw, 'note.md'));
      for (const name of ['note.md', 'taken.md', 'dangling.md', 'escape.md']) {
        const res = await t.post({ dir: t.rwId, name });
        expect([name, res.status]).toEqual([name, 409]);
        expect((await res.json()).reason).toBe('exists');
      }
      expect(readFileSync(join(t.rw, 'note.md'))).toEqual(before);
      expect(lstatSync(join(t.rw, 'taken.md')).isDirectory()).toBe(true);
      expect([readlinkSync(join(t.rw, 'dangling.md')), existsSync(join(t.rw, 'nowhere.md'))]).toEqual([join(t.rw, 'nowhere.md'), false]);
      expect(readFileSync(join(t.outside, 'secret.md'), 'utf8')).toBe('# secret\n');
    } finally {
      await t.stop();
    }
  });

  test('a folder swapped for a link between the route\'s check and the create: 404, the stray file kept', async () => {
    const t = await start(testPort(61986));
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      // writableAt: the route's check, then createFile's two; the last one swaps `sub` for a link to `outside`.
      let asked = 0;
      const writableAt = t.registry.writableAt.bind(t.registry);
      t.registry.writableAt = (loc) => {
        if (++asked === 3) {
          renameSync(join(t.rw, 'sub'), join(t.rw, 'sub-old'));
          symlinkSync(t.outside, join(t.rw, 'sub'));
        }
        return writableAt(loc);
      };
      const res = await t.post({ dir: `${t.rwId}/sub`, name: 'n.md' });
      expect([asked, res.status]).toEqual([3, 404]);
      expect([readFileSync(join(t.outside, 'n.md'), 'utf8'), readFileSync(join(t.outside, 'secret.md'), 'utf8')]).toEqual(['', '# secret\n']);
      expect([existsSync(join(t.rw, 'sub-old')), existsSync(join(t.rw, 'sub-old', 'n.md'))]).toEqual([true, false]);
    } finally {
      errors.mockRestore();
      await t.stop();
    }
  });

  test('two creates of one name at once: exactly one 201 and one 409', async () => {
    const t = await start(testPort(61985));
    try {
      for (let i = 0; i < 5; i++) {
        const statuses = (await Promise.all([t.post({ dir: t.rwId, name: `race-${i}.md` }), t.post({ dir: t.rwId, name: `race-${i}.md` })])).map((r) => r.status);
        expect(statuses.sort()).toEqual([201, 409]);
        expect(readFileSync(join(t.rw, `race-${i}.md`), 'utf8')).toBe('');
      }
    } finally {
      await t.stop();
    }
  });
});
