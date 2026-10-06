import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoHead } from '../src/lib/git';

let repo: string;

const git = (...args: string[]) =>
  Bun.spawn(['git', '-c', 'user.name=Ann', '-c', 'user.email=ann@example.com', ...args], {
    cwd: repo,
    stdout: 'ignore',
    stderr: 'ignore',
  }).exited;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'mdhouse-head-'));
  await git('init', '-q', '-b', 'main');
  await writeFile(join(repo, 'a.txt'), 'a\n');
  await git('add', '.');
  await git('commit', '-q', '-m', 'Not markdown, still the head');
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('repoHead', () => {
  test('names the branch and the commit HEAD is on, whatever it touched', async () => {
    const head = await repoHead(repo);
    expect(head?.branch).toBe('main');
    expect(head?.commit?.subject).toBe('Not markdown, still the head');
    expect(head?.commit?.author).toBe('Ann');
  });

  test('no pull time for a repo that has never fetched', async () => {
    expect((await repoHead(repo))?.pulledAt).toBeNull();
  });

  test('the pull time is when FETCH_HEAD was last written', async () => {
    const at = new Date('2026-01-02T03:04:05Z');
    const fetchHead = join(repo, '.git', 'FETCH_HEAD');
    await writeFile(fetchHead, '');
    await utimes(fetchHead, at, at);
    expect((await repoHead(repo))?.pulledAt).toBe(at.getTime());
  });

  test('a detached HEAD shows its short hash for a branch', async () => {
    await git('checkout', '-q', '--detach');
    const head = await repoHead(repo);
    expect(head?.branch).toBe(head!.commit!.hash.slice(0, 8));
    await git('checkout', '-q', 'main');
  });

  test('null outside any repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'mdhouse-nogit-'));
    expect(await repoHead(plain)).toBeNull();
    await rm(plain, { recursive: true, force: true });
  });
});
