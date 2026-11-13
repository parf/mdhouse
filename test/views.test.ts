import { describe, expect, test } from 'bun:test';
import { inView, inViewTab, MAX_REVEAL, noViews, revealNote, revealScopes, scopeOf, tabFiles, loadTab, saveTab, usableTab, toggle } from '../src/ui/views';
import { buildTree, type Node } from '../src/ui/tree-model';
import type { FileEntry } from '../src/lib/store';

describe('views', () => {
  test('inView: the file itself, or under a folder entry', () => {
    const entries = ['Plans/', 'README.md', 'a/b/'];
    expect(inView('Plans/TODO.md', entries)).toBe(true);
    expect(inView('Plans/x/y.md', entries)).toBe(true);
    expect(inView('README.md', entries)).toBe(true);
    expect(inView('a/b/c.md', entries)).toBe(true);
    // a name that only starts like a folder is not in it
    expect(inView('PlansOld/x.md', entries)).toBe(false);
    expect(inView('a/bc/x.md', entries)).toBe(false);
    expect(inView('doc/README.md', entries)).toBe(false);
    expect(inView('x.md', [])).toBe(false);
  });

  test('toggle: adds, or takes out', () => {
    expect(toggle(['a.md'], 'b/')).toEqual(['a.md', 'b/']);
    expect(toggle(['a.md', 'b/'], 'a.md')).toEqual(['b/']);
  });
});

describe('ignored browsing scopes', () => {
  test('scopeOf: folders only, no root, absolute or `..`', () => {
    expect(scopeOf('a/b/')).toBe('a/b');
    expect(scopeOf('.ai-team/')).toBe('.ai-team');
    for (const bad of ['a.md', '/', '', '/abs/', '../x/', 'a/../b/', 'a//b/', './', 'a/./b/']) expect(scopeOf(bad)).toBeNull();
  });

  test('revealScopes: the union of V1 and V2 folders, files left out, duplicates once, open folder first', () => {
    const views = { V1: ['x/', 'f.md', 'y/'], V2: ['y/', 'z/w/'] };
    expect(revealScopes(views)).toEqual({ scopes: ['x', 'y', 'z/w'], omitted: 0 });
    expect(revealScopes(views, 'y')).toEqual({ scopes: ['y', 'x', 'z/w'], omitted: 0 });
    expect(revealScopes({ V1: [], V2: [] })).toEqual({ scopes: [], omitted: 0 });
  });

  test('revealScopes: a view tab asks for its own folders (and the open folder) only', () => {
    const views = { V1: ['x/'], V2: ['y/'] };
    expect(revealScopes(views, null, 'V1').scopes).toEqual(['x']);
    expect(revealScopes(views, 'o', 'V2').scopes).toEqual(['o', 'y']);
    expect(revealScopes(views, null, null).scopes).toEqual(['x', 'y']);
  });

  test('revealScopes: the open folder is requested whatever the root holds, newlines in names stay distinct', () => {
    expect(revealScopes({ V1: [], V2: [] }, 'vendor').scopes).toEqual(['vendor']);
    expect(revealScopes({ V1: [], V2: [] }, '.ai-team/runs').scopes).toEqual(['.ai-team/runs']);
    const a = JSON.stringify(['r', revealScopes({ V1: ['a\nb/'], V2: [] }).scopes]);
    const b = JSON.stringify(['r', revealScopes({ V1: ['a/', 'b/'], V2: [] }).scopes]);
    expect(a).not.toBe(b);
  });

  test('revealScopes: over the limits, the rest is counted, not dropped silently', () => {
    const many = Array.from({ length: MAX_REVEAL + 3 }, (_, i) => `d${i}/`);
    const r = revealScopes({ V1: many, V2: [] });
    expect(r.scopes.length).toBe(MAX_REVEAL);
    expect(r.omitted).toBe(3);
    expect(revealScopes({ V1: [`${'é'.repeat(600)}/`], V2: [] })).toEqual({ scopes: [], omitted: 1 });
  });

  test('inViewTab: a view lists only its own entries; a revealed ignored file needs the global switch or its own folder', () => {
    const own = ['gen/'];
    const ign = { rel: 'gen/r.md', ignored: true };
    const other = { rel: 'tmp/r.md', ignored: true };
    expect(inViewTab(ign, own, false)).toBe(true);
    expect(inViewTab(other, own, false)).toBe(false);
    expect(inViewTab(other, own, true)).toBe(false);
    // an own folder lists what is ignored under it; an own file entry only with the global switch
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/'], false)).toBe(true);
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/r.md'], false)).toBe(false);
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/r.md'], true)).toBe(true);
    expect(inViewTab({ rel: 'a.md' }, ['a.md'], false)).toBe(true);
  });

  test('revealNote: null when complete, else says what is missing', () => {
    expect(revealNote(0)).toBeNull();
    expect(revealNote(0, [])).toBeNull();
    expect(revealNote(2)).toMatch(/2 selected folders not revealed/);
    expect(revealNote(0, ['big'])).toMatch(/big/);
  });
});


describe('a V tab is its selection only', () => {
  const f = (rel: string, extra: Partial<FileEntry> = {}): FileEntry => {
    const slash = rel.lastIndexOf('/');
    return { rel, name: rel.slice(slash + 1), dir: slash === -1 ? '' : rel.slice(0, slash), size: 100, mtime: 0, ...extra } as FileEntry;
  };
  const files = [
    f('README.md'),
    f('Plans/README.md'),
    f('Plans/TODO.md'),
    f('Plans/DONE.md'),
    f('Plans/R3/QA.md'),
    f('Plans/R3/workspaces/TODO.md'),
    f('doc/cli.md'),
    f('PlansOld/x.md'),
    f('Plans/empty.md', { size: 0 }),
    f('Plans/muted.md', { marks: ['muted'] }),
    f('Plans/hidden.md', { ignored: true }),
  ];
  const rels = (entries: string[] | null, showIgnored = false) => tabFiles(files, entries, showIgnored).map((x) => x.rel).sort();
  const paths = (nodes: Node[]): string[] => nodes.flatMap((n) => (n.kind === 'file' ? [n.path] : paths(n.children))).sort();

  test('one file: exactly that file, not its folder, not its siblings', () => {
    expect(rels(['Plans/TODO.md'])).toEqual(['Plans/TODO.md']);
    expect(paths(buildTree(tabFiles(files, ['Plans/TODO.md'], false)))).toEqual(['Plans/TODO.md']);
  });

  test('a folder: its files at any depth, no neighbour that only starts like it', () => {
    expect(rels(['Plans/R3/'])).toEqual(['Plans/R3/QA.md', 'Plans/R3/workspaces/TODO.md']);
    expect(rels(['Plans/'])).toEqual(['Plans/DONE.md', 'Plans/R3/QA.md', 'Plans/R3/workspaces/TODO.md', 'Plans/README.md', 'Plans/TODO.md', 'Plans/hidden.md']);
  });

  test('the tree: a selected file shows only its ancestor folders, a selected folder all its files', () => {
    const all = (nodes: Node[]): string[] => nodes.flatMap((n) => (n.kind === 'file' ? [n.path] : [n.path, ...all(n.children)])).sort();
    // a deep file: its folders to reach it, none of the sibling files or folders
    expect(all(buildTree(tabFiles(files, ['Plans/R3/workspaces/TODO.md'], false))).filter((x) => !x.endsWith('.md'))).toEqual(['Plans/R3/workspaces']);
    expect(all(buildTree(tabFiles(files, ['Plans/R3/workspaces/TODO.md'], false)))).toEqual(['Plans/R3/workspaces', 'Plans/R3/workspaces/TODO.md']);
    // a folder: every file at any depth
    expect(paths(buildTree(tabFiles(files, ['Plans/R3/'], false)))).toEqual(['Plans/R3/QA.md', 'Plans/R3/workspaces/TODO.md']);
    // a file and a folder: the folder's files plus only that file
    expect(paths(buildTree(tabFiles(files, ['Plans/R3/', 'Plans/TODO.md'], false)))).toEqual(['Plans/R3/QA.md', 'Plans/R3/workspaces/TODO.md', 'Plans/TODO.md']);
  });

  test('files and folders together; the other view does not count', () => {
    expect(rels(['README.md', 'doc/'])).toEqual(['README.md', 'doc/cli.md']);
    // V2 holds one file even though V1 holds its folder: the tab is built from its own entries only
    const views = { V1: ['Plans/'], V2: ['Plans/TODO.md'] };
    expect(rels(views.V2)).toEqual(['Plans/TODO.md']);
    expect(rels(views.V1)).toContain('Plans/DONE.md');
  });

  test('the open document, inside or outside the selection, adds nothing to the tab', () => {
    const views = { ...noViews(), V2: ['Plans/TODO.md'] };
    for (const open of ['Plans/TODO.md', 'Plans/DONE.md', 'doc/cli.md', null]) {
      const dir = open ? open.slice(0, Math.max(0, open.lastIndexOf('/'))) || null : null;
      // the open folder is revealed to the server (so its ignored files exist), and the tab still lists the selection only
      const { scopes } = revealScopes(views, dir, 'V2');
      if (dir) expect(scopes).toContain(dir);
      expect(rels(views.V2)).toEqual(['Plans/TODO.md']);
    }
  });

  test('empty and muted files stay out; an ignored file only with the switch or one of the tab\'s own folders', () => {
    expect(rels(['Plans/'])).not.toContain('Plans/empty.md');
    expect(rels(['Plans/'])).not.toContain('Plans/muted.md');
    expect(rels(['Plans/hidden.md'])).toEqual([]);
    expect(rels(['Plans/hidden.md'], true)).toEqual(['Plans/hidden.md']);
    expect(rels(['Plans/'])).toContain('Plans/hidden.md');
  });

  test('without entries (All files) every non-empty file', () => {
    expect(rels(null)).toHaveLength(files.length - 1);
  });
});

describe('the remembered sidebar tab', () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  test('saved and restored; unknown or unavailable storage is All files', () => {
    (globalThis as any).localStorage = ls;
    expect(loadTab()).toBe('files');
    saveTab('V2');
    expect(loadTab()).toBe('V2');
    store.set('mdhouse.sidebar.tab', 'nonsense');
    expect(loadTab()).toBe('files');
    (globalThis as any).localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadTab()).toBe('files');
    expect(() => saveTab('V1')).not.toThrow();
    delete (globalThis as any).localStorage;
  });
  test('a V tab with an empty view falls back to All files', () => {
    const v = { ...noViews(), V2: ['a.md'] };
    expect(usableTab('V1', v)).toBe('files');
    expect(usableTab('V2', v)).toBe('V2');
    expect(usableTab('recent', v)).toBe('recent');
  });
});
