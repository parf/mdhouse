/**
 * What the `/rag` page reads: the project's registered RAG source and its latest sync (both written
 * by `mdhouse-rag-sync` into the KV of `#mdhouse@<host>`, see `rag-registry.ts`), and a keyword
 * search of that source's RAG.
 */
import { validTarget } from './agent-bus';
import type { Citation } from './rag-sync-runtime';

/** Hits one search may return. */
export const SEARCH_LIMIT = { min: 1, max: 16, dflt: 8 } as const;
export const QUERY_MAX = 1024;
/** Excerpt characters sent to the page. */
export const EXCERPT_MAX = 600;

export interface RagSource {
  sid: string;
  namespace: string;
  table: string;
  /** The RAG agent this source's searches go to; never sent to the page. */
  rag: string;
}

export interface RagLast {
  startedAt: string;
  endedAt: string;
  result: string;
  confirmed: number | null;
  remaining: number | null;
  rounds: number;
}

export interface RagHit {
  source: string;
  url: string;
  lines?: [number, number];
  heading_path?: string[];
  excerpt: string;
  truncated?: true;
  stale?: true;
  score: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const SOURCE_PREFIX = 'rag/source/';

/** The key of a source's registry entry and of its latest run. */
export const sourceKeyOf = (sid: string): string => `${SOURCE_PREFIX}${sid}`;
export const lastKeyOf = (sid: string): string => `rag/last/${sid}`;
export const isSourceKey = (name: string): boolean => name.startsWith(SOURCE_PREFIX);

/** The source registered for the folder `rootPath`, from the `rag/source/*` values (key → value), or null. */
export function sourceFor(entries: ReadonlyArray<{ name: string; value: Record<string, unknown> | null }>, rootPath: string): RagSource | null {
  for (const { name, value } of entries) {
    if (!isSourceKey(name) || !isObj(value) || value.v !== 1 || !isObj(value.root) || value.root.path !== rootPath) continue;
    const { namespace, table, rag } = value;
    if (typeof namespace !== 'string' || typeof table !== 'string' || !validTarget(rag)) continue;
    if (name !== sourceKeyOf(`${namespace}/${table}`)) continue;
    return { sid: `${namespace}/${table}`, namespace, table, rag };
  }
  return null;
}

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const stamp = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** A run record as the page shows it; null when it is not one this version wrote. */
export function lastOf(value: Record<string, unknown> | null): RagLast | null {
  if (!isObj(value) || value.v !== 1) return null;
  const startedAt = stamp(value.startedAt);
  const endedAt = stamp(value.endedAt);
  if (!startedAt || !endedAt || typeof value.result !== 'string' || value.result.length > 32) return null;
  return { startedAt, endedAt, result: value.result, confirmed: count(value.confirmed), remaining: count(value.remaining), rounds: count(value.rounds) ?? 1 };
}

/** The keyword search request for `source`; the mode is fixed here, never taken from the page. */
export function searchBody(source: RagSource, query: string, limit: number): string {
  return JSON.stringify({ method: 'search', namespace: source.namespace, tableName: source.table, query, mode: 'keyword', limit });
}

/** A page's `q` and `limit`; null `q` when it is empty or too long. */
export function searchParams(url: URL): { q: string | null; limit: number } {
  const q = (url.searchParams.get('q') ?? '').trim();
  const asked = Math.trunc(Number(url.searchParams.get('limit')));
  const limit = Math.min(Math.max(Number.isFinite(asked) && asked ? asked : SEARCH_LIMIT.dflt, SEARCH_LIMIT.min), SEARCH_LIMIT.max);
  return { q: q && q.length <= QUERY_MAX ? q : null, limit };
}

/** Records (already cited from the local files) as hits; `docUrl` is the page address of a source file. */
export function shapeHits(records: ReadonlyArray<Citation & { stale?: true }>, docUrl: (source: string) => string): RagHit[] {
  return records.map((r) => {
    const score = Object.values(r.scores).find((n) => typeof n === 'number') ?? 0;
    const cut = r.excerpt.length > EXCERPT_MAX;
    return {
      source: r.source,
      url: `${docUrl(r.source)}${r.lines ? `#L${r.lines[0]}` : ''}`,
      ...(r.lines ? { lines: r.lines } : {}),
      ...(r.heading_path?.length ? { heading_path: r.heading_path } : {}),
      excerpt: cut ? r.excerpt.slice(0, EXCERPT_MAX) : r.excerpt,
      ...(cut ? { truncated: true as const } : {}),
      ...(r.stale ? { stale: true as const } : {}),
      score,
    };
  });
}
