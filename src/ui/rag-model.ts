/** What the `/rag` page decides from the server's answers, kept apart from the components. */
import { highlightRanges } from './format';
import type { RagStatus } from './api';

/** The page's address for a search: `/rag?q=…&root=…`; an empty part is left out. */
export const ragUrl = (state: { q?: string; root?: string }): string => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.root) params.set('root', state.root);
  const s = params.toString();
  return s ? `/rag?${s}` : '/rag';
};

/** The `q` and `root` of a page address's query string. */
export const parseRagUrl = (search: string): { q: string; root: string } => {
  const p = new URLSearchParams(search);
  return { q: (p.get('q') ?? '').trim(), root: p.get('root') ?? '' };
};

/** The words of a query, each once, longest first so a short word inside a long one does not split it; one-letter words only when alone. */
export function queryTerms(q: string): string[] {
  const words = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];
  const kept = words.filter((w) => w.length > 1);
  return (kept.length ? kept : words).sort((a, b) => b.length - a.length);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * `text` as plain and highlighted runs: every occurrence of a query word, any case. Matched on `text`
 * itself, so a character whose lower case is longer (`İ`) shifts nothing. Built as runs, never as HTML.
 */
export function highlight(text: string, q: string): Array<{ text: string; hit: boolean }> {
  const ranges: Array<[number, number]> = [];
  for (const term of queryTerms(q)) {
    for (const m of text.matchAll(new RegExp(escapeRe(term), 'giu'))) ranges.push([m.index, m.index + m[0].length]);
  }
  return highlightRanges(text, ranges);
}

/** A sync's result as the glyph that leads its line (CLAUDE.md): done, partial, ran and failed, unknown, nothing ran. */
export const resultGlyph = (result: string): string =>
  ({ confirmed: '✅', incomplete: '⚠️', failed: '❌', unknown: '❓', notsent: '⛔' })[result] ?? '❓';

/** `12/15` — confirmed over every file the sync counted; empty when the run did not say. */
export function progress(last: { confirmed: number | null; remaining: number | null }): string {
  return last.confirmed === null || last.remaining === null ? '' : `${last.confirmed}/${last.confirmed + last.remaining}`;
}

/** `lines 5–6`, `line 5`; empty when the hit has none. */
export function lineLabel(lines: [number, number] | undefined): string {
  if (!lines) return '';
  return lines[0] === lines[1] ? `line ${lines[0]}` : `lines ${lines[0]}–${lines[1]}`;
}

export const breadcrumb = (path: string[] | undefined): string => (path ?? []).filter(Boolean).join(' › ');

/** A shell word: single-quoted when it holds anything but safe characters. */
export const shellWord = (s: string): string => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The sync command for a project, its folder filled in and the names left as placeholders. */
export const syncCommand = (path: string): string =>
  `mdhouse-rag-sync sync --root ${shellWord(path)} --filescan '#filescan/<name>@<host>' --rag '#rag/<name>@<host>' --namespace <ns> --table <table> --apply --until-done`;

/** What the page shows, in order of precedence. */
export type RagState = 'loading' | 'off' | 'error' | 'unindexed' | 'indexed';

export function stateOf(status: RagStatus | null, failed: string | null): RagState {
  if (failed !== null) return 'error';
  if (!status) return 'loading';
  if (!status.enabled) return 'off';
  if (status.error) return 'error';
  return status.source ? 'indexed' : 'unindexed';
}
