import { canonicalIp, cleanText, publicIp, type Geo } from './geoip';

/**
 * Per-user sessions and their history, as pure state transitions: every function returns a new
 * model and never changes its input. The clock is always the caller's `now`.
 *
 * This is the consistency layer only. Who the caller is — the verified session, the route's
 * authorization, the admin bit — comes from the caller's authentication substrate as declared
 * context; nothing here reads a cookie, a name or a header, and nothing here enforces a route.
 */

/** A session not used for longer than this needs a new GitHub login; exactly this long is still fine. */
export const IDLE_MS = 30 * 86_400_000;
/** Each history list keeps this many entries, most recent first. */
export const HISTORY_MAX = 10;
export const UA_MAX = 512;
/** A failed or unfinished lookup for an address is asked again after this long. */
export const GEO_RETRY_MS = 3_600_000;

/** Provider + immutable provider ID — never a username or display name. */
export type UserKey = `github:${string}`;

/** GitHub's numeric user ID as a key. Throws on anything else. */
export function userKey(provider: 'github', id: string | number): UserKey {
  const s = String(id);
  if (provider !== 'github' || !/^[1-9]\d{0,19}$/.test(s)) throw new Error('user key: a GitHub numeric user ID is required');
  return `github:${s}`;
}

export type UserStatus = 'enabled' | 'disabled' | 'removed';
export type RevokeReason = 'self' | 'admin' | 'reauth' | 'country-change' | 'user-disabled' | 'user-removed';

export interface SessionRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  /** The country of the GitHub login that created this session; null when its address had none. */
  readonly authCountry: string | null;
  readonly revokedAt: number | null;
  readonly revokedBy: RevokeReason | null;
}

/** A lookup state for one address; `at` is the observation the lookup was started for. */
export type IpGeo =
  | { readonly state: 'pending'; readonly at: number }
  | { readonly state: 'none'; readonly at: number }
  | { readonly state: 'found'; readonly at: number; readonly geo: Geo };

export interface IpRecord {
  readonly ip: string;
  readonly lastSeen: number;
  /** Null for an address that is never looked up (not public). */
  readonly geo: IpGeo | null;
}

/** Unique by city + state + country. */
export interface CityRecord {
  readonly city: string;
  readonly state: string | null;
  readonly country: string;
  readonly lastSeen: number;
}

/** Unique by state + country. */
export interface StateRecord {
  readonly state: string;
  readonly country: string;
  readonly lastSeen: number;
}

export interface CountryRecord {
  readonly code: string;
  readonly name: string | null;
  readonly lastSeen: number;
}

export interface UserRecord {
  readonly status: UserStatus;
  readonly sessions: readonly SessionRecord[];
  readonly ips: readonly IpRecord[];
  readonly cities: readonly CityRecord[];
  readonly states: readonly StateRecord[];
  readonly countries: readonly CountryRecord[];
  readonly ua: { readonly value: string; readonly at: number } | null;
}

export type Model = Readonly<Record<UserKey, UserRecord>>;
export const EMPTY: Model = Object.freeze({});

const SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;

const put = (m: Model, key: UserKey, u: UserRecord): Model => ({ ...m, [key]: u });
const userOf = (m: Model, key: UserKey): UserRecord | undefined => (Object.hasOwn(m, key) ? m[key] : undefined);

/** Adds an enabled user with no history. Throws when the key is already known, removed users included. */
export function addUser(m: Model, key: UserKey): Model {
  if (userOf(m, key)) throw new Error('user already exists');
  return put(m, key, { status: 'enabled', sessions: [], ips: [], cities: [], states: [], countries: [], ua: null });
}

/**
 * Sets a user's status. Disabling or removing revokes every live session; history is kept.
 * Removal is final. Throws on an unknown user.
 */
export function setStatus(m: Model, key: UserKey, status: UserStatus, now: number): Model {
  const u = userOf(m, key);
  if (!u) throw new Error('unknown user');
  if (u.status === 'removed' && status !== 'removed') throw new Error('a removed user cannot come back');
  const by: RevokeReason | null = status === 'disabled' ? 'user-disabled' : status === 'removed' ? 'user-removed' : null;
  const sessions = by ? u.sessions.map((s) => (s.revokedAt === null ? { ...s, revokedAt: now, revokedBy: by } : s)) : u.sessions;
  return put(m, key, { ...u, status, sessions });
}

/**
 * Records a new session after a successful GitHub login — the only place a session's country is
 * set. `authCountry` is the country the login request's own address resolved to, or null. Throws
 * when the user is unknown or not enabled, the id or country is malformed, or the id was ever used
 * by anyone — an expired or revoked id never comes back.
 */
export function startSession(m: Model, key: UserKey, id: string, now: number, authCountry: string | null): Model {
  const u = userOf(m, key);
  if (!u) throw new Error('unknown user');
  if (u.status !== 'enabled') throw new Error(`user is ${u.status}`);
  if (!SESSION_ID.test(id)) throw new Error('malformed session id');
  if (authCountry !== null && !/^[A-Z]{2}$/.test(authCountry)) throw new Error('malformed country');
  if (Object.values(m).some((x) => x.sessions.some((s) => s.id === id))) throw new Error('session id already used');
  const s: SessionRecord = { id, createdAt: now, lastUsedAt: now, authCountry, revokedAt: null, revokedBy: null };
  return put(m, key, { ...u, sessions: [...u.sessions, s] });
}

/** Revokes one of the user's live sessions; anything else leaves the model as it is. */
export function revokeSession(m: Model, key: UserKey, id: string, by: RevokeReason, now: number): Model {
  const u = userOf(m, key);
  const i = u ? u.sessions.findIndex((s) => s.id === id && s.revokedAt === null) : -1;
  if (!u || i < 0) return m;
  const sessions = u.sessions.map((s, j) => (j === i ? { ...s, revokedAt: now, revokedBy: by } : s));
  return put(m, key, { ...u, sessions });
}

/** What the caller's authentication substrate established for this request. */
export interface TouchContext {
  readonly user: UserKey;
  readonly session: string;
  /** The route's own authorization result, decided by the caller. */
  readonly route: 'allowed' | 'denied';
  /** The trusted client address (the socket peer unless a trusted proxy rule says otherwise). */
  readonly ip: string;
  readonly ua: string | null;
  readonly now: number;
}

/** A lookup to run off the request path, bound to the observation that asked for it. */
export interface GeoJob {
  readonly user: UserKey;
  readonly session: string;
  readonly ip: string;
  readonly observedAt: number;
}

export type Refusal = 'unknown-user' | 'disabled' | 'removed' | 'unknown-session' | 'revoked' | 'reauth' | 'country-change' | 'denied';

/**
 * This request's country against the session's login country:
 * - `match` — the same country; the only state that records city/state/country history;
 * - `unbound` — a known country, but the session's login had none. **Undecided policy**: neither
 *   trusted nor refused here; the caller must not treat it as `match`;
 * - `pending` — a lookup is outstanding (`job` set when this request started it); the country is
 *   not known yet, so a protected action has no country decision;
 * - `unavailable` — no location: not public, not an address, or a failed lookup. Not a transition.
 * A different known country is never a state here: `touch` refuses it as `country-change`.
 */
export type CountryCheck =
  | { readonly state: 'match'; readonly country: string }
  | { readonly state: 'unbound'; readonly country: string }
  | { readonly state: 'pending'; readonly job: GeoJob | null }
  | { readonly state: 'unavailable' };

export type TouchResult =
  | { ok: true; model: Model; country: CountryCheck; lookup: GeoJob | null }
  | { ok: false; reason: Refusal; model: Model };

/**
 * One request's use of a session. In order: the user exists and is enabled → the session is this
 * user's → not revoked → not idle for more than `IDLE_MS` (else revoked as `reauth`) → the address,
 * when already resolved, is in the session's login country (else revoked as `country-change` —
 * every transition, whatever other sessions or the history know) → the route allowed it. Any
 * refusal leaves `lastUsedAt`, history and UA untouched. Then: `lastUsedAt`, the address, the UA,
 * city/state/country history on `match` only, or a lookup job. `ok` alone says nothing about the
 * country — read `country`.
 */
export function touch(m: Model, ctx: TouchContext): TouchResult {
  const no = (reason: Refusal, model = m): TouchResult => ({ ok: false, reason, model });
  const u = userOf(m, ctx.user);
  if (!u) return no('unknown-user');
  if (u.status !== 'enabled') return no(u.status);
  const s = u.sessions.find((x) => x.id === ctx.session);
  if (!s) return no('unknown-session');
  if (s.revokedAt !== null) return no('revoked');
  if (ctx.now - s.lastUsedAt > IDLE_MS) return no('reauth', revokeSession(m, ctx.user, s.id, 'reauth', ctx.now));
  const ip = canonicalIp(ctx.ip);
  const known = ip ? u.ips.find((r) => r.ip === ip)?.geo : null;
  const resolved = known?.state === 'found' ? known.geo : null;
  if (resolved && s.authCountry !== null && resolved.country !== s.authCountry) {
    return no('country-change', revokeSession(m, ctx.user, s.id, 'country-change', ctx.now));
  }
  if (ctx.route !== 'allowed') return no('denied');

  const now = ctx.now;
  let next: UserRecord = {
    ...u,
    sessions: u.sessions.map((x) => (x === s ? { ...x, lastUsedAt: Math.max(x.lastUsedAt, now) } : x)),
  };
  const ua = cleanText(ctx.ua, UA_MAX);
  if (ua && (!u.ua || now >= u.ua.at)) next = { ...next, ua: { value: ua, at: now } };

  let lookup: GeoJob | null = null;
  let country: CountryCheck = { state: 'unavailable' };
  if (ip) {
    const prev = u.ips.find((r) => r.ip === ip);
    let geo: IpGeo | null = prev ? prev.geo : null;
    if (publicIp(ip)) {
      if (geo?.state === 'found') {
        if (s.authCountry !== null) next = seenAt(next, geo.geo, now);
      } else if (!geo || now - geo.at > GEO_RETRY_MS) {
        geo = { state: 'pending', at: now };
        lookup = { user: ctx.user, session: s.id, ip, observedAt: now };
      }
    }
    const lastSeen = Math.max(prev?.lastSeen ?? now, now);
    next = { ...next, ips: mru(next.ips, (r) => r.ip === ip, { ip, lastSeen, geo }) };
    // A lookup for an address that did not make the list has nowhere to land.
    if (lookup && !next.ips.some((r) => r.ip === ip)) lookup = null;
    if (geo?.state === 'found') country = { state: s.authCountry === null ? 'unbound' : 'match', country: geo.geo.country };
    else if (geo?.state === 'pending') country = { state: 'pending', job: lookup };
  }
  return { ok: true, model: put(m, ctx.user, next), country, lookup };
}

/**
 * Applies a finished lookup. Ignored — the model returned as it is — unless the user is still
 * enabled, the job's session is still live and not idle at `now`, and the address is still listed
 * with this very job pending. A result for another address is a failure. The address keeps the
 * result either way, so the next `touch` checks its country; city/state/country history is written
 * only when it matches the job session's login country — a candidate country is never recorded.
 * It never adds or reorders addresses, and never changes the UA or `lastUsedAt`; history takes the
 * address's `lastSeen`, keeping a newer one.
 */
export function applyGeo(m: Model, job: GeoJob, geo: Geo | null, now: number): { applied: boolean; model: Model } {
  const keep = { applied: false, model: m };
  const u = userOf(m, job.user);
  if (!u || u.status !== 'enabled') return keep;
  const s = u.sessions.find((x) => x.id === job.session);
  if (!s || s.revokedAt !== null || now - s.lastUsedAt > IDLE_MS) return keep;
  const rec = u.ips.find((r) => r.ip === job.ip);
  if (!rec || rec.geo?.state !== 'pending' || rec.geo.at !== job.observedAt) return keep;

  const found = geo && geo.ip === job.ip ? geo : null;
  const ipGeo: IpGeo = found ? { state: 'found', at: job.observedAt, geo: found } : { state: 'none', at: job.observedAt };
  let next: UserRecord = { ...u, ips: u.ips.map((r) => (r === rec ? { ...r, geo: ipGeo } : r)) };
  if (found && s.authCountry !== null && found.country === s.authCountry) next = seenAt(next, found, rec.lastSeen);
  return { applied: true, model: put(m, job.user, next) };
}

/** City, state and country seen at `at`, each only when the lookup named it; an entry already seen later keeps its time. */
function seenAt(u: UserRecord, g: Geo, at: number): UserRecord {
  const later = (prev: { lastSeen: number } | undefined) => Math.max(prev?.lastSeen ?? at, at);
  let next = u;
  if (g.city !== null) {
    const c = u.cities.find((x) => x.city === g.city && x.state === g.state && x.country === g.country);
    next = { ...next, cities: mru(u.cities, (x) => x === c, { city: g.city, state: g.state, country: g.country, lastSeen: later(c) }) };
  }
  if (g.state !== null) {
    const st = u.states.find((x) => x.state === g.state && x.country === g.country);
    next = { ...next, states: mru(u.states, (x) => x === st, { state: g.state, country: g.country, lastSeen: later(st) }) };
  }
  const cty = u.countries.find((x) => x.code === g.country);
  const country = { code: g.country, name: g.countryName ?? cty?.name ?? null, lastSeen: later(cty) };
  return { ...next, countries: mru(u.countries, (x) => x === cty, country) };
}

/** `entry` replaces the matching one; newest `lastSeen` first (a tie keeps `entry` first); `HISTORY_MAX` kept. */
function mru<T extends { readonly lastSeen: number }>(list: readonly T[], same: (e: T) => boolean, entry: T): T[] {
  return [entry, ...list.filter((e) => !same(e))].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, HISTORY_MAX);
}

/** Who asks to see a history, as the caller's substrate declares it — not an authorization by itself. */
export interface Viewer {
  readonly user: UserKey;
  readonly admin: boolean;
}

export interface HistoryView {
  readonly status: UserStatus;
  readonly sessions: readonly SessionRecord[];
  readonly ips: readonly {
    readonly ip: string;
    readonly lastSeen: number;
    readonly isp: string | null;
    readonly org: string | null;
    readonly asn: number | null;
    readonly asnLabel: string | null;
  }[];
  readonly cities: readonly CityRecord[];
  readonly states: readonly StateRecord[];
  readonly countries: readonly CountryRecord[];
  readonly ua: { readonly value: string; readonly at: number } | null;
}

/**
 * The target's history for its own enabled user or a declared admin who is an enabled user;
 * null otherwise — another user, an unknown target and a disabled viewer look the same.
 */
export function historyView(m: Model, viewer: Viewer, target: UserKey): HistoryView | null {
  const v = userOf(m, viewer.user);
  const t = userOf(m, target);
  if (!v || v.status !== 'enabled' || !t) return null;
  if (viewer.user !== target && viewer.admin !== true) return null;
  return {
    status: t.status,
    sessions: t.sessions.map((s) => ({ ...s })),
    ips: t.ips.map((r) => {
      const g = r.geo?.state === 'found' ? r.geo.geo : null;
      return { ip: r.ip, lastSeen: r.lastSeen, isp: g?.isp ?? null, org: g?.org ?? null, asn: g?.asn ?? null, asnLabel: g?.asnLabel ?? null };
    }),
    cities: t.cities.map((c) => ({ ...c })),
    states: t.states.map((x) => ({ ...x })),
    countries: t.countries.map((c) => ({ ...c })),
    ua: t.ua ? { ...t.ua } : null,
  };
}
