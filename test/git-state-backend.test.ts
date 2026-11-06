import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { gitStateIn, Store } from '../src/lib/store';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'ignore' });

let base: string;
let repo: string;
const put = async (rel: string, at = repo) => {
  await mkdir(join(at, rel, '..'), { recursive: true });
  await writeFile(join(at, rel), `# ${rel}\n`);
};

/**
 * Tracked, modified, force-added under an ignored folder, ignored file, wholly ignored folder,
 * untracked file, wholly untracked folder, and a nested repository inside an untracked folder.
 */
beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-gitstate-')));
  repo = join(base, 'repo');
  await mkdir(repo);
  git(repo, 'init', '-q');
  await writeFile(join(repo, '.gitignore'), 'tmp/\nall/\n*.local.md\n');
  for (const f of ['t.md', 'm.md', 'tmp/forced.md']) await put(f);
  git(repo, 'add', '.gitignore', 't.md', 'm.md');
  git(repo, 'add', '-f', 'tmp/forced.md');
  git(repo, 'commit', '-qm', 'init');
  await writeFile(join(repo, 'm.md'), '# changed\n');
  for (const f of ['tmp/ign.md', 'all/x.md', 'all/sub/y.md', 'a.local.md', 'u.md', 'u.txt', 'new/deep/u.md', 'box/loose.md']) await put(f);
  const nested = join(repo, 'box', 'nested');
  await mkdir(nested, { recursive: true });
  git(nested, 'init', '-q');
  await put('n.md', nested);
  git(nested, 'add', 'n.md');
  git(nested, 'commit', '-qm', 'n');
  await put('nu.md', nested);
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const serve = async (dir: string, opts: { noGit?: boolean } = {}) => {
  const registry = await Registry.create([dir]);
  return { store: new Store(registry, await Prefs.load(join(base, `p-${Math.random()}.json`)), opts), root: registry.list()[0]! };
};
const states = (rows: { rel: string; gitState?: string }[]) => Object.fromEntries(rows.map((r) => [r.rel, r.gitState ?? '-']));

const WANT = {
  't.md': '-',
  'm.md': '-',
  'tmp/forced.md': '-',
  'tmp/ign.md': 'ignored',
  'all/x.md': 'ignored',
  'all/sub/y.md': 'ignored',
  'a.local.md': 'ignored',
  'u.md': 'untracked',
  'new/deep/u.md': 'untracked',
  'box/loose.md': 'untracked',
  'box/nested/n.md': '-',
  'box/nested/nu.md': 'untracked',
};

describe('gitState — actual git evidence only', () => {
  test('every case, by the owning repository', async () => {
    const { store, root } = await serve(repo);
    const got: Record<string, string> = {};
    for (const rel of Object.keys(WANT)) got[rel] = (await store.gitStateOf(root, rel)) ?? '-';
    expect(got).toEqual(WANT);
    expect(await store.gitStateOf(root, 'u.txt')).toBe('untracked');
  });

  test('the tree carries it, ignored files included; FileStatus is unchanged', async () => {
    const { store, root } = await serve(repo);
    const t = await store.tree(root, true);
    const want = Object.fromEntries(Object.entries(WANT).filter(([r]) => t.files.some((f) => f.rel === r)));
    expect(states(t.files)).toEqual(want);
    expect(t.files.find((f) => f.rel === 'm.md')!.status).toBe('modified');
    expect(t.files.find((f) => f.rel === 'u.md')!.status).toBe('untracked');
  });

  test('recents and digest rows carry it', async () => {
    const { store, root } = await serve(repo);
    const rec = states(await store.recents(root, 100, false));
    expect(rec['u.md']).toBe('untracked');
    expect(rec['t.md']).toBe('-');
    const d = await store.digest(root, 100, false);
    expect(states(d.uncommitted)['u.md']).toBe('untracked');
    expect(states(d.uncommitted)['m.md']).toBe('-');
    expect(d.commits.flatMap((c) => c.files).every((f) => f.gitState === undefined)).toBe(true);
  });

  test('no git evidence, no state: noGit, and a root in no repository (whose recents still say untracked)', async () => {
    const off = await serve(repo, { noGit: true });
    expect(states((await off.store.tree(off.root, false)).files)).toEqual(Object.fromEntries((await off.store.tree(off.root, false)).files.map((f) => [f.rel, '-'])));
    const loose = join(base, 'loose');
    await put('l.md', loose);
    const { store, root } = await serve(loose);
    expect((await store.tree(root, false)).files.map((f) => f.gitState)).toEqual([undefined]);
    const rec = await store.recents(root, 10, false);
    expect(rec[0]).toMatchObject({ rel: 'l.md', status: 'untracked' });
    expect(rec[0]!.gitState).toBeUndefined();
  });

  test('a root its repository ignores: ignored by git evidence; one holding a tracked file is not', async () => {
    const all = await serve(join(repo, 'all'));
    expect(states((await all.store.tree(all.root, false)).files)).toEqual({ 'sub/y.md': 'ignored', 'x.md': 'ignored' });
    const tmp = await serve(join(repo, 'tmp'));
    expect(await tmp.store.gitStateOf(tmp.root, 'forced.md')).toBeUndefined();
    expect(await tmp.store.gitStateOf(tmp.root, 'ign.md')).toBe('ignored');
  });

  test('built once per invalidation, any invalidate drops it', async () => {
    const { store, root } = await serve(repo);
    const first = await store.gitPaths(root);
    expect(await store.gitPaths(root)).toBe(first);
    store.invalidate(root.id, true);
    const second = await store.gitPaths(root);
    expect(second).not.toBe(first);
    store.invalidate(root.id);
    expect(await store.gitPaths(root)).not.toBe(second);
  });

  test('gitStateIn: the longest prefix decides, a listed folder covers what is below it', () => {
    const repos = [
      { prefix: 'a/b', ignored: new Set<string>(), untracked: new Set(['x.md']) },
      { prefix: '', ignored: new Set(['a/']), untracked: new Set<string>() },
    ];
    expect(gitStateIn(repos, 'a/b/x.md')).toBe('untracked');
    expect(gitStateIn(repos, 'a/b/y.md')).toBeUndefined();
    expect(gitStateIn(repos, 'a/c.md')).toBe('ignored');
    expect(gitStateIn(repos, 'ab.md')).toBeUndefined();
    expect(gitStateIn([{ prefix: '', ignored: new Set(['']), untracked: new Set<string>() }], 'q/r.md')).toBe('ignored');
    expect(gitStateIn([], 'q.md')).toBeUndefined();
  });
});

test('routes: /api/doc for any kind and /api/files rows carry it', async () => {
  const { serve: start } = await import('../src/server');
  const registry = await Registry.create([repo]);
  const id = registry.list()[0]!.id;
  const port = 61747;
  const { server, watcher, control } = await start({ registry, prefs: await Prefs.load(join(base, 'p-route.json')), port, hostname: '127.0.0.1' });
  const get = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`)).json() as Promise<Record<string, unknown>>;
  try {
    expect((await get(`/api/doc?p=${id}/u.txt`)).gitState).toBe('untracked');
    expect((await get(`/api/doc?p=${id}/u.md`)).gitState).toBe('untracked');
    expect((await get(`/api/doc?p=${id}/t.md`)).gitState).toBeUndefined();
    const all = states((await get(`/api/files?p=${id}`)).files as { rel: string; gitState?: string }[]);
    expect(all['u.txt']).toBe('untracked');
    expect(all['t.md']).toBe('-');
    expect(all['box/loose.md']).toBe('untracked');
    // ALL does not descend into a nested repository (unchanged); its own page does
    expect(all['box/nested/nu.md']).toBeUndefined();
    expect(states((await get(`/api/files?p=${id}/box/nested`)).files as { rel: string; gitState?: string }[])).toEqual({ 'box/nested/n.md': '-', 'box/nested/nu.md': 'untracked' });
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
  }
});
