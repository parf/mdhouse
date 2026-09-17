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
  roots: Array<{ name: string; path: string; writable: boolean }>;
}

export interface Handlers {
  add: (req: AddRequest) => Promise<AddReply>;
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

/**
 * One call to the daemon on `port`.
 *
 * Returns null when nobody is listening — no socket, or a stale file left by a process that
 * was killed rather than stopped. A stale file is removed on the way past: the next daemon to
 * start on this port would otherwise fail to bind it.
 */
async function call<T>(port: number, path: string, body: unknown = {}): Promise<T | { error: string } | null> {
  const sock = controlPath(port);
  if (!existsSync(sock)) return null;

  try {
    const res = await fetch(`http://localhost${path}`, {
      unix: sock,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => null)) as T | { error: string } | null;
    if (!parsed) return { error: `the daemon on ${port} answered ${res.status}` };
    return parsed;
  } catch {
    try {
      unlinkSync(sock);
    } catch {
      /* someone else got there first */
    }
    return null;
  }
}

/** Is an mdhouse listening on this port, and what is it serving? Null if nothing answers. */
export async function askPing(port: number): Promise<PingReply | null> {
  const reply = await call<PingReply>(port, '/ping');
  return reply && !('error' in reply) ? reply : null;
}

/** Ask the daemon on `port` to serve these directories too. */
export async function askDaemon(port: number, req: AddRequest): Promise<AddReply | { error: string } | null> {
  return call<AddReply>(port, '/add', req);
}

/**
 * Ask the daemon on `port` to stop, and wait for its socket to go.
 *
 * Returns what it was serving, so the caller can say what it stopped, or null if there was
 * nothing there to stop.
 */
export async function askExit(port: number): Promise<PingReply | null> {
  const who = await askPing(port);
  if (!who) return null;

  await call(port, '/exit');
  for (let i = 0; i < 100 && existsSync(controlPath(port)); i++) await Bun.sleep(20);
  return who;
}

/**
 * Listen for control calls. `handlers` does the work.
 *
 * Returns null if the socket cannot be bound — the viewer still works, it simply cannot be
 * handed new directories, which is not worth failing startup over.
 */
export async function serveControl(port: number, handlers: Handlers): Promise<{ stop: () => void } | null> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const path = controlPath(port);

  // A socket file with nobody behind it is left by a killed process. The ping clears it.
  if (existsSync(path)) await askPing(port);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* fall through to the bind, which will report the real problem */
    }
  }

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

        if (pathname === '/add') {
          const body = (await req.json().catch(() => null)) as AddRequest | null;
          if (!body || !Array.isArray(body.dirs)) {
            return Response.json({ error: 'expected {dirs: string[]}' }, { status: 400 });
          }
          try {
            return Response.json(await handlers.add(body));
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
