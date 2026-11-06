/**
 * The rag-sync bin's Agent Bus transport: the local account socket only, one bounded exchange per
 * request, answers taken only by the request's own random topic and tag.
 *
 * `openBus` proves who it talks as before any message: the socket is the login's own, the daemon
 * names that login, `#mdhouse@<host>` exists, is an active agent and is the login's, and its token
 * (kept in memory only) authenticates as it. It never registers, configures, drains or reads an
 * inbox unfiltered, and never reads `AGENT_BUS_*`. Diagnostics name the step and the HTTP status,
 * never a token, a message body or a reply.
 */
import { lstat, realpath, stat } from 'node:fs/promises';
import { defaultSocket, isUrl, ownName, validTarget } from './agent-bus';

export const BUS_LIMITS = Object.freeze({
  /** A daemon answer or a request body, bytes. */
  bytes: 1024 * 1024,
  /** One HTTP call other than a consume's own wait, ms. */
  callMs: 15_000,
  /** The longest single consume wait the daemon allows is 60 s. */
  waitS: 55,
});

/** `fetch` as Bun takes it, with `unix`; injected by tests. */
export type BusFetch = (url: string, init: RequestInit & { unix: string }) => Promise<Response>;

export interface RootId {
  readonly path: string;
  readonly dev: string;
  readonly ino: string;
}

export interface BusOptions {
  /** The account socket; default `defaultSocket()`. An `http(s)://` address is refused. */
  socket?: string;
  /** The OS user the socket must belong to; default the process's. */
  uid?: number;
  me?: string;
  fetch?: BusFetch;
  now?: () => number;
  /** How long one request waits for its answer, ms. */
  replyMs: number;
  /** The planned root: rechecked by dev/ino before every message that carries a body. */
  root: RootId;
  /** The only names a request may go to. */
  targets: readonly string[];
}

export interface TransportRequest {
  target: string;
  body?: string | object;
  ask?: 'status';
}

/** `sent: false` only when the daemon cannot have accepted the message. */
export type TransportReply = { kind: 'reply'; body: string } | { kind: 'uncertain'; sent: boolean; reason: string };

/** A FileScan's stored Configuration as its Owner reads it, with the identity of its `dir`. */
export interface OwnerConfig {
  readonly filescan: string;
  readonly root: RootId;
  /** The Configuration as stored, every key kept. */
  readonly config: Record<string, unknown>;
}

export interface RagBus {
  /** The agent the bin talks as. */
  readonly me: string;
  /** The account the socket authenticates as. */
  readonly account: string;
  ownerConfig(filescan: string): Promise<OwnerConfig>;
  request(req: TransportRequest): Promise<TransportReply>;
}

/** A refused setup step; the message names the step, never a credential. */
export class RagBusError extends Error {
  constructor(
    readonly step: string,
    message: string,
  ) {
    super(`${step}: ${message}`);
    this.name = 'RagBusError';
  }
}

/** A call that did not produce a whole answer; `sent` is false only when no connection was made. */
class CallError extends Error {
  constructor(
    readonly sent: boolean,
    message: string,
  ) {
    super(message);
  }
}

interface Answer {
  status: number;
  text: string;
}

const NOT_CONNECTED = new Set(['ENOENT', 'ECONNREFUSED', 'FailedToOpenSocket', 'ConnectionRefused']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads at most `limit` bytes of UTF-8; more, or bytes that are not UTF-8, is an error. */
async function readBounded(res: Response, limit: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new CallError(true, 'answer too large');
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    throw new CallError(true, 'answer is not UTF-8');
  }
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Device and inode of `path`'s real directory, decimal; null when it is not a directory. */
export async function rootId(path: string): Promise<RootId | null> {
  const real = await realpath(path).catch(() => null);
  const st = real ? await stat(real, { bigint: true }).catch(() => null) : null;
  return real && st?.isDirectory() ? { path: real, dev: String(st.dev), ino: String(st.ino) } : null;
}

const sameRoot = (a: RootId | null, b: RootId) => !!a && a.path === b.path && a.dev === b.dev && a.ino === b.ino;

/** Proves the account, the agent record and the agent's token, then returns the transport. */
export async function openBus(opts: BusOptions): Promise<RagBus> {
  const f: BusFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now;
  const me = opts.me ?? ownName();
  const socket = opts.socket ?? defaultSocket();
  const uid = opts.uid ?? process.getuid?.() ?? -1;

  if (isUrl(socket)) throw new RagBusError('socket', 'only the local account socket is used');
  const st = await lstat(socket).catch(() => null);
  if (!st?.isSocket()) throw new RagBusError('socket', 'the account socket is missing or not a socket');
  if (st.uid !== uid) throw new RagBusError('socket', 'the account socket belongs to another user');
  if ((st.mode & 0o077) !== 0) throw new RagBusError('socket', 'the account socket is open to other users');

  const call = async (method: string, path: string, token: string, body?: string, ms: number = BUS_LIMITS.callMs): Promise<Answer> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      let res: Response;
      try {
        res = await f(`http://localhost${path}`, {
          method,
          unix: socket,
          redirect: 'manual',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', ...(token ? { 'x-agent-bus-token': token } : {}) },
          ...(body === undefined ? {} : { body }),
        });
      } catch (err) {
        const code = String((err as { code?: unknown }).code ?? '');
        if (NOT_CONNECTED.has(code)) throw new CallError(false, 'daemon unreachable');
        throw new CallError(true, ctl.signal.aborted ? 'deadline' : 'connection lost');
      }
      return { status: res.status, text: await readBounded(res, BUS_LIMITS.bytes) };
    } catch (err) {
      if (err instanceof CallError) throw err;
      throw new CallError(true, ctl.signal.aborted ? 'deadline' : 'connection lost');
    } finally {
      clearTimeout(timer);
    }
  };

  /** One setup call that must answer 200 with JSON. */
  const setup = async (step: string, method: string, path: string, token = '', body?: object): Promise<unknown> => {
    let a: Answer;
    try {
      a = await call(method, path, token, body === undefined ? undefined : JSON.stringify(body));
    } catch (err) {
      throw new RagBusError(step, (err as Error).message);
    }
    if (a.status !== 200) throw new RagBusError(step, `HTTP ${a.status}`);
    const v = parse(a.text);
    if (v === undefined) throw new RagBusError(step, 'the answer is not JSON');
    return v;
  };

  const who = await setup('account', 'GET', '/status');
  const account = isObj(who) && typeof who.you === 'string' ? who.you : '';
  if (!account || account.startsWith('#')) throw new RagBusError('account', 'the socket does not authenticate as a user');

  const rec = await setup('agent', 'GET', `/lookup?${new URLSearchParams({ name: me })}`);
  if (!isObj(rec) || rec.name !== me || rec.kind !== 'agent') throw new RagBusError('agent', `${me} is not a registered agent`);
  if (rec.owner !== account) throw new RagBusError('agent', `${me} is not owned by ${account}`);
  if ((rec.status ?? 'active') !== 'active' && rec.status !== '') throw new RagBusError('agent', `${me} is not active`);

  const got = await setup('token', 'POST', '/token', '', { name: me });
  const token = isObj(got) && typeof got.token === 'string' ? got.token : '';
  if (!token || token.length > 4096) throw new RagBusError('token', 'the daemon gave no token');

  const self = await setup('identity', 'GET', '/status', token);
  if (!isObj(self) || self.you !== me) throw new RagBusError('identity', `the token does not authenticate as ${me}`);

  const ownerConfig = async (filescan: string): Promise<OwnerConfig> => {
    if (!validTarget(filescan)) throw new RagBusError('config', 'not an agent name');
    const config = await setup('config', 'GET', `/config?${new URLSearchParams({ name: filescan })}`);
    if (!isObj(config)) throw new RagBusError('config', `${filescan} has no Configuration`);
    if (typeof config.dir !== 'string' || !config.dir.startsWith('/')) throw new RagBusError('config', `${filescan} has no absolute dir`);
    const root = await rootId(config.dir);
    if (!root) throw new RagBusError('config', `the dir of ${filescan} is not a readable directory`);
    return { filescan, root, config };
  };

  const request = async (req: TransportRequest): Promise<TransportReply> => {
    const notSent = (reason: string): TransportReply => ({ kind: 'uncertain', sent: false, reason });
    const unknown = (reason: string): TransportReply => ({ kind: 'uncertain', sent: true, reason });
    if (!validTarget(req.target) || !opts.targets.includes(req.target)) return notSent('target not in this session');
    if ((req.body === undefined) === (req.ask === undefined)) return notSent('a request is a body or an ask');
    if (req.ask !== undefined && req.ask !== 'status') return notSent('unsupported ask');
    const body = req.body === undefined ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (body !== undefined && !sameRoot(await rootId(opts.root.path), opts.root)) return notSent('root-changed');

    const topic = `mdhouse-rag-${crypto.randomUUID()}`;
    const tag = crypto.randomUUID();
    const deadline = now() + opts.replyMs;
    const msg = JSON.stringify({ to: req.target, topic, tag, wait: `${Math.ceil(opts.replyMs / 1000)}s`, ...(body === undefined ? { ask: req.ask, body: '' } : { body }) });
    if (Buffer.byteLength(msg) > BUS_LIMITS.bytes) return notSent('request too large');

    let sent: Answer;
    try {
      sent = await call('POST', '/send', token, msg);
    } catch (err) {
      const e = err as CallError;
      return e.sent ? unknown(`send: ${e.message}`) : notSent(`send: ${e.message}`);
    }
    if (sent.status >= 400 && sent.status < 500) return notSent(`send refused: HTTP ${sent.status}`);
    if (sent.status !== 200) return unknown(`send: HTTP ${sent.status}`);
    const env = parse(sent.text);
    if (!isObj(env) || typeof env.message_id !== 'string' || !env.message_id || env.from !== me || env.to !== req.target)
      return unknown('send: the accepted envelope does not match');
    const id = env.message_id;

    let ended = false;
    while (now() < deadline) {
      const waitS = Math.max(1, Math.min(BUS_LIMITS.waitS, Math.ceil((deadline - now()) / 1000)));
      let got: Answer;
      try {
        got = await call('GET', `/consume?${new URLSearchParams({ topic, tag, wait: `${waitS}s` })}`, token, undefined, waitS * 1000 + BUS_LIMITS.callMs);
      } catch (err) {
        return unknown(`reply: ${(err as Error).message}`);
      }
      if (got.status === 204) continue;
      if (got.status !== 200) return unknown(`reply: HTTP ${got.status}`);
      const m = parse(got.text);
      // a message on this exchange's labels from anyone else, or about another message, is not the answer
      if (!isObj(m) || m.topic !== topic || m.tag !== tag || m.to !== me || m.from !== req.target) continue;
      if (m.re !== undefined && m.re !== '' && m.re !== id) continue;
      if (m.receipt === 'ack') continue;
      if (m.receipt === 'done') {
        ended = true;
        continue;
      }
      if (m.receipt !== undefined && m.receipt !== '') continue;
      if (typeof m.body !== 'string') return unknown('reply: malformed');
      return { kind: 'reply', body: m.body };
    }
    return unknown(ended ? 'done without an answer' : 'no answer before the deadline');
  };

  return { me, account, ownerConfig, request };
}
