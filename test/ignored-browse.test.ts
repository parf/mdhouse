import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRules, loadRootRules } from '../src/lib/ignore';
import { Prefs } from '../src/lib/prefs';
import { Registry, type Root } from '../src/lib/roots';
import { scanRoot } from '../src/lib/scan';
import { parseReveal, REVEAL, Store } from '../src/lib/store';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'ignore' });

let base: string;
let dir: string;
let outside: string;

const put = async (rel: string, body = '# x\n') => {
  await mkdir(join(dir, rel, '..'), { recursive: true });
  await writeFile(join(dir, rel), body);
};

/**
 * A repository with every kind of hidden Markdown: gitignored folders (`.ai-team/`, `tmp/`) and
 * files, tracked `vendor/` (a built-in default), an explicit `.mdhouseignore` name (`secret`),
 * and symlinks out of the root and into the explicit folder.
 */
beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-reveal-')));
  dir = join(base, 'repo');
  outside = join(base, 'outside');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'o.md'), '# outside\n');
  await mkdir(dir);
  git(dir, 'init', '-q');
  await writeFile(join(dir, '.gitignore'), '.ai-team/\ntmp/\n*.local.md\n');
  await writeFile(join(dir, '.mdhouseignore'), 'secret\n!.git\n');
  for (const f of ['a.md', 'docs/d.md', 'vendor/pkg/v.md', 'vendor/pkg/node_modules/n.md', 'secret/s.md', 'private/p.md', 'docs/private/q.md']) await put(f);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  for (const f of ['.ai-team/w1/plan.md', 'tmp/t.md', 'tmp/node_modules/z.md', 'docs/x.local.md']) await put(f);
  await symlink(outside, join(dir, 'tmp', 'out'));
  await symlink(join(dir, 'secret'), join(dir, 'tmp', 'alias'));
  await symlink(join(dir, 'secret'), join(dir, 'secret-alias'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const storeFor = async (opts: { extraDeny?: string[] } = {}) => {
  const registry = await Registry.create([dir]);
  const prefs = await Prefs.load(join(base, `prefs-${Math.random()}.json`));
  return { store: new Store(registry, prefs, opts), root: registry.list()[0]! as Root };
};
const rels = (files: { rel: string }[]) => files.map((f) => f.rel);
const ignoredRels = (files: { rel: string; ignored?: boolean }[]) => files.filter((f) => f.ignored).map((f) => f.rel);

describe('rules', () => {
  test('.git stays denied whatever .mdhouseignore says; explicit names are told apart from defaults', async () => {
    const rules = await loadRootRules(dir);
    expect(rules.deny.has('.git')).toBe(true);
    expect(rules.explicit.has('.git')).toBe(true);
    expect(rules.explicit.has('secret')).toBe(true);
    expect(rules.explicit.has('vendor')).toBe(false);
    expect(defaultRules(['private']).explicit.has('private')).toBe(true);
  });
});

describe('parseReveal', () => {
  test('root-relative directories; a trailing slash is dropped', () => {
    expect(parseReveal(['a', 'b/c/', '.ai-team/'])).toEqual(['a', 'b/c', '.ai-team']);
    expect(parseReveal([])).toEqual([]);
  });

  test.each([[''], ['/'], ['/etc'], ['../x'], ['a/../b'], ['a/./b'], ['.'], ['a//b'], ['a\0b']])('refuses %p, never normalizes it', (v) => {
    expect(parseReveal([v])).toBeTypeOf('string');
  });

  test('bounds: count, bytes per scope, bytes in all', () => {
    expect(parseReveal(Array.from({ length: REVEAL.scopes + 1 }, (_, i) => `d${i}`))).toBeTypeOf('string');
    expect(parseReveal(['é'.repeat(513)])).toBeTypeOf('string');
    expect(parseReveal(Array.from({ length: 17 }, () => 'x'.repeat(1000)))).toBeTypeOf('string');
    expect(parseReveal(['x'.repeat(1024)])).toEqual(['x'.repeat(1024)]);
  });
});

describe('tree — show ignored and revealed scopes', () => {
  test('default: no ignored file, hasIgnored from git, defaults and explicit names hidden', async () => {
    const { store, root } = await storeFor();
    const t = await store.tree(root, false);
    expect(rels(t.files)).toEqual(['a.md', 'docs/d.md', 'docs/private/q.md', 'private/p.md']);
    expect(t.hasIgnored).toBe(true);
    expect(t.revealed).toEqual([]);
    expect(t.capped).toEqual([]);
  });

  test('show ignored: actual gitignored files marked, still without built-in or explicit folders', async () => {
    const { store, root } = await storeFor();
    const t = await store.tree(root, true);
    expect(ignoredRels(t.files)).toEqual(['.ai-team/w1/plan.md', 'docs/x.local.md', 'tmp/t.md']);
    expect(rels(t.files)).not.toContain('tmp/node_modules/z.md');
    expect(rels(t.files)).not.toContain('secret/s.md');
    expect(t.hasIgnored).toBe(true);
  });

  test('a revealed ignored folder lists its contents with the toggle off', async () => {
    const { store, root } = await storeFor();
    const t = await store.tree(root, false, ['.ai-team']);
    expect(t.revealed).toEqual(['.ai-team']);
    expect(ignoredRels(t.files)).toEqual(['.ai-team/w1/plan.md']);
    expect(rels(t.files)).not.toContain('tmp/t.md');
  });

  test('tmp: ignored contents shown; nested defaults kept; symlinks out of the root or into an explicit folder never', async () => {
    const { store, root } = await storeFor();
    const t = await store.tree(root, false, ['tmp']);
    expect(rels(t.files).filter((r) => r.startsWith('tmp/'))).toEqual(['tmp/t.md']);
    expect(ignoredRels(t.files)).toEqual(['tmp/t.md']);
  });

  test('a deliberate vendor scope: the scope path is lifted, nested defaults are not; tracked files are not "ignored"', async () => {
    const { store, root } = await storeFor();
    expect(rels((await store.tree(root, true)).files)).not.toContain('vendor/pkg/v.md');
    const t = await store.tree(root, false, ['vendor/pkg']);
    expect(rels(t.files).filter((r) => r.startsWith('vendor/'))).toEqual(['vendor/pkg/v.md']);
    expect(t.files.find((f) => f.rel === 'vendor/pkg/v.md')!.ignored).toBeUndefined();
    const deeper = await store.tree(root, false, ['vendor/pkg/node_modules']);
    expect(rels(deeper.files)).toContain('vendor/pkg/node_modules/n.md');
  });

  test.each([
    ['.git'],
    ['secret'],
    ['secret-alias'],
    ['tmp/alias'],
    ['tmp/out'],
    ['docs/d.md'],
    ['missing'],
  ])('%p is refused: left out of revealed, nothing added', async (scope) => {
    const { store, root } = await storeFor();
    const plain = rels((await store.tree(root, false)).files);
    const t = await store.tree(root, false, [scope]);
    expect(t.revealed).toEqual([]);
    expect(rels(t.files)).toEqual(plain);
  });

  test('a CLI exclusion is never lifted by a scope, at its own path or below one', async () => {
    const { store, root } = await storeFor({ extraDeny: ['private'] });
    const t = await store.tree(root, false, ['private', 'docs']);
    expect(t.revealed).toEqual(['docs']);
    expect(rels(t.files)).not.toContain('private/p.md');
    expect(rels(t.files)).not.toContain('docs/private/q.md');
    expect(rels(t.files)).toContain('docs/x.local.md');
  });

  test('scopes are deduped by their canonical path and sorted', async () => {
    const { store, root } = await storeFor();
    const t = await store.tree(root, false, ['tmp', '.ai-team', 'tmp/', '.ai-team/w1']);
    expect(t.revealed).toEqual(['.ai-team', '.ai-team/w1', 'tmp']);
    expect(new Set(rels(t.files)).size).toBe(t.files.length);
  });

  test('scope scans are cached least-recently-used, bounded, and dropped with the root', async () => {
    const { store, root } = await storeFor();
    const many = Array.from({ length: 70 }, (_, i) => `many/d${i}`);
    for (const d of many) await put(`${d}/f.md`);
    try {
      for (let i = 0; i < many.length; i += REVEAL.scopes) await store.tree(root, false, many.slice(i, i + REVEAL.scopes));
      const scopes = (store as unknown as { state: Map<string, { scopes: Map<string, unknown> }> }).state.get(root.id)!.scopes;
      expect(scopes.size).toBe(REVEAL.cached);
      expect(scopes.has('many/d69')).toBe(true);
      expect(scopes.has('many/d0')).toBe(false);
      store.invalidate(root.id);
      expect(scopes.size).toBe(0);
    } finally {
      await rm(join(dir, 'many'), { recursive: true, force: true });
    }
  });

  test('hasIgnored: false when the only ignored Markdown is under a default or explicit folder', async () => {
    const plain = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-reveal-none-')));
    try {
      git(plain, 'init', '-q');
      await writeFile(join(plain, '.gitignore'), 'build/\nsecret/\n');
      await writeFile(join(plain, '.mdhouseignore'), 'secret\n');
      await writeFile(join(plain, 'a.md'), '# a\n');
      await mkdir(join(plain, 'build'));
      await writeFile(join(plain, 'build', 'b.md'), '# b\n');
      await mkdir(join(plain, 'secret'));
      await writeFile(join(plain, 'secret', 's.md'), '# s\n');
      const registry = await Registry.create([plain]);
      const store = new Store(registry, await Prefs.load(join(plain, '..', `p-${Math.random()}.json`)));
      const root = registry.list()[0]!;
      expect((await store.tree(root, false)).hasIgnored).toBe(false);
      expect((await store.tree(root, true)).hasIgnored).toBe(false);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

test('scanRoot: a limit caps the list and says so', async () => {
  const r = await scanRoot({ path: dir } as Root, await loadRootRules(dir), { includeIgnored: true, limit: 2 });
  expect(r.files).toHaveLength(2);
  expect(r.capped).toBe(true);
  expect((await scanRoot({ path: dir } as Root, await loadRootRules(dir))).capped).toBeUndefined();
});

describe('routes', () => {
  test('/api/tree takes repeated reveal; malformed is 400. /api/files keeps .git, explicit names and the jail', async () => {
    const { serve } = await import('../src/server');
    const registry = await Registry.create([dir]);
    const id = registry.list()[0]!.id;
    const port = 61746;
    const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs-route.json')), port, hostname: '127.0.0.1' });
    const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
    try {
      const t = await get(`/api/tree?root=${id}&reveal=.ai-team/&reveal=secret`);
      expect(t.status).toBe(200);
      const body = (await t.json()) as { revealed: string[]; hasIgnored: boolean; capped: string[]; files: { rel: string }[] };
      expect(body.revealed).toEqual(['.ai-team']);
      expect(body.hasIgnored).toBe(true);
      expect(rels(body.files)).toContain('.ai-team/w1/plan.md');
      for (const bad of ['../x', '%2Fetc', 'a%00b', 'a/./b']) expect((await get(`/api/tree?root=${id}&reveal=${bad}`)).status).toBe(400);

      // the folder ALL view: the tracked explicit folder is not listed, and not listable
      const all = (await (await get(`/api/files?p=${id}`)).json()) as { files: { rel: string }[] };
      expect(rels(all.files)).toContain('docs/d.md');
      expect(rels(all.files).filter((r) => r.startsWith('secret/') || r.startsWith('secret-alias'))).toEqual([]);
      for (const p of ['secret', 'secret/', '.git', 'secret-alias', 'tmp/alias']) expect((await get(`/api/files?p=${id}/${p}`)).status).toBe(404);
      expect((await get(`/api/files?p=${id}/tmp/out`)).status).toBe(403);
      const tmp = (await (await get(`/api/files?p=${id}/tmp`)).json()) as { files: { rel: string }[] };
      // its own walk skips node_modules, and symlinked folders are not followed
      expect(rels(tmp.files)).toEqual(['tmp/t.md']);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
    }
  });
});
