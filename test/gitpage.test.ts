import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitable, dirtyFiles, folderLog, hostOf, remoteState, run, suggestMessage, trackedFiles } from '../src/lib/gitpage';

describe('hostOf — the web address of a remote', () => {
  test('ssh and https, each host', () => {
    expect(hostOf('git@github.com:parf/mdhouse.git')).toMatchObject({ web: 'https://github.com/parf/mdhouse', kind: 'github' });
    expect(hostOf('https://github.com/parf/mdhouse')?.blob).toBe('https://github.com/parf/mdhouse/blob/{sha}/{path}');
    expect(hostOf('ssh://git@gitlab.example.com:2222/team/sub/repo.git')).toMatchObject({
      web: 'https://gitlab.example.com/team/sub/repo',
      commit: 'https://gitlab.example.com/team/sub/repo/-/commit/{sha}',
    });
    expect(hostOf('git@bitbucket.org:o/r.git')?.blob).toBe('https://bitbucket.org/o/r/src/{sha}/{path}');
    expect(hostOf('https://codeberg.org/o/r.git')?.blob).toBe('https://codeberg.org/o/r/src/commit/{sha}/{path}');
    expect(hostOf('https://git.example.com/o/r')).toMatchObject({ kind: 'guess', commit: 'https://git.example.com/o/r/commit/{sha}' });
  });
  test('not a web remote', () => {
    expect(hostOf('/srv/git/repo.git')).toBeNull();
    expect(hostOf('file:///srv/git/repo.git')).toBeNull();
    expect(hostOf('')).toBeNull();
  });
});

test('suggestMessage', () => {
  const f = (path: string) => ({ path, code: ' M', md: true });
  expect(suggestMessage([f('Plans/TODO.md')])).toBe('Update TODO.md');
  expect(suggestMessage([f('a.md'), f('b/a.md')])).toBe('Update a.md');
  expect(suggestMessage([f('a.md'), f('b.md')])).toBe('Update a.md, b.md');
  expect(suggestMessage([f('a'), f('b'), f('c'), f('d')])).toBe('');
});

describe('a real repo', () => {
  let base = '';
  let repo = '';
  const g = (...args: string[]) => run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'mdhouse-gitpage-'));
    repo = join(base, 'work');
    await run(base, ['init', '-q', '--bare', '-b', 'main', join(base, 'origin.git')]);
    await mkdir(join(repo, 'docs'), { recursive: true });
    await run(base, ['init', '-q', '-b', 'main', repo]);
    await writeFile(join(repo, 'docs/a.md'), 'a\n');
    await writeFile(join(repo, 'main.ts'), 'x\n');
    await g('add', '.');
    await g('commit', '-qm', 'first');
    await writeFile(join(repo, 'main.ts'), 'y\n');
    await g('commit', '-qam', 'code only');
    await g('remote', 'add', 'origin', join(base, 'origin.git'));
  });
  afterAll(() => rm(base, { recursive: true, force: true }));

  test('folderLog: every commit, any file type; a folder only its own', async () => {
    const all = await folderLog(repo, '');
    expect(all.map((c) => c.subject)).toEqual(['code only', 'first']);
    expect(all[0]!.files).toEqual([{ status: 'M', path: 'main.ts' }]);
    const docs = await folderLog(repo, 'docs');
    expect(docs.map((c) => c.subject)).toEqual(['first']);
    expect((await folderLog(repo, '', 1, 1)).map((c) => c.subject)).toEqual(['first']);
  });

  test('trackedFiles', async () => {
    expect(await trackedFiles(repo, '')).toEqual(['docs/a.md', 'main.ts']);
    expect(await trackedFiles(repo, 'docs')).toEqual(['docs/a.md']);
  });

  test('dirtyFiles and what commit -a takes', async () => {
    await writeFile(join(repo, 'docs/a.md'), 'a2\n');
    await writeFile(join(repo, 'new.txt'), 'n\n');
    const dirty = await dirtyFiles(repo);
    expect(dirty).toEqual([
      { path: 'docs/a.md', code: ' M', md: true },
      { path: 'new.txt', code: '??', md: false },
    ]);
    expect(commitable(dirty).map((f) => f.path)).toEqual(['docs/a.md']);
    await rm(join(repo, 'new.txt'));
    await g('checkout', '--', 'docs/a.md');
  });

  test('remoteState: none, ahead, same, new — by ls-remote, without fetching', async () => {
    expect((await remoteState(repo, 'main')).state).toBe('none'); // origin has no main yet
    await g('push', '-q', 'origin', 'main~1:refs/heads/main');
    expect(await remoteState(repo, 'main')).toMatchObject({ state: 'ahead', ahead: 1, behind: 0 });
    await g('push', '-q', 'origin', 'main');
    expect((await remoteState(repo, 'main')).state).toBe('same');
    // Someone else pushes a commit this checkout has never seen.
    const other = join(base, 'other');
    await run(base, ['clone', '-q', join(base, 'origin.git'), other]);
    await writeFile(join(other, 'x.md'), 'x\n');
    await run(other, ['-c', 'user.name=o', '-c', 'user.email=o@o', 'add', '.']);
    await run(other, ['-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '-qm', 'theirs']);
    await run(other, ['push', '-q']);
    expect((await remoteState(repo, 'main')).state).toBe('new');
    expect((await dirtyFiles(repo)).length).toBe(0); // ls-remote wrote nothing
  });
});

describe('syncState — how the branch stands with origin, without the network', () => {
  test('unpushed, pushed, ahead, pulled, a merge under way', async () => {
    const { syncState } = await import('../src/lib/gitpage');
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-sync-'));
    const repo = join(base, 'work');
    const g = (...args: string[]) => run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
    try {
      await run(base, ['init', '-q', '--bare', '-b', 'main', join(base, 'origin.git')]);
      await run(base, ['init', '-q', '-b', 'main', repo]);
      await g('remote', 'add', 'origin', join(base, 'origin.git'));
      await writeFile(join(repo, 'a.md'), 'a\n');
      await g('add', '.');
      await g('commit', '-qm', 'one');

      // Never pushed: no upstream, every commit is unpushed.
      let s = await syncState(repo, 'main');
      expect(s).toMatchObject({ upstream: null, last: null, ahead: 0, busy: null });
      expect(s.unpushed.map((c) => c.subject)).toEqual(['one']);

      await g('push', '-q', '-u', 'origin', 'main');
      s = await syncState(repo, 'main');
      expect(s.upstream).toBe('origin/main');
      expect(s.last?.way).toBe('pushed');
      expect(s.unpushed).toEqual([]);

      await writeFile(join(repo, 'a.md'), 'b\n');
      await g('commit', '-qam', 'two');
      s = await syncState(repo, 'main');
      expect(s.ahead).toBe(1);
      expect(s.unpushed.map((c) => c.subject)).toEqual(['two']);

      // Someone else pushes; we fetch: last exchange is now a pull, and we are behind.
      const other = join(base, 'other');
      await run(base, ['clone', '-q', join(base, 'origin.git'), other]);
      await writeFile(join(other, 'c.md'), 'c\n');
      await run(other, ['-c', 'user.name=o', '-c', 'user.email=o@o', 'add', '.']);
      await run(other, ['-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '-qm', 'theirs']);
      await run(other, ['push', '-q']);
      await Bun.sleep(1100); // reflog times are in seconds
      await g('fetch', '-q');
      s = await syncState(repo, 'main');
      expect(s).toMatchObject({ ahead: 1, behind: 1 });
      expect(s.last?.way).toBe('pulled');

      // A merge stopped on a conflict.
      await writeFile(join(other, 'a.md'), 'theirs\n');
      await run(other, ['-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '-qam', 'clash']);
      await run(other, ['push', '-q']);
      await g('pull', '-q', '--no-rebase', '--no-edit');
      expect((await syncState(repo, 'main')).busy).toBe('a merge is under way');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

test('agentSocket: the environment first, then the usual places', async () => {
  const { agentSocket } = await import('../src/lib/gitpage');
  expect(agentSocket({ SSH_AUTH_SOCK: '/tmp/a' }, () => false)).toBe('/tmp/a');
  const have = new Set(['/run/user/7/gcr/ssh']);
  expect(agentSocket({ XDG_RUNTIME_DIR: '/run/user/7' }, (p) => have.has(String(p)))).toBe('/run/user/7/gcr/ssh');
  expect(agentSocket({ XDG_RUNTIME_DIR: '/run/user/7' }, () => false)).toBeUndefined();
});
