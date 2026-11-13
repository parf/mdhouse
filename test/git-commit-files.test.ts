import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd });
  return r.stdout.toString().trim();
}

/** A repo served RW at `proj/`, with `ro/` served read-only and `out.md` outside both roots. */
async function start(port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-commit-files-')));
  const repo = join(dir, 'repo');
  await mkdir(join(repo, 'proj/sub'), { recursive: true });
  await mkdir(join(repo, 'ro'), { recursive: true });
  for (const f of ['proj/a.md', 'proj/b.md', 'proj/[ab].md', 'proj/gone.md', 'proj/old.md', 'ro/r.md', 'out.md']) await writeFile(join(repo, f), `# ${f}\n`);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'init');
  await mkdir(join(dir, 'cfg'));
  const prefs = await Prefs.load(join(dir, 'cfg/prefs.json'));
  const registry = await Registry.create([
    { path: join(repo, 'proj'), mode: 'rw' },
    { path: join(repo, 'ro'), mode: 'ro' },
  ]);
  const s = await serve({ registry, prefs, port: testPort(port), hostname: '127.0.0.1' });
  const origin = `http://127.0.0.1:${testPort(port)}`;
  const id = registry.list()[0]!.id;
  const post = async (body: unknown, headers: Record<string, string> = { origin }) => {
    const res = await fetch(`${origin}/api/git/commit-files`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return [res.status, await res.json()] as const;
  };
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(dir, { recursive: true, force: true });
  };
  return { repo, id, post, stop, status: () => Bun.spawnSync(['git', 'status', '--porcelain=v1'], { cwd: repo }).stdout.toString().replace(/\n$/, '') };
}

describe('POST /api/git/commit-files', () => {
  test('commits exactly the ticked files — a change, a new file, a deletion — and leaves the rest', async () => {
    const t = await start(61985);
    try {
      await writeFile(join(t.repo, 'proj/a.md'), '# a changed\n');
      await writeFile(join(t.repo, 'proj/b.md'), '# b changed\n');
      await writeFile(join(t.repo, 'proj/*new [x].md'), '# new\n');
      await writeFile(join(t.repo, 'proj/sub/c.md'), '# c\n');
      await unlink(join(t.repo, 'proj/gone.md'));
      // Staged elsewhere: left staged.
      await writeFile(join(t.repo, 'proj/old.md'), '# old changed\n');
      git(t.repo, 'add', 'proj/old.md');
      const files = [
        { path: 'proj/a.md', code: ' M' },
        { path: 'proj/*new [x].md', code: '??' },
        // A new folder is listed as one entry, as the page shows it.
        { path: 'proj/sub/', code: '??' },
        { path: 'proj/gone.md', code: ' D' },
      ];
      expect(await t.post({ p: `${t.id}`, message: 'three files', files })).toEqual([200, { ok: true, output: expect.any(String) }]);
      expect(git(t.repo, 'show', '--name-status', '--format=%s', 'HEAD').split('\n').filter(Boolean).sort()).toEqual(['A\tproj/*new [x].md', 'A\tproj/sub/c.md', 'D\tproj/gone.md', 'M\tproj/a.md', 'three files'].sort());
      expect(t.status().split('\n').sort()).toEqual([' M proj/b.md', 'M  proj/old.md']);
    } finally {
      await t.stop();
    }
  });

  test('a name git would read as a glob commits that file only', async () => {
    const t = await start(61987);
    try {
      for (const f of ['proj/a.md', 'proj/b.md', 'proj/[ab].md']) await writeFile(join(t.repo, f), '# changed\n');
      expect((await t.post({ p: t.id, message: 'glob', files: [{ path: 'proj/[ab].md', code: ' M' }] }))[0]).toBe(200);
      expect(git(t.repo, 'show', '--name-only', '--format=', 'HEAD')).toBe('proj/[ab].md');
      expect(t.status().split('\n').sort()).toEqual([' M proj/a.md', ' M proj/b.md']);
    } finally {
      await t.stop();
    }
  });

  test('refusals commit nothing: drift, a rename, outside the root or read-only, bad bodies, another site', async () => {
    const t = await start(61986);
    try {
      await writeFile(join(t.repo, 'proj/a.md'), '# a changed\n');
      await writeFile(join(t.repo, 'ro/r.md'), '# r changed\n');
      await writeFile(join(t.repo, 'out.md'), '# out changed\n');
      git(t.repo, 'mv', 'proj/old.md', 'proj/renamed.md');
      const head = git(t.repo, 'rev-parse', 'HEAD');
      const p = t.id;
      const m = 'm';
      // Drift: the page saw another code, or a file that is clean now.
      const [s1, b1] = await t.post({ p, message: m, files: [{ path: 'proj/a.md', code: '??' }] });
      expect([s1, b1.error, Array.isArray(b1.files)]).toEqual([409, expect.stringContaining('changed meanwhile'), true]);
      expect((await t.post({ p, message: m, files: [{ path: 'proj/b.md', code: ' M' }] }))[0]).toBe(409);
      expect((await t.post({ p, message: m, files: [{ path: 'proj/renamed.md', code: 'R ' }] }))).toEqual([409, { error: expect.stringContaining('terminal'), files: [{ path: 'proj/renamed.md', code: 'R ' }] }]);
      expect((await t.post({ p, message: m, files: [{ path: 'ro/r.md', code: ' M' }] }))[1].error).toContain('read-only');
      expect((await t.post({ p, message: m, files: [{ path: 'out.md', code: ' M' }] }))[1].error).toContain('outside');
      const a = { path: 'proj/a.md', code: ' M' };
      for (const bad of [{ p, files: [a] }, { p, message: m }, { p, message: m, files: [] }, { p, message: m, files: [a, a] }, { p, message: m, files: [{ path: 'x\0y', code: ' M' }] }, { p, message: m, files: [{ path: 'proj/a.md', code: 'M' }] }]) {
        expect([bad, (await t.post(bad))[0]]).toEqual([bad, 400]);
      }
      expect((await t.post({ p, message: 'x'.repeat(100_001), files: [a] }))[0]).toBe(413);
      expect((await t.post({ p, message: m, files: [a] }, { origin: 'http://evil.example' }))[0]).toBe(403);
      expect((await t.post({ p: `${t.id}/../ro`, message: m, files: [a] }))[0]).toBe(404);
      expect(git(t.repo, 'rev-parse', 'HEAD')).toBe(head);
    } finally {
      await t.stop();
    }
  });
});
