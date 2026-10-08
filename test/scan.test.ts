import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFiles, scanRoot } from '../src/lib/scan';
import { loadRootRules } from '../src/lib/ignore';
import type { Root } from '../src/lib/roots';

let repo: string;

const root = (path: string): Root => ({ id: 'r', name: 'r', path, writable: false });

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'mdhouse-scan-'));
  await Bun.spawn(['git', 'init', '-q'], { cwd: repo, stdout: 'ignore', stderr: 'ignore' }).exited;

  await writeFile(join(repo, '.gitignore'), 'tmp\n');
  await writeFile(join(repo, 'tracked.md'), '# tracked\n');

  // The case this file exists for: a directory the repo ignores, holding real documents.
  await mkdir(join(repo, 'tmp', 'notes'), { recursive: true });
  await writeFile(join(repo, 'tmp', 'scratch.md'), '# scratch\n');
  await writeFile(join(repo, 'tmp', 'notes', 'deep.md'), '# deep\n');
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('scanning', () => {
  test('lists the markdown a repository tracks', async () => {
    const result = await scanRoot(root(repo), await loadRootRules(repo));
    expect(result.files.map((f) => f.rel)).toContain('tracked.md');
    expect(result.files.map((f) => f.rel)).not.toContain('tmp/scratch.md');
    expect(result.repos).toHaveLength(1);
  });

  test('a root its own repository ignores still lists its files', async () => {
    const dir = join(repo, 'tmp');
    const result = await scanRoot(root(dir), await loadRootRules(dir));

    expect(result.files.map((f) => f.rel).sort()).toEqual(['notes/deep.md', 'scratch.md']);
    // Nothing there is tracked, so there is no git history to offer for it.
    expect(result.repos).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  test('the ALL view of a folder its repository ignores lists its files', async () => {
    const dir = join(repo, 'tmp');
    expect((await listFiles(dir, dir)).files.map((f) => f.rel).sort()).toEqual(['notes/deep.md', 'scratch.md']);
    expect((await listFiles(repo, join(dir, 'notes'))).files.map((f) => f.rel)).toEqual(['tmp/notes/deep.md']);
  });
});

describe('nested repositories', () => {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'ignore' });
  const repoWith = async (dir: string, file: string) => {
    await mkdir(dir, { recursive: true });
    git(dir, 'init', '-q');
    await writeFile(join(dir, file), '# x\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'init');
  };

  test('a root inside a repo lists the repos embedded below it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mdhouse-nested-'));
    try {
      await repoWith(home, 'top.md');
      await repoWith(join(home, 'src', 'r1'), 'a.md');
      await repoWith(join(home, 'src', 'r2'), 'b.md');
      await repoWith(join(home, 'src', 'vendor', 'r3'), 'c.md');
      const src = join(home, 'src');
      const result = await scanRoot(root(src), await loadRootRules(src));
      expect(result.files.map((f) => f.rel)).toEqual(['r1/a.md', 'r2/b.md']);
      expect(result.files.map((f) => f.repo)).toEqual([join(src, 'r1'), join(src, 'r2')]);
      expect(result.repos.sort()).toEqual([home, join(src, 'r1'), join(src, 'r2')]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test('a submodule lists its files', async () => {
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-sub-'));
    try {
      await repoWith(join(base, 'lib'), 'lib.md');
      const sup = join(base, 'sup');
      await repoWith(sup, 'top.md');
      git(sup, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', join(base, 'lib'), 'docs/lib');
      git(sup, 'commit', '-qm', 'sub');
      const result = await scanRoot(root(sup), await loadRootRules(sup));
      expect(result.files.map((f) => f.rel)).toEqual(['docs/lib/lib.md', 'top.md']);
      expect(result.repos).toContain(join(sup, 'docs', 'lib'));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
