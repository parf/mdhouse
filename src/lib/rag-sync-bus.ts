/**
 * The rag-sync bin's Agent Bus transport, on the `ai-agent-bus-sdk` client: the local account socket
 * only, one bounded exchange per request, answers taken only by the request's own random topic and tag.
 *
 * `openBus` proves who it talks as before any message: the socket is the login's own, the daemon
 * names that login, `#mdhouse@<host>` exists, is an active agent and is the login's, and its token
 * (kept in memory only) authenticates as it. It never registers, configures, drains or reads an
 * inbox unfiltered, and never reads `AGENT_BUS_*`. Diagnostics name the step and the HTTP status,
 * never a token, a message body or a reply.
 */
import { lstat, realpath, stat } from 'node:fs/promises';
import { BusError as ClientError, BusUnreachable, IdentityMismatch, UncertainOutcome, type Bus } from 'ai-agent-bus-sdk';
import { connectBus, defaultSocket, isUrl, ownName, validTarget } from './agent-bus';

export const BUS_LIMITS = Object.freeze({
  /** A daemon answer or a request body, bytes. */
  bytes: 1024 * 1024,
  /** One HTTP call other than a consume's own wait, ms. */
  callMs: 15_000,
  /** The longest single consume wait the daemon allows is 60 s. */
  waitS: 55,
});

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
  /** Opens a client; injected by tests. */
  connect?: typeof connectBus;
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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The step's words for a client failure: the HTTP status or the failure's class, never its text. */
function why(err: unknown): string {
  if (err instanceof RagBusError) return err.message;
  if (err instanceof ClientError) return `HTTP ${err.status}`;
  if (err instanceof IdentityMismatch) return 'the credential authenticates as someone else';
  if (err instanceof UncertainOutcome) return 'connection lost';
  if (err instanceof BusUnreachable) return 'daemon unreachable';
  return 'the answer is malformed';
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
  const connect = opts.connect ?? connectBus;
  const now = opts.now ?? Date.now;
  const me = opts.me ?? ownName();
  const socket = opts.socket ?? defaultSocket();
  const uid = opts.uid ?? process.getuid?.() ?? -1;

  if (isUrl(socket)) throw new RagBusError('socket', 'only the local account socket is used');
  const st = await lstat(socket).catch(() => null);
  if (!st?.isSocket()) throw new RagBusError('socket', 'the account socket is missing or not a socket');
  if (st.uid !== uid) throw new RagBusError('socket', 'the account socket belongs to another user');
  if ((st.mode & 0o077) !== 0) throw new RagBusError('socket', 'the account socket is open to other users');

  /** One setup step; a failure names the step and its status, never the daemon's text. */
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      throw new RagBusError(name, why(err));
    }
  };

  const owner = connect(socket, '', '', BUS_LIMITS.callMs);
  const who = await step('account', () => owner.whoami());
  const account = typeof who?.you === 'string' ? who.you : '';
  if (!account || account.startsWith('#')) throw new RagBusError('account', 'the socket does not authenticate as a user');

  const rec: unknown = await step('agent', () => owner.record(me).lookup());
  if (!isObj(rec) || rec.name !== me || rec.kind !== 'agent') throw new RagBusError('agent', `${me} is not a registered agent`);
  if (rec.owner !== account) throw new RagBusError('agent', `${me} is not owned by ${account}`);
  if ((rec.status ?? 'active') !== 'active' && rec.status !== '') throw new RagBusError('agent', `${me} is not active`);

  const got: unknown = await step('token', () => owner.request('POST', '/token', { name: me }));
  const token = isObj(got) && typeof got.token === 'string' ? got.token : '';
  if (!token || token.length > 4096) throw new RagBusError('token', 'the daemon gave no token');

  const agent: Bus = connect(socket, token, me, BUS_LIMITS.callMs);
  await step('identity', () => agent.whoami());

  const ownerConfig = async (filescan: string): Promise<OwnerConfig> => {
    if (!validTarget(filescan)) throw new RagBusError('config', 'not an agent name');
    const config: unknown = await step('config', () => owner.record(filescan).config());
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
    const msg = { to: req.target, topic, tag, wait: `${Math.ceil(opts.replyMs / 1000)}s`, ...(body === undefined ? { ask: req.ask, body: '' } : { body }) };
    if (Buffer.byteLength(JSON.stringify(msg)) > BUS_LIMITS.bytes) return notSent('request too large');

    // The send is made by hand, not by `call`: a refusal before acceptance must stay apart from a lost answer.
    let env: unknown;
    try {
      env = await agent.request('POST', '/send', msg, { timeout: BUS_LIMITS.callMs });
    } catch (err) {
      if (err instanceof ClientError && err.status >= 400 && err.status < 500) return notSent(`send refused: HTTP ${err.status}`);
      if (err instanceof BusUnreachable && !(err instanceof UncertainOutcome)) return notSent('send: daemon unreachable');
      return unknown(`send: ${why(err)}`);
    }
    if (!isObj(env) || typeof env.message_id !== 'string' || !env.message_id || env.from !== me || env.to !== req.target)
      return unknown('send: the accepted envelope does not match');
    const id = env.message_id;

    let ended = false;
    while (now() < deadline) {
      const waitS = Math.max(1, Math.min(BUS_LIMITS.waitS, Math.ceil((deadline - now()) / 1000)));
      let m: Readonly<Record<string, unknown>> | undefined;
      try {
        m = (await agent.consume({ topic, tag, wait: `${waitS}s`, timeout: waitS * 1000 + BUS_LIMITS.callMs }))?.envelope;
      } catch (err) {
        return unknown(`reply: ${why(err)}`);
      }
      if (!m) continue;
      // a message on this exchange's labels from anyone else, or about another message, is not the answer
      if (m.topic !== topic || m.tag !== tag || m.to !== me || m.from !== req.target) continue;
      if (m.re !== undefined && m.re !== '' && m.re !== id) continue;
      if (m.receipt === 'ack') continue;
      if (m.receipt === 'done') {
        ended = true;
        continue;
      }
      if (m.receipt !== undefined && m.receipt !== '') continue;
      if (typeof m.body !== 'string') return unknown('reply: malformed');
      if (Buffer.byteLength(m.body) > BUS_LIMITS.bytes) return unknown('reply: answer too large');
      return { kind: 'reply', body: m.body };
    }
    return unknown(ended ? 'done without an answer' : 'no answer before the deadline');
  };

  return { me, account, ownerConfig, request };
}
