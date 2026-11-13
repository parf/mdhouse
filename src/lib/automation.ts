/**
 * Scheduled flow runs (MW.11 slice 1): the registration a project keeps in `.mdhouse/automation/<id>.json`
 * (team data, under Git), the run index, and the handler for what an Agent Bus schedule delivers.
 *
 * Nothing here is wired to a server yet, and nothing here runs a flow by itself: a firing starts a run only through
 * `deps.start` (the flow host's `startFlowRun`), and only after `deps.approval` says this machine approved this exact
 * registration file. The approval that exists today refuses always (`notApproved`): who may let a committed
 * registration run is the owner's open question Q-R3-AUTO2, and the answer to it is not guessed.
 *
 * Provenance is the bus's `schedule` stamp alone — `{id, by, slot, late_by?, missed?}`, set only by the daemon, on a
 * message from `#bus`. The body is untrusted: it names a project and a registration, never a flow, a range or a path.
 */
import { createHash } from 'node:crypto';
import type { FlowError, FlowRange, FlowStarted, FlowStartRequest } from './flow-host';

export const AUTO_VERSION = 1;
export const AUTO_MAX_BODY = 4096;
export const AUTO_MAX_FILE = 16 * 1024;
export const AUTO_REPLAY_KEPT = 500;
export const AUTO_REPLAY_MS = 10 * 60_000;
/** A registration may not start twice within this, whatever its cron says. */
export const AUTO_MIN_INTERVAL_MS = 5 * 60_000;
/** Runs started per UTC day per registration. */
export const AUTO_DAILY_CAP = 10;
/** Consecutive failures after which the registration stops (its approval is withdrawn on this machine). */
export const AUTO_FAILURES_OFF = 3;
export const AUTO_HISTORY_CAP = 200;

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PACKAGE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COMMIT = /^[0-9a-f]{4,40}$/;
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const CRON_FIELD = /^(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?(,(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?)*$/;

/** What a registration file holds: what to run, when, over what, and who hears of it. Where it runs is not in the file. */
export interface Registration {
  id: string;
  /** A package of the installed catalog. */
  flow: string;
  range: FlowRange;
  /** The timer, as an Agent Bus schedule takes it: five or six cron fields, or one instant. */
  when: { cron: string } | { at: string };
  /** A firing later than this is skipped. */
  maxLateMs: number;
  /** Only `skip` is built: a firing while the registration has an open run is skipped. */
  overlap: 'skip';
  /** One agent told of the outcome; best effort. */
  notify?: string;
}

const KEYS = ['id', 'flow', 'range', 'when', 'maxLate', 'overlap', 'notify'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `30s`, `15m`, `2h`, `1d` → milliseconds (1 s to 7 d); null for anything else. */
export function parseDuration(text: unknown): number | null {
  const m = typeof text === 'string' ? /^(\d{1,6})([smhd])$/.exec(text) : null;
  if (!m) return null;
  const ms = Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return ms >= 1000 && ms <= 7 * 86_400_000 ? ms : null;
}

export function validCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  return (fields.length === 5 || fields.length === 6) && fields.every((f) => CRON_FIELD.test(f));
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * One registration file, strictly: exactly the known keys, the id the file's own name, a package id (that it is a
 * runnable package is the loader's check, against the catalog), a range that names no path, a cron or an instant.
 */
export function parseRegistration(text: string, fileId: string): Parsed<Registration> {
  const bad = (error: string): Parsed<Registration> => ({ ok: false, error });
  if (Buffer.byteLength(text) > AUTO_MAX_FILE) return bad(`over ${AUTO_MAX_FILE} bytes`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('not JSON');
  }
  if (!isObject(raw)) return bad('not an object');
  for (const k of Object.keys(raw)) if (!(KEYS as readonly string[]).includes(k)) return bad(`unknown key "${k}"`);
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) return bad('id: a-z 0-9 _ -, at most 64');
  if (raw.id !== fileId) return bad(`id "${raw.id}" is not the file's name "${fileId}"`);
  if (typeof raw.flow !== 'string' || !PACKAGE.test(raw.flow)) return bad('flow: a package id');
  let range: FlowRange;
  if (raw.range === 'since-last-run') range = { kind: 'since-last-run' };
  else if (isObject(raw.range) && raw.range.kind === 'baseline' && Object.keys(raw.range).length === 2 && typeof raw.range.commit === 'string' && COMMIT.test(raw.range.commit)) {
    range = { kind: 'baseline', commit: raw.range.commit };
  } else return bad('range: "since-last-run" or {"kind":"baseline","commit":"<4-40 hex>"}');
  let when: Registration['when'];
  if (isObject(raw.when) && Object.keys(raw.when).length === 1 && typeof raw.when.cron === 'string' && validCron(raw.when.cron)) when = { cron: raw.when.cron.trim().replace(/\s+/g, ' ') };
  else if (isObject(raw.when) && Object.keys(raw.when).length === 1 && typeof raw.when.at === 'string' && RFC3339.test(raw.when.at) && !Number.isNaN(Date.parse(raw.when.at))) when = { at: raw.when.at };
  else return bad('when: {"cron":"<5 or 6 fields>"} or {"at":"<RFC 3339 UTC instant>"}');
  const maxLateMs = raw.maxLate === undefined ? 3_600_000 : parseDuration(raw.maxLate);
  if (maxLateMs === null) return bad('maxLate: 1s to 7d, e.g. "30m"');
  if (raw.overlap !== undefined && raw.overlap !== 'skip') return bad('overlap: only "skip" is built');
  if (raw.notify !== undefined && (typeof raw.notify !== 'string' || !/^#[A-Za-z0-9._/@-]{1,120}$/.test(raw.notify))) return bad('notify: an agent name, #name@host');
  return { ok: true, value: { id: raw.id, flow: raw.flow, range, when, maxLateMs, overlap: 'skip', ...(raw.notify ? { notify: raw.notify as string } : {}) } };
}

/** The identity an approval is of: the file's exact bytes. A pull or a commit that changes them is a different registration. */
export const contentHash = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A registration found in a project, with the hash of the file it came from. */
export interface LoadedRegistration {
  rootId: string;
  reg: Registration;
  hash: string;
}

// ---------------------------------------------------------------- approval

export interface ApprovalAsk {
  rootId: string;
  registration: string;
  hash: string;
  scheduleId: string;
}
export type Approval = (ask: ApprovalAsk) => Promise<boolean>;
/**
 * The approval that exists today: none. Who lets a registration that arrived by a pull or a commit run on this
 * machine is [№Q-R3-AUTO2](../../Plans/R3/workspaces/QUESTIONS.md#Q-R3-AUTO2); until the owner answers, every firing is refused.
 */
export const notApproved: Approval = async () => false;

// ---------------------------------------------------------------- run index

/** The index's store: the instance's own, not the project's (user data). */
export interface AutoStore {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

export function memoryStore(): AutoStore {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    keys: async (p) => [...m.keys()].filter((k) => k.startsWith(p)).sort(),
    del: async (k) => void m.delete(k),
  };
}

export type RunOutcome = 'started' | 'skipped' | 'refused' | 'failed' | 'ok' | 'held';
export interface IndexEntry {
  v: 1;
  at: string;
  requestId: string;
  outcome: RunOutcome;
  /** Why it was skipped, refused or failed. */
  why?: string;
  runPath?: string;
  status?: string;
}
export interface RegState {
  v: 1;
  /** Consecutive failures; any started run that did not fail clears it. */
  failures: number;
  disabled: boolean;
  /** The last run this machine started, ms. */
  lastStartMs: number;
  day: string;
  started: number;
}
const emptyState = (): RegState => ({ v: 1, failures: 0, disabled: false, lastStartMs: 0, day: '', started: 0 });

/** `automation/<root>/<id>/state` and `…/hist/<time>-<hex>`: the newest `AUTO_HISTORY_CAP` kept. */
export class RunIndex {
  constructor(private readonly store: AutoStore, private readonly now: () => number = Date.now) {}

  private prefix = (rootId: string, id: string): string => `automation/${rootId}/${id}/`;

  async state(rootId: string, id: string): Promise<RegState> {
    const s = (await this.store.get(`${this.prefix(rootId, id)}state`)) as RegState | null;
    return s && s.v === 1 ? { ...emptyState(), ...s } : emptyState();
  }
  async save(rootId: string, id: string, s: RegState): Promise<void> {
    await this.store.put(`${this.prefix(rootId, id)}state`, s);
  }

  async record(rootId: string, id: string, e: Omit<IndexEntry, 'v' | 'at'>): Promise<void> {
    const at = new Date(this.now()).toISOString();
    const key = `${this.prefix(rootId, id)}hist/${at.replace(/[-:]/g, '').replace(/\.\d+/, '')}-${Math.random().toString(16).slice(2, 6).padEnd(4, '0')}`;
    await this.store.put(key, { v: 1, at, ...e } satisfies IndexEntry);
    const all = await this.store.keys(`${this.prefix(rootId, id)}hist/`);
    for (const old of all.slice(0, Math.max(0, all.length - AUTO_HISTORY_CAP))) await this.store.del(old);
  }

  /** Newest first. */
  async history(rootId: string, id: string, limit = 20): Promise<IndexEntry[]> {
    const keys = (await this.store.keys(`${this.prefix(rootId, id)}hist/`)).reverse().slice(0, limit);
    return (await Promise.all(keys.map((k) => this.store.get(k)))).filter((e): e is IndexEntry => !!e && (e as IndexEntry).v === 1);
  }

  /** A run this machine started ended: `failed` counts toward the stop, anything else clears the count. */
  async outcome(rootId: string, id: string, outcome: 'ok' | 'failed' | 'held', detail: Omit<IndexEntry, 'v' | 'at' | 'outcome'>): Promise<RegState> {
    const s = await this.state(rootId, id);
    s.failures = outcome === 'failed' ? s.failures + 1 : 0;
    if (s.failures >= AUTO_FAILURES_OFF) s.disabled = true;
    await this.save(rootId, id, s);
    await this.record(rootId, id, { ...detail, outcome });
    return s;
  }
}

// ---------------------------------------------------------------- the handler

export interface ScheduleStamp {
  id: string;
  by: string;
  slot: string;
  late_by?: string | number;
  missed?: number;
}

/** One message as the bus delivers it: the sender, and the daemon's stamp when a schedule fired it. */
export interface Firing {
  from: string;
  schedule?: unknown;
  body: string;
}

export type AutoErrorCode = 'bad-request' | 'denied' | 'unregistered' | 'not-approved' | 'disabled' | 'conflict' | 'failed' | 'internal';

export interface AutoDeps {
  /** The registrations a project holds now (re-read each firing: a file may have changed). Null: no such project. */
  registration(rootId: string, id: string): Promise<{ loaded: LoadedRegistration } | { error: string } | null>;
  approval: Approval;
  /** The flow host's `startFlowRun({ request })`. */
  start(req: FlowStartRequest): Promise<FlowStarted | FlowError>;
  index: RunIndex;
  audit(level: 'notice' | 'warning' | 'alert', line: string): void;
  /** Tells `agent` how a run went; best effort, never throws into the handler. */
  notify?(agent: string, text: string): Promise<void>;
  now?(): number;
}

type Reply = Record<string, unknown>;
const refuse = (requestId: string | undefined, code: AutoErrorCode, msg: string): Reply => ({ v: AUTO_VERSION, ...(requestId ? { requestId } : {}), ok: false, error: { code, msg } });
const clean = (s: string) => s.replace(/[\s\x00-\x1f\x7f]+/g, '_').slice(0, 200);

/** The daemon's stamp, or null when it is not one (missing, malformed): only its shape is trusted, never the body. */
export function readStamp(raw: unknown): ScheduleStamp | null {
  if (!isObject(raw)) return null;
  const { id, by, slot, late_by, missed } = raw;
  if (typeof id !== 'string' || !REQUEST_ID.test(id) || typeof by !== 'string' || !by || by.length > 200) return null;
  if (typeof slot !== 'string' || !RFC3339.test(slot) || Number.isNaN(Date.parse(slot))) return null;
  if (late_by !== undefined && typeof late_by !== 'string' && typeof late_by !== 'number') return null;
  return { id, by, slot, ...(late_by !== undefined ? { late_by } : {}), ...(typeof missed === 'number' ? { missed } : {}) };
}

/** `late_by` as milliseconds: a number is seconds, a string a `90s`/`2m`/`1h` duration (fractions allowed); null when unreadable. */
export function lateMs(v: string | number | undefined): number | null {
  if (v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v * 1000 : null;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'ms' | 's' | 'm' | 'h' | 'd'];
}

export class Automation {
  private readonly replies = new Map<string, { fingerprint: string; reply: Promise<string>; at: number }>();
  /** A registration with a firing in flight: a second one is an overlap, even before the host knows of the run. */
  private readonly busy = new Set<string>();

  constructor(private readonly deps: AutoDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Answers one firing; never throws. */
  async handle(firing: Firing): Promise<string> {
    try {
      return await this.dispatch(firing);
    } catch {
      return JSON.stringify(refuse(undefined, 'internal', 'internal error'));
    }
  }

  private async dispatch(firing: Firing): Promise<string> {
    // Only the bus fires a schedule, and only its stamp says which: anything else is not one.
    const stamp = firing.from === '#bus' ? readStamp(firing.schedule) : null;
    if (!stamp) {
      this.deps.audit('warning', `automation refused a message from ${clean(firing.from)}: no bus schedule stamp`);
      return JSON.stringify(refuse(undefined, 'denied', 'not a schedule firing'));
    }
    const requestId = `${stamp.id}:${stamp.slot}`;
    if (Buffer.byteLength(firing.body) > AUTO_MAX_BODY) return JSON.stringify(refuse(requestId, 'bad-request', `body over ${AUTO_MAX_BODY} bytes`));
    let body: unknown;
    try {
      body = JSON.parse(firing.body);
    } catch {
      return JSON.stringify(refuse(requestId, 'bad-request', 'body is not JSON'));
    }
    if (!isObject(body) || body.v !== AUTO_VERSION || body.op !== 'run') return JSON.stringify(refuse(requestId, 'bad-request', 'expected {"v":1,"op":"run","project":…,"registration":…}'));
    for (const k of Object.keys(body)) if (!['v', 'op', 'project', 'registration'].includes(k)) return JSON.stringify(refuse(requestId, 'bad-request', `unknown key "${k}"`));
    if (typeof body.project !== 'string' || !body.project || typeof body.registration !== 'string' || !ID.test(body.registration)) {
      return JSON.stringify(refuse(requestId, 'bad-request', 'project and registration are required'));
    }

    // A repeated slot (a bus replay, a catch-up) gets the answer it got: it never starts a second run.
    const now = this.now();
    for (const [k, r] of this.replies) if (now - r.at > AUTO_REPLAY_MS) this.replies.delete(k);
    const fingerprint = JSON.stringify([stamp.by, body.project, body.registration]);
    const seen = this.replies.get(requestId);
    if (seen) return seen.fingerprint === fingerprint ? seen.reply : JSON.stringify(refuse(requestId, 'conflict', 'this slot was already used for another request'));
    const reply = this.run(stamp, requestId, body.project, body.registration);
    this.replies.set(requestId, { fingerprint, reply, at: now });
    while (this.replies.size > AUTO_REPLAY_KEPT) this.replies.delete(this.replies.keys().next().value!);
    return reply;
  }

  private async run(stamp: ScheduleStamp, requestId: string, rootId: string, regId: string): Promise<string> {
    const { deps } = this;
    const out = (reply: Reply) => JSON.stringify(reply);
    const found = await deps.registration(rootId, regId);
    if (!found || 'error' in found) {
      deps.audit('warning', `automation: no usable registration ${clean(rootId)}/${clean(regId)} for schedule ${clean(stamp.id)}${found && 'error' in found ? `: ${clean(found.error)}` : ''}`);
      return out(refuse(requestId, 'unregistered', found && 'error' in found ? found.error : 'no such registration'));
    }
    const { reg, hash } = found.loaded;
    const key = `${rootId}/${regId}`;
    const skip = async (why: string): Promise<string> => {
      await deps.index.record(rootId, regId, { requestId, outcome: 'skipped', why });
      deps.audit('notice', `automation ${clean(key)} skipped slot ${clean(stamp.slot)}: ${why}`);
      return out({ v: AUTO_VERSION, requestId, ok: true, skipped: why });
    };

    // FAIL CLOSED: nothing below runs until this machine approved this exact file (Q-R3-AUTO2 is open).
    if (!(await deps.approval({ rootId, registration: regId, hash, scheduleId: stamp.id }))) {
      await deps.index.record(rootId, regId, { requestId, outcome: 'refused', why: 'not approved' });
      deps.audit('warning', `automation ${clean(key)} refused: not approved on this machine`);
      return out(refuse(requestId, 'not-approved', 'not approved'));
    }

    const state = await deps.index.state(rootId, regId);
    if (state.disabled) return out(refuse(requestId, 'disabled', `stopped after ${AUTO_FAILURES_OFF} failures`));

    const late = lateMs(stamp.late_by);
    if (late === null || late > reg.maxLateMs) return skip('late');
    const now = this.now();
    if (now - state.lastStartMs < AUTO_MIN_INTERVAL_MS) return skip('interval');
    const day = new Date(now).toISOString().slice(0, 10);
    if (state.day === day && state.started >= AUTO_DAILY_CAP) return skip('daily cap');
    if (this.busy.has(key)) return skip('overlap');

    this.busy.add(key);
    try {
      const started = await deps.start({ rootId, packageId: reg.flow, range: reg.range, trigger: { kind: 'schedule', id: stamp.id, slot: stamp.slot } });
      if ('reason' in started) {
        if (started.reason === 'open-run') return skip('overlap');
        const s = await deps.index.outcome(rootId, regId, 'failed', { requestId, why: `${started.reason}: ${started.error}` });
        if (s.disabled) deps.audit('alert', `automation ${clean(key)} stopped after ${AUTO_FAILURES_OFF} failures`);
        else deps.audit('warning', `automation ${clean(key)} could not start: ${clean(started.reason)}`);
        await this.tell(reg, `${reg.id}: could not start (${started.reason})`);
        return out(refuse(requestId, 'failed', `${started.reason}: ${started.error}`));
      }
      if (started.created) {
        state.lastStartMs = now;
        state.started = state.day === day ? state.started + 1 : 1;
        state.day = day;
        await deps.index.save(rootId, regId, state);
        await deps.index.record(rootId, regId, { requestId, outcome: 'started', runPath: started.runPath, status: started.status });
        await this.tell(reg, `${reg.id}: run started — ${started.runPath}`);
      }
      return out({ v: AUTO_VERSION, requestId, ok: true, status: started.status, runPath: started.runPath, url: started.url, created: started.created });
    } finally {
      this.busy.delete(key);
    }
  }

  private async tell(reg: Registration, text: string): Promise<void> {
    if (!reg.notify || !this.deps.notify) return;
    await this.deps.notify(reg.notify, text).catch(() => {});
  }
}
