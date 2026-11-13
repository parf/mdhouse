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
/** The info string of the fenced block that holds the host's facts about a run (`FlowRunDocMeta`). */
export const FLOW_META_INFO = 'json mdhouse-flow-meta';
const MARKER_LINE = /^<!-- last-commit-id: ([0-9a-f]{40}) -->$/;

/** The first marker line outside fenced code: its line index and commit; null when none. */
function markerAt(lines: string[]): { at: number; commit: string } | null {
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length && line.trim() === open) fence = null;
      continue;
    }
    if (open) {
      fence = open;
      continue;
    }
    const m = MARKER_LINE.exec(line);
    if (m) return { at: i, commit: m[1]! };
  }
  return null;
}

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
  /** The starting host's seal over the run input (`verifyRun`). */
  seal?: FlowRunSeal;
}

/** `key`: the sealing key's id; `mac`: HMAC-SHA256 over the run input, hex. */
export interface FlowRunSeal {
  key: string;
  mac: string;
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
    fenced(FLOW_META_INFO, JSON.stringify(meta)), '',
  ];
  const result = lines.join('\n');
  if (new TextEncoder().encode(result).length > FLOW_RUN_LIMITS.preview) throw new Error('Flow run document exceeds size limit');
  return result;
}

/** The JSON of the first fenced block with `info`; undefined when there is none or it does not parse. */
function fencedJson(text: string, info: string): unknown {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^`{3,}/.test(l) && l.replace(/^`+/, '') === info);
  if (at === -1) return undefined;
  const fence = lines[at]!.slice(0, lines[at]!.length - info.length);
  const end = lines.findIndex((l, i) => i > at && l === fence);
  if (end === -1) return undefined;
  try {
    return JSON.parse(lines.slice(at + 1, end).join('\n')) as unknown;
  } catch {
    return undefined;
  }
}

/** A run document's validated state and marker; null when the text holds none, or one that does not replay. */
export function readFlowRunDocument(text: string): { state: ReturnType<typeof validateFlowRunState>; marker: string | null } | null {
  const raw = fencedJson(text, FLOW_STATE_INFO);
  if (raw === undefined) return null;
  try {
    return { state: validateFlowRunState(raw), marker: markerOf(text) };
  } catch {
    return null;
  }
}

const STR = (v: unknown): v is string => typeof v === 'string';
const STRS = (v: unknown): v is string[] => Array.isArray(v) && v.every(STR);

/** The host's facts a run document carries; null when the block is missing or malformed. */
export function readFlowRunMeta(text: string): FlowRunDocMeta | null {
  const m = fencedJson(text, FLOW_META_INFO) as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') return null;
  const t = m.trigger as Record<string, unknown> | undefined;
  const trigger =
    t?.kind === 'manual' && STR(t.actor) ? { kind: 'manual' as const, actor: t.actor }
    : t?.kind === 'schedule' && STR(t.id) && STR(t.slot) ? { kind: 'schedule' as const, id: t.id, slot: t.slot }
    : null;
  if (!trigger || !STR(m.rootId) || !STR(m.runPath) || !STR(m.marker) || !/^[0-9a-f]{40}$/.test(m.marker) || !STRS(m.commits) || !STRS(m.dirty)) return null;
  const s = m.seal as Record<string, unknown> | undefined;
  const seal = s && STR(s.key) && /^[0-9a-f]{16}$/.test(s.key) && STR(s.mac) && /^[0-9a-f]{64}$/.test(s.mac) ? { seal: { key: s.key, mac: s.mac } } : {};
  return { rootId: m.rootId, runPath: m.runPath, trigger, marker: m.marker, commits: m.commits, dirty: m.dirty, ...seal };
}

const ANALYST = /^## Findings$[\s\S]*?(?=^## Transitions$)/m;

/**
 * `next` with the analyst's sections (`## Findings` through `## Checks`, up to `## Transitions`)
 * taken from `previous`; null when `previous` no longer has them, so no text is lost.
 */
export function keepAnalystSections(previous: string, next: string): string | null {
  const kept = ANALYST.exec(previous)?.[0];
  if (kept === undefined || !ANALYST.test(next)) return null;
  return next.replace(ANALYST, () => kept);
}

/**
 * The destination document after a complete run: its `last-commit-id` set to `target` and its
 * `Last run:` line to the run; created with a title when there is none. Everything else stays.
 */
export function advanceDestination(text: string | null, run: { title: string; target: string; base: string; runId: string; url: string }): string {
  const marker = `<!-- last-commit-id: ${run.target} -->`;
  const last = `Last run: [${run.runId}](<${run.url}>) — complete · \`${run.base.slice(0, 12)}..${run.target.slice(0, 12)}\``;
  if (text === null) return `# ${run.title}\n\n${marker}\n\n${last}\n`;
  const lines = text.split('\n');
  const found = markerAt(lines);
  if (found) lines[found.at] = marker;
  else lines.splice(1, 0, '', marker);
  const at = found?.at ?? 2;
  if (lines[at + 1] === '' && lines[at + 2]?.startsWith('Last run: ')) lines[at + 2] = last;
  else lines.splice(at + 1, 0, '', last);
  return lines.join('\n');
}

/** The `last-commit-id` a document names on a line of its own, outside fenced code; null when none. */
export const markerOf = (text: string): string | null => markerAt(text.split('\n'))?.commit ?? null;
