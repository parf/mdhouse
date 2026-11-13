/** The flow UI's contract with the server (MW.3.3) and the pure rules the dialog and the run bar follow. */

import { VIEWER_MESSAGE } from './viewer-text';

export type FlowRangeKind = 'since-last-run' | 'baseline';
export type FlowRange = { kind: 'since-last-run' } | { kind: 'baseline'; commit: string };
export type FlowOutcome = 'complete' | 'blocked' | 'failed';
export type FlowRunStatus = 'running' | 'held' | 'complete' | 'blocked' | 'failed' | 'cancelled' | 'partial' | 'unsupported';

/** `GET /api/flow/catalog` */
export interface FlowCatalogEntry {
  id: string;
  family: string;
  title: string;
  summary?: string;
  ranges: FlowRangeKind[];
  lastRun: { url: string; status: FlowRunStatus; at: string } | null;
  openRun: { url: string; status: FlowRunStatus } | null;
}
export interface FlowCatalog {
  packages: FlowCatalogEntry[];
}

/** `POST /api/flow/preview`: nothing is written; `html` is the server's own rendering, passed through safe-html. */
export interface FlowPreview {
  token: string;
  runPath: string;
  base: string;
  target: string;
  dirty: string[];
  warnings: string[];
  html: string;
}

/** `POST /api/flow/start` */
export interface FlowStarted {
  status: FlowRunStatus;
  runPath: string;
  url: string;
}

/** The `flow` field of a run document's payload, derived by the server from the validated embedded state. */
export interface DocFlow {
  runId: string;
  version: number;
  status: FlowRunStatus;
  node: { id: string; title: string; outcomes: FlowOutcome[] };
  holds: string[];
  evidence: Array<{ label: string; status: 'supplied' | 'missing'; note: string; required: boolean }>;
  questions: Array<{ id: string; title: string; required: boolean; status: 'unanswered' | 'answered' }>;
  canAct: boolean;
}

/** `POST /api/flow/event` */
export type FlowAction =
  | { type: 'outcome'; outcome: FlowOutcome; text: string }
  | { type: 'evidence'; label: string; status: 'supplied' | 'missing'; note: string }
  | { type: 'question'; questionId: string; status: 'unanswered' | 'answered'; turn: string }
  | { type: 'cancel'; reason: string };
export interface FlowEventRequest {
  root: string;
  path: string;
  expectedVersion: number;
  clientId: string;
  action: FlowAction;
}
export interface FlowEventResult {
  status: FlowRunStatus;
  version: number;
  url: string;
}

/** Why a first look has no baseline: nothing ran yet, or the last run's commit is gone. */
export type FlowNoBaselineWhy = 'first-run' | 'marker-missing' | 'marker-unreachable';
export const noBaselineText = (why: string | undefined): string =>
  why === 'marker-missing' ? 'The last run left no commit to start from: choose one.' : why === 'marker-unreachable' ? 'The last run’s commit is no longer in the history (rewritten?): choose where to start.' : 'This flow has not run here yet: choose the commit to start from.';

/** The server's reasons for a refusal (`{ error, reason }`, as every write route). */
export type FlowReason = 'viewer' | 'read-only' | 'not-writable' | 'no-root' | 'no-git' | 'unknown-package' | 'no-baseline' | 'bad-baseline' | 'open-run' | 'stale' | 'invalid';

const TERMINAL: FlowRunStatus[] = ['complete', 'blocked', 'failed', 'cancelled', 'partial', 'unsupported'];
export const isTerminal = (status: FlowRunStatus): boolean => TERMINAL.includes(status);

const HEX = /^[0-9a-f]{4,40}$/i;

/** The range the user chose; a baseline needs a commit id (4–40 hex digits — the server resolves it to the full one). */
export function rangeOf(kind: FlowRangeKind, commit: string): { range: FlowRange } | { error: string } {
  if (kind === 'since-last-run') return { range: { kind } };
  const c = commit.trim();
  if (!c) return { error: 'Give the commit to start from.' };
  if (!HEX.test(c)) return { error: 'A commit id is 4 to 40 hexadecimal digits.' };
  return { range: { kind, commit: c.toLowerCase() } };
}

/** The packages that can start now: one with an open run is a link, not a start. */
export const startable = (p: FlowCatalogEntry): boolean => p.openRun === null;

/** Which range kind a package starts with: since the last run once there is one, else a baseline. */
export function defaultRange(p: FlowCatalogEntry): FlowRangeKind {
  if (p.lastRun && p.ranges.includes('since-last-run')) return 'since-last-run';
  return p.ranges.includes('baseline') ? 'baseline' : (p.ranges[0] ?? 'baseline');
}

const REASON_WORDS: Partial<Record<FlowReason, string>> = {
  viewer: VIEWER_MESSAGE,
  'read-only': 'This project is read-only, so a run document cannot be written.',
  'not-writable': 'This project is read-only, so a run document cannot be written.',
  'no-root': 'That project is not served.',
  'no-git': 'This project is not in a git repository, so there is no history to review.',
  'unknown-package': 'That flow is not installed.',
  'no-baseline': 'This flow has not run here yet: choose the commit to start from.',
  'bad-baseline': 'That commit is not in this project’s history.',
  'open-run': 'A run of this flow is already open.',
  invalid: 'The server did not accept that.',
};
/** The page's words for a refusal; a `stale` is the server's own (a preview that went out of date and a run that moved on need different things). */
export const flowReasonText = (reason: string | undefined, fallback: string): string => (reason && REASON_WORDS[reason as FlowReason]) || fallback;

/** Blocked and failed say why; completing may add a note. Every text is bounded like the server's (16 KiB). */
export const OUTCOME_TEXT_MAX = 16 * 1024;
export function outcomeError(outcome: FlowOutcome, text: string): string | null {
  const t = text.trim();
  if (outcome !== 'complete' && !t) return outcome === 'blocked' ? 'Say what blocks it.' : 'Say what failed.';
  if (new TextEncoder().encode(t).length > OUTCOME_TEXT_MAX) return 'That is too long.';
  return null;
}

/** The outcomes the bar offers: those the node allows, and only while the run is open and the user can act. */
export const barOutcomes = (flow: DocFlow): FlowOutcome[] => (flow.canAct && !isTerminal(flow.status) ? flow.node.outcomes : []);
/** The bar is for someone who can act on the run: one rule, used by the page and by the bar itself. */
export const showsBar = (flow: DocFlow | undefined | null): flow is DocFlow => !!flow && flow.canAct;

/** One id per intended action: a retry after a lost answer is the same event, not a second one. */
export const newClientId = (): string => crypto.randomUUID();
