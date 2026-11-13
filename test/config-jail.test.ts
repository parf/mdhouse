import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

/** A served project that holds the instance's config dir (`mdhouse ~` with the default config). */
async function start(inside: boolean, port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-cfgjail-')));
  const proj = join(dir, 'proj');
  const cfg = inside ? join(proj, 'cfg') : join(dir, 'cfg');
  await mkdir(join(proj, 'docs'), { recursive: true });
  await mkdir(cfg, { recursive: true });
  await writeFile(join(proj, 'docs/a.md'), '# a\n\nneedle outside\n');
  await writeFile(join(cfg, 'notes.md'), '- [ ] needle inside\n');
  await symlink(cfg, join(proj, 'docs/link'));
  await writeFile(join(cfg, 'prefs.json'), '{}\n');
  const prefs = await Prefs.load(join(cfg, 'prefs.json'));
  const registry = await Registry.create([{ path: proj, mode: 'rw' }]);
  const s = await serve({ registry, prefs, port: testPort(port), hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${testPort(port)}`;
  const id = registry.list()[0]!.id;
  const get = (path: string) => fetch(origin + path);
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(dir, { recursive: true, force: true });
  };
  return { registry, proj, cfg, origin, id, get, stop };
}

describe('the instance config dir inside a served root', () => {
  test('raw, doc, files, tree, search, write and a symlink into it all refuse; the seal key exists from start', async () => {
    const t = await start(true, 61983);
    try {
      expect((await readFile(join(t.cfg, 'flow-seal.key'))).length).toBe(32);
      // Refused exactly as a path outside the root is.
      const jailed = async (route: string) => (await t.get(`/api/${route}?p=${t.id}/../x.md`)).status;
      for (const rel of ['cfg/flow-seal.key', 'cfg/prefs.json', 'cfg/notes.md', 'docs/link/flow-seal.key', 'docs/link/prefs.json']) {
        expect([rel, (await t.get(`/api/raw?p=${t.id}/${rel}`)).status]).toEqual([rel, await jailed('raw')]);
      }
      expect(await jailed('raw')).toBeGreaterThanOrEqual(400);
      for (const rel of ['cfg/notes.md', 'docs/link/notes.md']) expect([rel, (await t.get(`/api/doc?p=${t.id}/${rel}`)).status]).toEqual([rel, await jailed('doc')]);
      expect((await t.get(`/api/files?p=${t.id}/cfg`)).status).not.toBe(200);
      const files = (await (await t.get(`/api/files?p=${t.id}`)).json()) as { files: Array<{ rel: string }> };
      expect(files.files.map((f) => f.rel)).toEqual(['docs/a.md']);
      for (const ignored of ['0', '1']) {
        const tree = JSON.stringify(await (await t.get(`/api/tree?root=${t.id}&ignored=${ignored}`)).json());
        expect([ignored, tree.includes('notes.md'), tree.includes('a.md')]).toEqual([ignored, false, true]);
        const hits = JSON.stringify(await (await t.get(`/api/search?root=${t.id}&q=needle&ignored=${ignored}`)).json());
        expect([ignored, hits.includes('inside'), hits.includes('outside')]).toEqual([ignored, false, true]);
      }
      const tick = await fetch(`${t.origin}/api/task`, { method: 'POST', headers: { 'content-type': 'application/json', origin: t.origin }, body: JSON.stringify({ p: `${t.id}/cfg/notes.md`, line: 0, hash: 'x', checked: true }) });
      expect(tick.status).toBe(404);
      await expect(t.registry.writeFile(`${t.id}/cfg/prefs.json`, '{}')).rejects.toThrow('outside any root');
      expect(await readFile(join(t.cfg, 'notes.md'), 'utf8')).toBe('- [ ] needle inside\n');
      expect(t.registry.hidden(t.proj, join(t.cfg, 'deeper/x'))).toBe(true);
      expect(t.registry.hidden(t.proj, join(t.proj, 'cfgx/x'))).toBe(false);
      // A root that is the config dir, or inside it, was asked for by name.
      expect(t.registry.hidden(t.cfg, join(t.cfg, 'prefs.json'))).toBe(false);
      expect(t.registry.hidden(join(t.cfg, 'sub'), join(t.cfg, 'sub/a.md'))).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('a config dir named through a symlink is hidden by its real location', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-cfgjail-alias-')));
    try {
      await mkdir(join(dir, 'proj/cfg'), { recursive: true });
      await writeFile(join(dir, 'proj/cfg/prefs.json'), '{}\n');
      await symlink(join(dir, 'proj/cfg'), join(dir, 'alias'));
      const registry = await Registry.create([{ path: join(dir, 'proj'), mode: 'rw' }]);
      const id = registry.list()[0]!.id;
      expect(await registry.resolve(`${id}/cfg/prefs.json`)).not.toBeNull();
      await registry.hide([join(dir, 'alias')]);
      expect(await registry.resolve(`${id}/cfg/prefs.json`)).toBeNull();
      expect(await registry.resolve(`${id}/cfg/new.md`)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('outside every root: nothing changes', async () => {
    const t = await start(false, 61984);
    try {
      expect((await t.get(`/api/raw?p=${t.id}/docs/a.md`)).status).toBe(200);
      // The symlink leads out of the root: refused as before, by the jail.
      expect((await t.get(`/api/raw?p=${t.id}/docs/link/prefs.json`)).status).toBe((await t.get(`/api/raw?p=${t.id}/../x.md`)).status);
      const files = (await (await t.get(`/api/files?p=${t.id}`)).json()) as { files: Array<{ rel: string }> };
      expect(files.files.map((f) => f.rel)).toEqual(['docs/a.md']);
    } finally {
      await t.stop();
    }
  });
});
