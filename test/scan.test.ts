import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRoot } from '../src/lib/scan';
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
});
