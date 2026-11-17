import { describe, expect, test } from 'bun:test';
import { buildTree, type Node, type DirNode } from '../src/ui/tree-model';
import type { FileEntry } from '../src/lib/store';

const file = (rel: string): FileEntry => {
  const slash = rel.lastIndexOf('/');
  return {
    rel,
    name: rel.slice(slash + 1),
    dir: slash === -1 ? '' : rel.slice(0, slash),
  } as FileEntry;
};

/** `[dir/name, [children]]` — enough shape to assert on, without the FileEntry noise. */
const shape = (n: Node): unknown => (n.kind === 'dir' ? { [n.name]: n.children.map(shape) } : n.name);

describe('shaping the flat file list into a tree', () => {
  test('a chain with nothing else in it collapses to one row', () => {
    expect(buildTree([file('a/b/c.md')]).map(shape)).toEqual([{ 'a/b': ['c.md'] }]);
  });

  test('the folded-away directory does not come back as a child', () => {
    // The bug this guards: collapsing produced `a/b`, then the walk descended into the
    // *uncollapsed* children and re-added `b` inside it, so the sidebar showed the same
    // directory twice, nested in itself.
    const [root] = buildTree([file('Plans/PRF-55/TODO.md'), file('Plans/PRF-55/DONE.md')]) as DirNode[];

    expect(root!.name).toBe('Plans/PRF-55');
    expect(root!.children.every((c) => c.kind === 'file')).toBe(true);
    expect(root!.children.map((c) => c.name)).toEqual(['DONE.md', 'TODO.md']);
  });

  test('a directory with two children is not collapsed into either', () => {
    expect(buildTree([file('a/b/one.md'), file('a/c/two.md')]).map(shape)).toEqual([
      { a: [{ b: ['one.md'] }, { c: ['two.md'] }] },
    ]);
  });

  test('a long chain folds all the way down, once', () => {
    expect(buildTree([file('a/b/c/d/leaf.md')]).map(shape)).toEqual([{ 'a/b/c/d': ['leaf.md'] }]);
  });
});

describe('order at each level', () => {
  const marked = (rel: string, ...marks: string[]) => ({ ...file(rel), marks } as FileEntry);
  test('folders first, then favorite files, then other files, then muted ones — at the root and inside a folder', () => {
    const files = [
      marked('README.md', 'favorite'),
      file('a.md'),
      marked('z.md', 'muted'),
      file('docs/x.md'),
      file('docs/sub/y.md'),
      file('docs/sub/y2.md'),
      marked('docs/fav.md', 'favorite'),
      file('src/b.md'),
    ];
    expect(buildTree(files).map(shape)).toEqual([
      { docs: [{ sub: ['y.md', 'y2.md'] }, 'fav.md', 'x.md'] },
      { src: ['b.md'] },
      'README.md',
      'a.md',
      'z.md',
    ]);
  });
});
