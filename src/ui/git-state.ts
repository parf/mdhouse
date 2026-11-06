/**
 * The Git state the server reports for a file: gitignored or untracked. Tracked files, folders
 * outside a repository and anything the server could not tell carry neither, so no badge — the
 * client never works a state out from marks, `status` or missing metadata.
 */
export type GitState = 'ignored' | 'untracked';

export const GIT_STATE: Record<GitState, { name: string; short: string }> = {
  ignored: { name: 'Gitignored', short: 'Ign' },
  untracked: { name: 'Untracked', short: 'Unt' },
};

/** The state on a file, tree entry, recent entry or document payload; null for anything else. */
export function gitStateOf(item: unknown): GitState | null {
  const state = item && typeof item === 'object' ? (item as { gitState?: unknown }).gitState : undefined;
  return state === 'ignored' || state === 'untracked' ? state : null;
}

/** Class for a row or title: the shared colour hook, empty without a state. */
export const gitStateClass = (item: unknown): string => {
  const state = gitStateOf(item);
  return state ? ` git-${state}` : '';
};

/**
 * A file's `status` for display. `untracked` is never shown as a status: it may be synthesized (no
 * repository), so only a reported `gitState` presents it. Other statuses pass through.
 */
export const shownStatus = <S extends string>(status: S | undefined): S | undefined => (status === ('untracked' as string) ? undefined : status);

/** The parent folder of a file `rel` as a reveal scope; null for a file at the root. */
export function parentScope(rel: string): string | null {
  const at = rel.lastIndexOf('/');
  return at > 0 ? rel.slice(0, at) : null;
}

/** Is the file's history asked for: never for a Gitignored file; an untracked one is asked to find out whether it has any. */
export const fetchesHistory = (state: GitState | null): boolean => state !== 'ignored';

/**
 * Is the History panel shown. Gitignored: never. Untracked: only once the current file has
 * commits — hidden while the answer is unknown, empty or failed. Anything else (tracked, no
 * repository, unknown) keeps the panel as it was.
 */
export function showsHistory(state: GitState | null, log: { commits: readonly unknown[] } | null): boolean {
  if (state === 'ignored') return false;
  if (state === 'untracked') return !!log && log.commits.length > 0;
  return true;
}

/** An answer held with the path it was asked for. */
export interface Held<T> {
  path: string;
  value: T;
  /** What it was asked for; absent on a value that was not requested for a revision and state. */
  ask?: HistoryAsk;
}

/** The held answer, only for the path now shown — a previous file's never stands in for this one. */
export const heldFor = <T>(held: Held<T> | null, path: string | null): T | null => (held && path !== null && held.path === path ? held.value : null);

/** What a history request was asked for: the file, the metadata revision the page was on, the file's Git state. */
export interface HistoryAsk {
  path: string;
  revision: string | null;
  state: GitState | null;
}

export const sameAsk = (a: HistoryAsk, b: HistoryAsk): boolean => a.path === b.path && a.revision === b.revision && a.state === b.state;

/** The answer held after `value` arrives for `ask`: replaced only while `ask` is still what is shown, else `held` stays. */
export const holdAnswer = <T>(held: Held<T> | null, ask: HistoryAsk, now: HistoryAsk, value: T): Held<T> | null =>
  sameAsk(ask, now) ? { path: ask.path, value, ask } : held;

/**
 * The held answer only when it was asked for exactly `now` — path, revision and Git state. An
 * untracked file's history is confirmed only by such an answer; one from before a change of
 * revision or state confirms nothing.
 */
export const heldConfirmed = <T>(held: Held<T> | null, now: HistoryAsk | null): T | null =>
  held && now && held.ask && sameAsk(held.ask, now) ? held.value : null;
