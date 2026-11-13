import { expect, test } from 'bun:test';
import { loadFlowPackage } from '../src/lib/flow-package';
import { applyFlowRunEvent, createFlowRun, FLOW_RUN_LIMITS, validateFlowRunState } from '../src/lib/flow-run';
import type { FlowRunEvent, FlowRunInput, FlowRunState } from '../src/lib/flow-run';

export async function runInput(id = 'project-review'): Promise<FlowRunInput> {
  const { manifest } = await loadFlowPackage(`${import.meta.dir}/../agents/flows/${id}`);
  return { runId: 'example-run', startedAt: '2026-11-06T01:00:00.000Z', package: manifest,
    packageDigest: 'a'.repeat(64), selection: { ...manifest.defaults, root: 'project',
      sources: [{ id: 'source-one', path: 'src/example.ts', digest: 'b'.repeat(64) }],
      base: '1'.repeat(40), target: '2'.repeat(40), dirtySourceIds: [] },
    evidence: manifest.evidence.required.map(label => ({ label, status: 'supplied', sourceIds: ['source-one'], note: 'Synthetic supplied assertion, not verified.' })),
    questions: [] };
}
function outcome(state: FlowRunState, value: 'complete' | 'blocked' | 'failed' = 'complete'): FlowRunEvent {
  return { id: `event-${state.version}`, expectedVersion: state.version, at: state.input.startedAt,
    action: { type: 'outcome', nodeId: state.nodeId, outcome: value, text: 'Caller says analysis is complete; not verified.', sourceIds: ['source-one'], questionIds: [] } };
}
function apply(state: FlowRunState, event: FlowRunEvent): FlowRunState { return applyFlowRunEvent(state, event).state; }

test('project-review and generic legal package follow their existing analysis graph with deterministic caller times', async () => {
  for (const id of ['project-review', 'legal-contract-review']) {
    const input = await runInput(id);
    let state = createFlowRun(input);
    for (const step of input.package.steps) {
      expect(state.nodeId).toBe(step.id);
      const previous = structuredClone(state);
      state = apply(state, outcome(state));
      expect(state.version).toBe(previous.version + 1);
      expect(previous.events).toHaveLength(previous.version);
      expect(validateFlowRunState(state)).toEqual(state);
    }
    expect(state.status).toBe('complete');
    expect(createFlowRun(input)).toEqual(createFlowRun(input));
    expect(state.input.selection.target).toBe('2'.repeat(40));
    expect(JSON.stringify(state)).not.toContain('last-commit-id');
  }
});

test('all public calls return detached data and never mutate their inputs', async () => {
  const input = await runInput();
  const state = createFlowRun(input);
  input.package.steps[0]!.id = 'changed'; input.evidence[0]!.note = 'changed';
  expect(state.nodeId).toBe('scope'); expect(state.evidence[0]!.note).not.toBe('changed');
  const event = outcome(state); const before = structuredClone(state);
  const result = applyFlowRunEvent(state, event);
  event.action = { type: 'cancel', reason: 'changed' };
  result.state.input.package.steps[0]!.id = 'detached';
  expect(state).toEqual(before); expect(result.state.events[0]!.action.type).toBe('outcome');
  const cloned = validateFlowRunState(state); cloned.evidence[0]!.sourceIds.push('changed');
  expect(state).toEqual(before);
});

test('required evidence block holds, report warns, and required unanswered questions still hold', async () => {
  const input = await runInput(); input.evidence[0]!.status = 'missing'; input.evidence[0]!.sourceIds = [];
  let state = createFlowRun(input);
  expect(state.status).toBe('held'); expect(state.holds).toHaveLength(1);
  expect(() => apply(state, outcome(state))).toThrow('hold');
  expect(apply(state, outcome(state, 'blocked')).status).toBe('blocked');
  input.package.evidence.missing = 'report';
  state = createFlowRun(input); expect(state.status).toBe('running'); expect(state.warnings).toHaveLength(1);
  expect(apply(state, outcome(state)).nodeId).toBe('review');
  input.questions = [{ id: 'Q1', title: 'Need required evidence?', required: true, status: 'unanswered', sourceIds: ['source-one'], evidenceLabels: [input.evidence[0]!.label], turns: [] }];
  state = createFlowRun(input); expect(state.status).toBe('held');
  state = apply(state, { id: 'answer', expectedVersion: 0, at: input.startedAt,
    action: { type: 'question', questionId: 'Q1', status: 'answered', turn: 'Caller assertion, not human approval.' } });
  expect(state.status).toBe('running'); expect(state.questions[0]!.turns).toEqual(['Caller assertion, not human approval.']);
  input.questions[0]!.required = false;
  expect(createFlowRun(input).status).toBe('running');
});

test('evidence assertion releases a hold without changing initial snapshot; questions can reopen', async () => {
  const input = await runInput(); input.evidence[0]!.status = 'missing';
  let state = createFlowRun(input);
  state = apply(state, { id: 'evidence', expectedVersion: 0, at: input.startedAt,
    action: { type: 'evidence', evidence: { ...input.evidence[0]!, status: 'supplied' } } });
  expect(state.status).toBe('running'); expect(state.input.evidence[0]!.status).toBe('missing');
  input.questions = [{ id: 'Q2', title: 'Scope?', required: true, status: 'answered', sourceIds: [], evidenceLabels: [], turns: [] }];
  state = createFlowRun(input);
  state = apply(state, { id: 'reopen', expectedVersion: 0, at: input.startedAt,
    action: { type: 'question', questionId: 'Q2', status: 'unanswered', turn: 'Uncertainty remains.' } });
  expect(state.holds).toContain('Unanswered question: Q2');
});

test('exact retries are idempotent; conflicts, stale versions, times and node order are rejected unchanged', async () => {
  const initial = createFlowRun(await runInput()); const ev = outcome(initial);
  const next = apply(initial, ev); const before = structuredClone(next);
  const duplicate = applyFlowRunEvent(next, ev);
  expect(duplicate).toEqual({ state: next, duplicate: true });
  duplicate.state.evidence[0]!.note = 'detached'; expect(next).toEqual(before);
  const different = structuredClone(ev); different.at = '2026-11-06T01:00:01.000Z';
  expect(() => apply(next, different)).toThrow('different payload');
  expect(() => apply(next, { ...outcome(next), expectedVersion: 0 })).toThrow('stale');
  expect(() => apply(next, { ...outcome(next), at: '2026-11-06T00:59:59.999Z' })).toThrow('chronology');
  const wrong = outcome(next); if (wrong.action.type === 'outcome') wrong.action.nodeId = 'report';
  expect(() => apply(next, wrong)).toThrow('out-of-order'); expect(next).toEqual(before);
});

test('terminal outcomes are immutable except exact retry, and a new run may link its predecessor', async () => {
  for (const terminal of ['blocked', 'failed', 'cancelled', 'complete'] as const) {
    let state = createFlowRun(await runInput()); let last = outcome(state, terminal === 'blocked' ? 'blocked' : 'failed');
    if (terminal === 'cancelled') last.action = { type: 'cancel', reason: 'Caller cancelled.' };
    if (terminal === 'complete') {
      while (state.nodeId !== 'report') state = apply(state, outcome(state));
      last = outcome(state);
    }
    state = apply(state, last); expect(state.status).toBe(terminal);
    expect(applyFlowRunEvent(state, last).duplicate).toBe(true);
    expect(() => apply(state, { id: 'later', expectedVersion: state.version, at: state.input.startedAt, action: { type: 'cancel', reason: 'Retry' } })).toThrow('terminal');
    const input = await runInput(); input.runId = 'next-run'; input.predecessor = state.input.runId;
    expect(createFlowRun(input).input.predecessor).toBe('example-run');
  }
});

test('consequential entry, later consequential step and handoff terminate unsupported without provider success', async () => {
  const incoming = await runInput('incoming-change-review');
  let state = createFlowRun(incoming);
  while (state.status === 'running') state = apply(state, outcome(state));
  expect(state.status).toBe('unsupported'); expect(state.nodeId).toBe('merge');
  expect(state.events.every(e => e.action.type === 'outcome' && e.action.outcome === 'complete')).toBe(true);
  expect(() => apply(state, outcome(state))).toThrow('terminal');
  incoming.package.entry = 'merge'; incoming.package.steps = incoming.package.steps.filter(s => ['merge', 'post-merge', 'report'].includes(s.id));
  expect(createFlowRun(incoming).status).toBe('unsupported');
  state = createFlowRun(await runInput('ideas-to-project'));
  while (state.status === 'running') state = apply(state, outcome(state));
  expect(state.status).toBe('unsupported'); expect(state.unsupported).toEqual({ kind: 'handoff', to: 'person', target: 'project-owner' });
});

test('replay rejects inconsistent or malformed public states, not claiming authenticity', async () => {
  const original = createFlowRun(await runInput());
  for (const mutate of [
    (s: FlowRunState) => { s.version = 9; }, (s: FlowRunState) => { s.status = 'complete'; },
    (s: FlowRunState) => { s.evidence[0]!.note = 'forged'; }, (s: FlowRunState) => { s.nodeId = 'report'; },
  ]) {
    const s = structuredClone(original); mutate(s);
    expect(() => validateFlowRunState(s)).toThrow(); expect(() => apply(s, outcome(original))).toThrow();
  }
  const next = apply(original, outcome(original)); next.events.push(next.events[0]!);
  expect(() => validateFlowRunState(next)).toThrow();
  const modifiedInput = await runInput(); modifiedInput.evidence[0]!.note = 'Different caller assertion.';
  expect(validateFlowRunState(createFlowRun(modifiedInput)).input.evidence[0]!.note).toBe('Different caller assertion.');
});

test('public unknown rejects foreign keys, invalid digest/revision/time and unbound or conflicting assertions', async () => {
  const seed = await runInput();
  const changes: ((i: any) => void)[] = [
    i => { i.extra = true; }, i => { i.packageDigest = 'g'.repeat(64); }, i => { i.selection.target = 'abc'; },
    i => { i.startedAt = '2026-02-30T01:00:00.000Z'; }, i => { i.startedAt = '2026-11-06T01:00:00+00:00'; },
    i => { i.evidence.push(i.evidence[0]); }, i => { i.evidence.pop(); }, i => { i.evidence[0].label = 'unknown'; },
    i => { i.evidence[0].sourceIds = ['undeclared']; }, i => { i.evidence[0].sourceIds = ['source-one', 'source-one']; },
    i => { i.selection.sources.push(i.selection.sources[0]); }, i => { i.selection.sources[0].path = '../escape'; },
    i => { i.predecessor = i.runId; }, i => { i.evidence[0].status = 'verified'; },
    i => { i.questions = [{ id: 'Q1', title: 'Question', required: true, status: 'unanswered', sourceIds: [], evidenceLabels: ['unknown'], turns: [] }]; },
  ];
  for (const change of changes) { const i = structuredClone(seed); change(i); expect(() => createFlowRun(i)).toThrow(); }
  const state = createFlowRun(seed);
  for (const action of [
    { type: 'question', questionId: 'Q9', status: 'answered', turn: 'Unbound' },
    { type: 'outcome', nodeId: 'scope', outcome: 'succeeded', text: 'Forged', sourceIds: [], questionIds: [] },
    { type: 'outcome', nodeId: 'scope', outcome: 'complete', text: 'Text', sourceIds: [], questionIds: ['Q9'] },
    { type: 'cancel', reason: 'Text', approval: true },
  ]) expect(() => applyFlowRunEvent(state, { id: 'event', expectedVersion: 0, at: seed.startedAt, action })).toThrow();
});

test('finite bounded JSON gate rejects cycles, sparse/accessor/prototype/deep/oversized inputs without running getters', async () => {
  const seed = await runInput(); let called = false;
  const getter = { ...seed }; Object.defineProperty(getter, 'runId', { get() { called = true; return 'bad'; }, enumerable: true });
  const cycle: any = {}; cycle.self = cycle;
  let deep: any = {}; for (let n = 0; n < 34; n++) deep = { next: deep };
  const sparse = new Array(4); sparse[3] = 'only';
  const unknowns = [getter, cycle, deep, sparse, new Date(), NaN, Infinity, undefined,
    { ...seed, extra: () => {} }, { ...seed, extra: '\u{1f600}'.repeat(5000) }, { ...seed, extra: 'x'.repeat(FLOW_RUN_LIMITS.text + 1) }];
  for (const v of unknowns) expect(() => createFlowRun(v)).toThrow();
  expect(called).toBe(false);
  const input = await runInput(); input.questions = Array.from({ length: 129 }, (_, i) => ({ id: `Q${i+1}`, title: 'Question', required: false, status: 'unanswered', sourceIds: [], evidenceLabels: [], turns: [] }));
  expect(() => createFlowRun(input)).toThrow();
});

test('bounded event journal stops growth and preserves exact retry at its limit', async () => {
  const input = await runInput(); let state = createFlowRun(input);
  const first: FlowRunEvent = { id: 'assert-0', expectedVersion: 0, at: input.startedAt,
    action: { type: 'evidence', evidence: input.evidence[0]! } };
  for (let i = 0; i < FLOW_RUN_LIMITS.events; i++) state = apply(state, { ...first, id: `assert-${i}`, expectedVersion: i });
  expect(state.events).toHaveLength(256);
  expect(applyFlowRunEvent(state, first).duplicate).toBe(true);
  const before = structuredClone(state);
  expect(() => apply(state, { ...first, id: 'over-limit', expectedVersion: 256 })).toThrow();
  expect(state).toEqual(before);
});

test('aggregate byte bounds, array subclasses, hidden/symbol keys and invalid event envelopes reject', async () => {
  const seed = await runInput();
  const big = structuredClone(seed);
  big.questions = Array.from({ length: 80 }, (_, i) => ({ id: `Q${i+1}`, title: 'x'.repeat(16000), required: false, status: 'unanswered', sourceIds: [], evidenceLabels: [], turns: [] }));
  expect(() => createFlowRun(big)).toThrow('size');
  class ForeignArray extends Array {}
  for (const extra of [new ForeignArray(), new Array(100_001)]) expect(() => createFlowRun({ ...seed, extra })).toThrow();
  const symbol = { ...seed, [Symbol('hidden')]: 1 };
  const hidden = { ...seed }; Object.defineProperty(hidden, 'extra', { value: 1 });
  expect(() => createFlowRun(symbol)).toThrow(); expect(() => createFlowRun(hidden)).toThrow();
  const state = createFlowRun(seed);
  for (const value of [-1, 0.5, Infinity, 256]) expect(() => applyFlowRunEvent(state, { ...outcome(state), expectedVersion: value })).toThrow();
  expect(() => applyFlowRunEvent(state, { ...outcome(state), at: '2026-11-06T25:00:00.000Z' })).toThrow();
  const contradictory = structuredClone(seed); contradictory.evidence.push({ ...seed.evidence[0]!, status: 'missing' });
  expect(() => createFlowRun(contradictory)).toThrow();
});

test('current assertions and unsupported targets do not alias their immutable snapshots or event payloads', async () => {
  const input = await runInput(); let state = createFlowRun(input);
  state = apply(state, { id: 'assertion', expectedVersion: 0, at: input.startedAt,
    action: { type: 'evidence', evidence: { ...input.evidence[0]!, note: 'New assertion' } } });
  state.evidence[0]!.sourceIds.push('changed');
  const recorded = state.events[0]!.action;
  expect(recorded.type).toBe('evidence');
  if (recorded.type === 'evidence') expect(recorded.evidence.sourceIds).toEqual(['source-one']);
  expect(state.input.evidence[0]!.sourceIds).toEqual(['source-one']);
  state = createFlowRun(await runInput('ideas-to-project'));
  while (state.status === 'running') state = apply(state, outcome(state));
  if (state.unsupported?.kind === 'handoff') state.unsupported.target = 'changed';
  expect(state.input.package.steps.at(-1)!.on.complete).toEqual({ kind: 'handoff', to: 'person', target: 'project-owner' });
});
