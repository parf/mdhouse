/**
 * The Agent Bus integration (`~/src/ai-agent-bus`): a page asks an AI session to read it and reply.
 *
 * Talks to the `agent-busd` daemon over its unix socket, HTTP+JSON. The account socket
 * (`user-<login>.sock`) makes every call the login's own; mdhouse registers an agent of its own
 * (`#mdhouse@<host>`, owned by the login, `@owner` allowed) and talks as it, since a reply needs a
 * registered inbox. `AGENT_BUS_*` from the environment is never read: a mdhouse started from an AI
 * session's shell would act as that session.
 */
import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';

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
/** A pushed session re-polls every 55 s: a credential used this recently is alive between polls. */
const ALIVE_MS = 90_000;
/** Jobs kept for a page that reconnects. */
const JOBS_KEPT = 50;

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

/** The daemon, as one credential sees it. An empty token on the account socket is the login. */
export class Daemon {
  constructor(
    readonly socket: string,
    private readonly token = '',
  ) {}

  async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T | null> {
    const res = await fetch(`http://localhost${path}`, {
      method,
      unix: this.socket,
      headers: { 'content-type': 'application/json', ...(this.token ? { 'x-agent-bus-token': this.token } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch((err: Error) => {
      throw new BusError(0, `agent bus unreachable at ${this.socket}: ${err.message}`);
    });
    // nothing arrived before the wait ran out
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) throw new BusError(res.status, reason(text) || res.statusText);
    return text ? (JSON.parse(text) as T) : null;
  }

  ls(kind?: string): Promise<Rec[] | null> {
    return this.call<Rec[]>('GET', `/ls${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
  }

  send(msg: { to: string; body: string; topic: string; tag: string }): Promise<Envelope | null> {
    return this.call<Envelope>('POST', '/send', msg);
  }

  /** Takes one message from the own inbox without waiting; false when it is empty. */
  async drain(): Promise<boolean> {
    return (await this.call<Envelope>('GET', '/consume?wait=0s')) !== null;
  }

  /** A filtered long-poll: only this topic + tag; null when the wait ran out. */
  consume(topic: string, tag: string, wait = '55s'): Promise<Envelope | null> {
    return this.call<Envelope>('GET', `/consume?${new URLSearchParams({ topic, tag, wait })}`);
  }
}

/** A refusal's words: the daemon answers `{"error": "…"}`, or plain text. */
function reason(text: string): string {
  try {
    const got = JSON.parse(text) as { error?: unknown };
    if (typeof got?.error === 'string') return got.error;
  } catch {
    /* plain text */
  }
  return text.trim();
}

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
export class AgentBus {
  readonly me: string;
  private agent: Promise<Daemon> | null = null;
  private agentSocket = '';
  private readonly jobs = new Map<string, AbEvent[]>();

  constructor(
    private readonly socket: () => string,
    private readonly emit: (ev: AbEvent) => void,
    opts: { me?: string; answerMs?: number; wait?: string } = {},
  ) {
    this.me = opts.me ?? ownName();
    this.answerMs = opts.answerMs ?? ANSWER_MS;
    this.wait = opts.wait ?? '55s';
  }
  private readonly answerMs: number;
  private readonly wait: string;

  /** The daemon as mdhouse's agent: registered if missing, its token minted. Retried after a failure. */
  private connect(): Promise<Daemon> {
    const socket = this.socket();
    if (this.agent && this.agentSocket === socket) return this.agent;
    this.agentSocket = socket;
    const owner = new Daemon(socket);
    this.agent = (async () => {
      const rec = { name: this.me, kind: 'agent', descr: 'mdhouse — pages ask agents', personal: true, allow: ['@owner'] };
      // create only: an existing record keeps what its owner set on it
      await owner.call('POST', '/register', rec, { 'if-none-match': '*' }).catch((err: unknown) => {
        if (!(err instanceof BusError && err.status === 412)) throw err;
      });
      const got = await owner.call<{ token: string }>('POST', '/token', { name: this.me });
      if (!got?.token) throw new BusError(500, `agent bus gave no token for ${this.me}`);
      const agent = new Daemon(socket, got.token);
      // replies to jobs of an earlier run: nobody waits for them any more
      for (let i = 0; i < 1000 && (await agent.drain()); i++);
      return agent;
    })();
    this.agent.catch(() => {
      this.agent = null;
    });
    return this.agent;
  }

  /** Connected, or why not. */
  async status(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.connect();
      return { connected: true };
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  /** Every agent this login may see, mdhouse left out; the live ones first, A–Z. */
  async agents(): Promise<BusAgent[]> {
    const d = await this.connect();
    const now = Date.now();
    return ((await d.ls('agent')) ?? [])
      .filter((r) => r.kind === 'agent' && r.name !== this.me)
      .map((r) => ({ name: r.name, descr: r.descr ?? '', alive: isAlive(r, now) }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name));
  }

  /** A job's events so far; null when it is not (or no longer) kept. */
  job(id: string): AbEvent[] | null {
    return this.jobs.get(id) ?? null;
  }

  /** Ask each target; returns the job id at once — the events follow through `emit`. */
  async ask(targets: string[], body: string): Promise<string> {
    const d = await this.connect();
    const job = crypto.randomUUID();
    this.jobs.set(job, []);
    while (this.jobs.size > JOBS_KEPT) this.jobs.delete(this.jobs.keys().next().value!);
    for (const to of targets) void this.exchange(d, job, to, body);
    return job;
  }

  private note(job: string, to: string, kind: AbKind, body?: string): void {
    const ev: AbEvent = { job, to, kind, ...(body !== undefined ? { body } : {}), at: Date.now() };
    this.jobs.get(job)?.push(ev);
    this.emit(ev);
  }

  /** One target: send, then wait on this exchange's tag for an ack and the answer (or done). */
  private async exchange(d: Daemon, job: string, to: string, body: string): Promise<void> {
    const tag = `mdhouse-${crypto.randomUUID()}`;
    try {
      await d.send({ to, body, topic: TOPIC, tag });
      this.note(job, to, 'sent');
      const until = Date.now() + this.answerMs;
      while (Date.now() < until) {
        const m = await d.consume(TOPIC, tag, this.wait);
        if (!m) continue;
        if (m.receipt === 'ack') this.note(job, to, 'ack');
        else if (m.receipt === 'done') return this.note(job, to, 'done');
        else return this.note(job, to, 'answer', m.body);
      }
      this.note(job, to, 'timeout');
    } catch (err) {
      this.note(job, to, 'error', (err as Error).message);
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
