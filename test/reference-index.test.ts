import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const doc = resolve(import.meta.dir, '../doc');
const index = readFileSync(join(doc, 'README.md'), 'utf8');

/** The local targets of README.md's links, anchors dropped, in order. */
const targets = [...index.matchAll(/\]\(([^)\s#?]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((t) => !/^[a-z]+:/i.test(t));

/** Every Markdown file of the reference but the index and the flow packages' own files, which flows/README.md and catalog.json own. */
const documents = [...new Bun.Glob('**/*.md').scanSync({ cwd: doc, onlyFiles: true })]
  .filter((f) => f !== 'README.md' && !/^flows\/[^/]+\//.test(f))
  .sort();

describe('doc/README.md is the one start file', () => {
  test('lists only files that exist', () => {
    expect(targets.length).toBeGreaterThan(10);
    for (const t of targets) expect([t, existsSync(join(doc, t))]).toEqual([t, true]);
  });

  test('links every document of the reference exactly once', () => {
    for (const f of documents) expect([f, targets.filter((t) => t === f).length]).toEqual([f, 1]);
  });

  test('says where it lives and that nothing is written here', () => {
    expect(index).toContain('read-only reference');
    expect(index).toContain('Never write here');
    expect(index).toContain('/api/raw?p=_mdhouse/<file>');
  });
});
