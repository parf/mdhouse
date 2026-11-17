import type { AnyFile } from '../lib/scan';
import type { FileEntry } from '../lib/store';

/** What the sidebar's file tree lists: the project's Markdown, or every file. */
export type TreeKind = 'md' | 'all';

const KEY = 'mdhouse.sidebar.kind';

/** The remembered tree kind; anything unknown, or no storage, is MD. */
export function loadTreeKind(): TreeKind {
  try {
    return localStorage.getItem(KEY) === 'all' ? 'all' : 'md';
  } catch {
    return 'md';
  }
}

export function saveTreeKind(kind: TreeKind): void {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    /* a per-viewer convenience; fine without it */
  }
}

/**
 * The ALL tree's files: every listed file, a Markdown one as the MD tree has it (marks, status), plus
 * the MD tree's files the listing leaves out (ignored ones shown) — so ALL always holds every MD row.
 */
export function allEntries(listed: AnyFile[], md: FileEntry[]): FileEntry[] {
  const byRel = new Map(md.map((f) => [f.rel, f]));
  const out: FileEntry[] = listed.map((f) => byRel.get(f.rel) ?? f);
  const seen = new Set(listed.map((f) => f.rel));
  for (const f of md) if (!seen.has(f.rel)) out.push(f);
  return out;
}
