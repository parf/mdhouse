/**
 * The Agent Bus integration (`~/src/ai-agent-bus`): a page asks an AI session to read it and reply.
 *
 * Talks to the `agent-busd` daemon through the `ai-agent-bus-sdk` client. The account socket
 * (`user-<login>.sock`) makes every call the login's own; mdhouse registers an agent of its own
 * (`#mdhouse@<host>`, owned by the login, `@owner` allowed) and talks as it, since a reply needs a
 * registered inbox. `AGENT_BUS_*` from the environment is never read: a mdhouse started from an AI
 * session's shell would act as that session — `connectBus` passes every client option explicitly.
 */
import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { Bus, BusError as ClientError, BusTimeout, BusUnreachable } from 'ai-agent-bus-sdk';

/** One message as the daemon hands it out. A receipt (`ack` / `done`) is not an answer. */
export interface Envelope {
  message_id: string;
  from: string;
  to: string;
  body: string;
  topic?: string;
  tag?: string;
  receipt?: 'ack' | 'done';
  re?: string;
}

/** A `/ls` row — only the fields read here. */
interface Rec {
  name: string;
  kind: string;
  descr?: string;
  readers?: number;
  last_used?: string;
}

export interface BusAgent {
  name: string;
  descr: string;
  alive: boolean;
}

export type AbKind = 'sent' | 'ack' | 'answer' | 'done' | 'timeout' | 'error';

export interface AbEvent {
  job: string;
  to: string;
  kind: AbKind;
  body?: string;
  at: number;
}

export class BusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The topic every mdhouse request and its reply carry. */
export const TOPIC = 'mdhouse';
/** How long a request waits for its reply. */
export const ANSWER_MS = 10 * 60_000;
/** One daemon call other than a request's wait for its reply, ms. */
const CALL_MS = 30_000;
/** A pushed session re-polls every 55 s: a credential used this recently is alive between polls. */
const ALIVE_MS = 90_000;
/** Jobs kept for a page that reconnects. */
const JOBS_KEPT = 50;
/** Connections kept, one per endpoint and credential; one with exchanges under way is never dropped. */
const CONNECTIONS_KEPT = 16;

/**
 * `<!-- AB: #claude/x@host -->` in a document: the agents it asks, in order, no repeats. One shown
 * as code — in a fenced block or a `code span` — is an example, not a comment.
 */
export function abTargets(src: string): string[] {
  const text = src.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, '').replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, '');
  const names = [...text.matchAll(/<!--\s*AB:\s*([\s\S]*?)\s*-->/g)].flatMap((m) => m[1]!.split(/[\s,]+/));
  return [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
}

/** The account socket: `$XDG_RUNTIME_DIR/agent-bus`, else `/run/agent-bus`. */
export function defaultSocket(env = process.env, login = userInfo().username): string {
  const file = `user-${login}.sock`;
  const dirs = [env.XDG_RUNTIME_DIR ? `${env.XDG_RUNTIME_DIR}/agent-bus` : '', '/run/agent-bus'].filter(Boolean);
  return dirs.map((d) => `${d}/${file}`).find((p) => existsSync(p)) ?? `/run/agent-bus/${file}`;
}

/** mdhouse's own agent name: `#mdhouse@<host>`, in the bus's name alphabet. */
export function ownName(host = hostname()): string {
  const realm = host.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') || 'localhost';
  return `#mdhouse@${realm}`.slice(0, 64);
}

/** A daemon over TCP — `http://host:6767`, `https://…` — rather than a unix socket. */
export const isUrl = (addr: string) => /^https?:\/\//.test(addr);

/** Where a daemon is, and the credential to reach it with (empty: the account socket's login). */
export interface Endpoint {
  addr: string;
  token: string;
}

/** Longest endpoint a project may name. */
export const ENDPOINT_MAX = 1024;

/**
 * Is `addr` an endpoint a project may name: an absolute unix socket path, or an `http(s)://` address
 * with no user info, query or fragment — nothing secret, so it can be shown. No control characters.
 */
export function validEndpoint(addr: unknown): addr is string {
  if (typeof addr !== 'string' || !addr || addr.length > ENDPOINT_MAX || /[\u0000-\u001f\u007f-\u009f]/.test(addr)) return false;
  if (addr.startsWith('/')) return true;
  if (!isUrl(addr) || /[?#@]/.test(addr)) return false;
  try {
    const u = new URL(addr);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && !u.search && !u.hash && !!u.hostname;
  } catch {
    return false;
  }
}

/** The words a page, a WebSocket event or a log may carry for a failure: never the daemon's own text. */
export function safeError(err: unknown): string {
  if (err instanceof BusUnreachable) return 'the agent bus is unreachable';
  if (err instanceof BusTimeout) return 'the agent bus timed out';
  if (!(err instanceof BusError || err instanceof ClientError)) return 'the agent bus failed';
  const { status } = err;
  if (status === 0) return 'the agent bus is unreachable';
  if (status === 401 || status === 403) return `the agent bus refused mdhouse's credential (HTTP ${status})`;
  if (status === 404) return 'the agent bus does not know that name (HTTP 404)';
  if (status === 408 || status === 504) return `the agent bus timed out (HTTP ${status})`;
  if (status === 429) return 'the agent bus is busy (HTTP 429)';
  return status >= 500 ? `the agent bus failed (HTTP ${status})` : `the agent bus refused the request (HTTP ${status})`;
}

/**
 * A client of the daemon at `addr`, as `token` sees it: an empty token on the account socket is the
 * login; over TCP every call needs one. Every option is explicit, so no `AGENT_BUS_*` is read.
 */
export function connectBus(addr: string, token: string, expectName = '', timeout = CALL_MS): Bus {
  return Bus.connect({ addr, token, expectName, fingerprint: '', timeout });
}

/**
 * Does the names filter let `name` through? A regex per line, matched against the name without
 * its `#`, any case; a line that is not a regex is skipped; no lines — every name.
 */
export function passes(name: string, filter: string[]): boolean {
  const res = filter.flatMap((line) => {
    try {
      return [new RegExp(line, 'i')];
    } catch {
      return [];
    }
  });
  return !res.length || res.some((re) => re.test(name.replace(/^#/, '')));
}

/** The lines of a filter that are not regexes. */
export const badPatterns = (filter: string[]): string[] =>
  filter.filter((line) => {
    try {
      new RegExp(line);
      return false;
    } catch {
      return true;
    }
  });

/** Alive: a long-poll open now, or the credential used within the last re-poll. */
export function isAlive(r: Pick<Rec, 'readers' | 'last_used'>, now = Date.now()): boolean {
  if ((r.readers ?? 0) > 0) return true;
  const used = r.last_used ? Date.parse(r.last_used) : NaN;
  return Number.isFinite(used) && now - used < ALIVE_MS;
}

/**
 * The service: connects lazily as mdhouse's own agent, lists the live agents, and runs requests —
 * a send per target, then a filtered wait for its ack and its answer. Every event goes to `emit`
 * and is kept with its job for a page that reconnects.
 */
/**
 * mdhouse's agent on every daemon it talks to: one connection per endpoint and credential, one job
 * store. Roots that share an endpoint share its connection. It never reads its inbox unfiltered: each call
 * waits for its own topic and tag, so a reply left by an earlier run (it expires by the daemon's TTL) or meant
 * for another process talking as the same agent is never taken. A changed endpoint or credential never loses
 * the jobs started before.
 */
export class AgentBus {
  readonly me: string;
  /** `addr \n token` → the connection. */
  private readonly connections = new Map<string, Promise<Bus>>();
  /** Exchanges under way, per connection key. */
  private readonly active = new Map<string, number>();
  private readonly jobs = new Map<string, AbEvent[]>();

  constructor(
    /** The default endpoint: the instance's. */
    private readonly where: () => Endpoint,
    private readonly emit: (ev: AbEvent) => void,
    opts: { me?: string; answerMs?: number } = {},
  ) {
    this.me = opts.me ?? ownName();
    this.answerMs = opts.answerMs ?? ANSWER_MS;
  }
  private readonly answerMs: number;

  /**
   * The daemon as mdhouse's agent at `ep`: registered if missing, its token minted. Retried after a
   * failure. A new endpoint or credential is a connection of its own; the old one keeps serving the
   * exchanges it started.
   */
  private connect(ep: Endpoint = this.where()): Promise<Bus> {
    const key = `${ep.addr}\n${ep.token}`;
    const known = this.connections.get(key);
    if (known) return known;
    const { addr: socket, token } = ep;
    const agent = (async () => {
      const owner = connectBus(socket, token);
      let minted: string;
      try {
        const rec = { name: this.me, kind: 'agent', descr: 'mdhouse — pages ask agents', tags: ['personal'], allow: ['@owner'] };
        // create only: an existing record keeps what its owner set on it
        await owner.register(rec, { createOnly: true }).catch((err: unknown) => {
          if (!(err instanceof ClientError && err.status === 412)) throw err;
        });
        const got = (await owner.request('POST', '/token', { name: this.me })) as { token?: unknown } | null;
        if (typeof got?.token !== 'string' || !got.token) throw new BusError(500, `agent bus gave no token for ${this.me}`);
        minted = got.token;
      } finally {
        await owner.close();
      }
      return connectBus(socket, minted, this.me);
    })();
    this.connections.set(key, agent);
    agent.catch(() => {
      if (this.connections.get(key) === agent) this.connections.delete(key);
    });
    for (const old of this.connections.keys()) {
      if (this.connections.size <= CONNECTIONS_KEPT) break;
      if (old !== key && !this.active.get(old)) this.connections.delete(old);
    }
    return agent;
  }

  /** Connected to `ep` (default: the instance's), or why not — in safe words. */
  async status(ep?: Endpoint): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.connect(ep);
      return { connected: true };
    } catch (err) {
      return { connected: false, error: safeError(err) };
    }
  }

  /** Every agent this login may see at `ep`, mdhouse left out; the live ones first, A–Z. */
  async agents(ep?: Endpoint): Promise<BusAgent[]> {
    const d = await this.connect(ep);
    const now = Date.now();
    return (((await d.records({ kind: 'agent' })) as Rec[] | null) ?? [])
      .filter((r) => r.kind === 'agent' && r.name !== this.me)
      .map((r) => ({ name: r.name, descr: r.descr ?? '', alive: isAlive(r, now) }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name));
  }

  /** A job's events so far; null when it is not (or no longer) kept. */
  job(id: string): AbEvent[] | null {
    return this.jobs.get(id) ?? null;
  }

  /** Ask each target at `ep` (default: the instance's); returns the job id at once — the events follow through `emit`. */
  async ask(targets: string[], body: string, ep: Endpoint = this.where()): Promise<string> {
    const key = `${ep.addr}\n${ep.token}`;
    const d = await this.connect(ep);
    const job = crypto.randomUUID();
    this.jobs.set(job, []);
    while (this.jobs.size > JOBS_KEPT) this.jobs.delete(this.jobs.keys().next().value!);
    this.active.set(key, (this.active.get(key) ?? 0) + targets.length);
    for (const to of targets) void this.exchange(d, key, job, to, body);
    return job;
  }

  private note(job: string, to: string, kind: AbKind, body?: string): void {
    const ev: AbEvent = { job, to, kind, ...(body !== undefined ? { body } : {}), at: Date.now() };
    this.jobs.get(job)?.push(ev);
    this.emit(ev);
  }

  /**
   * One target, already counted in `active`: `sent` when handed to the client, then the client's call —
   * its ack, then the answer, done or timeout. A refused send follows `sent` with `error`.
   */
  private async exchange(d: Bus, key: string, job: string, to: string, body: string): Promise<void> {
    try {
      this.note(job, to, 'sent');
      const out = await d.call(to, body, { topic: TOPIC, timeout: this.answerMs, onAck: () => this.note(job, to, 'ack') });
      if (out.kind === 'answer') this.note(job, to, 'answer', out.message.body);
      else this.note(job, to, out.kind);
    } catch (err) {
      this.note(job, to, 'error', safeError(err));
    } finally {
      const n = (this.active.get(key) ?? 1) - 1;
      if (n > 0) this.active.set(key, n);
      else this.active.delete(key);
    }
  }
}

/** What a page can ask; the note is added to any of them, and is the whole request for `note`. */
export const AB_ACTIONS = ['updated', 'target', 'resolve', 'review', 'note'] as const;
export type AbAction = (typeof AB_ACTIONS)[number];

const MARKUP = 'https://github.com/parf/mdhouse/blob/main/doc/agent-markup.md';

/** The message a page's request sends: the file by its absolute path, the page by its URL. */
export function requestText(action: AbAction, abs: string, url: string, note = ''): string {
  const ask = {
    updated: `${abs} was updated — read it and reply.`,
    target: `Do the 🎯 items in ${abs}, then reply.`,
    resolve: `The questions in ${abs} are answered — carry the answers over, then reply.`,
    review: `Review ${abs} — write the findings into it in the markup of ${MARKUP}, then reply.`,
    note: `About ${abs}:`,
  }[action];
  return `mdhouse: ${ask}\nPage: ${url}${note.trim() ? `\n\n${note.trim()}` : ''}`;
}

/** A bus name as a page may send it: an agent, a user or a group, at most 64 characters. */
export const validTarget = (n: unknown): n is string => typeof n === 'string' && n.length <= 64 && /^[#@]?[a-z0-9][a-z0-9._+@/-]*$/.test(n);
