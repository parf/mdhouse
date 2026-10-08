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
