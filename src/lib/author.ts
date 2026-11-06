/**
 * Who a signed reply is from, per browser. A cookie names the browser's author; it is attribution
 * only — it grants no access, and it never reaches `prefs.json`. The name is untrusted input from
 * the browser, so it is cut down to letters, digits, `_` and `-` before it can reach Markdown.
 */

/** Where a signed name came from. `github` is for an authenticated session, later. */
export type AuthorSource = 'github' | 'cookie' | 'prefs' | 'git' | 'login';

/** The name a signed turn carries, and where it came from. `id` is the provider's, for `github`. */
export interface AuthorIdentity {
  name: string;
  source: AuthorSource;
  id?: string;
}

/** Longest name, in code points. */
export const MAX_AUTHOR = 32;
const MAX_MARKS = 2;

/** Variation selectors: they would turn a digit into an emoji. */
const VARIATION = /[︀-️\u{E0100}-\u{E01EF}]/u;

/**
 * A name a badge can carry: NFC, letters and digits of any script plus `_` and `-`, at most two
 * combining marks after a letter or digit, at most 32 code points. Returns null when no letter or
 * digit is left.
 */
export function normalizeAuthorName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let out = '';
  let afterBase = false;
  let marks = 0;
  for (const ch of raw.normalize('NFD')) {
    if (/[\p{L}\p{N}_-]/u.test(ch)) {
      out += ch;
      afterBase = /[\p{L}\p{N}]/u.test(ch);
      marks = 0;
    } else if (afterBase && marks < MAX_MARKS && /[\p{Mn}\p{Mc}]/u.test(ch) && !VARIATION.test(ch)) {
      out += ch;
      marks++;
    }
  }
  const name = [...out.normalize('NFC')].slice(0, MAX_AUTHOR).join('');
  return /[\p{L}\p{N}]/u.test(name) ? name : null;
}

/** One cookie per port: cookies ignore ports, so two mdhouse instances on a host must not share one. */
export const authorCookieName = (port: number): string => `mdhouse_author_${port}`;

/** The browser's author name from a `Cookie` header, normalized again — never trusted as stored. */
export function readAuthorCookie(header: string | null, port: number): string | null {
  const want = authorCookieName(port);
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== want) continue;
    try {
      return normalizeAuthorName(decodeURIComponent(part.slice(eq + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * `Set-Cookie` for the author name: this host only, one year, not readable by scripts, not sent
 * with cross-site subrequests. `Secure` only when the request itself came over HTTPS. `null` clears it.
 */
export function authorSetCookie(port: number, name: string | null, secure: boolean): string {
  const value = name === null ? '' : encodeURIComponent(name);
  const age = name === null ? 0 : 31_536_000;
  return `${authorCookieName(port)}=${value}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
