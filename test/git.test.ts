import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorship, fileHistory, recentChanges, workingDiff, workingStatus } from '../src/lib/git';
import { folderLog, trackedFiles } from '../src/lib/gitpage';

let repo = '';
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (...args: string[]) => Bun.spawnSync(['git', ...args], { cwd: repo, env, stdout: 'ignore', stderr: 'ignore' });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'mdhouse-names-'));
  git('init', '-q');
  for (const f of [':memo/a.md', 'memo/a.md', 'notes[1]/b.md', 'notes1/b.md']) {
    mkdirSync(join(repo, f, '..'), { recursive: true });
    writeFileSync(join(repo, f), 'v1\n');
  }
  git('add', '.');
  git('commit', '-qm', 'first');
  writeFileSync(join(repo, ':memo/a.md'), 'v2\n');
  writeFileSync(join(repo, 'notes[1]/b.md'), 'v2\n');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test('a folder named like pathspec magic or a glob: every git view sees it, and only it', async () => {
  for (const dir of [':memo', 'notes[1]']) {
    const file = dir === ':memo' ? 'a.md' : 'b.md';
    expect([...(await workingStatus(repo, join(repo, dir)))]).toEqual([[file, 'modified']]);
    expect((await recentChanges(repo, join(repo, dir))).map((c) => c.rel)).toEqual([file]);
    expect(await trackedFiles(repo, dir)).toEqual({ files: [`${dir}/${file}`], capped: false });
    expect((await folderLog(repo, dir)).map((c) => c.files.map((f) => f.path))).toEqual([[`${dir}/${file}`]]);
    expect((await fileHistory(repo, `${dir}/${file}`)).commits).toHaveLength(1);
    expect((await authorship(repo, `${dir}/${file}`)).created?.subject).toBe('first');
    expect((await workingDiff(repo, `${dir}/${file}`))?.added).toBe(1);
  }
});
