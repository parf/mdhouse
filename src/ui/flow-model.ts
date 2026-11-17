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
  /** The package's own defaults; `scope` says what it runs on. */
  defaults?: { scope: FlowScope };
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
  /** Why this run cannot be acted on: not the host's own (tampered, foreign, made before runs were sealed). */
  refused?: string;
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
export type FlowReason = 'incompatible-scope' | 'viewer' | 'held' | 'read-only' | 'not-writable' | 'no-root' | 'no-git' | 'unknown-package' | 'no-baseline' | 'bad-baseline' | 'open-run' | 'stale' | 'invalid';

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
};
/** The page's words for a refusal; a `stale` is the server's own (a preview that went out of date and a run that moved on need different things). */
export const flowReasonText = (reason: string | undefined, fallback: string): string => (reason && REASON_WORDS[reason as FlowReason]) || fallback;

/** An assertion carries its words: where the evidence is, what the answer was (the server refuses an empty note). */
export const assertionError = (kind: 'evidence' | 'question', text: string): string | null =>
  text.trim() ? null : kind === 'evidence' ? 'Write the note first: where the evidence is.' : 'Write the note first: what the answer was.';

/** Every outcome says something: what was found, what blocks it, what failed (the server refuses an empty one). Every text is bounded like the server's (16 KiB). */
export const OUTCOME_TEXT_MAX = 16 * 1024;
export function outcomeError(outcome: FlowOutcome, text: string): string | null {
  const t = text.trim();
  if (!t) return outcome === 'complete' ? 'Say what the analysis found.' : outcome === 'blocked' ? 'Say what blocks it.' : 'Say what failed.';
  if (new TextEncoder().encode(t).length > OUTCOME_TEXT_MAX) return 'That is too long.';
  return null;
}

/** The outcomes the bar offers: those the node allows, and only while the run is open and the user can act. */
export const barOutcomes = (flow: DocFlow): FlowOutcome[] => (flow.canAct && !isTerminal(flow.status) ? flow.node.outcomes : []);
/** What the page says of a run the host refuses to act on; nothing for a run that is merely closed. */
export const refusedNote = (flow: DocFlow | undefined | null): string | null => (flow?.refused ? `This run cannot be acted on: ${flow.refused}` : null);

/** The bar is for someone who can act on the run: one rule, used by the page and by the bar itself. */
export const showsBar = (flow: DocFlow | undefined | null): flow is DocFlow => !!flow && flow.canAct;

/** A fresh id for one action. */
export const newClientId = (): string => crypto.randomUUID();

/**
 * One client id per intended action, kept until the server has given a definite answer: a retry after a lost response
 * sends the same id (the server replays its record), a different action or a later version a new one.
 */
export function actionIds(make: () => string = newClientId) {
  let pending: { key: string; id: string } | null = null;
  return {
    idFor(key: string): string {
      if (pending?.key !== key) pending = { key, id: make() };
      return pending.id;
    },
    /** The server answered (accepted or refused): the next press is a new action. */
    settle(): void {
      pending = null;
    },
  };
}

/** What a package runs on (its manifest's `defaults.scope`). */
export type FlowScope = 'selected-project' | 'selected-subsystem' | 'selected-document';
/** What a run is on, as the page offers it. */
export type FlowTargetKind = 'page' | 'directory' | 'project';
export type FlowSubject = { kind: 'project' } | { kind: 'directory' | 'page'; path: string };
export const TARGET_SCOPE: Record<FlowTargetKind, FlowScope> = { page: 'selected-document', directory: 'selected-subsystem', project: 'selected-project' };
export const TARGET_LABEL: Record<FlowTargetKind, string> = { page: 'Page', directory: 'Directory', project: 'Project' };
const SCOPE_TARGET: Record<FlowScope, FlowTargetKind> = { 'selected-document': 'page', 'selected-subsystem': 'directory', 'selected-project': 'project' };

/** The run page's address: the project, and the page or folder (ending `/`) it was opened from (`''` = the project). */
export const flowPageUrl = (rootUrl: string, from: string): string => `${rootUrl}?flow=${encodeURIComponent(from)}`;
/** `?flow=<from>` of an address's query; null when the query is not the run page's. */
export const flowFrom = (search: string): string | null => new URLSearchParams(search).get('flow');

/**
 * The targets a run page opened from `from` offers: a file — itself, its folder, the project; a folder (`…/`) — itself and the
 * project; the project (`''`) — the project. Null = not offered (the page says why). A file at the root has no folder of its own.
 */
export function flowTargets(from: string): Record<FlowTargetKind, string | null> {
  const f = from.replace(/^\/+/, '');
  if (!f) return { page: null, directory: null, project: '' };
  if (f.endsWith('/')) return { page: null, directory: f.replace(/\/+$/, ''), project: '' };
  const cut = f.lastIndexOf('/');
  return { page: f, directory: cut === -1 ? null : f.slice(0, cut), project: '' };
}

/** The first target offered, narrowest first: Page, then Directory, then Project. */
export const defaultTarget = (targets: Record<FlowTargetKind, string | null>): FlowTargetKind =>
  targets.page !== null ? 'page' : targets.directory !== null ? 'directory' : 'project';

/** The run's subject for a target kind. */
export const subjectOf = (kind: FlowTargetKind, targets: Record<FlowTargetKind, string | null>): FlowSubject =>
  kind === 'project' ? { kind } : { kind, path: targets[kind] ?? '' };

/** Null when the package runs on `kind`, else what it does run on, in words. */
export function scopeMismatch(entry: FlowCatalogEntry, kind: FlowTargetKind): string | null {
  const scope = entry.defaults?.scope;
  if (!scope || scope === TARGET_SCOPE[kind]) return null;
  return `runs on ${SCOPE_TARGET[scope] === 'project' ? 'the whole project' : SCOPE_TARGET[scope] === 'directory' ? 'a directory' : 'one page'}`;
}
