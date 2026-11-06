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
