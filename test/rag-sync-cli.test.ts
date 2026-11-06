import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXCLUDE_GLOBS, EXIT, inventory, main, parsePlanArgs, planInput } from '../src/rag-sync-cli';

const base = mkdtempSync(join(tmpdir(), 'mdhouse-rag-sync-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
const tree = (files: Record<string, string>) => {
  const root = join(base, `t${++n}`);
  mkdirSync(root);
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => void out.push(t), err: (t: string) => void err.push(t) } };
};

const TARGET = ['--filescan', '#filescan@box', '--rag', '#rag@box', '--namespace', 'notes', '--table', 'md'];

// Any network attempt fails the test that made it.
const realFetch = globalThis.fetch;
let fetched = 0;
beforeEach(() => {
  fetched = 0;
  globalThis.fetch = (() => {
    fetched++;
    throw new Error('network');
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  expect(fetched).toBe(0);
});

describe('parsePlanArgs', () => {
  test('takes the five flags in both forms', () => {
    const a = parsePlanArgs(['--root', '/x', '--filescan=#f@h', '--rag', '#r@h', '--namespace=ns', '--table', 't_1']);
    expect(a).toEqual({ root: '/x', filescan: '#f@h', rag: '#r@h', namespace: 'ns', table: 't_1' });
  });

  test.each([
    [['--root', '/x', ...TARGET, '--token=SECRET'], 'unknown option --token'],
    [['--root', '/x', ...TARGET, 'SECRET'], 'unexpected argument 11'],
    [['--root', '/x', ...TARGET, '--Tok=SECRET'], 'unexpected argument 11'],
    [['--root', '/x', '--root', '/y', ...TARGET], '--root given twice'],
    [TARGET, '--root is required'],
    [['--root', '/x', ...TARGET.slice(0, 7), 'SECRET table'], '--table must be'],
    [['--root', '/x', '--filescan', 'SECRET', ...TARGET.slice(2)], '--filescan is not an agent name'],
  ])('refuses %p without echoing a value', (args, msg) => {
    expect(() => parsePlanArgs(args)).toThrow(msg);
    try {
      parsePlanArgs(args);
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRET');
    }
  });
});

describe('inventory', () => {
  test('lists *.md by metadata, sorted; skips dot entries and dependency trees at any depth', async () => {
    const root = tree({
      'a.md': '# a',
      'b.txt': 'x',
      'sub/c.MD': 'cc',
      '.hidden.md': 'h',
      '.git/x.md': 'g',
      'node_modules/p/r.md': 'n',
      'sub/deep/bower_components/r.md': 'b',
      'sub/jspm_packages/r.md': 'j',
    });
    const inv = await inventory(root);
    expect(inv.complete).toBe(true);
    expect(inv.issues).toEqual([]);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md', 'sub/c.MD']);
    expect(inv.sources[0]).toEqual({ path: 'a.md', size: 3, mtimeMs: statSync(join(root, 'a.md')).mtimeMs });
    const rst = statSync(root, { bigint: true });
    expect(inv.root).toEqual({ path: root, dev: String(rst.dev), ino: String(rst.ino) });
  });

  test('never follows symlinks or special files: unsupported issues, incomplete', async () => {
    const outside = tree({ 'secret.md': 's' });
    const root = tree({ 'a.md': 'a', 'd/b.md': 'b' });
    symlinkSync(join(outside, 'secret.md'), join(root, 'out.md'));
    symlinkSync(join(root, 'a.md'), join(root, 'in.md'));
    symlinkSync(outside, join(root, 'dirlink'));
    spawnSync('mkfifo', [join(root, 'pipe.md')]);
    const inv = await inventory(root);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md', 'd/b.md']);
    expect(inv.issues).toEqual([
      { path: 'dirlink', reason: 'unsupported' },
      { path: 'in.md', reason: 'unsupported' },
      { path: 'out.md', reason: 'unsupported' },
      { path: 'pipe.md', reason: 'unsupported' },
    ]);
    expect(inv.complete).toBe(false);
  });

  test('a root given through a symlink is listed by its real path', async () => {
    const root = tree({ 'a.md': 'a' });
    const link = join(base, `link${++n}`);
    symlinkSync(root, link);
    const inv = await inventory(link);
    expect(inv.root.path).toBe(root);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md']);
  });

  test('bounds stop the walk with a limit issue, never a silent cut', async () => {
    const root = tree({ 'a.md': '', 'b.md': '', 'c.md': '', 'd/e/f/g.md': '' });
    const files = await inventory(root, { files: 2, dirs: 50, depth: 32 });
    expect(files.sources.map((s) => s.path)).toEqual(['a.md', 'b.md']);
    expect(files.issues).toEqual([{ path: 'c.md', reason: 'limit' }]);
    expect(files.complete).toBe(false);
    const depth = await inventory(root, { files: 50, dirs: 50, depth: 1 });
    expect(depth.issues).toEqual([{ path: 'd/e', reason: 'limit' }]);
    expect(depth.complete).toBe(false);
    const dirs = await inventory(root, { files: 50, dirs: 2, depth: 32 });
    expect(dirs.issues).toEqual([{ path: 'd/e', reason: 'limit' }]);
  });

  test.skipIf(process.getuid?.() === 0)('an unreadable directory is an issue; the rest is listed', async () => {
    const root = tree({ 'a.md': '', 'locked/b.md': '' });
    const { chmodSync } = await import('node:fs');
    chmodSync(join(root, 'locked'), 0o000);
    try {
      const inv = await inventory(root);
      expect(inv.sources.map((s) => s.path)).toEqual(['a.md']);
      expect(inv.issues).toEqual([{ path: 'locked', reason: 'unreadable' }]);
      expect(inv.complete).toBe(false);
    } finally {
      chmodSync(join(root, 'locked'), 0o755);
    }
  });

  test('refuses a root that is not a directory', async () => {
    const root = tree({ 'a.md': '' });
    await expect(inventory(join(root, 'a.md'))).rejects.toThrow('--root is not a readable directory');
    await expect(inventory(join(root, 'missing'))).rejects.toThrow('--root is not a readable directory');
  });
});

test('planInput carries the agreed planner fields', async () => {
  const root = tree({ 'a.md': 'a' });
  const inv = await inventory(root);
  const args = parsePlanArgs(['--root', root, ...TARGET]);
  expect(planInput(args, inv, '#mdhouse@box')).toEqual({
    caller: '#mdhouse@box',
    target: { filescan: '#filescan@box', rag: '#rag@box', namespace: 'notes', table: 'md' },
    root: inv.root,
    include: ['*.md'],
    exclude: ['**/.*', '**/node_modules/**', '**/bower_components/**', '**/jspm_packages/**'],
    inventory: { root: inv.root, complete: true, issues: [] },
    sources: inv.sources,
    oversizeLimit: 32768,
  });
  expect(EXCLUDE_GLOBS).toEqual(planInput(args, inv, 'x').exclude);
});

describe('main', () => {
  test('help: exit 0; no command: help on exit 2', async () => {
    const a = io();
    expect(await main(['--help'], a.io)).toBe(EXIT.ok);
    expect(a.out.join('')).toContain('mdhouse-rag-sync plan --root');
    const b = io();
    expect(await main([], b.io)).toBe(EXIT.usage);
  });

  test.each(['sync', 'search'])('%s is not wired: exit 3, does nothing, echoes nothing', async (cmd) => {
    const root = tree({ 'a.md': '' });
    const a = io();
    expect(await main([cmd, '--root', root, '--key', 'SECRET'], a.io)).toBe(EXIT.notWired);
    expect(JSON.parse(a.out.join(''))).toEqual({ error: 'not-wired', command: cmd, effects: 'none' });
    expect(a.err.join('') + a.out.join('')).not.toContain('SECRET');
  });

  test('an unknown command or bad flag is usage, without echoing it', async () => {
    const a = io();
    expect(await main(['SECRET'], a.io)).toBe(EXIT.usage);
    const b = io();
    expect(await main(['plan', '--root', '/x', ...TARGET, '--token=SECRET'], b.io)).toBe(EXIT.usage);
    expect(a.err.join('') + b.err.join('')).not.toContain('SECRET');
  });

  test('plan prints JSON; exit 0 when complete, 1 with issues', async () => {
    const root = tree({ 'a.md': 'a' });
    const a = io();
    expect(await main(['plan', '--root', root, ...TARGET], a.io)).toBe(EXIT.ok);
    const plan = JSON.parse(a.out.join(''));
    expect(plan).toMatchObject({ kind: 'local-plan-only', execution: 'not-performed', root: { path: root } });
    expect(plan.coverage).toMatchObject({ status: 'metadata-only', inventoryComplete: true, total: 1, eligible: 1, issues: 0 });
    expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);
    symlinkSync(join(root, 'a.md'), join(root, 'l.md'));
    const b = io();
    expect(await main(['plan', '--root', root, ...TARGET], b.io)).toBe(EXIT.runtime);
    expect(JSON.parse(b.out.join('')).coverage).toMatchObject({ status: 'partial', issues: 1 });
    expect(b.err.join('')).toContain('incomplete');
  });

  test('plan never reads file content', async () => {
    const root = tree({ 'a.md': 'CONTENT-MARKER' });
    const a = io();
    await main(['plan', '--root', root, ...TARGET], a.io);
    expect(a.out.join('')).not.toContain('CONTENT-MARKER');
  });

  test('a missing root is exit 1', async () => {
    const a = io();
    expect(await main(['plan', '--root', join(base, 'nope'), ...TARGET], a.io)).toBe(EXIT.runtime);
  });
});

test('the bin runs under Bun: help 0, sync 3', () => {
  const bin = join(import.meta.dir, '../bin/mdhouse-rag-sync');
  expect(spawnSync(bin, ['--help'], { encoding: 'utf8' }).status).toBe(0);
  const r = spawnSync(bin, ['sync'], { encoding: 'utf8' });
  expect(r.status).toBe(3);
  expect(r.stderr).toContain('not wired');
});
