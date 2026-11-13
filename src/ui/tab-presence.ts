/**
 * This tab on the live channel for Agent Bus control: its id across reconnects, the page it shows,
 * and whether an editor holds unsaved text (then `open` does not move it).
 */

const KEY = 'mdhouse.client';
const unsaved = new Set<object>();
let notify: (() => void) | null = null;

/** The kept `<id>.<proof>` for the socket URL; empty when none or storage is unavailable. */
export function savedClient(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Keeps the id the server gave this tab. */
export function keepClient(clientId: string, resume: string): void {
  try {
    sessionStorage.setItem(KEY, `${clientId}.${resume}`);
  } catch {
    /* a tab without storage gets a new id on each reconnect */
  }
}

/** An editor's unsaved state; `owner` is any object that stands for that editor. */
export function setUnsaved(owner: object, on: boolean): void {
  const had = unsaved.has(owner);
  if (on) unsaved.add(owner);
  else unsaved.delete(owner);
  if (had !== on) notify?.();
}

export const hasUnsaved = (): boolean => unsaved.size > 0;

/** The `at` frame: the page this tab shows and whether it is busy. */
export const atFrame = (): string => JSON.stringify({ t: 'at', page: location.pathname, title: document.title, busy: hasUnsaved() });

/**
 * Calls `send` now and whenever the page, its title or the unsaved state changes. Returns the stop.
 * The title is set after each navigation, so watching it also catches page changes.
 */
export function watchPresence(send: () => void): () => void {
  notify = send;
  const title = document.querySelector('title');
  const obs = title ? new MutationObserver(send) : null;
  if (title) obs!.observe(title, { childList: true, characterData: true, subtree: true });
  addEventListener('popstate', send);
  send();
  return () => {
    notify = null;
    obs?.disconnect();
    removeEventListener('popstate', send);
  };
}

/** A control `open` target this page navigates to: an in-app document path, nothing else. */
export function openTarget(url: unknown, origin = location.origin): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.length > 2048) return null;
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.pathname : null;
  } catch {
    return null;
  }
}
