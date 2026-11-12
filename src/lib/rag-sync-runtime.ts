/** Injected, one-call sync/search orchestration. Intent/config/capabilities are not authentication. */
import { planRagSync, RAG_SYNC_REQUIRED_EXCLUDES } from './rag-sync-plan';
import type { RagSyncPlan, RagSyncPlanInput } from './rag-sync-plan';

export const RAG_SYNC_RUNTIME_LIMITS = Object.freeze({ replyBytes: 1024 * 1024, inputBytes: 8 * 1024 * 1024,
  depth: 16, nodes: 50_000, stringBytes: 32768, syncFiles: 200, records: 16 });
export interface RuntimeRequest { target: string; body?: string | Record<string, unknown>; ask?: 'status' }
/** The host enforces credentials, dispatch/root checks, raw bounds and envelope correlation. */
export interface RuntimeTransport { request(request: RuntimeRequest): Promise<unknown> }
export interface SyncReply {
  result: 'confirmed' | 'incomplete' | 'unknown' | 'failed'; confirmed: number; remaining: number;
  sent: number; capped: boolean; files: { path: string; state: 'failed' | 'unknown' | 'in_flight'; reason: string }[];
}
export interface SyncRunResult {
  effect: 'notsent' | 'unknown' | 'reported'; result: SyncReply['result'] | null; report: SyncReply | null; reason: string | null;
}
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';
export interface Citation {
  namespace: string; tableName: string; id: string; source: string; content_hash: string;
  indexed_at: string; chunk_index: number; excerpt: string; scores: Record<string, number>;
  key1?: string; key2?: string; heading_path?: string[]; lines?: [number, number];
}
export interface SearchReply { mode: SearchMode; records: Citation[] }
export interface SearchRunResult { effect: 'notsent' | 'unknown' | 'reported'; result: SearchReply | null; reason: string | null }
export interface FileScanStatus {
  mode: string; effective_mode: string; fallback: string | null; tracked: number; last_scan: number | null;
  skipped: [string, string][]; state_bytes: number; state_max: number;
  subscribers: { id: string; target: string; sent: number; confirmed: number; dropped: number; pending: number }[];
  paused: { kind: string; reason: string; at: number } | null;
  skipped_for_rag: Record<string, Record<string, string>>;
}
export interface RagCapabilities {
  version: string; methods: string[]; modes: SearchMode[]; limits: Record<string, number>;
  embedding_model: string | null; dimensions: number | null;
}
export interface SyncInput {
  plan: RagSyncPlanInput; ownerConfig: { filescan: string; root: { path: string; dev: string; ino: string }; config: Record<string, unknown> };
  intent: { apply: boolean };
}
export interface SearchInput { plan: RagSyncPlanInput; query: string; mode?: SearchMode; limit?: number; intent: { paid: boolean } }
export class RagSyncRuntimeError extends Error {
  constructor(message: string) { super(`RAG runtime: ${message}`); this.name = 'RagSyncRuntimeError'; }
}

type Obj = Record<string, unknown>;
const utf8 = new TextEncoder();
const MODES = ['keyword', 'semantic', 'hybrid'] as const;
const PROVIDER_EXCLUDES = ['node_modules/**', '*/node_modules/**', '.*', '*/.*',
  'bower_components/**', '*/bower_components/**', 'jspm_packages/**', '*/jspm_packages/**'];
const CONFIG_KEYS = ['dir', 'include', 'exclude', 'namespace', 'table', 'mode', 'every', 'settle', 'batch',
  'max_file_size', 'bigfile_ttl', 'max_per_scan', 'baseline', 'delete_pct', 'delete_max', 'state_max'];
function invalid(message: string): never { throw new RagSyncRuntimeError(message); }
function bytes(s: string): number { return utf8.encode(s).length; }
/** Finite detached plain data; no accessors, foreign prototypes, sparse arrays or cycles. */
function data(value: unknown, max: number = RAG_SYNC_RUNTIME_LIMITS.replyBytes, stringMax: number = RAG_SYNC_RUNTIME_LIMITS.stringBytes): unknown {
  let nodes = 0; let size = 0; const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > RAG_SYNC_RUNTIME_LIMITS.nodes || depth > RAG_SYNC_RUNTIME_LIMITS.depth) invalid('data depth/node budget');
    if (typeof v === 'string') {
      if (v.length > stringMax || bytes(v) > stringMax) invalid('text budget');
      size += bytes(v); if (size > max) invalid('data budget'); return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object' || active.has(v)) invalid('plain finite acyclic data required');
    const array = Array.isArray(v);
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(v))) invalid('foreign prototype');
    if (array && v.length > RAG_SYNC_RUNTIME_LIMITS.nodes) invalid('array budget');
    const keys = Reflect.ownKeys(v); if (keys.length > RAG_SYNC_RUNTIME_LIMITS.nodes) invalid('key budget');
    const out: Obj | unknown[] = array ? [] : Object.create(null); active.add(v);
    for (const k of keys) {
      if (array && k === 'length') continue;
      if (typeof k !== 'string' || (array && !/^(0|[1-9]\d*)$/.test(k))) invalid('data key');
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      if (!('value' in d) || !d.enumerable) invalid('accessor/hidden key');
      size += bytes(k); if (size > max) invalid('data budget');
      Object.defineProperty(out, k, { value: copy(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && ((out as unknown[]).length !== v.length || keys.length !== v.length + 1)) invalid('sparse array');
    active.delete(v); return out;
  };
  const result = copy(value, 0);
  if (bytes(JSON.stringify(result)) > max) invalid('serialized data budget'); return result;
}
/** Reads raw JSON before duplicate keys can be overwritten by JSON.parse. */
function wire(value: unknown): unknown {
  if (typeof value !== 'string') return data(value);
  if (value.length > RAG_SYNC_RUNTIME_LIMITS.replyBytes || bytes(value) > RAG_SYNC_RUNTIME_LIMITS.replyBytes) invalid('reply budget');
  let at = 0; let nodes = 0;
  const ws = () => { while (/[ \r\n\t]/.test(value[at] ?? '') && at < value.length) at++; };
  const string = (): string => {
    const start = at++; let closed = false;
    while (at < value.length) {
      const c = value[at++]!;
      if (c === '"') { closed = true; break; }
      if (c === '\\') at++;
      if (at - start > RAG_SYNC_RUNTIME_LIMITS.stringBytes * 6 + 2) invalid('JSON string budget');
    }
    if (!closed) invalid('unterminated JSON string');
    let s: unknown; try { s = JSON.parse(value.slice(start, at)); } catch { return invalid('JSON string'); }
    if (typeof s !== 'string' || bytes(s) > RAG_SYNC_RUNTIME_LIMITS.stringBytes) invalid('JSON string budget'); return s;
  };
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const parse = (depth: number): unknown => {
    if (++nodes > RAG_SYNC_RUNTIME_LIMITS.nodes || depth > RAG_SYNC_RUNTIME_LIMITS.depth) invalid('JSON depth/node budget'); ws();
    if (value[at] === '"') return string();
    if (value[at] === '{') {
      at++; ws(); const out: Obj = Object.create(null);
      if (value[at] === '}') { at++; return out; }
      for (;;) {
        ws(); if (value[at] !== '"') invalid('JSON key'); const k = string();
        if (Object.hasOwn(out, k)) invalid('duplicate JSON key'); ws(); if (value[at++] !== ':') invalid('JSON colon');
        out[k] = parse(depth + 1); ws(); const end = value[at++]; if (end === '}') return out; if (end !== ',') invalid('JSON object');
      }
    }
    if (value[at] === '[') {
      at++; ws(); const out: unknown[] = []; if (value[at] === ']') { at++; return out; }
      for (;;) { out.push(parse(depth + 1)); ws(); const end = value[at++]; if (end === ']') return out; if (end !== ',') invalid('JSON array'); }
    }
    for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) if (value.startsWith(word, at)) { at += word.length; return v; }
    number.lastIndex = at; const m = number.exec(value); if (!m) invalid('JSON value'); at = number.lastIndex;
    const n = Number(m[0]); if (!Number.isFinite(n)) invalid('nonfinite JSON number'); return n;
  };
  const result = parse(0); ws(); if (at !== value.length) invalid('trailing JSON'); return result;
}
function object(v: unknown, keys?: readonly string[], required = keys): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid('object required'); const o = v as Obj;
  if ((keys && Object.keys(o).some(k => !keys.includes(k))) || required?.some(k => !Object.hasOwn(o, k))) invalid('schema keys'); return o;
}
/** A provider reply object: `required` present; fields a newer provider adds are ignored. */
function fields(v: unknown, required: readonly string[]): Obj { return object(v, undefined, required); }
function array(v: unknown, max = 10_000): unknown[] { if (!Array.isArray(v) || v.length > max) invalid('array bound'); return v; }
function text(v: unknown, max = 2048, empty = false): string {
  if (typeof v !== 'string' || !v.isWellFormed() || (!empty && !v.trim()) || bytes(v) > max || /[\x00\ufeff]/.test(v)) invalid('bounded text'); return v;
}
function integer(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || Object.is(v, -0) || v < 0 || v > max) invalid('integer'); return v;
}
function numeric(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) invalid('nonnegative number'); return v; }
function bool(v: unknown): boolean { if (typeof v !== 'boolean') invalid('boolean'); return v; }
function choice<const T extends readonly string[]>(v: unknown, values: T): T[number] { if (!values.includes(v as string)) invalid('enum'); return v as T[number]; }
function sourcePath(v: unknown, excludes: readonly string[] = []): string {
  const s = text(v);
  if (s.normalize('NFC') !== s || s.startsWith('/') || /[\\:%?#\x00-\x1f\x7f-\x9f]/.test(s)
    || s.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.') || ['node_modules','bower_components','jspm_packages'].includes(p))
    || excludes.some(p => !p.startsWith('**/') && s.startsWith(p.slice(0, -2)))) invalid('source outside selected lexical boundary');
  return s;
}
function service(v: string, kind: 'rag' | 'filescan'): void {
  if (!new RegExp(`^#${kind}/[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$`).test(v)) invalid('dedicated service target required');
}
function plan(v: unknown): RagSyncPlan {
  const p = planRagSync(v); service(p.target.rag, 'rag'); service(p.target.filescan, 'filescan');
  if (![p.target.namespace,p.target.table].every(x => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(x))) invalid('safe explicit destination tokens required');
  return p;
}
function stamp(v: unknown): string {
  const s = text(v, 40); const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/.exec(s);
  if (!m) invalid('indexed_at');
  const canonical = `${m[1]}.${(m[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`;
  if (!Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== canonical) invalid('indexed_at'); return s;
}

export function decodeFileScanStatus(value: unknown): FileScanStatus {
  const o = fields(wire(value), ['mode','effective_mode','fallback','tracked','last_scan','skipped','state_bytes','state_max','subscribers','paused','skipped_for_rag']);
  const modes = ['demand','poll','watch','both'] as const;
  const subscribers = array(o.subscribers, 100).map(v => { const s = fields(v, ['id','target','sent','confirmed','dropped','pending']);
    return { id: text(s.id), target: text(s.target), sent: integer(s.sent), confirmed: integer(s.confirmed), dropped: integer(s.dropped), pending: integer(s.pending) }; });
  const skipped = array(o.skipped).map(v => { const r = array(v, 2); if (r.length !== 2) invalid('skipped tuple'); return [text(r[0]),text(r[1])] as [string,string]; });
  let paused: FileScanStatus['paused'] = null;
  if (o.paused !== null) { const p = fields(o.paused, ['kind','reason','at']); paused = { kind: text(p.kind), reason: text(p.reason), at: numeric(p.at) }; }
  const skipped_for_rag: FileScanStatus['skipped_for_rag'] = Object.create(null);
  for (const [key, v] of Object.entries(object(o.skipped_for_rag))) {
    const row: Record<string,string> = Object.create(null); for (const [path, reason] of Object.entries(object(v))) row[text(path)] = text(reason); skipped_for_rag[text(key)] = row;
  }
  return { mode: choice(o.mode,modes), effective_mode: choice(o.effective_mode,modes), fallback: o.fallback === null ? null : text(o.fallback),
    tracked: integer(o.tracked), last_scan: o.last_scan === null ? null : numeric(o.last_scan), skipped, state_bytes: integer(o.state_bytes), state_max: integer(o.state_max), subscribers, paused, skipped_for_rag };
}
const LIMIT_KEYS = ['body_bytes','record_bytes','data_bytes','chunks','embedding_scalars','query_bytes','page_records','catalogue_bytes','namespaces','tables_per_namespace'] as const;
export function decodeRagCapabilities(value: unknown): RagCapabilities {
  const o = fields(wire(value), ['version','methods','modes','limits','embedding_model','dimensions']);
  const methods = array(o.methods, 64).map(v => text(v, 64)); const modes = array(o.modes,3).map(v => choice(v,MODES));
  if (new Set(methods).size !== methods.length || new Set(modes).size !== modes.length) invalid('duplicate capability');
  const l = fields(o.limits, LIMIT_KEYS);
  const limits: Record<string,number> = {}; for (const k of LIMIT_KEYS) limits[k] = integer(l[k]);
  return { version: text(o.version,32), methods, modes, limits, embedding_model: o.embedding_model === null ? null : text(o.embedding_model,128), dimensions: o.dimensions === null ? null : integer(o.dimensions,8192) };
}
export function decodeSyncReply(value: unknown): SyncReply {
  const o = fields(wire(value), ['result','confirmed','remaining','capped','sent','files']);
  const files = array(o.files,200).map(v => { const f = fields(v, ['path','state','reason']); return { path: sourcePath(f.path), state: choice(f.state,['failed','unknown','in_flight'] as const), reason: text(f.reason) }; });
  if (new Set(files.map(f => f.path)).size !== files.length) invalid('duplicate sync file');
  const r: SyncReply = { result: choice(o.result,['confirmed','incomplete','unknown','failed'] as const), confirmed: integer(o.confirmed), remaining: integer(o.remaining), capped: bool(o.capped), sent: integer(o.sent), files };
  if (files.length > r.remaining || (r.result === 'confirmed' && (r.remaining !== 0 || r.capped || files.length))
    || (r.result !== 'confirmed' && r.remaining === 0 && !r.capped)
    || (files.some(f => f.state === 'failed') && r.result !== 'failed')
    || (files.some(f => f.state === 'unknown') && !['failed','unknown'].includes(r.result))) invalid('inconsistent sync result');
  return r;
}
export function decodeSearchReply(value: unknown, expected: unknown): SearchReply {
  const e = object(data(expected), ['namespace','table','mode','limit','exclude']);
  const namespace = text(e.namespace,128); const table = text(e.table,128); const mode = choice(e.mode,MODES); const limit = integer(e.limit,16);
  if (!limit) invalid('search limit'); const excludes = array(e.exclude,128).map(v => text(v));
  const o = fields(wire(value), ['mode','records']); if (o.mode !== mode) invalid('effective search mode mismatch');
  const identities = new Set<string>();
  const records = array(o.records,limit).map(v => {
    const c = fields(v, ['namespace','tableName','id','source','content_hash','indexed_at','chunk_index','excerpt','scores']);
    if (c.namespace !== namespace || c.tableName !== table) invalid('cross-scope citation');
    const id = text(c.id,128); if (id.normalize('NFC') !== id) invalid('citation ID');
    if (identities.has(id)) invalid('duplicate record citation'); identities.add(id);
    const source = sourcePath(c.source, excludes); if (!source.endsWith('.md')) invalid('non-Markdown citation');
    const hash = text(c.content_hash,64); if (!/^[0-9a-f]{64}$/.test(hash)) invalid('citation hash');
    const score = { keyword: 'bm25', semantic: 'dense', hybrid: 'rrf' }[mode]; const rawScores = fields(c.scores,[score]);
    const n = rawScores[score]; if (typeof n !== 'number' || !Number.isFinite(n) || n < (mode === 'semantic' ? -1 : 0)) invalid('citation score');
    const record: Citation = { namespace, tableName: table, id, source, content_hash: hash, indexed_at: stamp(c.indexed_at), chunk_index: integer(c.chunk_index,255), excerpt: text(c.excerpt,32768,true), scores: { [score]: n } };
    for (const key of ['key1','key2'] as const) if (Object.hasOwn(c,key)) record[key] = text(c[key],256,true);
    if (Object.hasOwn(c,'heading_path') !== Object.hasOwn(c,'lines')) invalid('large citation location pair');
    if (Object.hasOwn(c,'heading_path')) {
      record.heading_path = array(c.heading_path,256).map(v => text(v,32768,true)); const lines = array(c.lines,2);
      if (lines.length !== 2) invalid('line range'); const first = integer(lines[0],1048576); const last = integer(lines[1],1048576);
      if (first < 1 || last < first) invalid('line range'); record.lines = [first,last];
    }
    return record;
  });
  return { mode, records };
}

function owner(value: unknown, p: RagSyncPlan): void {
  const w = object(value,['filescan','root','config']); const r = object(w.root,['path','dev','ino']);
  if (w.filescan !== p.target.filescan || ['path','dev','ino'].some(k => r[k] !== p.root[k as keyof typeof p.root])) invalid('owner root/FileScan binding mismatch');
  const c = object(w.config,CONFIG_KEYS,['dir','include','exclude','namespace','table','mode']);
  if (c.dir !== p.root.path || c.namespace !== p.target.namespace || c.table !== p.target.table || c.mode !== 'demand') invalid('owner config scope mismatch');
  const include = array(c.include,1); if (include.length !== 1 || include[0] !== '*.md') invalid('owner include mismatch');
  const exclude = array(c.exclude,8).map(v => text(v));
  if (exclude.length !== PROVIDER_EXCLUDES.length || new Set(exclude).size !== exclude.length || PROVIDER_EXCLUDES.some(x => !exclude.includes(x))) invalid('owner exclude mismatch');
  if (p.exclude.length !== RAG_SYNC_REQUIRED_EXCLUDES.length || RAG_SYNC_REQUIRED_EXCLUDES.some(x => !p.exclude.includes(x))) invalid('unsupported selected exclusions');
}
type Reply = { kind: 'reply'; body: unknown } | { kind: 'uncertain'; sent: boolean; reason: string };
async function request(t: RuntimeTransport, r: RuntimeRequest): Promise<Reply> {
  try {
    const raw = object(data(await t.request(r),RAG_SYNC_RUNTIME_LIMITS.inputBytes,RAG_SYNC_RUNTIME_LIMITS.replyBytes),['kind','body','sent','reason'],['kind']);
    if (raw.kind === 'reply') { object(raw,['kind','body']);
      if (typeof raw.body === 'string' && bytes(raw.body) > RAG_SYNC_RUNTIME_LIMITS.replyBytes) invalid('reply body budget');
      return { kind: 'reply', body: raw.body }; }
    if (raw.kind === 'uncertain') { object(raw,['kind','sent','reason']); return { kind: 'uncertain', sent: bool(raw.sent), reason: text(raw.reason) }; }
    return invalid('transport result');
  } catch { return { kind: 'uncertain', sent: true, reason: 'invalid-or-lost-transport-response' }; }
}
/** `version` is a plain `x.y.z` at or above `min`. */
function atLeast(version: string, min: readonly [number, number, number]): boolean {
  const m = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(version); if (!m) return false;
  for (let i = 0; i < 3; i++) { const d = Number(m[i + 1]) - min[i]!; if (d) return d > 0; }
  return true;
}
async function preflight(t: RuntimeTransport, p: RagSyncPlan): Promise<void> {
  const fs = await request(t,{ target: p.target.filescan, body: 'status' });
  if (fs.kind !== 'reply') invalid('FileScan preflight unavailable'); const status = decodeFileScanStatus(fs.body);
  if (status.mode !== 'demand' || status.effective_mode !== 'demand' || status.fallback !== null || status.paused !== null || status.subscribers.length
    || status.state_bytes > status.state_max || status.skipped.length || Object.keys(status.skipped_for_rag).length) invalid('FileScan not ready for finite sync');
  const cap = await request(t,{ target: p.target.rag, body: { method: 'capabilities' } });
  if (cap.kind !== 'reply') invalid('RAG capabilities unavailable'); const capabilities = decodeRagCapabilities(cap.body);
  // 0.4.2 is the first contract with large Markdown references/checks; a newer one keeps it.
  if (!atLeast(capabilities.version, [0,4,2]) || !capabilities.embedding_model || !capabilities.dimensions
    || ['upsert','get','search'].some(m => !capabilities.methods.includes(m)) || !capabilities.modes.includes('keyword')
    || capabilities.limits.data_bytes! < 32768 || capabilities.limits.body_bytes! < 1048576) invalid('unsupported/unconfigured RAG contract');
  const health = await request(t,{ target: p.target.rag, ask: 'status' });
  if (health.kind !== 'reply' || health.body !== `ok: collection verified (RAG ${capabilities.version})`) invalid('RAG collection health unverified');
}
function syncResult(effect: SyncRunResult['effect'], reason: string | null, report: SyncReply | null = null): SyncRunResult {
  return { effect, result: report?.result ?? (effect === 'unknown' ? 'unknown' : null), report, reason };
}
/** Executes exactly one finite sync only after explicit apply and metadata/config preflight; files sent before with no confirmation are sent again. */
export async function runSync(value: unknown, transport: RuntimeTransport): Promise<SyncRunResult> {
  let p: RagSyncPlan;
  try {
    const i = object(data(value,RAG_SYNC_RUNTIME_LIMITS.inputBytes),['plan','ownerConfig','intent']);
    const intent = object(i.intent,['apply']); if (!bool(intent.apply)) invalid('explicit apply required');
    p = plan(i.plan); owner(i.ownerConfig,p);
    if (!p.inventory.complete || p.inventory.issues.length || !p.sources.length || p.sources.some(s => s.size > 1048576 || s.path.split('/').slice(0,-1).some(x => x.endsWith('.md')))) invalid('unsupported/incomplete local source selection');
    await preflight(transport,p);
  } catch { return syncResult('notsent','sync-preflight-refused'); }
  const response = await request(transport,{ target: p.target.filescan,
    body: `sync ${p.target.rag} as rag ${p.target.namespace} ${p.target.table} resend:true` });
  if (response.kind === 'uncertain') return syncResult(response.sent ? 'unknown' : 'notsent',response.reason);
  try {
    const raw = wire(response.body);
    if (raw && typeof raw === 'object' && Object.hasOwn(raw,'error')) {
      const error = object(object(raw,['error']).error,['code','text']); text(error.code,128); text(error.text);
      return { effect: 'reported', result: 'failed', report: null, reason: 'FileScan-refused' };
    }
    const report = decodeSyncReply(raw);
    if (report.result === 'confirmed' && report.confirmed < p.sources.length) invalid('confirmation omits selected source count');
    return syncResult('reported',null,report);
  } catch { return syncResult('unknown','invalid-sync-response'); }
}
/** Makes one explicit scoped search, with paid intent checked before transport. Never syncs or probes. */
export async function runSearch(value: unknown, transport: RuntimeTransport): Promise<SearchRunResult> {
  let p: RagSyncPlan; let query: string; let mode: SearchMode; let limit: number;
  try {
    const i = object(data(value,RAG_SYNC_RUNTIME_LIMITS.inputBytes),['plan','query','mode','limit','intent'],['plan','query','intent']);
    p = plan(i.plan); query = text(i.query,1024); const intent = object(i.intent,['paid']); const paid = bool(intent.paid);
    mode = Object.hasOwn(i,'mode') ? choice(i.mode,MODES) : 'keyword'; limit = Object.hasOwn(i,'limit') ? integer(i.limit,16) : 5;
    if (!limit || (mode !== 'keyword' && !paid)) invalid('explicit paid query intent required');
  } catch { return { effect: 'notsent', result: null, reason: 'search-input-refused' }; }
  const reply = await request(transport,{ target: p.target.rag, body: { method: 'search', namespace: p.target.namespace, tableName: p.target.table, query, mode, limit } });
  if (reply.kind === 'uncertain') return { effect: reply.sent ? 'unknown' : 'notsent', result: null, reason: reply.reason };
  try { return { effect: 'reported', result: decodeSearchReply(reply.body,{ namespace: p.target.namespace, table: p.target.table, mode, limit, exclude: p.exclude }), reason: null }; }
  catch { return { effect: 'unknown', result: null, reason: 'invalid-or-refused-search-response' }; }
}
