/**
 * What `mdhouse-rag-sync sync` keeps on `#mdhouse@<host>`: the source registry and the sync history,
 * in the agent's own JSON key-value store, all under `rag/`. A source is the RAG target
 * `<namespace>/<table>`, which has one folder, one FileScan and one RAG.
 *
 *   rag/source/<sid>            the registered source, written once (add)
 *   rag/last/<sid>              the latest run, overwritten
 *   rag/hist/<sid>/<time>-<hex> one immutable entry per run, the newest `HISTORY_CAP` kept
 */
import type { RagStore, RootId } from './rag-sync-bus';

export const HISTORY_CAP = 200;
/** Failed or unknown files named in one history entry. */
export const MAX_FILES = 20;

export interface SourceDef {
  root: RootId;
  filescan: string;
  rag: string;
  namespace: string;
  table: string;
}

export interface RunRecord {
  v: 1;
  startedAt: string;
  endedAt: string;
  rounds: number;
  untilDone: boolean;
  /** The sync's result, or the effect when no answer was reported. */
  result: string;
  exit: number;
  confirmed?: number;
  remaining?: number;
  sent?: number;
}

export type Registration = 'new' | 'same' | 'other';

/** `--namespace` and `--table` are at most 64 bytes of a-z 0-9 _ -, so every key is far inside the KV's 256 bytes. */
export const sourceId = (t: Pick<SourceDef, 'namespace' | 'table'>): string => `${t.namespace}/${t.table}`;
export const sourceKey = (sid: string): string => `rag/source/${sid}`;
export const lastKey = (sid: string): string => `rag/last/${sid}`;
const histPrefix = (sid: string): string => `rag/hist/${sid}/`;
const HIST_TAIL = /^\d{8}T\d{6}Z-[0-9a-f]{4}$/;

const compact = (at: Date): string => at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
/** Sorts by start time; `rnd` (four hex digits) keeps two runs of one second apart. */
export const histKey = (sid: string, at: Date, rnd: string): string => `${histPrefix(sid)}${compact(at)}-${rnd}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether `stored` is this source: same folder path, FileScan, RAG, namespace and table. */
export function sameSource(stored: unknown, def: SourceDef): boolean {
  return (
    isObj(stored) &&
    isObj(stored.root) &&
    stored.root.path === def.root.path &&
    stored.filescan === def.filescan &&
    stored.rag === def.rag &&
    stored.namespace === def.namespace &&
    stored.table === def.table
  );
}

/** Looks the source up and registers it when it is not there; `other` means the registry holds a different one. */
export async function registerSource(store: RagStore, def: SourceDef, now: Date, by: string): Promise<Registration> {
  const key = sourceKey(sourceId(def));
  const held = await store.get(key);
  if (held) return sameSource(held, def) ? 'same' : 'other';
  const value = { v: 1, root: def.root, filescan: def.filescan, rag: def.rag, namespace: def.namespace, table: def.table, createdAt: now.toISOString(), by };
  if (await store.add(key, value)) return 'new';
  // another run registered it first
  const again = await store.get(key);
  return again && !sameSource(again, def) ? 'other' : 'same';
}

/** Records one run as the latest and in the history, then drops the history beyond the cap. */
export async function recordRun(store: RagStore, sid: string, run: RunRecord, files: readonly { path: string; state: string }[], rnd: string): Promise<void> {
  await store.set(lastKey(sid), { ...run });
  const listed = files.slice(0, MAX_FILES).map((f) => ({ path: f.path, state: f.state }));
  await store.add(histKey(sid, new Date(run.startedAt), rnd), { ...run, ...(listed.length ? { files: listed } : {}) });
  await trimHistory(store, sid);
}

/** Deletes the oldest history entries of `sid` beyond `cap`; names of another source are never touched. */
export async function trimHistory(store: RagStore, sid: string, cap: number = HISTORY_CAP): Promise<void> {
  const prefix = histPrefix(sid);
  const mine = (await store.names(prefix)).filter((n) => n.startsWith(prefix) && HIST_TAIL.test(n.slice(prefix.length))).sort();
  for (const name of mine.slice(0, Math.max(0, mine.length - cap))) await store.delete(name);
}
