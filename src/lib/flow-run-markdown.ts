/** Deterministic unsaved preview. Supplied strings remain fenced data, never Markdown instructions. */
import { FLOW_RUN_LIMITS, validateFlowRunState } from './flow-run';

function literal(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  let longest = 0;
  for (const match of json.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}json\n${json}\n${fence}`;
}

/** Renders caller assertions, not verified findings, owner answers, permissions or saved history. */
export function previewFlowRun(value: unknown): string {
  const state = validateFlowRunState(value);
  const lines = [
    '# Flow analysis preview', '',
    'Unsaved, caller-asserted data. No analysis execution, semantic verification, authenticated approval,',
    'filesystem access, marker advance or saved history is claimed.',
    'Supplied digests are declarations, not proof of trusted installed packages or source contents.',
    'Validation/replay establishes consistency, not authenticity or a tamper-proof journal.', '',
    '## Run and selection', '',
    literal({ runId: state.input.runId, startedAt: state.input.startedAt,
      ...(state.input.predecessor ? { predecessor: state.input.predecessor } : {}),
      package: state.input.package, packageDigest: state.input.packageDigest, selection: state.input.selection }), '',
    '## State and evidence assertions', '',
    literal({ version: state.version, nodeId: state.nodeId, status: state.status,
      holds: state.holds, warnings: state.warnings, unsupported: state.unsupported, evidence: state.evidence }), '',
    '## Caller questions', '',
  ];
  for (const question of state.questions) {
    if (question.status === 'unanswered') {
      lines.push(`- ❓ ${question.id} Caller-asserted question`,
        '  Requiredness, words and source references below are supplied data.',
        '  > 💬👾 The caller reports this question as unanswered; no human answer is inferred.', '',
        ...literal(question).split('\n').map(line => `  ${line}`), '',
        `Reference №${question.id}.`, '');
    } else {
      // A caller-reported answer is not an authenticated human turn or a settled decision.
      lines.push(`<a id="${question.id}"></a>`, '',
        `Caller-reported answered question №${question.id}; no authenticated answer or decision is inferred.`, '',
        literal(question), '');
    }
  }
  lines.push('## In-memory event history', '', literal(state.events), '',
    'This preview grants no project, administrator, write or external-action authority.',
    'Trusted package/source/access checks and materialization belong to a separately gated host.', '');
  const result = lines.join('\n');
  if (new TextEncoder().encode(result).length > FLOW_RUN_LIMITS.preview) throw new Error('Flow run preview exceeds size limit');
  return result;
}

/** The info string of the fenced block that holds a run document's state. */
export const FLOW_STATE_INFO = 'json mdhouse-flow-state';
const MARKER = /^<!-- last-commit-id: ([0-9a-f]{40}) -->$/m;

/** What the host knows about a materialized run, beside its state. */
export interface FlowRunDocMeta {
  /** The served root's id (the state's `selection.root` is only a slug of it). */
  rootId: string;
  runPath: string;
  trigger: { kind: 'manual'; actor: string } | { kind: 'schedule'; id: string; slot: string };
  /** The commit this document's marker names: the run's base until a successful run advances it. */
  marker: string;
  /** Commits in `base..target`, oldest first, `<hash> <subject>`. */
  commits: string[];
  /** Uncommitted paths under the root, not part of the range. */
  dirty: string[];
}

function fenced(info: string, body: string): string {
  let longest = 0;
  for (const match of body.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${info}\n${body}\n${fence}`;
}

/**
 * The run's Markdown document. `## Findings` and `## Checks` are the analyst's; every other section is
 * the host's, rendered from the validated state. Supplied text stays fenced data.
 */
export function renderFlowRunDocument(value: unknown, meta: FlowRunDocMeta): string {
  const state = validateFlowRunState(value);
  const { input } = state;
  const pkg = input.package;
  const sel = input.selection;
  const nodeAt = pkg.steps.findIndex((s) => s.id === state.nodeId);
  const done = state.status !== 'running' && state.status !== 'held';
  const evidence = state.evidence.map((e) => `- ${e.status === 'supplied' ? '✅' : '❓'} ${e.label}`);
  const lines = [
    `# ${pkg.title} — run ${input.runId}`, '',
    `<!-- last-commit-id: ${meta.marker} -->`, '',
    `Status: **${state.status}**${done ? '' : ` · current step: \`${state.nodeId}\``} · range \`${sel.base.slice(0, 12)}..${sel.target.slice(0, 12)}\` (${meta.commits.length} commits)`, '',
    '## Run', '',
    literal({ runId: input.runId, startedAt: input.startedAt, trigger: meta.trigger, root: meta.rootId, package: pkg.id,
      base: sel.base, target: sel.target, scope: sel.scope, audience: sel.audience, output: sel.output,
      destination: sel.destination, runDocument: meta.runPath }), '',
    '## Plan', '',
    ...pkg.steps.map((s, i) => `${i + 1}. ${!done && i === nodeAt ? '▶ ' : ''}\`${s.id}\` — ${s.effect}, instructions: \`${s.document}\``), '',
    '## Evidence', '',
    ...evidence, '',
    ...(state.holds.length ? ['Holds:', '', literal(state.holds), ''] : []),
    ...(state.warnings.length ? ['Warnings:', '', literal(state.warnings), ''] : []),
    '## Commits in range', '',
    literal(meta.commits), '',
    '## Uncommitted (not in range)', '',
    meta.dirty.length ? literal(meta.dirty) : 'None.', '',
    '## Findings', '',
    '_The analyst writes findings here, each with its evidence and severity._', '',
    '## Checks', '',
    '_Checks run and their results._', '',
    '## Transitions', '',
    literal(state.events), '',
    '## Outcome', '',
    done ? `Run ended: **${state.status}**.` : 'Open — no outcome yet.', '',
    '## Run state', '',
    'Maintained by mdhouse; edits here are rejected by replay.', '',
    fenced(FLOW_STATE_INFO, JSON.stringify(state, null, 2)), '',
  ];
  const result = lines.join('\n');
  if (new TextEncoder().encode(result).length > FLOW_RUN_LIMITS.preview) throw new Error('Flow run document exceeds size limit');
  return result;
}

/** A run document's validated state and marker; null when the text holds none, or one that does not replay. */
export function readFlowRunDocument(text: string): { state: ReturnType<typeof validateFlowRunState>; marker: string | null } | null {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^`{3,}json mdhouse-flow-state$/.test(l));
  if (at === -1) return null;
  const fence = lines[at]!.slice(0, lines[at]!.indexOf('json'));
  const end = lines.findIndex((l, i) => i > at && l === fence);
  if (end === -1) return null;
  try {
    const state = validateFlowRunState(JSON.parse(lines.slice(at + 1, end).join('\n')));
    return { state, marker: MARKER.exec(text)?.[1] ?? null };
  } catch {
    return null;
  }
}

/** The `last-commit-id` a document names; null when none. */
export const markerOf = (text: string): string | null => MARKER.exec(text)?.[1] ?? null;
