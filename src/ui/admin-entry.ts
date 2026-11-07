/**
 * The browser side of an administrator sign-in link: `/settings#admin=<proof>`.
 *
 * Imported first by `app.tsx`, so it runs before any other module, request or render. An
 * `#admin=` fragment — well-formed or not — leaves the address bar and the session history
 * entry at once. A well-formed proof is exchanged exactly once for the HttpOnly session cookie;
 * no retry, and the proof is kept nowhere but that one request. The app renders only after
 * `adminEntry` settles. A link opened in an already loaded page (a fragment change) is handled
 * the same way and reported through `onAdminEntry`.
 */

/** What the address said, and what came of it. */
export type AdminEntry = 'none' | 'signed-in' | 'invalid' | 'failed';

/** `#admin=…`, and the same with the `=` percent-encoded — any case. */
const FRAGMENT = /^#admin(?:=|%3d)/i;
const PROOF = /^[A-Za-z0-9_-]{43}$/;

/**
 * Removes an `#admin=` fragment from the current URL through `replace`. Returns 'none' for any
 * other address, null for a malformed proof, else the proof.
 */
export function takeAdminProof(loc: { pathname: string; search: string; hash: string }, replace: (url: string) => void): string | 'none' | null {
  // `location` is live: read the fragment before replacing it.
  const hash = loc.hash;
  if (!FRAGMENT.test(hash)) return 'none';
  replace(loc.pathname + loc.search);
  const proof = hash.startsWith('#admin=') ? hash.slice('#admin='.length) : '';
  return PROOF.test(proof) ? proof : null;
}

/** Exchanges the proof once: 204 → 'signed-in', a 4xx → 'invalid', anything else → 'failed'. */
export async function exchangeAdminProof(proof: string, send: typeof fetch = fetch): Promise<AdminEntry> {
  try {
    const res: Response = await send('/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proof }),
      cache: 'no-store',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 204) return 'signed-in';
    return res.status >= 400 && res.status < 500 ? 'invalid' : 'failed';
  } catch {
    return 'failed';
  }
}

function enter(): Promise<AdminEntry> {
  const proof = takeAdminProof(location, (url) => history.replaceState(history.state, '', url));
  if (proof === 'none') return Promise.resolve('none');
  if (proof === null) return Promise.resolve('invalid');
  return exchangeAdminProof(proof);
}

/** Settles once the sign-in link, if any, is handled. */
export const adminEntry: Promise<AdminEntry> = enter();

const listeners = new Set<(entry: AdminEntry) => void>();

/** Calls `fn` with the outcome of each sign-in link opened in an already loaded page; returns the unsubscribe. */
export function onAdminEntry(fn: (entry: AdminEntry) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// A link pasted into an open page changes only the fragment: no reload, so the load-time check never sees it.
addEventListener('hashchange', () => {
  void enter().then((entry) => {
    if (entry !== 'none') for (const fn of listeners) fn(entry);
  });
});
