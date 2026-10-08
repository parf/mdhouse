/**
 * The control channel: a unix socket beside the config, used by a second `mdhouse` to hand
 * its directories to the one already running — or to ask it to stop.
 *
 * There is no token, no signature and no clock. The socket lives at
 * `~/.config/mdhouse/control-<port>.sock` with mode 0600, so the only process that can ask a
 * daemon to do anything is one running as the user who started it — which is exactly the
 * policy a shared secret in that same directory would have been standing in for. A browser
 * cannot open a unix socket at all, so the CSRF and DNS-rebinding routes into a local HTTP
 * endpoint simply do not exist here.
 */

import { chmodSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { CONFIG_DIR } from './prefs';

export interface AddRequest {
  dirs: string[];
  /** Whether the new roots may be written to — `--rw` on the second invocation. */
  rw?: boolean;
  /** Also save them, so they are served on every start — `-p` / `--perm`. */
  save?: boolean;
}

/** `mdhouse --rm <dir>`: forget these directories and stop serving them. */
export interface RemoveRequest {
  dirs: string[];
}

export interface RemoveReply {
  /** One line per directory asked about, saying what became of it. */
  results: Array<{
    path: string;
    /** It was in the saved list and is not any more. */
    unsaved: boolean;
    /** It was being served and is not any more. */
    removed: boolean;
    /** Served, but kept: it is the last root, and a server with none cannot answer anything. */
    kept?: boolean;
  }>;
  roots: RootLine[];
}

export interface RootLine {
  id: string;
  name: string;
  path: string;
  writable: boolean;
  /** This request created it. */
  added: boolean;
  /** This request named it — true for a directory the daemon was already serving. */
  asked: boolean;
  /** In the saved list: served again on every start. */
  saved: boolean;
  /** This request made it writable — it was served read-only until now. */
  upgraded?: boolean;
}

export interface AddReply {
  url: string;
  /** Every root the daemon now serves, in order. */
  roots: RootLine[];
}

/** What a daemon says about itself. The liveness probe, and what `mdhouse exit` reports. */
export interface PingReply {
  pid: number;
  url: string;
  roots: Array<{ name: string; path: string; writable: boolean; saved?: boolean }>;
  /** The systemd unit it runs as, if any — `mdhouse exit` leaves that one to systemctl. */
  service?: string;
}

export interface Handlers {
  add: (req: AddRequest) => Promise<AddReply>;
  remove: (req: RemoveRequest) => Promise<RemoveReply>;
  ping: () => PingReply;
  exit: () => void;
}

export function controlPath(port: number): string {
  return `${CONFIG_DIR}/control-${port}.sock`;
}

/** Every port this user has a control socket for — live daemons and stale files alike. */
export function knownPorts(): number[] {
  try {
    return readdirSync(CONFIG_DIR)
      .map((f) => /^control-(\d+)\.sock$/.exec(f)?.[1])
      .filter((p): p is string => p !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** How long a ping or an exit waits for an answer; an add or a remove may scan a large tree. */
const QUICK_MS = 2000;
const SLOW_MS = 60_000;

/**
 * One call to the daemon on `port`.
 *
 * Returns null when nobody is listening — no socket, or a stale file left by a process that
 * was killed rather than stopped. A stale file is removed on the way past: the next daemon to
 * start on this port would otherwise fail to bind it. A daemon that takes longer than `ms`
 * (stopped with Ctrl+Z, hung) is `{error}`, and its socket is kept.
 */
async function call<T>(port: number, path: string, body: unknown = {}, ms = QUICK_MS): Promise<T | { error: string } | null> {
  const sock = controlPath(port);
  if (!existsSync(sock)) return null;

  try {
    const res = await fetch(`http://localhost${path}`, {
      unix: sock,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    const parsed = (await res.json().catch(() => null)) as T | { error: string } | null;
    if (!parsed) return { error: `the daemon on ${port} answered ${res.status}` };
    return parsed;
  } catch (err) {
    // Only a socket with nothing behind it is stale. Any other failure — a timeout, an abort,
    // a daemon mid-hiccup — belongs to a server that is still running, and deleting its socket
    // would cut off every later `mdhouse` call that wanted to reach it.
    //
    // Bun reports both "no such file" and "nothing is listening" as FailedToOpenSocket; the
    // POSIX codes are listed too, for a runtime that uses them instead.
    if ((err as Error | null)?.name === 'TimeoutError') return { error: `the mdhouse on port ${port} is not answering` };
    const code = (err as { code?: string } | null)?.code;
    if (code === 'FailedToOpenSocket' || code === 'ECONNREFUSED' || code === 'ENOENT') {
      try {
        unlinkSync(sock);
      } catch {
        /* someone else got there first */
      }
    }
    return null;
  }
}

/**
 * Is an mdhouse listening on this port, and what is it serving? Null if nothing is there;
 * `{error}` if one is there but does not answer.
 */
export async function askPing(port: number): Promise<PingReply | { error: string } | null> {
  return call<PingReply>(port, '/ping');
}

/** The daemon on `port` when it answered, else null — for a caller that only waits for one. */
export async function answered(port: number): Promise<PingReply | null> {
  const reply = await askPing(port);
  return reply && !('error' in reply) ? reply : null;
}

/** Ask the daemon on `port` to serve these directories too. */
export async function askDaemon(port: number, req: AddRequest): Promise<AddReply | { error: string } | null> {
  return call<AddReply>(port, '/add', req, SLOW_MS);
}

/** Ask the daemon on `port` to forget these directories, and stop serving them. */
export async function askRemove(port: number, req: RemoveRequest): Promise<RemoveReply | { error: string } | null> {
  return call<RemoveReply>(port, '/remove', req, SLOW_MS);
}

/**
 * Ask the daemon on `port` to stop, and wait for its socket to go.
 *
 * Returns what it was serving, so the caller can say what it stopped, null if there was
 * nothing there to stop, or `{error}` if the one there does not answer.
 */
export async function askExit(port: number): Promise<PingReply | { error: string } | null> {
  const who = await askPing(port);
  if (!who || 'error' in who) return who;

  await call(port, '/exit');
  for (let i = 0; i < 100 && existsSync(controlPath(port)); i++) await Bun.sleep(20);
  return who;
}

/**
 * Listen for control calls. `handlers` does the work.
 *
 * Returns null if the socket cannot be bound, or belongs to another live mdhouse on this port
 * (bound to another host) — the viewer still works, it simply cannot be handed new directories
 * or stopped by `mdhouse exit`, which is not worth failing startup over. A live socket is never
 * taken over: its daemon would be left with no way to reach it.
 */
export async function serveControl(port: number, handlers: Handlers): Promise<{ stop: () => void } | null> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const path = controlPath(port);

  // A socket file with nobody behind it is left by a killed process. The ping clears it; one
  // still there after it is a live daemon's.
  if (existsSync(path)) await askPing(port);
  if (existsSync(path)) return null;

  try {
    const server = Bun.serve({
      unix: path,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        if (req.method !== 'POST') return Response.json({ error: 'not found' }, { status: 404 });

        if (pathname === '/ping') return Response.json(handlers.ping());

        if (pathname === '/exit') {
          // Answer first: the caller is a terminal waiting to hear what it stopped.
          queueMicrotask(() => handlers.exit());
          return Response.json({ ok: true });
        }

        if (pathname === '/add' || pathname === '/remove') {
          const body = (await req.json().catch(() => null)) as AddRequest | null;
          if (!body || !Array.isArray(body.dirs)) {
            return Response.json({ error: 'expected {dirs: string[]}' }, { status: 400 });
          }
          try {
            return Response.json(await (pathname === '/add' ? handlers.add(body) : handlers.remove(body)));
          } catch (err) {
            // A directory that has been removed since the caller checked it, a permission
            // problem — the caller is a terminal waiting for an answer, so say what happened.
            return Response.json({ error: (err as Error).message }, { status: 400 });
          }
        }

        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    chmodSync(path, 0o600);
    return {
      stop: () => {
        server.stop(true);
        if (existsSync(path)) {
          try {
            unlinkSync(path);
          } catch {
            /* already gone */
          }
        }
      },
    };
  } catch {
    return null;
  }
}
