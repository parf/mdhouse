import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Watcher, type WatchEvent } from '../src/lib/watch';
import { gitDirs } from '../src/lib/git';
import type { Root } from '../src/lib/roots';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'ignore' });

/** The kinds of event a commit in `root` sets off, when the root is watched as the server does it. */
async function eventsOfCommit(path: string, commitIn: string): Promise<string[]> {
  const root: Root = { id: 'r', name: 'r', path, writable: false };
  const events: WatchEvent[] = [];
  const watcher = new Watcher((e) => events.push(...e));
  try {
    watcher.watchRoot(root);
    watcher.watchRepo(root, await gitDirs(path));
    await Bun.sleep(150);
    writeFileSync(join(path, 'a.md'), 'edited\n');
    await Bun.sleep(300);
    events.length = 0;
    git(commitIn, 'commit', '-qam', 'edit');
    await Bun.sleep(400);
    return events.map((e) => e.kind);
  } finally {
    watcher.close();
  }
}

test('a commit sets off a git event: in a linked worktree, and in a folder of a checkout', async () => {
  const base = mkdtempSync(join(tmpdir(), 'mdhouse-watch-'));
  try {
    const main = join(base, 'main');
    mkdirSync(join(main, 'docs'), { recursive: true });
    git(main, 'init', '-q');
    writeFileSync(join(main, 'a.md'), 'a\n');
    writeFileSync(join(main, 'docs', 'a.md'), 'a\n');
    git(main, 'add', '.');
    git(main, 'commit', '-qm', 'init');
    const wt = join(base, 'wt');
    git(main, 'worktree', 'add', '-q', wt);

    expect(await eventsOfCommit(wt, wt)).toContain('git');
    expect(await eventsOfCommit(join(main, 'docs'), main)).toContain('git');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('an edited .mdhouseignore or .gitignore sets off an fs event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdhouse-watch-ign-'));
  const root: Root = { id: 'r', name: 'r', path: dir, writable: false };
  const events: WatchEvent[] = [];
  const watcher = new Watcher((e) => events.push(...e));
  try {
    mkdirSync(join(dir, 'sub'));
    watcher.watchRoot(root);
    await Bun.sleep(150);
    writeFileSync(join(dir, '.mdhouseignore'), 'drafts\n');
    writeFileSync(join(dir, 'sub', '.gitignore'), 'tmp/\n');
    writeFileSync(join(dir, 'other.txt'), 'x\n');
    await Bun.sleep(400);
    expect(events.flatMap((e) => (e.kind === 'fs' ? e.paths : [])).sort()).toEqual(['.mdhouseignore', 'sub/.gitignore']);
  } finally {
    watcher.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
