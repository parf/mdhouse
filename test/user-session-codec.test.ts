import { expect, test } from 'bun:test';
import { decodeSnapshot, encodeSnapshot, SNAPSHOT_LIMITS, SNAPSHOT_VERSION, SnapshotError } from '../src/lib/user-session-codec';
import { EMPTY, addUser, applyGeo, revokeSession, setStatus, startSession, touch, userKey } from '../src/lib/user-session-model';
import type { Model, TouchContext } from '../src/lib/user-session-model';
import type { Geo } from '../src/lib/geoip';

const A = userKey('github', 123); const B = userKey('github', 456);
const SA = 'session-a-00000001'; const SB = 'session-b-00000001';
const T = 1_700_000_000_000;
function base(country: string | null = 'US'): Model {
  return startSession(startSession(addUser(addUser(EMPTY, A), B), A, SA, T, country), B, SB, T, 'US');
}
function observation(ip = '8.8.8.8', overrides: Partial<TouchContext> = {}): TouchContext {
  return { user: A, session: SA, route: 'allowed', ip, ua: 'Browser/1', now: T + 1, ...overrides };
}
function location(ip: string, overrides: Partial<Geo> = {}): Geo {
  return { ip, city: 'City', state: 'State', country: 'US', countryName: 'United States',
    isp: 'ISP', org: 'Org', asn: 123, asnLabel: 'AS123 Network', source: 'freeipapi.com', ...overrides };
}
function observed(m: Model = base(), ip = '8.8.8.8', overrides: Partial<Geo> = {}, ctx: Partial<TouchContext> = {}): Model {
  const r = touch(m, observation(ip, ctx));
  if (!r.ok || !r.lookup) throw new Error('fixture needs a lookup');
  return applyGeo(r.model, r.lookup, location(ip, overrides), ctx.now ?? T + 1).model;
}
function roundtrip(model: Model, revision = 7): Model {
  const text = encodeSnapshot(model, revision);
  const snapshot = decodeSnapshot(text);
  expect(snapshot).toEqual({ version: SNAPSHOT_VERSION, revision, model });
  expect(encodeSnapshot(snapshot.model, revision)).toBe(text);
  expect(decodeSnapshot(snapshot)).toEqual(snapshot);
  return snapshot.model;
}
function fails(value: unknown, reason: SnapshotError['reason'] = 'corrupt'): void {
  try { decodeSnapshot(value); throw new Error('expected SnapshotError'); }
  catch (error) { expect(error).toBeInstanceOf(SnapshotError); expect((error as SnapshotError).reason).toBe(reason); }
}
const snapshot = (model: unknown = base(), revision = 0) => ({ version: SNAPSHOT_VERSION, revision, model });

// Object mutations intentionally exercise unknown public data, not typed model operations.
function mutate(change: (m: any) => void): unknown {
  const m = structuredClone(observed()); change(m); return snapshot(m);
}

test('empty, enabled, disabled and removed models retain every session and history with deterministic revisions', () => {
  roundtrip(EMPTY, 0); roundtrip(addUser(EMPTY, A)); roundtrip(base());
  const m = observed();
  for (const status of ['disabled', 'removed'] as const) {
    const next = roundtrip(setStatus(m, A, status, T + 2));
    expect(next[A]!.sessions[0]!.revokedBy).toBe(`user-${status}`);
    expect(next[A]!.ips).toEqual(m[A]!.ips); expect(next[B]).toEqual(m[B]);
  }
  roundtrip(revokeSession(m, A, SA, 'admin', T - 10)); // backwards caller clock is supported by the model
  expect(decodeSnapshot(encodeSnapshot(m, Number.MAX_SAFE_INTEGER)).revision).toBe(Number.MAX_SAFE_INTEGER);
});

test('pending, failed, private, candidate-country and unbound states survive without inventing trusted MRU history', () => {
  const pending = touch(base(), observation()); if (!pending.ok || !pending.lookup) throw new Error('fixture');
  roundtrip(pending.model);
  roundtrip(applyGeo(pending.model, pending.lookup, null, T + 2).model);
  const privateIp = touch(base(), observation('fd00::1')); if (!privateIp.ok) throw new Error('fixture');
  expect(roundtrip(privateIp.model)[A]!.ips[0]!.geo).toBeNull();
  const candidate = roundtrip(applyGeo(pending.model, pending.lookup, location('8.8.8.8', { country: 'DE' }), T + 2).model);
  expect(candidate[A]!.countries).toEqual([]);
  const denied = touch(candidate, observation('8.8.8.8', { now: T + 3 }));
  expect(denied.ok).toBe(false); expect(roundtrip(denied.model)[A]!.sessions[0]!.revokedBy).toBe('country-change');
  const unbound = roundtrip(observed(base(null)));
  const check = touch(unbound, observation('8.8.8.8', { now: T + 3 }));
  expect(check.ok && check.country.state).toBe('unbound'); expect(unbound[A]!.countries).toEqual([]);
});

test('all network metadata and independent city/state/country MRUs keep their words, keys and order', () => {
  let m = observed();
  expect(roundtrip(m)[A]!.ips[0]!.geo).toEqual(m[A]!.ips[0]!.geo);
  const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ'];
  for (let i = 0; i < codes.length; i++) {
    const session = `session-country-${i.toString().padStart(5, '0')}`;
    m = startSession(m, A, session, T + i + 2, codes[i]!);
    m = observed(m, `8.8.4.${i+1}`, { country: codes[i]!, city: null, state: null, countryName: null }, { session, now: T + i + 2 });
  }
  const next = roundtrip(m);
  expect(next[A]!.countries.some(c => c.code === 'US')).toBe(false);
  expect(next[A]!.cities[0]!.country).toBe('US'); expect(next[A]!.states[0]!.country).toBe('US');
  expect(next[A]!.cities).toHaveLength(1); expect(next[A]!.countries).toHaveLength(10);
  roundtrip(observed(base(), '2606:4700:4700::1111', { city: null, state: null, isp: null, org: null, asn: null, asnLabel: null, source: 'ipwho.is' }));
});

test('more than fifty sessions, including revoked and removed records, are never truncated or purged', () => {
  let m = addUser(EMPTY, A);
  for (let i = 0; i < 81; i++) m = startSession(m, A, `session-${i.toString().padStart(10, '0')}`, T + i, null);
  m = revokeSession(m, A, m[A]!.sessions[0]!.id, 'self', T + 100);
  m = setStatus(m, A, 'removed', T + 101);
  const next = roundtrip(m);
  expect(next[A]!.sessions).toHaveLength(81); expect(next[A]!.sessions[0]!.revokedBy).toBe('self');
  expect(next[A]!.sessions[80]!.revokedBy).toBe('user-removed');
});

test('canonical text ignores object insertion order, preserves array order and rejects invalid encode inputs', () => {
  const m = observed();
  const reordered = { [B]: m[B]!, [A]: Object.fromEntries(Object.entries(m[A]!).reverse()) };
  expect(encodeSnapshot(reordered, 3)).toBe(encodeSnapshot(m, 3));
  for (const value of [null, [], { 'github:01': m[A] }]) expect(() => encodeSnapshot(value, 0)).toThrow(SnapshotError);
  for (const rev of [-0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => encodeSnapshot(m, rev)).toThrow(SnapshotError);
});

test('decode and encode validate fresh detached trees; shared caller objects do not alias decoded records', () => {
  const original = observed(); const raw: any = structuredClone(snapshot(original));
  const decoded: any = decodeSnapshot(raw);
  decoded.model[A].sessions[0].authCountry = 'DE'; decoded.model[A].ips[0].geo.geo.org = 'changed';
  decoded.model[A].cities[0].city = 'changed';
  expect(raw.model).toEqual(original);
  const text = encodeSnapshot(raw.model, 0); raw.model[A].ua.value = 'changed';
  expect(decodeSnapshot(text).model[A]!.ua!.value).toBe('Browser/1');
  const user: any = structuredClone(original[A]);
  const aliasInput = { [A]: user, [B]: { ...user, sessions: [] } };
  const next: any = decodeSnapshot(snapshot(aliasInput)).model;
  next[A].ips[0].geo.geo.city = 'changed';
  expect(next[B].ips[0].geo.geo.city).toBe('City');
  expect(aliasInput[A].ips[0].geo.geo.city).toBe('City');
});

test('unknown schema/version/status/principal/session identity and revocation corruption reject atomically', () => {
  fails({ ...snapshot(), version: SNAPSHOT_VERSION + 1 }, 'newer'); fails({ version: 999 }, 'newer');
  fails({ ...snapshot(), version: 0 }, 'unsupported'); fails({ ...snapshot(), version: '1' });
  fails({ ...snapshot(), extra: true }); fails({ version: 1, model: {} }); fails(snapshot(null));
  const changes: ((m: any) => void)[] = [
    m => { m[A].extra = true; }, m => { m[A].status = 'admin'; },
    m => { m['github:0'] = m[A]; delete m[A]; }, m => { m['local:123'] = m[A]; delete m[A]; },
    m => { m[B].sessions[0].id = m[A].sessions[0].id; }, m => { m[A].sessions.push({ ...m[A].sessions[0] }); },
    m => { m[A].sessions[0].id = 'short'; }, m => { m[A].sessions[0].authCountry = 'us'; },
    m => { m[A].status = 'removed'; }, m => { m[A].sessions[0].revokedBy = 'admin'; },
    m => { m[A].sessions[0].revokedAt = T; }, m => { m[A].sessions[0].createdAt = T + 100; },
    m => { m[A].sessions[0].revokedAt = T; m[A].sessions[0].revokedBy = 'unknown'; },
  ];
  for (const change of changes) fails(mutate(change));
});

test('timestamp, canonical IP, Geo binding, network metadata and display corruption never normalize silently', () => {
  const changes: ((m: any) => void)[] = [
    m => { m[A].sessions[0].createdAt = -1; }, m => { m[A].ua.at = 0.5; },
    m => { m[A].countries[0].lastSeen = Infinity; }, m => { m[A].ips[0].lastSeen = 8_640_000_000_000_001; },
    m => { m[A].ips[0].ip = '::ffff:8.8.8.8'; }, m => { m[A].ips[0].geo.geo.ip = '8.8.4.4'; },
    m => { m[A].ips[0].geo.geo.asn = 0; }, m => { m[A].ips[0].geo.geo.asn = 0x100000000; },
    m => { m[A].ips[0].geo.geo.asn = 'AS123'; }, m => { m[A].ips[0].geo.geo.country = 'USA'; },
    m => { m[A].ips[0].geo.geo.source = 'other'; }, m => { m[A].ips[0].geo.geo.city = ' City '; },
    m => { m[A].ips[0].geo.geo.org = '\u202ebidi'; }, m => { m[A].ua.value = 'x'.repeat(513); },
    m => { m[A].ips[0].geo.at = T + 500; }, m => { m[A].ips[0].geo = null; },
    m => { m[A].ips[0].geo.state = 'pending'; }, // extra Geo field on pending must reject
    m => { m[A].ips[0].ip = '127.0.0.1'; m[A].ips[0].geo.geo.ip = '127.0.0.1'; },
  ];
  for (const change of changes) fails(mutate(change));
});

test('MRU uniqueness uses the full tuples, descending timestamps and existing ten-entry bounds', () => {
  for (const field of ['ips', 'cities', 'states', 'countries']) {
    fails(mutate(m => { m[A][field].push({ ...m[A][field][0] }); }));
    fails(mutate(m => { m[A][field] = Array.from({ length: 11 }, () => ({ ...m[A][field][0] })); }));
  }
  fails(mutate(m => { m[A].countries = [{ code: 'US', name: null, lastSeen: T }, { code: 'DE', name: null, lastSeen: T + 1 }]; }));
  const m: any = structuredClone(observed());
  m[A].cities.push({ ...m[A].cities[0], state: 'Other' });
  m[A].states.push({ ...m[A].states[0], country: 'DE' });
  roundtrip(m);
});

test('raw persisted JSON rejects duplicate keys (including Unicode escapes), malformed syntax and invalid numbers', () => {
  for (const text of [
    '', '{', '{"version":1,}', '[1,]', 'null', '\ufeff{}', 'true trailing',
    '{"version":1,"revision":0,"model":{},"model":{}}',
    '{"version":1,"revision":0,"model":{},"m\\u006fdel":{}}',
    '{"version":1,"revision":0,"model":{"github:1":{},"github:1":{}}}',
    '{"version":1,"revision":1e999,"model":{}}', '{"version":1,"revision":01,"model":{}}',
    '{"version":1,"revision":NaN,"model":{}}', '{"version":1,"revision":0,"model":{}}x',
    '{"version":1,"revision":0,"model":{"__proto__":{}}}',
    '{"version":1,"revision":0,"model":{},"__proto__":{}}',
  ]) fails(text);
  fails('{"version":2,"revision":0,"model":{}}', 'newer');
  fails('{"version":0,"revision":0,"model":{}}', 'unsupported');
  const raw = JSON.stringify(snapshot(observed())).replace('Browser/1', 'Browser\\q'); fails(raw);
  const json = encodeSnapshot(observed(), 0);
  expect(decodeSnapshot(' \n\t' + json + '\r ').model).toEqual(observed());
});

test('plain unknown values reject accessors without invocation, foreign prototypes, symbols, hidden keys, cycles and sparse arrays', () => {
  let invoked = false;
  const accessor = { ...snapshot() }; Object.defineProperty(accessor, 'model', { enumerable: true, get() { invoked = true; return {}; } });
  const hidden = { ...snapshot() }; Object.defineProperty(hidden, 'hidden', { value: true });
  const cycle: any = snapshot(); cycle.model = cycle;
  const sparse = Array(3); sparse[2] = 'only';
  class ForeignArray extends Array {}
  for (const value of [accessor, hidden, cycle, Object.create(snapshot()), new Date(), NaN, Infinity, undefined,
    { ...snapshot(), [Symbol('hidden')]: 1 }, { ...snapshot(), extra: () => 0 }, { ...snapshot(), extra: sparse },
    { ...snapshot(), extra: new ForeignArray() }]) fails(value);
  expect(invoked).toBe(false);
  fails(JSON.parse('{"version":1,"revision":0,"model":{},"constructor":{}}'));
});

test('budgets reject oversized/deep JSON and objects without truncation, with exported limits for the store', () => {
  fails(' '.repeat(SNAPSHOT_LIMITS.bytes + 1));
  fails('['.repeat(18) + '0' + ']'.repeat(18));
  let deep: unknown = 0; for (let i = 0; i < 18; i++) deep = [deep]; fails(deep);
  fails({ ...snapshot(), extra: 'x'.repeat(SNAPSHOT_LIMITS.string + 1) });
  fails({ ...snapshot(), extra: new Array(SNAPSHOT_LIMITS.nodes + 1).fill(null) });
  fails('[' + 'null,'.repeat(SNAPSHOT_LIMITS.nodes) + 'null]');
  expect(SNAPSHOT_LIMITS.bytes).toBe(16 * 1024 * 1024);
});

test('changing a consistent caller snapshot is not authenticated country provenance or an authorization decision', () => {
  const m: any = structuredClone(base()); m[A].sessions[0].authCountry = 'DE';
  const decoded = roundtrip(m);
  expect(decoded[A]!.sessions[0]!.authCountry).toBe('DE');
  expect(Object.keys(decodeSnapshot(snapshot(m)))).toEqual(['version', 'revision', 'model']);
});
