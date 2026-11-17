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
}

/** How many wikilinks one document resolves; past it the rest stay text. */
export const WIKI_MAX = 500;

const nameOf = (rel: string): string => rel.slice(rel.lastIndexOf('/') + 1).replace(MD_EXT, '');
const add = (m: Map<string, string[]>, k: string, rel: string) => {
  const list = m.get(k);
  if (list) list.push(rel);
  else m.set(k, [rel]);
};

export function wikiIndex(rels: Iterable<string>): WikiIndex {
  const index: WikiIndex = { rels: new Set(), byName: new Map(), byNameLower: new Map() };
  for (const rel of rels) {
    if (!MD_EXT.test(rel)) continue;
    index.rels.add(rel);
    add(index.byName, nameOf(rel), rel);
    add(index.byNameLower, nameOf(rel).toLowerCase(), rel);
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
