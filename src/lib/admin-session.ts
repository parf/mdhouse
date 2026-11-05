import { createHash } from 'node:crypto';

/**
 * Instance-administrator sessions, in memory only.
 *
 * A trusted caller mints a short-lived single-use proof; exchanging it creates a session whose
 * secret goes to the browser as an HttpOnly cookie. Neither secret is kept: entries are keyed by
 * the SHA-256 of the secret and listed by a separate random id. Nothing is persisted, so a restart
 * signs every administrator out. Every failure is the same `{ ok: false }`.
 *
 * Grants nothing by itself and takes no address, Host or visitor input: whoever wires it decides
 * who may mint.
 */

export interface AdminLimits {
  /** Proof lifetime; at most `MAX_PROOF_TTL_MS`. */
  proofTtlMs: number;
  /** A session ends after this long without a `verify`. */
  idleMs: number;
  /** A session ends this long after its exchange, however active. */
  absoluteMs: number;
  maxProofs: number;
  maxSessions: number;
}

export const MAX_PROOF_TTL_MS = 120_000;

const DEFAULTS: AdminLimits = {
  proofTtlMs: 60_000,
  idleMs: 30 * 60_000,
  absoluteMs: 12 * 60 * 60_000,
  maxProofs: 16,
  maxSessions: 64,
};

export interface AdminSessionInfo {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export type Invalid = { ok: false };

interface Session {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

const SECRET = /^[A-Za-z0-9_-]{43}$/;
const INVALID: Invalid = Object.freeze({ ok: false });

function token(bytes: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

function secret(): string {
  return Buffer.from(token(32)).toString('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The digest of a well-formed secret, or null for anything else. */
function keyOf(value: unknown): string | null {
  return typeof value === 'string' && SECRET.test(value) ? digest(value) : null;
}

export class AdminSessions {
  readonly limits: Readonly<AdminLimits>;
  readonly #now: () => number;
  /** digest(proof) → expiry; insertion order is mint order. */
  readonly #proofs = new Map<string, number>();
  /** digest(secret) → session; insertion order is last-seen order. */
  readonly #sessions = new Map<string, Session>();

  constructor(opts: { now?: () => number; limits?: Partial<AdminLimits> } = {}) {
    const limits = { ...DEFAULTS, ...opts.limits };
    for (const [k, v] of Object.entries(limits)) {
      if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`admin session ${k} must be a positive integer`);
    }
    if (limits.proofTtlMs > MAX_PROOF_TTL_MS) throw new Error(`admin proof TTL must be at most ${MAX_PROOF_TTL_MS} ms`);
    this.limits = Object.freeze(limits);
    this.#now = opts.now ?? Date.now;
  }

  /** A new single-use proof. The caller owns the only copy. */
  mintProof(): { proof: string; expiresAt: number } {
    const now = this.#prune();
    while (this.#proofs.size >= this.limits.maxProofs) this.#proofs.delete(this.#proofs.keys().next().value!);
    const proof = secret();
    const expiresAt = now + this.limits.proofTtlMs;
    this.#proofs.set(digest(proof), expiresAt);
    return { proof, expiresAt };
  }

  /** Consumes the proof — valid or expired — and opens a session for a live one. */
  exchange(proof: unknown): { ok: true; secret: string; id: string; expiresAt: number } | Invalid {
    const key = keyOf(proof);
    if (key === null) return INVALID;
    const expiresAt = this.#proofs.get(key);
    this.#proofs.delete(key);
    const now = this.#prune();
    if (expiresAt === undefined || now >= expiresAt) return INVALID;
    while (this.#sessions.size >= this.limits.maxSessions) this.#sessions.delete(this.#sessions.keys().next().value!);
    const value = secret();
    const session: Session = { id: Buffer.from(token(16)).toString('hex'), createdAt: now, lastSeenAt: now };
    this.#sessions.set(digest(value), session);
    return { ok: true, secret: value, id: session.id, expiresAt: this.#expiry(session) };
  }

  /** The session for this secret, its idle timer restarted; an expired one is removed. */
  verify(value: unknown): { ok: true; id: string; expiresAt: number } | Invalid {
    const key = keyOf(value);
    if (key === null) return INVALID;
    const now = this.#prune();
    const session = this.#sessions.get(key);
    if (!session) return INVALID;
    session.lastSeenAt = now;
    this.#sessions.delete(key);
    this.#sessions.set(key, session);
    return { ok: true, id: session.id, expiresAt: this.#expiry(session) };
  }

  /** Live sessions by safe id, oldest activity first. */
  list(): AdminSessionInfo[] {
    this.#prune();
    return [...this.#sessions.values()].map((s) => ({ ...s, expiresAt: this.#expiry(s) }));
  }

  revoke(id: string): boolean {
    for (const [key, s] of this.#sessions) {
      if (s.id === id) return this.#sessions.delete(key);
    }
    return false;
  }

  /** Ends every session and drops every unexchanged proof; returns the sessions ended. */
  revokeAll(): number {
    const n = this.#sessions.size;
    this.#sessions.clear();
    this.#proofs.clear();
    return n;
  }

  #expiry(s: Session): number {
    return Math.min(s.createdAt + this.limits.absoluteMs, s.lastSeenAt + this.limits.idleMs);
  }

  /** Drops expired proofs and sessions; returns the current time. */
  #prune(): number {
    const now = this.#now();
    for (const [key, at] of this.#proofs) if (now >= at) this.#proofs.delete(key);
    for (const [key, s] of this.#sessions) if (now >= this.#expiry(s)) this.#sessions.delete(key);
    return now;
  }
}

/**
 * Where the cookie lives. Browsers share cookies across ports, so the name carries the instance's
 * port: a second instance on the same host never overwrites this one's cookie. `secure` is set by
 * whoever knows the transport is HTTPS, never guessed from a request.
 */
export interface AdminCookieScope {
  port: number;
  secure: boolean;
}

/** `__Host-` binds the HTTPS cookie to this host and path `/`; both names are apart from author cookies. */
export function adminCookieName(c: AdminCookieScope): string {
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error(`invalid port ${c.port}`);
  return `${c.secure ? '__Host-' : ''}mdhouse-admin-${c.port}`;
}

/** A host-only HttpOnly SameSite=Strict `Set-Cookie` value for the session secret. */
export function adminCookie(value: string, maxAgeMs: number, c: AdminCookieScope): string {
  if (!SECRET.test(value)) throw new Error('not an admin session secret');
  const maxAge = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${adminCookieName(c)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${c.secure ? '; Secure' : ''}`;
}

/** A `Set-Cookie` value that removes the admin cookie. */
export function clearAdminCookie(c: AdminCookieScope): string {
  return `${adminCookieName(c)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${c.secure ? '; Secure' : ''}`;
}

/** The admin cookie's value from a `Cookie` header — the exact name only — or null. */
export function readAdminCookie(header: string | null | undefined, c: AdminCookieScope): string | null {
  if (!header) return null;
  const name = adminCookieName(c);
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
