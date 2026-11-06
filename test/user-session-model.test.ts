import { describe, expect, test } from 'bun:test';
import type { Geo } from '../src/lib/geoip';
import {
  EMPTY,
  GEO_RETRY_MS,
  IDLE_MS,
  addUser,
  applyGeo,
  historyView,
  revokeSession,
  setStatus,
  startSession,
  touch,
  userKey,
  type Model,
  type TouchContext,
  type TouchResult,
  type UserKey,
} from '../src/lib/user-session-model';

const A = userKey('github', 1001);
const B = userKey('github', 2002);
const SA = 'session-a-0000000001';
const SA2 = 'session-a-0000000002';
const SB = 'session-b-0000000001';
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DAY = 86_400_000;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** A and B, each with one session started at T0 in the US. */
function base(country: string | null = 'US'): Model {
  let m = addUser(addUser(EMPTY, A), B);
  m = startSession(m, A, SA, T0, country);
  m = startSession(m, B, SB, T0, country);
  return deepFreeze(m);
}

const ctx = (over: Partial<TouchContext> = {}): TouchContext => ({ user: A, session: SA, route: 'allowed', ip: '8.8.8.8', ua: 'UA/1', now: T0 + MIN, ...over });

function ok(r: TouchResult) {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  deepFreeze(r.model);
  return r;
}

const geo = (ip: string, over: Partial<Geo> = {}): Geo => ({
  ip,
  city: 'Mountain View',
  state: 'California',
  country: 'US',
  countryName: 'United States',
  isp: 'Google LLC',
  org: 'Google LLC',
  asn: 15169,
  asnLabel: null,
  source: 'ipwho.is',
  ...over,
});

/** Touch from `ip`, resolve the lookup with `g`, return the model. */
function seen(m: Model, ip: string, g: Geo | null, now: number, user: UserKey = A, session = SA): Model {
  const r = ok(touch(m, ctx({ user, session, ip, now })));
  if (!r.lookup) return r.model;
  return deepFreeze(applyGeo(r.model, r.lookup, g, now).model);
}

describe('identity and lifecycle', () => {
  test('a user key is provider + immutable numeric ID only', () => {
    expect(userKey('github', '583231')).toBe('github:583231');
    for (const bad of ['octocat', '0', '-1', '1.5', '', '1'.repeat(21)]) expect(() => userKey('github', bad)).toThrow();
    expect(() => userKey('gitlab' as 'github', 1)).toThrow();
  });

  test('sessions: unknown or disabled user, bad id or country, and any reused id are refused', () => {
    const m = base();
    expect(() => addUser(m, A)).toThrow('already exists');
    expect(() => startSession(m, userKey('github', 9), 'x'.repeat(20), T0, null)).toThrow('unknown user');
    expect(() => startSession(m, A, 'short', T0, null)).toThrow('malformed session id');
    expect(() => startSession(m, A, 'bad id with spaces!!', T0, null)).toThrow('malformed session id');
    expect(() => startSession(m, A, SA2, T0, 'usa')).toThrow('malformed country');
    expect(() => startSession(m, A, SA, T0, 'US')).toThrow('already used');
    expect(() => startSession(m, A, SB, T0, 'US')).toThrow('already used'); // another user's id
    const off = setStatus(m, A, 'disabled', T0);
    expect(() => startSession(off, A, SA2, T0, 'US')).toThrow('user is disabled');
  });

  test('an expired or revoked id never comes back', () => {
    const idle = touch(base(), ctx({ now: T0 + IDLE_MS + 1 }));
    expect(idle.ok).toBe(false);
    expect(() => startSession(idle.model, A, SA, T0 + IDLE_MS + 2, 'US')).toThrow('already used');
    const revoked = revokeSession(base(), A, SA, 'self', T0);
    expect(() => startSession(revoked, A, SA, T0, 'US')).toThrow('already used');
  });

  test('disable/remove revoke live sessions and keep history; removal is final', () => {
    let m = seen(base(), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    m = setStatus(m, A, 'removed', T0 + 2 * MIN);
    expect(m[A]!.sessions.every((s) => s.revokedBy === 'user-removed')).toBe(true);
    expect(m[A]!.ips).toHaveLength(1);
    expect(m[A]!.countries).toHaveLength(1);
    expect(() => setStatus(m, A, 'enabled', T0)).toThrow('cannot come back');
    expect(m[B]!.sessions[0]!.revokedAt).toBeNull();
  });
});

describe('touch — order and refusals', () => {
  test('every refusal leaves lastUsedAt, history and UA untouched', () => {
    const m = base();
    const removed = deepFreeze(setStatus(m, A, 'removed', T0));
    const disabled = deepFreeze(setStatus(m, A, 'disabled', T0));
    const revoked = deepFreeze(revokeSession(m, A, SA, 'self', T0));
    const cases: [Model, Partial<TouchContext>, string][] = [
      [m, { user: userKey('github', 77) }, 'unknown-user'],
      [disabled, {}, 'disabled'],
      [removed, {}, 'removed'],
      [m, { session: 'session-z-0000000000' }, 'unknown-session'],
      [m, { session: SB }, 'unknown-session'], // B's session presented for A
      [revoked, {}, 'revoked'],
      [m, { route: 'denied' }, 'denied'],
    ];
    for (const [model, over, reason] of cases) {
      const r = touch(model, ctx(over));
      expect(r).toEqual({ ok: false, reason: reason as never, model });
      expect(r.model).toBe(model);
    }
  });

  test('idle: exactly 30 days is fine; one ms more is reauth — revoked, nothing else touched', () => {
    const m = base();
    const at30 = ok(touch(m, ctx({ now: T0 + IDLE_MS })));
    expect(at30.model[A]!.sessions[0]!.lastUsedAt).toBe(T0 + IDLE_MS);

    const r = touch(m, ctx({ now: T0 + IDLE_MS + 1 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('reauth');
    const s = r.model[A]!.sessions[0]!;
    expect(s).toEqual({ ...m[A]!.sessions[0]!, revokedAt: T0 + IDLE_MS + 1, revokedBy: 'reauth' });
    expect(r.model[A]!.ips).toEqual([]);
    expect(r.model[A]!.ua).toBeNull();
    expect(r.model[B]).toBe(m[B]);
    expect(touch(r.model, ctx({ now: T0 + IDLE_MS + 2 }))).toMatchObject({ ok: false, reason: 'revoked' });
  });

  test('idle is per session: a busy neighbor never renews it', () => {
    let m = deepFreeze(startSession(base(), A, SA2, T0, 'US'));
    for (let t = T0 + DAY; t < T0 + 40 * DAY; t += DAY) m = ok(touch(m, ctx({ session: SA2, now: t }))).model;
    expect(m[A]!.sessions.find((s) => s.id === SA)!.lastUsedAt).toBe(T0);
    expect(touch(m, ctx({ now: T0 + 40 * DAY }))).toMatchObject({ ok: false, reason: 'reauth' });
  });

  test('idle beats a denied route: a stale session is revoked even on a denied request', () => {
    expect(touch(base(), ctx({ route: 'denied', now: T0 + IDLE_MS + 1 }))).toMatchObject({ ok: false, reason: 'reauth' });
  });

  test('a clock going backwards never renews', () => {
    const m = ok(touch(base(), ctx({ now: T0 + 10 * MIN }))).model;
    const back = ok(touch(m, ctx({ now: T0 + 5 * MIN }))).model;
    expect(back[A]!.sessions[0]!.lastUsedAt).toBe(T0 + 10 * MIN);
  });

  test('touch never changes its input', () => {
    const m = base();
    const before = JSON.stringify(m);
    ok(touch(m, ctx()));
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('history — addresses and UA', () => {
  test('11 addresses → the 10 most recent, newest first; a repeat moves to the front', () => {
    let m = base();
    for (let i = 1; i <= 11; i++) m = ok(touch(m, ctx({ ip: `10.0.0.${i}`, now: T0 + i * MIN }))).model;
    expect(m[A]!.ips.map((r) => r.ip)).toEqual(Array.from({ length: 10 }, (_, i) => `10.0.0.${11 - i}`));
    m = ok(touch(m, ctx({ ip: '10.0.0.5', now: T0 + 20 * MIN }))).model;
    expect(m[A]!.ips.map((r) => r.ip).slice(0, 2)).toEqual(['10.0.0.5', '10.0.0.11']);
    expect(m[A]!.ips).toHaveLength(10);
  });

  test('exact canonical addresses: IPv4-mapped equals IPv4; one IPv6 /64 is still two addresses', () => {
    let m = ok(touch(base(), ctx({ ip: '::ffff:10.1.1.1' }))).model;
    m = ok(touch(m, ctx({ ip: '10.1.1.1', now: T0 + 2 * MIN }))).model;
    m = ok(touch(m, ctx({ ip: 'fd00:0:0:1::1', now: T0 + 3 * MIN }))).model;
    m = ok(touch(m, ctx({ ip: 'fd00:0:0:1::2', now: T0 + 4 * MIN }))).model;
    expect(m[A]!.ips.map((r) => r.ip)).toEqual(['fd00:0:0:1::2', 'fd00:0:0:1::1', '10.1.1.1']);
  });

  test('an unparsable address is not recorded; the session still counts as used', () => {
    const m = ok(touch(base(), ctx({ ip: 'not-an-ip' }))).model;
    expect(m[A]!.ips).toEqual([]);
    expect(m[A]!.sessions[0]!.lastUsedAt).toBe(T0 + MIN);
  });

  test('UA: latest only, plain text, bounded; an older request never overwrites a newer one', () => {
    let m = ok(touch(base(), ctx({ ua: 'Old/1', now: T0 + 2 * MIN }))).model;
    m = ok(touch(m, ctx({ ua: '<img src=x onerror=alert(1)>‮\u0000' + 'A'.repeat(600), now: T0 + 3 * MIN }))).model;
    const ua = m[A]!.ua!;
    expect(ua.value.startsWith('<img src=x onerror=alert(1)>AAA')).toBe(true);
    expect([...ua.value].length).toBe(512);
    expect(ua.value).not.toMatch(/[\u0000‮]/);
    m = ok(touch(m, ctx({ ua: 'Late/1', now: T0 + MIN }))).model;
    expect(m[A]!.ua!.at).toBe(T0 + 3 * MIN);
    m = ok(touch(m, ctx({ ua: null, now: T0 + 4 * MIN }))).model;
    expect(m[A]!.ua!.at).toBe(T0 + 3 * MIN);
  });
});

describe('history — GeoIP', () => {
  test('a private address starts no lookup and is unavailable', () => {
    for (const ip of ['192.168.1.2', '::1', 'fd00::5']) {
      const r = ok(touch(base(), ctx({ ip })));
      expect(r.lookup).toBeNull();
      expect(r.country).toEqual({ state: 'unavailable' });
      expect(r.model[A]!.ips[0]!.geo).toBeNull();
    }
  });

  test('a new public address → one pending job; applied → cities, states, countries, network fields', () => {
    const r = ok(touch(base(), ctx()));
    expect(r.lookup).toEqual({ user: A, session: SA, ip: '8.8.8.8', observedAt: T0 + MIN });
    expect(r.country).toEqual({ state: 'pending', job: r.lookup });
    const again = ok(touch(r.model, ctx({ now: T0 + 2 * MIN })));
    expect(again.lookup).toBeNull();
    expect(again.country).toEqual({ state: 'pending', job: null });

    const done = applyGeo(again.model, r.lookup!, geo('8.8.8.8'), T0 + 3 * MIN);
    expect(done.applied).toBe(true);
    const u = done.model[A]!;
    expect(u.cities).toEqual([{ city: 'Mountain View', state: 'California', country: 'US', lastSeen: T0 + 2 * MIN }]);
    expect(u.states).toEqual([{ state: 'California', country: 'US', lastSeen: T0 + 2 * MIN }]);
    expect(u.countries).toEqual([{ code: 'US', name: 'United States', lastSeen: T0 + 2 * MIN }]);
    expect(historyView(done.model, { user: A, admin: false }, A)!.ips[0]).toEqual({ ip: '8.8.8.8', lastSeen: T0 + 2 * MIN, isp: 'Google LLC', org: 'Google LLC', asn: 15169, asnLabel: null });
    expect('county' in u.cities[0]!).toBe(false);
  });

  test('a resolved address refreshes city/state/country lastSeen without a new lookup', () => {
    const m = seen(base(), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    const r = ok(touch(m, ctx({ now: T0 + DAY })));
    expect(r.lookup).toBeNull();
    expect(r.country).toEqual({ state: 'match', country: 'US' });
    const u = r.model[A]!;
    expect([u.cities[0]!.lastSeen, u.states[0]!.lastSeen, u.countries[0]!.lastSeen]).toEqual([T0 + DAY, T0 + DAY, T0 + DAY]);
  });

  test('a failed lookup leaves no location and is retried only after GEO_RETRY_MS', () => {
    const m = seen(base(), '8.8.8.8', null, T0 + MIN);
    expect(m[A]!.ips[0]!.geo).toEqual({ state: 'none', at: T0 + MIN });
    expect(m[A]!.countries).toEqual([]);
    const soon = ok(touch(m, ctx({ now: T0 + MIN + GEO_RETRY_MS })));
    expect(soon.lookup).toBeNull();
    expect(soon.country).toEqual({ state: 'unavailable' });
    expect(ok(touch(m, ctx({ now: T0 + MIN + GEO_RETRY_MS + 1 }))).lookup).not.toBeNull();
  });

  test('missing city or state records only what is known; null is never a key', () => {
    const m = seen(base(), '8.8.8.8', geo('8.8.8.8', { city: null, state: null }), T0 + MIN);
    expect(m[A]!.cities).toEqual([]);
    expect(m[A]!.states).toEqual([]);
    expect(m[A]!.countries.map((c) => c.code)).toEqual(['US']);
  });

  test('cities are unique by city + state + country; states by state + country', () => {
    let m = base();
    const places: Partial<Geo>[] = [
      { city: 'Springfield', state: 'Illinois' },
      { city: 'Springfield', state: 'Missouri' },
      { city: 'Springfield', state: 'Illinois' },
      { city: 'Portland', state: 'Oregon' },
    ];
    places.forEach((p, i) => (m = seen(m, `8.8.8.${10 + i}`, geo(`8.8.8.${10 + i}`, p), T0 + (i + 1) * MIN)));
    expect(m[A]!.cities.map((c) => `${c.city}/${c.state}`)).toEqual(['Portland/Oregon', 'Springfield/Illinois', 'Springfield/Missouri']);
    expect(m[A]!.states.map((s) => s.state)).toEqual(['Oregon', 'Illinois', 'Missouri']);
  });

  test('11 cities → 10, newest first', () => {
    let m = base();
    for (let i = 1; i <= 11; i++) m = seen(m, `8.8.4.${i}`, geo(`8.8.4.${i}`, { city: `City ${i}` }), T0 + i * MIN);
    expect(m[A]!.cities.map((c) => c.city)).toEqual(Array.from({ length: 10 }, (_, i) => `City ${11 - i}`));
  });

  test('11 countries → 10, newest first, each with its last-seen date', () => {
    const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK'];
    let m = addUser(EMPTY, A);
    codes.forEach((c, i) => {
      const id = `session-c-${String(i).padStart(10, '0')}`;
      m = startSession(m, A, id, T0 + i * MIN, c);
      m = seen(m, `8.8.3.${i + 1}`, geo(`8.8.3.${i + 1}`, { country: c }), T0 + i * MIN, A, id);
    });
    expect(m[A]!.countries.map((c) => c.code)).toEqual([...codes].reverse().slice(0, 10));
    expect(m[A]!.countries[0]!.lastSeen).toBe(T0 + 10 * MIN);
  });

  test('a result for another address is a failure, not a location', () => {
    const r = ok(touch(base(), ctx()));
    const done = applyGeo(r.model, r.lookup!, geo('8.8.4.4'), T0 + 2 * MIN);
    expect(done.applied).toBe(true);
    expect(done.model[A]!.ips[0]!.geo).toEqual({ state: 'none', at: T0 + MIN });
    expect(done.model[A]!.countries).toEqual([]);
  });

  test('a late result is dropped for a disabled/removed user, a revoked or idle session, an evicted address or a superseded job', () => {
    const r = ok(touch(base(), ctx()));
    const job = r.lookup!;
    const g = geo('8.8.8.8');
    const drops: Model[] = [
      setStatus(r.model, A, 'disabled', T0 + 2 * MIN),
      setStatus(r.model, A, 'removed', T0 + 2 * MIN),
      revokeSession(r.model, A, SA, 'admin', T0 + 2 * MIN),
    ];
    for (const m of drops) expect(applyGeo(deepFreeze(m), job, g, T0 + 3 * MIN)).toEqual({ applied: false, model: m });
    expect(applyGeo(r.model, job, g, T0 + MIN + IDLE_MS + 1).applied).toBe(false);

    let evicted = r.model;
    for (let i = 1; i <= 10; i++) evicted = ok(touch(evicted, ctx({ ip: `10.9.0.${i}`, now: T0 + (i + 1) * MIN }))).model;
    expect(evicted[A]!.ips.some((x) => x.ip === '8.8.8.8')).toBe(false);
    const late = applyGeo(evicted, job, g, T0 + 20 * MIN);
    expect(late.applied).toBe(false);
    expect(late.model[A]!.ips.some((x) => x.ip === '8.8.8.8')).toBe(false);
    expect(late.model[A]!.countries).toEqual([]);

    const retried = ok(touch(applyGeo(r.model, job, null, T0 + 2 * MIN).model, ctx({ now: T0 + MIN + GEO_RETRY_MS + 1 })));
    expect(applyGeo(retried.model, job, g, T0 + MIN + GEO_RETRY_MS + 2).applied).toBe(false); // the old job
    expect(applyGeo(retried.model, retried.lookup!, g, T0 + MIN + GEO_RETRY_MS + 2).applied).toBe(true);
  });

  test('out-of-order results: address order, UA and lastUsedAt never move; lastSeen keeps the newer', () => {
    const r1 = ok(touch(base(), ctx({ ip: '8.8.8.1', ua: 'First', now: T0 + MIN })));
    const r2 = ok(touch(r1.model, ctx({ ip: '8.8.8.2', ua: 'Second', now: T0 + 2 * MIN })));
    let m = r2.model;
    const ipsBefore = m[A]!.ips.map((x) => x.ip);
    m = applyGeo(m, r2.lookup!, geo('8.8.8.2', { city: 'Two' }), T0 + 3 * MIN).model;
    m = applyGeo(m, r1.lookup!, geo('8.8.8.1', { city: 'One' }), T0 + 4 * MIN).model;
    const u = m[A]!;
    expect(u.ips.map((x) => x.ip)).toEqual(ipsBefore);
    expect(u.ua).toEqual({ value: 'Second', at: T0 + 2 * MIN });
    expect(u.sessions[0]!.lastUsedAt).toBe(T0 + 2 * MIN);
    expect(u.cities.map((c) => c.city)).toEqual(['Two', 'One']);
    expect(u.countries).toEqual([{ code: 'US', name: 'United States', lastSeen: T0 + 2 * MIN }]);
  });
});

describe('country gate — every transition needs a GitHub login', () => {
  test('US session, DE address → country-change: revoked, nothing touched', () => {
    const m = seen(base('US'), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    const de = seen(m, '9.9.9.9', geo('9.9.9.9', { country: 'DE', city: 'Berlin', state: 'Berlin' }), T0 + 2 * MIN);
    // The lookup itself recorded no DE history: a candidate country is not trusted.
    expect(de[A]!.countries.map((c) => c.code)).toEqual(['US']);
    expect(de[A]!.cities.map((c) => c.city)).toEqual(['Mountain View']);

    const r = touch(de, ctx({ ip: '9.9.9.9', now: T0 + 3 * MIN }));
    expect(r).toMatchObject({ ok: false, reason: 'country-change' });
    expect(r.model[A]!.sessions[0]!.revokedBy).toBe('country-change');
    expect(r.model[A]!.sessions[0]!.lastUsedAt).toBe(de[A]!.sessions[0]!.lastUsedAt);
    expect(r.model[A]!.ua).toEqual(de[A]!.ua);
  });

  test('US → DE → US: both transitions need a login, even though history and a neighbor know US', () => {
    let m = seen(base('US'), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    m = deepFreeze(startSession(m, A, SA2, T0 + MIN, 'US')); // a US neighbor
    m = seen(m, '9.9.9.9', geo('9.9.9.9', { country: 'DE' }), T0 + 2 * MIN, A, SA2);
    expect(touch(m, ctx({ session: SA2, ip: '9.9.9.9', now: T0 + 3 * MIN }))).toMatchObject({ ok: false, reason: 'country-change' });

    const deLogin = 'session-a-de00000001';
    m = deepFreeze(startSession(m, A, deLogin, T0 + 4 * MIN, 'DE'));
    const inDe = ok(touch(m, ctx({ session: deLogin, ip: '9.9.9.9', now: T0 + 5 * MIN })));
    expect(inDe.country).toEqual({ state: 'match', country: 'DE' });
    expect(inDe.model[A]!.countries.map((c) => c.code)).toEqual(['DE', 'US']);

    expect(touch(inDe.model, ctx({ session: deLogin, ip: '8.8.8.8', now: T0 + 6 * MIN }))).toMatchObject({ ok: false, reason: 'country-change' });
  });

  test('unknown, private or failed GeoIP is not a transition', () => {
    let m = seen(base('US'), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    m = seen(m, '1.2.3.4', null, T0 + 2 * MIN);
    expect(ok(touch(m, ctx({ ip: '1.2.3.4', now: T0 + 3 * MIN }))).country).toEqual({ state: 'unavailable' });
    expect(ok(touch(m, ctx({ ip: '192.168.0.9', now: T0 + 4 * MIN }))).country).toEqual({ state: 'unavailable' });
    expect(ok(touch(m, ctx({ ip: '5.6.7.8', now: T0 + 5 * MIN }))).country.state).toBe('pending');
  });

  test('a session whose login had no country: a known country is unbound — neither match nor refusal, never recorded', () => {
    const m = seen(base(null), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    expect(m[A]!.countries).toEqual([]);
    const r = ok(touch(m, ctx({ now: T0 + 2 * MIN })));
    expect(r.country).toEqual({ state: 'unbound', country: 'US' });
    expect(r.model[A]!.countries).toEqual([]);
    expect(r.model[A]!.cities).toEqual([]);
  });

  test('the gate runs before the route decision', () => {
    const m = seen(base('US'), '9.9.9.9', geo('9.9.9.9', { country: 'DE' }), T0 + MIN);
    expect(touch(m, ctx({ ip: '9.9.9.9', route: 'denied', now: T0 + 2 * MIN }))).toMatchObject({ ok: false, reason: 'country-change' });
  });
});

describe('two users and views', () => {
  test('one user’s requests and lookups never touch the other', () => {
    const m = base();
    const r = ok(touch(m, ctx()));
    expect(r.model[B]).toBe(m[B]);
    const forged = { ...r.lookup!, user: B };
    expect(applyGeo(r.model, forged, geo('8.8.8.8'), T0 + 2 * MIN).applied).toBe(false);
    const viaB = { ...r.lookup!, session: SB };
    expect(applyGeo(r.model, viaB, geo('8.8.8.8'), T0 + 2 * MIN).applied).toBe(false);
  });

  test('history: self and a declared admin see it; anyone else, a disabled viewer or an unknown target get null', () => {
    const m = seen(base(), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    expect(historyView(m, { user: A, admin: false }, A)?.countries[0]?.code).toBe('US');
    expect(historyView(m, { user: B, admin: true }, A)?.ips[0]?.ip).toBe('8.8.8.8');
    expect(historyView(m, { user: B, admin: false }, A)).toBeNull();
    expect(historyView(m, { user: B, admin: 'yes' as never }, A)).toBeNull();
    expect(historyView(m, { user: A, admin: false }, userKey('github', 5))).toBeNull();
    expect(historyView(m, { user: B, admin: true }, userKey('github', 5))).toBeNull();
    const off = setStatus(m, A, 'disabled', T0 + 2 * MIN);
    expect(historyView(off, { user: A, admin: true }, B)).toBeNull();
    expect(historyView(off, { user: B, admin: true }, A)?.status).toBe('disabled');
  });

  test('a view is a copy', () => {
    const m = seen(base(), '8.8.8.8', geo('8.8.8.8'), T0 + MIN);
    const v = historyView(m, { user: A, admin: false }, A)!;
    (v.cities[0] as { city: string }).city = 'changed';
    expect(m[A]!.cities[0]!.city).toBe('Mountain View');
  });
});
