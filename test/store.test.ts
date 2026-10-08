import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/lib/store';
import { Prefs } from '../src/lib/prefs';
import type { Registry, Root } from '../src/lib/roots';

let base: string;
let prefs: Prefs;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mdhouse-store-'));
  prefs = await Prefs.load(join(base, 'prefs.json'));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

test('an edited .mdhouseignore applies on the next invalidate', async () => {
  const dir = join(base, 'ign');
  mkdirSync(join(dir, 'drafts'), { recursive: true });
  writeFileSync(join(dir, 'a.md'), 'a\n');
  writeFileSync(join(dir, 'drafts', 'b.md'), 'b\n');
  const root: Root = { id: 'ign', name: 'ign', path: dir, writable: false };
  const store = new Store({} as Registry, prefs, { noGit: true });

  expect((await store.tree(root, false)).files.map((f) => f.rel)).toEqual(['a.md', 'drafts/b.md']);
  writeFileSync(join(dir, '.mdhouseignore'), 'drafts\n');
  store.invalidate(root.id);
  expect((await store.tree(root, false)).files.map((f) => f.rel)).toEqual(['a.md']);
});

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'ignore' });
/** The cached scans of a root, by "include ignored". */
const scans = (store: Store, id: string): Map<boolean, unknown> =>
  (store as unknown as { state: Map<string, { scans: Map<boolean, unknown> }> }).state.get(id)!.scans;

test('a document open uses the cached scan; the ignored scan only for a file it does not list', async () => {
  const dir = join(base, 'open');
  mkdirSync(join(dir, 'tmp'), { recursive: true });
  git(dir, 'init', '-q');
  writeFileSync(join(dir, '.gitignore'), 'tmp/\n');
  writeFileSync(join(dir, 'a.md'), 'a\n');
  writeFileSync(join(dir, 'tmp', 'b.md'), 'b\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'init');
  writeFileSync(join(dir, 'a.md'), 'a2\n');
  const root: Root = { id: 'open', name: 'open', path: dir, writable: false };
  const store = new Store({} as Registry, prefs);

  await store.tree(root, false);
  expect(await store.statusOf(root, 'a.md')).toBe('modified');
  expect(await store.repoFor(root, 'a.md')).toEqual({ repo: dir, repoRel: 'a.md' });
  expect([...scans(store, 'open').keys()]).toEqual([false]);
  expect(await store.repoFor(root, 'tmp/b.md')).toEqual({ repo: dir, repoRel: 'tmp/b.md' });
  expect([...scans(store, 'open').keys()]).toEqual([false, true]);
});

test('a root of several repos: status and commits of each', async () => {
  const dir = join(base, 'many');
  for (const r of ['r1', 'r2']) {
    const repo = join(dir, r);
    mkdirSync(repo, { recursive: true });
    git(repo, 'init', '-q');
    writeFileSync(join(repo, `${r}.md`), 'x\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', r);
    writeFileSync(join(repo, 'new.md'), 'y\n');
  }
  const root: Root = { id: 'many', name: 'many', path: dir, writable: false };
  const digest = await new Store({} as Registry, prefs).digest(root, 60, false);
  expect(digest.uncommitted.map((e) => e.rel).sort()).toEqual(['r1/new.md', 'r2/new.md']);
  expect(digest.commits.flatMap((c) => c.files.map((f) => f.rel)).sort()).toEqual(['r1/r1.md', 'r2/r2.md']);
});
