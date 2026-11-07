/**
 * Optional human names for project roots: display only. A name never changes a root's id, path,
 * URLs, marks, views or access; it is keyed by the root's canonical path and shown beside it.
 * Shared by the server, the CLI and the page, so all three accept and refuse the same input.
 */

/** Longest name, in UTF-16 code units after trimming. */
export const PROJECT_NAME_MAX = 80;

/** The CLI word that clears a name: `--name reset`. */
export const PROJECT_NAME_RESET = 'reset';

/**
 * C0/C1 controls and DEL, line/paragraph separators, and the bidi embeddings, overrides and
 * isolates (U+202A–U+202E, U+2066–U+2069) that reorder text around them.
 */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

export type NameResult = { ok: true; name: string | null } | { ok: false; error: string };

/**
 * Returns the stored form of a requested name: trimmed, `null` for empty (clears the name). Refuses
 * a non-string, a malformed UTF-16 string, a control or bidi-reordering character, and a name over
 * `PROJECT_NAME_MAX` — never truncates or rewrites inside the name.
 */
export function normalizeProjectName(input: unknown): NameResult {
  if (typeof input !== 'string') return { ok: false, error: 'name: expected a string' };
  if (!input.isWellFormed()) return { ok: false, error: 'name: malformed text' };
  if (FORBIDDEN.test(input)) return { ok: false, error: 'name: control and text-direction characters are not allowed' };
  const name = input.trim();
  if (name.length > PROJECT_NAME_MAX) return { ok: false, error: `name: at most ${PROJECT_NAME_MAX} characters` };
  return { ok: true, name: name || null };
}

export type NameRequest = { ok: true; id: string; name: string | null } | { ok: false; error: string };

/** Parses a `POST /api/roots/name` body: exactly `{id, name}`, any other field refused. */
export function parseNameRequest(body: unknown): NameRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'expected {id, name}' };
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes('id') || !keys.includes('name')) return { ok: false, error: 'expected exactly {id, name}' };
  const { id, name } = body as { id: unknown; name: unknown };
  if (typeof id !== 'string' || !id) return { ok: false, error: 'id: expected a root id' };
  const n = normalizeProjectName(name);
  return n.ok ? { ok: true, id, name: n.name } : n;
}

/**
 * Checks a CLI `--name` request before anything is changed: one explicit directory, no `--rm`.
 * Returns the name to store (`null` for `reset` or empty), or the error to print.
 */
export function checkNameArgs(value: string, dirs: string[], opts: { rm: boolean }): NameResult {
  if (opts.rm) return { ok: false, error: '--name cannot be combined with --rm' };
  if (dirs.length !== 1) {
    return { ok: false, error: `--name names exactly one directory; ${dirs.length ? `got ${dirs.length}` : 'none was given'}` };
  }
  return value === PROJECT_NAME_RESET ? { ok: true, name: null } : normalizeProjectName(value);
}

/** A root as the page sees it: `name` is the label to show, `customName` the override when one is set. */
export function labelled<T extends { name: string }>(root: T, custom: string | null | undefined): T & { customName?: string } {
  return custom ? { ...root, name: custom, customName: custom } : { ...root };
}
