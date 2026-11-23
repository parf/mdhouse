import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GITHUB_RAW } from '../src/lib/docs-cmd';

const doc = resolve(import.meta.dir, '../agents');
const index = readFileSync(join(doc, 'README.md'), 'utf8');

/** The local targets of README.md's links, anchors dropped, in order. */
const targets = [...index.matchAll(/\]\(([^)\s#?]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((t) => !/^[a-z]+:/i.test(t));

/** Reference docs other than the entry point, its legacy pointer and the assets listed by the flow catalog. */
const documents = [...new Bun.Glob('**/*.md').scanSync({ cwd: doc, onlyFiles: true })]
  .filter((f) => f !== 'README.md' && f !== 'for-agents.md' && !/^flows\/[^/]+\//.test(f))
  .sort();

describe('agents/README.md is the one start file', () => {
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
  test('covers plans, glyphs and markup in a short guide', () => {
    expect(index.split('\n').length).toBeLessThanOrEqual(40);
    for (const t of ['plans.md', 'skills/glyphs.md', 'agent-markup.md', 'https://github.com/parf/mdhouse/blob/main/doc/syntax.md']) expect(index).toContain(`](${t})`);
  });
  test('the project README and earlier entry points direct agents to the same guide', () => {
    const projectReadme = readFileSync(join(doc, '../README.md'), 'utf8');
    expect(projectReadme.split('**TL;DR**')[0]).toContain(GITHUB_RAW);
    expect(projectReadme.match(/agents\/[^\s)<>]+\.md/g)).toEqual(['agents/README.md']);
    for (const path of ['for-agents.md', '../doc/for-agents.md']) {
      expect(readFileSync(join(doc, path), 'utf8')).toContain(GITHUB_RAW);
    }
  });
});
