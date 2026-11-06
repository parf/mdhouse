/** Pure local metadata planning. Declarations and the digest establish no access or remote readiness. */
import { createHash } from 'node:crypto';

export const RAG_SYNC_PLAN_VERSION = 1;
export const RAG_SYNC_PLAN_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, depth: 12, nodes: 200_000,
  sources: 10_000, issues: 10_000, patterns: 128, pathBytes: 2048, string: 4096 });
export const RAG_SYNC_REQUIRED_EXCLUDES: readonly string[] = Object.freeze([
  '**/.*', '**/node_modules/**', '**/bower_components/**', '**/jspm_packages/**',
]);
const dependencies = ['node_modules', 'bower_components', 'jspm_packages'];
export class RagSyncPlanError extends Error {
  constructor(readonly code: 'invalid-input' | 'limit', message: string) {
    super(`RAG sync plan ${code}: ${message}`); this.name = 'RagSyncPlanError';
  }
}
export interface RagSyncRoot { path: string; dev: string; ino: string }
export interface RagSyncSource { path: string; size: number; mtimeMs: number }
export interface RagSyncIssue { path: string; reason: 'unreadable' | 'changed' | 'limit' | 'unsupported' }
export interface RagSyncPlanInput {
  caller: string;
  target: { filescan: string; rag: string; namespace: string; table: string };
  root: RagSyncRoot;
  include: string[]; exclude: string[];
  inventory: { root: RagSyncRoot; complete: boolean; issues: RagSyncIssue[] };
  sources: RagSyncSource[];
  oversizeLimit: 32768;
}
export interface RagSyncPlan extends Omit<RagSyncPlanInput, 'sources'> {
  version: typeof RAG_SYNC_PLAN_VERSION;
  kind: 'local-plan-only';
  remoteReadiness: 'unverified'; authority: 'declarations-only'; execution: 'not-performed';
  digest: string;
  digestMeaning: 'canonical-plan-metadata-not-content-or-atomic-folder-proof';
  sources: (RagSyncSource & { eligibility: 'eligible-by-metadata' | 'oversize' })[];
  coverage: { status: 'partial' | 'metadata-only' | 'empty'; total: number; eligible: number;
    oversize: number; issues: number; inventoryComplete: boolean;
    textEncoding: 'unverified'; providerIndexability: 'unverified' };
}

type Obj = Record<string, unknown>;
const utf8 = new TextEncoder();
function invalid(at: string): never { throw new RagSyncPlanError('invalid-input', at); }
function limit(at: string): never { throw new RagSyncPlanError('limit', at); }
function byteSize(value: string): number { return utf8.encode(value).length; }
/** Copies plain finite JSON data without invoking accessors; aliases become independent data. */
function data(value: unknown): unknown {
  let nodes = 0; let bytes = 0;
  const active = new Set<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (++nodes > RAG_SYNC_PLAN_LIMITS.nodes || depth > RAG_SYNC_PLAN_LIMITS.depth) limit('node/depth budget');
    if (typeof v === 'string') {
      if (v.length > RAG_SYNC_PLAN_LIMITS.string) limit('string budget');
      bytes += byteSize(v); if (bytes > RAG_SYNC_PLAN_LIMITS.bytes) limit('byte budget');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object' || active.has(v)) invalid('finite acyclic plain data required');
    const array = Array.isArray(v);
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(v))) invalid('foreign prototype');
    if (array && v.length > RAG_SYNC_PLAN_LIMITS.nodes) limit('array budget');
    const keys = Reflect.ownKeys(v);
    if (keys.length > RAG_SYNC_PLAN_LIMITS.nodes) limit('key budget');
    const out: Obj | unknown[] = array ? [] : Object.create(null);
    active.add(v);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || (array && !/^(0|[1-9]\d*)$/.test(key))) invalid('JSON keys required');
      if (key.length > RAG_SYNC_PLAN_LIMITS.string) limit('key budget');
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      if (!('value' in d) || !d.enumerable) invalid('accessors/hidden keys');
      bytes += byteSize(key); if (bytes > RAG_SYNC_PLAN_LIMITS.bytes) limit('byte budget');
      Object.defineProperty(out, key, { value: walk(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && ((out as unknown[]).length !== v.length || keys.length !== v.length + 1)) invalid('sparse array');
    active.delete(v);
    return out;
  };
  const result = walk(value, 0);
  if (byteSize(JSON.stringify(result)) > RAG_SYNC_PLAN_LIMITS.bytes) limit('serialized byte budget');
  return result;
}
function object(value: unknown, keys: readonly string[]): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('object required');
  const o = value as Obj;
  if (Object.keys(o).length !== keys.length || keys.some(k => !Object.hasOwn(o, k))) invalid('schema keys');
  return o;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) invalid('array required');
  if (value.length > max) limit('list budget');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.normalize('NFC') !== value
    || /[\x00-\x1f\x7f-\x9f\ufeff]/.test(value)) invalid('canonical text required');
  return value;
}
function path(value: unknown, absolute = false, allowEmpty = false): string {
  if (allowEmpty && value === '') return '';
  const p = text(value);
  if (byteSize(p) > RAG_SYNC_PLAN_LIMITS.pathBytes) limit('path budget');
  if (p.startsWith('/') !== absolute || /[\\:%?#]/.test(p) || p === '/') invalid('path declaration');
  const parts = (absolute ? p.slice(1) : p).split('/');
  if (parts.some(x => !x || x === '.' || x === '..')) invalid('path segments');
  return p;
}
function identity(value: unknown, nonzero = false): string {
  const v = text(value);
  if (!/^(?:0|[1-9]\d{0,19})$/.test(v) || BigInt(v) > 0xffffffffffffffffn || (nonzero && v === '0')) invalid('decimal root identity');
  return v;
}
function root(value: unknown): RagSyncRoot {
  const r = object(value, ['path', 'dev', 'ino']);
  return { path: path(r.path, true), dev: identity(r.dev), ino: identity(r.ino, true) };
}
function name(value: unknown): string {
  const n = text(value);
  if (n.length > 64 || !/^#[a-z0-9][a-z0-9._+/-]*@[a-z0-9][a-z0-9._-]*$/.test(n)) invalid('full agent name required');
  return n;
}
function destination(value: unknown): string {
  const v = text(value);
  if (byteSize(v) > 128 || v.includes('*')) invalid('explicit namespace/table');
  return v;
}
function excludes(value: unknown): string[] {
  const patterns = list(value, RAG_SYNC_PLAN_LIMITS.patterns).map(v => {
    const s = text(v);
    if ((RAG_SYNC_REQUIRED_EXCLUDES as readonly string[]).includes(s)) return s;
    if (!s.endsWith('/**')) invalid('supported exclude directory prefix required');
    const prefix = path(s.slice(0, -3));
    if (/[*\[\]{}!]/.test(prefix)) invalid('unsupported exclusion glob');
    return s;
  });
  if (new Set(patterns).size !== patterns.length || RAG_SYNC_REQUIRED_EXCLUDES.some(p => !patterns.includes(p))) invalid('required/unique excludes');
  return patterns.sort();
}
function excluded(p: string, patterns: string[]): boolean {
  const parts = p.split('/');
  if (parts.some(x => x.startsWith('.') || dependencies.includes(x))) return true;
  return patterns.some(pattern => !pattern.startsWith('**/') && p.startsWith(pattern.slice(0, -2)));
}
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Obj)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Validates declarations and metadata only; no filesystem, clock, random, provider or grant checks. */
export function planRagSync(value: unknown): RagSyncPlan {
  const raw = object(data(value), ['caller', 'target', 'root', 'include', 'exclude', 'inventory', 'sources', 'oversizeLimit']);
  const declaredRoot = root(raw.root);
  const t = object(raw.target, ['filescan', 'rag', 'namespace', 'table']);
  const target = { filescan: name(t.filescan), rag: name(t.rag), namespace: destination(t.namespace), table: destination(t.table) };
  const caller = name(raw.caller);
  if (target.filescan === target.rag || [target.filescan, target.rag].includes(caller)) invalid('distinct caller/FileScan/RAG required');
  const include = list(raw.include, 1);
  if (include.length !== 1 || include[0] !== '*.md') invalid('supported recursive Markdown mask required');
  const exclude = excludes(raw.exclude);
  if (raw.oversizeLimit !== 32768) invalid('current 32768-byte limit required');
  const inv = object(raw.inventory, ['root', 'complete', 'issues']);
  const inventoryRoot = root(inv.root);
  if (canonical(inventoryRoot) !== canonical(declaredRoot)) invalid('cross-root inventory');
  if (typeof inv.complete !== 'boolean') invalid('inventory completeness required');
  const issueKeys = new Set<string>();
  const issues = list(inv.issues, RAG_SYNC_PLAN_LIMITS.issues).map(v => {
    const i = object(v, ['path', 'reason']); const p = path(i.path, false, true);
    if (!['unreadable', 'changed', 'limit', 'unsupported'].includes(i.reason as string)) invalid('issue reason');
    const reason = i.reason as RagSyncIssue['reason'];
    const key = canonical([p, reason]); if (issueKeys.has(key)) invalid('duplicate issue'); issueKeys.add(key);
    return { path: p, reason };
  }).sort((a, b) => compare(a.path, b.path) || compare(a.reason, b.reason));
  if (inv.complete && issues.length) invalid('issues require incomplete inventory');
  const paths = new Set<string>();
  const sources = list(raw.sources, RAG_SYNC_PLAN_LIMITS.sources).map(v => {
    const s = object(v, ['path', 'size', 'mtimeMs']); const p = path(s.path);
    if (!p.endsWith('.md') || excluded(p, exclude) || paths.has(p)) invalid('unsupported/excluded/duplicate Markdown source');
    paths.add(p);
    if (typeof s.size !== 'number' || !Number.isSafeInteger(s.size) || s.size < 0 || Object.is(s.size, -0)) invalid('source size');
    if (typeof s.mtimeMs !== 'number' || !Number.isFinite(s.mtimeMs) || s.mtimeMs < 0 || s.mtimeMs > 8_640_000_000_000_000 || Object.is(s.mtimeMs, -0)) invalid('source mtime');
    return { path: p, size: s.size, mtimeMs: s.mtimeMs,
      eligibility: s.size > 32768 ? 'oversize' as const : 'eligible-by-metadata' as const };
  }).sort((a, b) => compare(a.path, b.path));
  // A caller can report an issue after a source stat; retaining both makes uncertainty visible.
  const oversize = sources.filter(s => s.eligibility === 'oversize').length;
  const coverage: RagSyncPlan['coverage'] = {
    status: !inv.complete || oversize > 0 ? 'partial' : sources.length ? 'metadata-only' : 'empty',
    total: sources.length, eligible: sources.length - oversize, oversize, issues: issues.length,
    inventoryComplete: inv.complete, textEncoding: 'unverified', providerIndexability: 'unverified',
  };
  const metadata: Omit<RagSyncPlan, 'digest'> = { version: RAG_SYNC_PLAN_VERSION, kind: 'local-plan-only' as const, caller, target,
    root: declaredRoot, include: ['*.md'], exclude, inventory: { root: inventoryRoot, complete: inv.complete, issues }, sources,
    oversizeLimit: 32768 as const, coverage, remoteReadiness: 'unverified' as const, authority: 'declarations-only' as const,
    execution: 'not-performed' as const, digestMeaning: 'canonical-plan-metadata-not-content-or-atomic-folder-proof' as const };
  const serialized = canonical(metadata);
  if (byteSize(serialized) > RAG_SYNC_PLAN_LIMITS.bytes) limit('plan byte budget');
  const plan = { ...metadata, digest: createHash('sha256').update(serialized, 'utf8').digest('hex') };
  if (byteSize(canonical(plan)) > RAG_SYNC_PLAN_LIMITS.bytes) limit('final plan byte budget');
  return plan;
}
