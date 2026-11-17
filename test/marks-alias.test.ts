import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from '../src/lib/roots';
import { Prefs } from '../src/lib/prefs';
import { serve } from '../src/server';
import { testPort } from './ports';

test('a favorite through a symlinked folder is the canonical file: listed, starred, cleared by one toggle; a gone file stays missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-marks-alias-'));
  const cfg = await mkdtemp(join(tmpdir(), 'mdhouse-marks-alias-cfg-'));
  await mkdir(join(dir, 'agents', 'skills'), { recursive: true });
  await writeFile(join(dir, 'agents', 'skills', 'glyphs.md'), '# g\n');
  await mkdir(join(dir, '.claude'));
  await symlink('../agents/skills', join(dir, '.claude', 'skills'));
  const prefs = await Prefs.load(join(cfg, 'prefs.json'));
  // As saved before the folder moved: by the alias, plus one file that no longer exists.
  await prefs.set(dir, '.claude/skills/glyphs.md', 'favorite', true);
  await prefs.set(dir, 'gone.md', 'favorite', true);
  const port = testPort(61970);
  const base = `http://127.0.0.1:${port}`;
  const { server, watcher, control } = await serve({ registry: await Registry.create([dir]), prefs, port, hostname: '127.0.0.1', noGit: true });
  try {
    const root = ((await (await fetch(`${base}/api/roots`)).json()) as { roots: Array<{ id: string }> }).roots[0]!.id;
    const tree = async () =>
      (await (await fetch(`${base}/api/tree?root=${root}`)).json()) as { files: Array<{ rel: string; marks?: string[] }>; marks: { favorite: string[] } };
    let t = await tree();
    expect(t.marks.favorite).toEqual(['agents/skills/glyphs.md', 'gone.md']);
    expect(t.files.find((f) => f.rel === 'agents/skills/glyphs.md')?.marks).toEqual(['favorite']);
    const doc = (await (await fetch(`${base}/api/doc?p=${root}/.claude/skills/glyphs.md`)).json()) as { rel: string; marks: string[] };
    expect(doc.rel).toBe('agents/skills/glyphs.md');
    expect(doc.marks).toEqual(['favorite']);

    // One toggle off by the canonical path clears the alias entry too.
    const mark = (path: string, on: boolean) =>
      fetch(`${base}/api/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ root, path, mark: 'favorite', on }) });
    expect((await mark('agents/skills/glyphs.md', false)).status).toBe(200);
    t = await tree();
    expect(t.marks.favorite).toEqual(['gone.md']);
    expect(prefs.get(dir).favorite).toEqual(['gone.md']);
    // Set by the alias: stored at the canonical path.
    await mark('.claude/skills/glyphs.md', true);
    expect(prefs.get(dir).favorite).toEqual(['agents/skills/glyphs.md', 'gone.md']);

    // Muted through the alias, then favorited by the canonical path: the mute goes too (one write).
    await mark('agents/skills/glyphs.md', false);
    await prefs.set(dir, '.claude/skills/glyphs.md', 'muted', true);
    await mark('agents/skills/glyphs.md', true);
    expect(prefs.get(dir).muted).toEqual([]);
    expect(prefs.get(dir).favorite).toEqual(['agents/skills/glyphs.md', 'gone.md']);
    // GET answers the same canonical lists.
    expect(((await (await fetch(`${base}/api/marks?root=${root}`)).json()) as { favorite: string[] }).favorite).toEqual(['agents/skills/glyphs.md', 'gone.md']);

    // Body shape: a non-string path or a non-boolean `on` is a 400, not a 500 or a set mark.
    const post = (body: unknown) => fetch(`${base}/api/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ root, path: ['a.md'], mark: 'favorite' })).status).toBe(400);
    expect((await post({ root, path: 'gone.md', mark: 'favorite', on: 'false' })).status).toBe(400);
    expect(prefs.get(dir).favorite).toEqual(['agents/skills/glyphs.md', 'gone.md']);
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(dir, { recursive: true, force: true });
    await rm(cfg, { recursive: true, force: true });
  }
});
