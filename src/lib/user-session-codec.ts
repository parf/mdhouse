/** Strict snapshot consistency only: no authenticated sessions, authority or authCountry provenance. */
import { canonicalIp, cleanText, publicIp } from './geoip';
import type { Geo } from './geoip';
import { HISTORY_MAX, UA_MAX } from './user-session-model';
import type { Model, UserRecord, SessionRecord, IpRecord, CityRecord, StateRecord, CountryRecord } from './user-session-model';

export const SNAPSHOT_VERSION = 1;
/** Resource budgets reject the whole snapshot; they are not retention/session caps or truncation. */
export const SNAPSHOT_LIMITS = { bytes: 16 * 1024 * 1024, depth: 16, nodes: 500_000, string: 2048 } as const;
export type SnapshotErrorReason = 'newer' | 'unsupported' | 'corrupt';
export class SnapshotError extends Error {
  constructor(readonly reason: SnapshotErrorReason, message = 'invalid snapshot') {
    super(`Session snapshot ${reason}: ${message}`);
    this.name = 'SnapshotError';
  }
}
export interface SessionSnapshot { version: typeof SNAPSHOT_VERSION; revision: number; model: Model }
type Obj = Record<string, unknown>;
const utf8 = new TextEncoder();
function corrupt(at: string): never { throw new SnapshotError('corrupt', at); }
function size(text: string): void {
  if (text.length > SNAPSHOT_LIMITS.bytes || utf8.encode(text).length > SNAPSHOT_LIMITS.bytes) corrupt('byte budget');
}

/** Parses bounded persisted JSON and rejects duplicate keys, including escaped spellings. */
function parse(text: string): unknown {
  size(text);
  let at = 0;
  let nodes = 0;
  const ws = () => { while (at < text.length && /[ \t\r\n]/.test(text[at]!)) at++; };
  const string = (): string => {
    const start = at++;
    let end = false;
    while (at < text.length) {
      if (at - start > SNAPSHOT_LIMITS.string * 6 + 2) corrupt('string budget');
      const c = text[at++]!;
      if (c === '"') { end = true; break; }
      if (c === '\\') at++;
    }
    if (!end) corrupt('unterminated string');
    let value: unknown;
    try { value = JSON.parse(text.slice(start, at)); } catch { return corrupt('JSON string'); }
    if (typeof value !== 'string' || value.length > SNAPSHOT_LIMITS.string) corrupt('string budget');
    return value;
  };
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const value = (depth: number): unknown => {
    if (depth > SNAPSHOT_LIMITS.depth || ++nodes > SNAPSHOT_LIMITS.nodes) corrupt('depth/node budget');
    ws();
    const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; ws();
      const out: Obj = Object.create(null);
      if (text[at] === '}') { at++; return out; }
      for (;;) {
        ws(); if (text[at] !== '"') corrupt('object key');
        const key = string();
        if (Object.hasOwn(out, key)) corrupt('duplicate JSON key');
        ws(); if (text[at++] !== ':') corrupt('object colon');
        out[key] = value(depth + 1); ws();
        const next = text[at++];
        if (next === '}') return out;
        if (next !== ',') corrupt('object delimiter');
      }
    }
    if (c === '[') {
      at++; ws(); const out: unknown[] = [];
      if (text[at] === ']') { at++; return out; }
      for (;;) {
        out.push(value(depth + 1)); ws();
        const next = text[at++];
        if (next === ']') return out;
        if (next !== ',') corrupt('array delimiter');
      }
    }
    for (const [word, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, at)) { at += word.length; return result; }
    }
    number.lastIndex = at;
    const match = number.exec(text);
    if (!match) corrupt('JSON value');
    at = number.lastIndex;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) corrupt('nonfinite JSON number');
    return n;
  };
  const result = value(0); ws();
  if (at !== text.length) corrupt('trailing JSON');
  return result;
}

/** Copies finite plain JSON trees without invoking accessors; repeated references become detached copies. */
function plain(value: unknown): unknown {
  let nodes = 0;
  let bytes = 0;
  const active = new Set<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > SNAPSHOT_LIMITS.depth || ++nodes > SNAPSHOT_LIMITS.nodes) corrupt('depth/node budget');
    if (typeof v === 'string') {
      if (v.length > SNAPSHOT_LIMITS.string) corrupt('string budget');
      bytes += utf8.encode(v).length;
      if (bytes > SNAPSHOT_LIMITS.bytes) corrupt('string/byte budget');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object' || active.has(v)) corrupt('finite acyclic JSON data required');
    const array = Array.isArray(v);
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(v))) corrupt('plain prototype required');
    if (array && v.length > SNAPSHOT_LIMITS.nodes) corrupt('node budget');
    const keys = Reflect.ownKeys(v);
    if (keys.length > SNAPSHOT_LIMITS.nodes) corrupt('node budget');
    const out: Obj | unknown[] = array ? [] : Object.create(null);
    active.add(v);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || key.length > SNAPSHOT_LIMITS.string
        || (array && !/^(0|[1-9]\d*)$/.test(key))) corrupt('JSON key');
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      if (!('value' in d) || !d.enumerable) corrupt('accessor/hidden data');
      bytes += utf8.encode(key).length;
      if (bytes > SNAPSHOT_LIMITS.bytes) corrupt('byte budget');
      Object.defineProperty(out, key, { value: walk(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && ((out as unknown[]).length !== v.length || keys.length !== v.length + 1)) corrupt('sparse array');
    active.delete(v);
    return out;
  };
  const result = walk(value, 0);
  size(JSON.stringify(result));
  return result;
}
function object(value: unknown, keys?: readonly string[]): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) corrupt('object required');
  const o = value as Obj;
  if (keys && (Object.keys(o).length !== keys.length || keys.some(k => !Object.hasOwn(o, k)))) corrupt('schema keys');
  return o;
}
function choice<const T extends readonly string[]>(v: unknown, choices: T): T[number] {
  if (!choices.includes(v as string)) corrupt('enum');
  return v as T[number];
}
function integer(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || Object.is(v, -0) || v < 0 || v > max) corrupt('nonnegative safe integer required');
  return v;
}
const timestamp = (v: unknown) => integer(v, 8_640_000_000_000_000);
function country(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Z]{2}$/.test(v)) corrupt('country code');
  return v;
}
function display(v: unknown, max = 100): string {
  if (typeof v !== 'string' || cleanText(v, max) !== v) corrupt('canonical display text');
  return v;
}
const nullableText = (v: unknown) => v === null ? null : display(v);
function ip(v: unknown): string {
  if (typeof v !== 'string' || canonicalIp(v) !== v) corrupt('canonical IP');
  return v;
}
function geo(value: unknown, address: string): Geo {
  const g = object(value, ['ip', 'city', 'state', 'country', 'countryName', 'isp', 'org', 'asn', 'asnLabel', 'source']);
  if (ip(g.ip) !== address) corrupt('Geo IP binding');
  const asn = g.asn === null ? null : integer(g.asn, 0xffffffff);
  if (asn === 0) corrupt('ASN');
  return { ip: address, city: nullableText(g.city), state: nullableText(g.state), country: country(g.country),
    countryName: nullableText(g.countryName), isp: nullableText(g.isp), org: nullableText(g.org),
    asn, asnLabel: nullableText(g.asnLabel), source: choice(g.source, ['ipwho.is', 'freeipapi.com']) };
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) corrupt('array required');
  return value;
}
function mru<T extends { lastSeen: number }>(value: unknown, read: (v: unknown) => T, key: (v: T) => string): T[] {
  const result = array(value).map(read);
  if (result.length > HISTORY_MAX || new Set(result.map(key)).size !== result.length
    || result.some((v, i) => i > 0 && result[i - 1]!.lastSeen < v.lastSeen)) corrupt('MRU size/uniqueness/order');
  return result;
}
function model(value: unknown): Model {
  const raw = object(value);
  const result: Record<string, UserRecord> = {};
  const ids = new Set<string>();
  for (const [principal, value] of Object.entries(raw)) {
    if (!/^github:[1-9]\d{0,19}$/.test(principal)) corrupt('immutable principal');
    const u = object(value, ['status', 'sessions', 'ips', 'cities', 'states', 'countries', 'ua']);
    const status = choice(u.status, ['enabled', 'disabled', 'removed']);
    const sessions: SessionRecord[] = array(u.sessions).map(value => {
      const s = object(value, ['id', 'createdAt', 'lastUsedAt', 'authCountry', 'revokedAt', 'revokedBy']);
      if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(s.id) || ids.has(s.id)) corrupt('unique session ID');
      ids.add(s.id);
      const createdAt = timestamp(s.createdAt); const lastUsedAt = timestamp(s.lastUsedAt);
      if (lastUsedAt < createdAt) corrupt('session last-use chronology');
      const revokedAt = s.revokedAt === null ? null : timestamp(s.revokedAt);
      const revokedBy = s.revokedBy === null ? null : choice(s.revokedBy, ['self', 'admin', 'reauth', 'country-change', 'user-disabled', 'user-removed']);
      if ((revokedAt === null) !== (revokedBy === null) || (status !== 'enabled' && revokedAt === null)) corrupt('revocation consistency');
      // A caller clock may move backwards during revocation; the model does not order revokedAt.
      return { id: s.id, createdAt, lastUsedAt, authCountry: s.authCountry === null ? null : country(s.authCountry), revokedAt, revokedBy };
    });
    const ips = mru<IpRecord>(u.ips, value => {
      const r = object(value, ['ip', 'lastSeen', 'geo']); const address = ip(r.ip); const lastSeen = timestamp(r.lastSeen);
      let location: IpRecord['geo'] = null;
      if (r.geo !== null) {
        if (publicIp(address) === null) corrupt('nonpublic Geo observation');
        const g = object(r.geo); const state = choice(g.state, ['pending', 'none', 'found']);
        object(g, state === 'found' ? ['state', 'at', 'geo'] : ['state', 'at']);
        const at = timestamp(g.at);
        if (at > lastSeen) corrupt('Geo observation chronology');
        location = state === 'found' ? { state, at, geo: geo(g.geo, address) } : { state, at };
      } else if (publicIp(address) !== null) corrupt('public observation requires lookup state');
      return { ip: address, lastSeen, geo: location };
    }, r => r.ip);
    const cities = mru<CityRecord>(u.cities, value => {
      const c = object(value, ['city', 'state', 'country', 'lastSeen']);
      return { city: display(c.city), state: nullableText(c.state), country: country(c.country), lastSeen: timestamp(c.lastSeen) };
    }, c => JSON.stringify([c.city, c.state, c.country]));
    const states = mru<StateRecord>(u.states, value => {
      const s = object(value, ['state', 'country', 'lastSeen']);
      return { state: display(s.state), country: country(s.country), lastSeen: timestamp(s.lastSeen) };
    }, s => JSON.stringify([s.state, s.country]));
    const countries = mru<CountryRecord>(u.countries, value => {
      const c = object(value, ['code', 'name', 'lastSeen']);
      return { code: country(c.code), name: nullableText(c.name), lastSeen: timestamp(c.lastSeen) };
    }, c => c.code);
    let ua: UserRecord['ua'] = null;
    if (u.ua !== null) {
      const a = object(u.ua, ['value', 'at']); ua = { value: display(a.value, UA_MAX), at: timestamp(a.at) };
    }
    // MRUs evict independently. Candidate/unbound Geo need not exist in any trusted location MRU.
    result[principal] = { status, sessions, ips, cities, states, countries, ua };
  }
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Obj)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Validates the entire snapshot and returns fresh data, never reset/default/drop records. */
export function decodeSnapshot(value: unknown | string): SessionSnapshot {
  const raw = object(typeof value === 'string' ? parse(value) : plain(value));
  if (typeof raw.version !== 'number' || !Number.isSafeInteger(raw.version) || raw.version < 0) corrupt('version');
  if (raw.version !== SNAPSHOT_VERSION) throw new SnapshotError(raw.version > SNAPSHOT_VERSION ? 'newer' : 'unsupported', 'version');
  object(raw, ['version', 'revision', 'model']);
  return { version: SNAPSHOT_VERSION, revision: integer(raw.revision), model: model(raw.model) };
}
/** Encodes canonical deterministic JSON; revision/model declarations do not prove authCountry provenance. */
export function encodeSnapshot(value: unknown, revision: number): string {
  const snapshot = decodeSnapshot({ version: SNAPSHOT_VERSION, revision, model: value });
  const text = canonical(snapshot) + '\n'; size(text);
  return text;
}
