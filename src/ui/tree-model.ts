/**
 * Turning the flat file list into a tree, on the client.
 *
 * The server sends a flat list because the client needs it flat anyway — fuzzy name matching
 * runs over it with no round-trip. Shaping it into a tree here costs a few milliseconds and
 * keeps the server free of presentation concerns.
 */

import type { FileEntry } from '../lib/store';
import type { Mark } from '../lib/prefs';

export interface FileNode {
  kind: 'file';
  name: string;
  path: string;
  file: FileEntry;
}

export interface DirNode {
  kind: 'dir';
  /** Display name — several segments when a single-child chain was collapsed. */
  name: string;
  path: string;
  children: Node[];
  /** Total files in the subtree, for the collapsed-count badge. */
  count: number;
}

export type Node = FileNode | DirNode;

const hasMark = (f: FileEntry, m: Mark) => f.marks?.includes(m) ?? false;

function sortNodes(nodes: Node[]): Node[] {
  return nodes.sort((a, b) => {
    const favA = a.kind === 'file' && hasMark(a.file, 'favorite') ? 0 : 1;
    const favB = b.kind === 'file' && hasMark(b.file, 'favorite') ? 0 : 1;
    if (favA !== favB) return favA - favB;

    const mutedA = a.kind === 'file' && hasMark(a.file, 'muted') ? 1 : 0;
    const mutedB = b.kind === 'file' && hasMark(b.file, 'muted') ? 1 : 0;
    if (mutedA !== mutedB) return mutedA - mutedB;

    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;

    // README, CLAUDE and AGENTS lead their directory — the same convention r-doc uses,
    // and the same order the Plans/ house convention reads in.
    if (a.kind === 'file' && b.kind === 'file') {
      const rank = (n: string) => (/^(README|CLAUDE|AGENTS|TODO|DONE)\./i.test(n) ? 0 : 1);
      const ra = rank(a.name), rb = rank(b.name);
      if (ra !== rb) return ra - rb;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** Collapse `a/b/c` chains that hold nothing else into one row, VS Code style. */
function collapseChains(dir: DirNode): DirNode {
  let node = dir;
  while (node.children.length === 1 && node.children[0]!.kind === 'dir') {
    const only = node.children[0] as DirNode;
    node = { ...only, name: `${node.name}/${only.name}` };
  }
  node.children = node.children.map((c) => (c.kind === 'dir' ? collapseChains(c) : c));
  return node;
}

export function buildTree(files: FileEntry[]): Node[] {
  const rootChildren: Node[] = [];
  const dirs = new Map<string, DirNode>();

  const ensureDir = (path: string): DirNode => {
    const existing = dirs.get(path);
    if (existing) return existing;

    const slash = path.lastIndexOf('/');
    const node: DirNode = {
      kind: 'dir',
      name: slash === -1 ? path : path.slice(slash + 1),
      path,
      children: [],
      count: 0,
    };
    dirs.set(path, node);
    if (slash === -1) rootChildren.push(node);
    else ensureDir(path.slice(0, slash)).children.push(node);
    return node;
  };

  for (const file of files) {
    const node: FileNode = { kind: 'file', name: file.name, path: file.rel, file };
    if (!file.dir) rootChildren.push(node);
    else {
      ensureDir(file.dir).children.push(node);
      // Every ancestor counts this file.
      for (let d: string | undefined = file.dir; d; ) {
        dirs.get(d)!.count++;
        const slash = d.lastIndexOf('/');
        d = slash === -1 ? undefined : d.slice(0, slash);
      }
    }
  }

  const walk = (nodes: Node[]): Node[] =>
    sortNodes(nodes.map((n) => (n.kind === 'dir' ? { ...collapseChains(n), children: walk(n.children) } : n)));

  return walk(rootChildren);
}

/** Every directory path on the way to a file, for auto-expanding to the open document. */
export function ancestors(path: string): string[] {
  const out: string[] = [];
  let at = path.lastIndexOf('/');
  while (at !== -1) {
    out.push(path.slice(0, at));
    at = path.lastIndexOf('/', at - 1);
  }
  return out;
}

/**
 * Subsequence fuzzy match over a path, scoring matches on the filename far above matches in
 * the directory part. Returns null when the query does not appear at all.
 */
export function fuzzyScore(query: string, path: string, name: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const lowerPath = path.toLowerCase();
  const lowerName = name.toLowerCase();

  const exactName = lowerName.indexOf(q);
  if (exactName !== -1) return 1000 - exactName * 5 - (lowerName.length - q.length);

  const exactPath = lowerPath.indexOf(q);
  if (exactPath !== -1) return 500 - exactPath;

  // Subsequence fallback: every query character in order, rewarding tight runs.
  let score = 0;
  let at = -1;
  let run = 0;
  for (const ch of q) {
    const next = lowerPath.indexOf(ch, at + 1);
    if (next === -1) return null;
    run = next === at + 1 ? run + 1 : 0;
    score += 4 + run * 3 - Math.min(next - at - 1, 6);
    at = next;
  }
  return score;
}
