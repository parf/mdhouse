/** Pure caller-asserted analysis state. Replay checks consistency, never authenticity or truth. */
import { validateFlowPackage } from './flow-package';
import type { FlowPackage, FlowTarget } from './flow-package';

export const FLOW_RUN_LIMITS = {
  bytes: 1024 * 1024, preview: 4 * 1024 * 1024, text: 16 * 1024,
  sources: 128, evidence: 128, questions: 128, events: 256, depth: 32,
} as const;
export interface FlowRunSource { id: string; path: string; digest: string }
export interface FlowRunEvidence {
  label: string; status: 'supplied' | 'missing'; sourceIds: string[]; note: string;
}
export interface FlowRunQuestion {
  id: string; title: string; required: boolean; status: 'unanswered' | 'answered';
  sourceIds: string[]; evidenceLabels: string[]; turns: string[];
}
export interface FlowRunInput {
  runId: string; startedAt: string; predecessor?: string;
  package: FlowPackage;
  /** Caller declaration, not proof of a trusted installed artifact. */
  packageDigest: string;
  selection: FlowPackage['defaults'] & {
    root: string; sources: FlowRunSource[]; base: string; target: string; dirtySourceIds: string[];
  };
  evidence: FlowRunEvidence[]; questions: FlowRunQuestion[];
}
export type FlowRunAction =
  | { type: 'evidence'; evidence: FlowRunEvidence }
  | { type: 'question'; questionId: string; status: 'unanswered' | 'answered'; turn: string }
  | { type: 'outcome'; nodeId: string; outcome: 'complete' | 'blocked' | 'failed'; text: string; sourceIds: string[]; questionIds: string[] }
  | { type: 'cancel'; reason: string };
export interface FlowRunEvent { id: string; expectedVersion: number; at: string; action: FlowRunAction }
export type FlowRunStatus = 'running' | 'held' | 'complete' | 'blocked' | 'failed' | 'cancelled' | 'partial' | 'unsupported';
export interface FlowRunState {
  input: FlowRunInput; version: number; nodeId: string; status: FlowRunStatus;
  evidence: FlowRunEvidence[]; questions: FlowRunQuestion[];
  holds: string[]; warnings: string[]; events: FlowRunEvent[];
  unsupported: FlowTarget | null;
}
export interface FlowRunResult { state: FlowRunState; duplicate: boolean }

type Obj = Record<string, unknown>;
const encoder = new TextEncoder();
function invalid(at: string): never { throw new Error(`Invalid flow run: ${at}`); }
/** Copies bounded plain JSON data without invoking accessors or accepting partial normalization. */
function data(value: unknown): unknown {
  let entries = 0;
  let bytes = 0;
  const active = new Set<object>();
  const visit = (v: unknown, depth: number): unknown => {
    if (depth > FLOW_RUN_LIMITS.depth || ++entries > 100_000) invalid('data depth/size');
    if (typeof v === 'string') {
      const size = encoder.encode(v).length;
      bytes += size;
      if (size > FLOW_RUN_LIMITS.text || bytes > FLOW_RUN_LIMITS.bytes) invalid('text/aggregate size');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object' || active.has(v)) invalid('expected finite acyclic JSON data');
    const array = Array.isArray(v);
    if (array && v.length > 100_000) invalid('array size');
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(v))) invalid('expected plain data');
    const keys = Reflect.ownKeys(v);
    if (keys.length > 100_000) invalid('data size');
    active.add(v);
    const out: Obj | unknown[] = array ? [] : Object.create(null);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || (array && !/^(0|[1-9]\d*)$/.test(key))) invalid('data key');
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      if (!('value' in d) || !d.enumerable) invalid('data accessor/hidden property');
      bytes += encoder.encode(key).length;
      if (bytes > FLOW_RUN_LIMITS.bytes) invalid('aggregate size');
      Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && (out as unknown[]).length !== v.length) invalid('sparse array');
    if (array && keys.length !== v.length + 1) invalid('sparse array');
    active.delete(v);
    return out;
  };
  const result = visit(value, 0);
  bounded(result);
  return result;
}
function bounded(value: unknown): void {
  if (encoder.encode(JSON.stringify(value)).length > FLOW_RUN_LIMITS.bytes) invalid('serialized size');
}
function object(v: unknown, keys: string[], required = keys): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid('expected object');
  const o = v as Obj;
  if (Object.keys(o).some(k => !keys.includes(k)) || required.some(k => !Object.hasOwn(o, k))) invalid('object keys');
  return o;
}
function text(v: unknown, at: string): string {
  if (typeof v !== 'string' || !v.trim()) invalid(at);
  return v;
}
function slug(v: unknown): string {
  const s = text(v, 'ID');
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(s) || s.length > 128) invalid('ID');
  return s;
}
function hex(v: unknown, size: number): string {
  const s = text(v, 'hex');
  if (s.length !== size || !/^[0-9a-f]+$/.test(s)) invalid('hex');
  return s;
}
function time(v: unknown): string {
  const s = text(v, 'UTC time');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)
    || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) invalid('UTC time');
  return s;
}
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T)) invalid('choice');
  return v as T;
}
function list(v: unknown, max = 128): unknown[] {
  if (!Array.isArray(v) || v.length > max) invalid('list');
  return v;
}
function refs(v: unknown, allowed: string[]): string[] {
  const all = list(v).map(x => text(x, 'reference'));
  if (new Set(all).size !== all.length || all.some(x => !allowed.includes(x))) invalid('unknown/duplicate reference');
  return all;
}
function questionId(v: unknown): string {
  const s = text(v, 'question ID');
  if (!/^Q[1-9]\d{0,5}$/.test(s)) invalid('question ID');
  return s;
}
function evidence(v: unknown, labels: string[], sources: string[]): FlowRunEvidence {
  const o = object(v, ['label', 'status', 'sourceIds', 'note']);
  const label = text(o.label, 'evidence label');
  if (!labels.includes(label)) invalid('unknown evidence');
  const status = choice(o.status, ['supplied', 'missing'] as const);
  const sourceIds = refs(o.sourceIds, sources);
  if (status === 'supplied' && !sourceIds.length) invalid('supplied evidence requires source reference');
  return { label, status, sourceIds, note: text(o.note, 'evidence note') };
}
function input(v: unknown): FlowRunInput {
  const o = object(v, ['runId', 'startedAt', 'predecessor', 'package', 'packageDigest', 'selection', 'evidence', 'questions'],
    ['runId', 'startedAt', 'package', 'packageDigest', 'selection', 'evidence', 'questions']);
  const pkg = validateFlowPackage(o.package);
  const s = object(o.selection, ['scope', 'range', 'audience', 'output', 'destination', 'root', 'sources', 'base', 'target', 'dirtySourceIds']);
  const defaults = validateFlowPackage({ ...pkg, defaults: { scope: s.scope, range: s.range, audience: s.audience, output: s.output, destination: s.destination } }).defaults;
  const sources = list(s.sources, FLOW_RUN_LIMITS.sources).map(v => {
    const source = object(v, ['id', 'path', 'digest']);
    const path = text(source.path, 'source path');
    if (path.startsWith('/') || /[\\:%?#\x00-\x1f\x7f]/.test(path)
      || path.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')) invalid('source declaration');
    return { id: slug(source.id), path, digest: hex(source.digest, 64) };
  });
  const sourceIds = sources.map(s => s.id);
  if (!sources.length || new Set(sourceIds).size !== sources.length) invalid('missing/duplicate sources');
  const labels = pkg.evidence.required;
  const allEvidence = list(o.evidence, FLOW_RUN_LIMITS.evidence).map(v => evidence(v, labels, sourceIds));
  if (allEvidence.length !== labels.length || new Set(allEvidence.map(e => e.label)).size !== labels.length) invalid('required evidence keys');
  const questions = list(o.questions, FLOW_RUN_LIMITS.questions).map(v => {
    const q = object(v, ['id', 'title', 'required', 'status', 'sourceIds', 'evidenceLabels', 'turns']);
    if (typeof q.required !== 'boolean') invalid('required question');
    return { id: questionId(q.id), title: text(q.title, 'question title'), required: q.required,
      status: choice(q.status, ['unanswered', 'answered'] as const), sourceIds: refs(q.sourceIds, sourceIds),
      evidenceLabels: refs(q.evidenceLabels, labels), turns: list(q.turns).map(v => text(v, 'question turn')) };
  });
  if (new Set(questions.map(q => q.id)).size !== questions.length) invalid('duplicate questions');
  const runId = slug(o.runId);
  const result: FlowRunInput = { runId, startedAt: time(o.startedAt), package: pkg,
    packageDigest: hex(o.packageDigest, 64), selection: { ...defaults, root: slug(s.root), sources,
      base: hex(s.base, 40), target: hex(s.target, 40), dirtySourceIds: refs(s.dirtySourceIds, sourceIds) }, evidence: allEvidence, questions };
  if (Object.hasOwn(o, 'predecessor')) {
    result.predecessor = slug(o.predecessor);
    if (result.predecessor === runId) invalid('self predecessor');
  }
  return result;
}
function event(v: unknown, state: FlowRunState): FlowRunEvent {
  const o = object(v, ['id', 'expectedVersion', 'at', 'action']);
  if (!Number.isSafeInteger(o.expectedVersion) || (o.expectedVersion as number) < 0 || (o.expectedVersion as number) >= FLOW_RUN_LIMITS.events) invalid('expectedVersion');
  const a = object(o.action, ['type', 'evidence', 'questionId', 'status', 'turn', 'nodeId', 'outcome', 'text', 'sourceIds', 'questionIds', 'reason'], ['type']);
  const sources = state.input.selection.sources.map(s => s.id);
  let action: FlowRunAction;
  switch (a.type) {
    case 'evidence':
      object(a, ['type', 'evidence']);
      action = { type: 'evidence', evidence: evidence(a.evidence, state.input.package.evidence.required, sources) }; break;
    case 'question':
      object(a, ['type', 'questionId', 'status', 'turn']);
      if (!state.questions.some(q => q.id === a.questionId)) invalid('undeclared question');
      action = { type: 'question', questionId: questionId(a.questionId), status: choice(a.status, ['unanswered', 'answered'] as const), turn: text(a.turn, 'question turn') }; break;
    case 'outcome':
      object(a, ['type', 'nodeId', 'outcome', 'text', 'sourceIds', 'questionIds']);
      action = { type: 'outcome', nodeId: slug(a.nodeId), outcome: choice(a.outcome, ['complete', 'blocked', 'failed'] as const),
        text: text(a.text, 'analysis text'), sourceIds: refs(a.sourceIds, sources), questionIds: refs(a.questionIds, state.questions.map(q => q.id)) }; break;
    case 'cancel':
      object(a, ['type', 'reason']); action = { type: 'cancel', reason: text(a.reason, 'cancel reason') }; break;
    default: return invalid('analysis action only');
  }
  return { id: slug(o.id), expectedVersion: o.expectedVersion as number, at: time(o.at), action };
}
function assess(state: FlowRunState): void {
  state.holds = [];
  state.warnings = [];
  for (const e of state.evidence) if (e.status === 'missing') {
    (state.input.package.evidence.missing === 'block' ? state.holds : state.warnings).push(`Missing evidence: ${e.label}`);
  }
  for (const q of state.questions) if (q.required && q.status === 'unanswered') state.holds.push(`Unanswered question: ${q.id}`);
  if (state.status === 'running' || state.status === 'held') state.status = state.holds.length ? 'held' : 'running';
}
function initial(i: FlowRunInput): FlowRunState {
  // Separate input assertions from their changing current values.
  const state: FlowRunState = { input: i, version: 0, nodeId: i.package.entry, status: 'running',
    evidence: structuredClone(i.evidence), questions: structuredClone(i.questions), holds: [], warnings: [], events: [], unsupported: null };
  enter(state);
  assess(state);
  return state;
}
function enter(state: FlowRunState): void {
  const node = state.input.package.steps.find(n => n.id === state.nodeId)!;
  if (node.effect !== 'analysis') {
    state.status = 'unsupported';
    state.unsupported = { kind: 'step', id: node.id };
  }
}
function accept(state: FlowRunState, ev: FlowRunEvent): void {
  if (!['running', 'held'].includes(state.status)) invalid('terminal state');
  if (ev.expectedVersion !== state.version) invalid('stale event version');
  if (ev.at < (state.events.at(-1)?.at ?? state.input.startedAt)) invalid('event chronology');
  if (state.events.length >= FLOW_RUN_LIMITS.events) invalid('event limit');
  const a = ev.action;
  if (a.type === 'evidence') state.evidence = state.evidence.map(e => e.label === a.evidence.label ? structuredClone(a.evidence) : e);
  else if (a.type === 'question') {
    state.questions = state.questions.map(q => q.id === a.questionId ? { ...q, status: a.status, turns: [...q.turns, a.turn] } : q);
    if (state.questions.some(q => q.turns.length > 128)) invalid('question turn limit');
  } else if (a.type === 'cancel') state.status = 'cancelled';
  else {
    if (a.nodeId !== state.nodeId) invalid('out-of-order node');
    if (a.outcome === 'complete' && state.holds.length) invalid('required evidence/questions hold completion');
    const node = state.input.package.steps.find(n => n.id === state.nodeId)!;
    const route = node.on[a.outcome]!;
    if (route.kind === 'step') { state.nodeId = route.id; enter(state); }
    else if (route.kind === 'handoff') { state.status = 'unsupported'; state.unsupported = structuredClone(route); }
    else state.status = route.status;
  }
  state.version++;
  state.events.push(ev);
  assess(state);
  bounded(state);
}
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Obj)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
/** Creates detached state from explicit declarations; no clock, filesystem, provider or permission check. */
export function createFlowRun(value: unknown): FlowRunState {
  const state = initial(input(data(value)));
  bounded(state);
  return state;
}
/** Replays bounded public data for consistency. This is not authentication or a tamper-proof journal. */
export function validateFlowRunState(value: unknown): FlowRunState {
  const raw = object(data(value), ['input', 'version', 'nodeId', 'status', 'evidence', 'questions', 'holds', 'warnings', 'events', 'unsupported']);
  const state = initial(input(raw.input));
  const ids = new Set<string>();
  for (const item of list(raw.events, FLOW_RUN_LIMITS.events)) {
    const ev = event(item, state);
    if (ids.has(ev.id)) invalid('duplicate journal event');
    ids.add(ev.id);
    accept(state, ev);
  }
  if (stable(raw) !== stable(state)) invalid('inconsistent state');
  return state;
}
/** Accepts only analysis assertions. Exact event retries are idempotent, including after termination. */
export function applyFlowRunEvent(value: unknown, payload: unknown): FlowRunResult {
  const state = validateFlowRunState(value);
  const ev = event(data(payload), state);
  const previous = state.events.find(e => e.id === ev.id);
  if (previous) {
    if (stable(previous) !== stable(ev)) invalid('event ID reused with different payload');
    return { state, duplicate: true };
  }
  accept(state, ev);
  return { state, duplicate: false };
}
