import { describe, expect, test } from 'bun:test';
import { allEntries } from '../src/ui/sidebar-kind';

const f = (rel: string, extra: object = {}) => ({ rel, name: rel.split('/').pop()!, dir: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '', mtime: 1, size: 10, ...extra });

describe('allEntries', () => {
  test('a listed Markdown file keeps the MD tree entry; other files come as listed', () => {
    const md = [f('a.md', { marks: ['favorite'] })];
    const out = allEntries([f('a.md'), f('img/x.png')], md);
    expect(out.map((e) => e.rel)).toEqual(['a.md', 'img/x.png']);
    expect(out[0]!.marks).toEqual(['favorite']);
  });
  test('MD files the listing leaves out (ignored, shown) stay in ALL', () => {
    const out = allEntries([f('b.txt')], [f('gen/c.md', { ignored: true })]);
    expect(out.map((e) => e.rel).sort()).toEqual(['b.txt', 'gen/c.md']);
  });
});
