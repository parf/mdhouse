/**
 * `[[page]]`, `[[path/page]]`, `[[page|label]]`, `[[page#heading]]`: what a wikilink names, resolved against one
 * project's Markdown files as the store lists them (ignore rules, the path jail and `.git` already applied) — never
 * the filesystem, never another project. Pure: the caller supplies the list.
 */
import { MD_EXT } from './filetypes';

/** One wikilink's target, resolved: a file, nothing, or several files a bare name could mean. */
export type WikiTarget = { rel: string } | { missing: true } | { ambiguous: string[] };

/** The project's Markdown files, for lookups: every root-relative path, and the paths by name (without extension). */
export interface WikiIndex {
  rels: Set<string>;
  byName: Map<string, string[]>;
  byNameLower: Map<string, string[]>;
  /** By name with only letters and digits, lower case: `AI Agents` = `ai-agents`. */
  bySquash: Map<string, string[]>;
}

/** How many wikilinks one document resolves; past it the rest stay text. */
export const WIKI_MAX = 500;

const squash = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const ANY_EXT = /\.[^./]+$/;
const nameOf = (rel: string, ext: RegExp = MD_EXT): string => rel.slice(rel.lastIndexOf('/') + 1).replace(ext, '');
const add = (m: Map<string, string[]>, k: string, rel: string) => {
  const list = m.get(k);
  if (list) list.push(rel);
  else m.set(k, [rel]);
};

/** The index of Markdown pages — or, `anyFile`, of every listed file, by name without its extension. */
export function wikiIndex(rels: Iterable<string>, opts: { anyFile?: boolean } = {}): WikiIndex {
  const index: WikiIndex = { rels: new Set(), byName: new Map(), byNameLower: new Map(), bySquash: new Map() };
  const ext = opts.anyFile ? ANY_EXT : MD_EXT;
  for (const rel of rels) {
    if (!opts.anyFile && !MD_EXT.test(rel)) continue;
    index.rels.add(rel);
    add(index.byName, nameOf(rel, ext), rel);
    add(index.byNameLower, nameOf(rel, ext).toLowerCase(), rel);
    const sq = squash(nameOf(rel, ext));
    if (sq) add(index.bySquash, sq, rel);
  }
  return index;
}

/** `path` against the folder of `docPath`, inside the project: null when it climbs out. Text, not a URL — no decoding. */
function join(docPath: string, path: string): string | null {
  const dir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
  const stack = dir ? dir.split('/') : [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!stack.length) return null;
      stack.pop();
    } else stack.push(seg);
  }
  return stack.length ? stack.join('/') : null;
}

/**
 * What `target` names from the document at `docPath`: relative to the document first, then from the project root
 * (a leading `/` — the root only); `.md` / `.mdx` may be left off. A bare name (no `/`) that names no such file is the
 * one Markdown file of that name anywhere in the project — exact case first, then any case; two or more: ambiguous.
 */
export function resolveWiki(index: WikiIndex, docPath: string, target: string): WikiTarget {
  const t = target.trim();
  if (!t) return { missing: true };
  const rootOnly = t.startsWith('/');
  const path = rootOnly ? t.replace(/^\/+/, '') : t;
  const forms = MD_EXT.test(path) ? [path] : [`${path}.md`, `${path}.mdx`];
  const bases = rootOnly ? [''] : [docPath, ''];
  for (const base of bases) {
    for (const f of forms) {
      const rel = join(base, f);
      if (rel && index.rels.has(rel)) return { rel };
    }
  }
  if (path.includes('/')) return { missing: true };
  const name = path.replace(MD_EXT, '');
  for (const hits of [index.byName.get(name), index.byNameLower.get(name.toLowerCase())]) {
    if (hits?.length === 1) return { rel: hits[0]! };
    if (hits && hits.length > 1) return { ambiguous: [...hits].sort() };
  }
  return { missing: true };
}

/**
 * The wikilinks in a source, as the renderer reads them: `[[target#heading|label]]` on one line, not `![[embed]]`,
 * not followed by `(` (that is a Markdown link whose text has brackets). The target is what resolves.
 */
export interface WikiLink {
  target: string;
  heading: string | null;
  label: string | null;
}
export function parseWiki(inner: string): WikiLink | null {
  // A space just inside the brackets is shell (`[[ -z "$X" ]]`), not a wikilink.
  if (!inner || /[[\]\n]/.test(inner) || /^\s|\s$/.test(inner)) return null;
  const bar = inner.indexOf('|');
  const left = bar === -1 ? inner : inner.slice(0, bar);
  const label = bar === -1 ? null : inner.slice(bar + 1).trim() || null;
  const hash = left.indexOf('#');
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  const heading = hash === -1 ? null : left.slice(hash + 1).trim() || null;
  if (!target && !heading) return null;
  return { target, heading, label };
}

/** Every distinct target a source's wikilinks name (over-collected: code is not skipped here), at most WIKI_MAX. */
export function wikiTargets(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?<!!)\[\[([^[\]\n]+)\]\](?!\()/g)) {
    const w = parseWiki(m[1]!);
    if (w?.target) out.add(w.target);
    if (out.size >= WIKI_MAX) break;
  }
  return [...out];
}

/** One place a link could mean, and why it is offered. */
export interface WikiCandidate {
  rel: string;
  why: 'name' | 'any-case' | 'similar';
  /** Where it is, from the document's folder. */
  place: WikiPlace;
}
/** How many candidates the choosing page lists. */
export const CANDIDATES_MAX = 50;

/** Where a candidate is, from the referring document's folder — the owner's order. */
export type WikiPlace = 'same-folder' | 'parent' | 'subfolder' | 'root' | 'other';
const PLACES: WikiPlace[] = ['same-folder', 'parent', 'subfolder', 'root', 'other'];
/** Branches offered first among their peers: archived and wiki pages. */
const PREFERRED = new Set(['done', 'wiki']);

/**
 * Where a link that names several pages, or none, could go — anywhere in the project, by place first (owner's order):
 * the document's folder, its parent, its direct subfolders, the project root, everywhere else (deeper, higher, done/ —
 * no archive penalty). Within a place: the same name, then any case, then a similar name (letters and digits only);
 * then a `done/` or `wiki/` branch (the first folder after the path it shares with the document's folder); then more
 * trailing folders in common with the written path (a moved folder); then shallower, then A–Z. Places that are the
 * same folder (a document at the root) count once. Only the index's files: never a guess.
 */
export function wikiCandidates(index: WikiIndex, docPath: string, target: string, ext?: string): WikiCandidate[] {
  const last = target.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  // `ext` (an `anyFile` index): the type asked for — `.ts` finds `.ts` files only.
  const name = ext ? (last.toLowerCase().endsWith(ext.toLowerCase()) ? last.slice(0, -ext.length) : last) : last.replace(MD_EXT, '');
  if (!name) return [];
  const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
  const docDirs = docDir ? docDir.split('/') : [];
  const parentDir = docDirs.slice(0, -1).join('/');
  const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
  const place = (rel: string): WikiPlace => {
    const dir = dirOf(rel);
    if (dir === docDir) return 'same-folder';
    if (docDirs.length && dir === parentDir) return 'parent';
    if (dirOf(dir) === docDir && dir !== '') return 'subfolder';
    if (dir === '') return 'root';
    return 'other';
  };
  const branch = (rel: string) => {
    const dirs = dirOf(rel).split('/').filter(Boolean);
    let n = 0;
    while (n < dirs.length && n < docDirs.length && dirs[n] === docDirs[n]) n++;
    return PREFERRED.has((dirs[n] ?? '').toLowerCase()) ? 0 : 1;
  };
  // The path as the document meant it (`../task.md` from Plans/R3/notes/ is Plans/R3/task.md); a leading `/` is the root.
  const written = target.trim().startsWith('/') ? target.trim().replace(/^\/+/, '') : (join(docPath, target.trim()) ?? target.trim());
  const want = written.split('/').filter((seg) => seg && seg !== '.' && seg !== '..').map((seg) => seg.toLowerCase());
  const strip = ext ? ANY_EXT : MD_EXT;
  if (want.length) want[want.length - 1] = want[want.length - 1]!.replace(strip, '');
  const tail = (rel: string) => {
    const segs = rel.toLowerCase().split('/');
    segs[segs.length - 1] = segs[segs.length - 1]!.replace(strip, '');
    let n = 0;
    while (n < want.length && n < segs.length && segs[segs.length - 1 - n] === want[want.length - 1 - n]) n++;
    return n;
  };
  const kinds: Array<[WikiCandidate['why'], string[] | undefined]> = [
    ['name', index.byName.get(name)],
    ['any-case', index.byNameLower.get(name.toLowerCase())],
    ['similar', index.bySquash.get(squash(name))],
  ];
  const found = new Map<string, WikiCandidate['why']>();
  for (const [why, rels] of kinds) for (const rel of rels ?? []) if (!found.has(rel) && (!ext || rel.toLowerCase().endsWith(ext.toLowerCase()))) found.set(rel, why);
  const KIND = { name: 0, 'any-case': 1, similar: 2 } as const;
  return [...found]
    .map(([rel, why]) => ({ rel, why, place: place(rel) }))
    .sort(
      (a, b) =>
        PLACES.indexOf(a.place) - PLACES.indexOf(b.place) ||
        KIND[a.why] - KIND[b.why] ||
        branch(a.rel) - branch(b.rel) ||
        tail(b.rel) - tail(a.rel) ||
        a.rel.split('/').length - b.rel.split('/').length ||
        a.rel.localeCompare(b.rel),
    )
    .slice(0, CANDIDATES_MAX);
}

/** A relative file link as written, from the document's folder: the file when the index lists it (no fallback by name). */
export function exactFile(index: WikiIndex, docPath: string, target: string): string | null {
  const t = target.trim();
  const rel = t.startsWith('/') ? join('', t.replace(/^\/+/, '')) : join(docPath, t);
  return rel && index.rels.has(rel) ? rel : null;
}
