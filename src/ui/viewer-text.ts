/** What the page says while the instance is a Viewer, and the pure helpers around it. */

export type InstanceMode = 'workspace' | 'viewer';

/** The header badge, and the tooltip every place that dropped a control for the Viewer can show. */
export const VIEWER_BADGE = 'Viewer — read-only';
export const VIEWER_TITLE = 'Every project is read-only — an administrator switches it in Settings (sign in with mdhouse admin)';

/** What a refused write says in a Viewer: shown wherever the server's refusal is shown. */
export const VIEWER_MESSAGE = 'Viewer — read-only: this mdhouse accepts no changes. An administrator can switch it to Workspace in Settings (sign in with mdhouse admin).';

/** Told to a Settings reader who is not the administrator, which is all a Viewer lets in without `mdhouse admin`. */
export const VIEWER_SIGN_IN = ['Viewer — sign in with ', 'mdhouse admin', ' to switch back'] as const;

/** Fired by a refused write, so a tab that still shows Workspace re-reads the mode. */
export const VIEWER_DENIED = 'mdhouse:viewer-denied';

/** Whether the settings the server gave say Viewer; anything else (older server, not loaded yet) is Workspace. */
export const isViewer = (settings: { mode?: unknown } | null | undefined): boolean => settings?.mode === 'viewer';

/** The confirmation before a switch; null when `to` is the mode already. */
export function switchConfirm(from: InstanceMode, to: InstanceMode): string | null {
  if (from === to) return null;
  return to === 'viewer'
    ? 'Switch to Viewer?\n\nEvery project becomes read-only for everyone, including you: ticks, answers, edits, commits, marks and Agent Bus sends are refused and their controls disappear. Each project keeps its own RW/RO setting; Workspace brings it back.\n\nYou will need mdhouse admin to switch back.'
    : 'Switch to Workspace?\n\nProjects become writable again by their own RW/RO settings.';
}

/** The text of a server refusal as the page shows it: a Viewer's own words for `reason: viewer`, else the server's. */
export function refusalText(body: { error?: unknown; reason?: unknown } | null, fallback: string): string {
  if (body?.reason === 'viewer') return VIEWER_MESSAGE;
  return typeof body?.error === 'string' && body.error ? body.error : fallback;
}
