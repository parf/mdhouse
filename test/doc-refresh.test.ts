import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertLegacy } from '../src/lib/legacy';
import { Prefs } from '../src/lib/prefs';
import { splitFrontmatter } from '../src/lib/render';
import { Registry } from '../src/lib/roots';
import { Store } from '../src/lib/store';
import { testPort } from './ports';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'pipe', stderr: 'ignore' });
const head = (cwd: string) => git(cwd, 'rev-parse', 'HEAD').stdout.toString().trim();
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const DOC = '---\ntitle: t\n---\n# Doc\n\n> q: Who?\n> a: nobody\n';

let base: string;
let repo: string;
let nested: string;
let loose: string;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-docrefresh-')));
  repo = join(base, 'repo');
  nested = join(repo, 'sub', 'inner');
  loose = join(base, 'loose');
  await mkdir(nested, { recursive: true });
  await mkdir(join(loose, 'r'), { recursive: true });
  git(repo, 'init', '-q');
  await writeFile(join(repo, 'a.md'), DOC);
  await writeFile(join(repo, 'c.ts'), 'export const x = 1;\n');
  await writeFile(join(repo, 'i.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  await writeFile(join(repo, 'big.txt'), Buffer.alloc(5_000_001, 'a'));
  await mkdir(join(repo, 'dir'));
  await writeFile(join(repo, 'dir', 'x.md'), '# x\n');
  git(repo, 'add', 'a.md', 'c.ts', 'dir/x.md');
  git(repo, 'commit', '-qm', 'init');
  await writeFile(join(repo, 'c.ts'), 'export const x = 2;\n');
  await writeFile(join(repo, 'dir', 'x.md'), '# x changed\n');
  git(nested, 'init', '-q');
  await writeFile(join(nested, 'n.md'), '# n\n');
  git(nested, 'add', 'n.md');
  git(nested, 'commit', '-qm', 'n');
  await writeFile(join(loose, 'l.md'), '# l\n');
  git(join(loose, 'r'), 'init', '-q');
  await writeFile(join(loose, 'r', 'u.md'), '# u\n');
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('Store.gitRevision', () => {
  const open = async (dir: string, noGit = false) => {
    const registry = await Registry.create([dir]);
    return { store: new Store(registry, await Prefs.load(join(base, `p-${Math.random()}.json`)), { noGit }), root: registry.list()[0]! };
  };

  test('the innermost owning repository, cached until an invalidate', async () => {
    const { store, root } = await open(repo);
    expect(await store.gitRevision(root, 'a.md')).toBe(head(repo));
    expect(await store.gitRevision(root, 'c.ts')).toBe(head(repo));
    expect(await store.gitRevision(root, 'sub/inner/n.md')).toBe(head(nested));
    const before = head(repo);
    await writeFile(join(repo, 'later.md'), '# later\n');
    git(repo, 'add', 'later.md');
    git(repo, 'commit', '-qm', 'later');
    expect(head(repo)).not.toBe(before);
    expect(await store.gitRevision(root, 'a.md')).toBe(before);
    store.invalidate(root.id, true);
    expect(await store.gitRevision(root, 'a.md')).toBe(head(repo));
  });

  test('null without git, outside any repository and for an unborn HEAD', async () => {
    const off = await open(repo, true);
    expect(await off.store.gitRevision(off.root, 'a.md')).toBeNull();
    const { store, root } = await open(loose);
    expect(await store.gitRevision(root, 'l.md')).toBeNull();
    expect(await store.gitRevision(root, 'r/u.md')).toBeNull();
  });
});

test('route: /api/doc meta=1 and ifContent', async () => {
  const { serve: start } = await import('../src/server');
  const registry = await Registry.create([repo]);
  const id = registry.list()[0]!.id;
  const port = testPort(61748);
  const { server, watcher, control } = await start({ registry, prefs: await Prefs.load(join(base, 'p-route.json')), port, hostname: '127.0.0.1' });
  const res = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
  const get = async (path: string) => (await res(path)).json() as Promise<Record<string, unknown>>;
  const doc = (rel: string, q = '') => get(`/api/doc?p=${id}/${rel}${q}`);
  try {
    // full: the hash of the text the renderer takes — frontmatter in, legacy forms converted
    const full = await doc('a.md');
    const src = convertLegacy(DOC, splitFrontmatter(DOC).offset);
    expect(src).not.toBe(DOC);
    expect(full.contentHash).toBe(sha(src));
    expect(full.gitRevision).toBe(head(repo));
    expect(typeof full.actToken).toBe('string');
    expect(full.html).toBeTruthy();

    // meta: the metadata alone
    const meta = await doc('a.md', '&meta=1');
    expect(meta.meta).toBe(true);
    expect(meta.kind).toBe('md');
    expect(meta.gitRevision).toBe(head(repo));
    expect(meta.writable).toBe(full.writable);
    for (const k of ['html', 'actToken', 'contentHash', 'frontmatter', 'headings', 'unchanged']) expect(meta[k]).toBeUndefined();
    expect((await doc('dir/x.md', '&meta=1')).status).toBeDefined();
    expect(await doc('dir', '&meta=1')).toEqual({ folder: expect.any(String) });

    // ifContent: the same text answers unchanged, without a render
    const same = await doc('a.md', `&ifContent=${full.contentHash}`);
    expect(same.unchanged).toBe(true);
    expect(same.contentHash).toBe(full.contentHash);
    expect(same.gitRevision).toBe(head(repo));
    for (const k of ['html', 'actToken', 'headings', 'frontmatter']) expect(same[k]).toBeUndefined();
    const other = await doc('a.md', `&ifContent=${'0'.repeat(64)}`);
    expect(other.unchanged).toBeUndefined();
    expect(other.contentHash).toBe(full.contentHash);
    expect(typeof other.actToken).toBe('string');
    expect(other.actToken).not.toBe(full.actToken);

    // code: hashed text; images and too-big files have no hash and never answer unchanged
    const code = await doc('c.ts');
    expect(code.contentHash).toBe(sha('export const x = 2;\n'));
    expect((await doc('c.ts', `&ifContent=${code.contentHash}`)).unchanged).toBe(true);
    for (const rel of ['i.png', 'big.txt']) {
      const r = await doc(rel, `&ifContent=${sha('')}`);
      expect(r.contentHash).toBeUndefined();
      expect(r.unchanged).toBeUndefined();
    }
    expect((await doc('big.txt')).tooBig).toBe(true);

    // the nested repository's own HEAD
    expect((await doc('sub/inner/n.md', '&meta=1')).gitRevision).toBe(head(nested));

    // shapes and guards stay as they were
    for (const q of ['&ifContent=abc', `&ifContent=${'A'.repeat(64)}`, `&ifContent=${'0'.repeat(65)}`, `&meta=1&ifContent=${'0'.repeat(64)}`]) {
      expect((await res(`/api/doc?p=${id}/a.md${q}`)).status).toBe(400);
    }
    expect((await res(`/api/doc?p=${id}/.git/HEAD&meta=1`)).status).toBe(404);
    expect((await res(`/api/doc?p=${id}/nope.md&meta=1`)).status).toBe(404);
    expect((await res(`/api/doc?p=elsewhere/a.md&meta=1`)).status).toBe(403);
    const byUrl = await get(`/api/doc?d=${encodeURIComponent(full.url as string)}&meta=1`);
    expect(byUrl.rel).toBe('a.md');
    expect(byUrl.meta).toBe(true);
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
  }
});

test('route: gitRevision is null without git', async () => {
  const { serve: start } = await import('../src/server');
  const registry = await Registry.create([repo]);
  const id = registry.list()[0]!.id;
  const port = testPort(61749);
  const { server, watcher, control } = await start({ registry, prefs: await Prefs.load(join(base, 'p-nogit.json')), port, hostname: '127.0.0.1', noGit: true });
  try {
    const meta = (await (await fetch(`http://127.0.0.1:${port}/api/doc?p=${id}/a.md&meta=1`)).json()) as Record<string, unknown>;
    expect(meta.gitRevision).toBeNull();
    expect(meta.meta).toBe(true);
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
  }
});
