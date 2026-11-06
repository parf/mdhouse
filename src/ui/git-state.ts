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
