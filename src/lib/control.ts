/**
 * The control channel: a unix socket beside the config, used by a second `mdhouse` to hand
 * its directories to the one already running.
 *
 * There is no token, no signature and no clock. The socket lives at
 * `~/.config/mdhouse/control-<port>.sock` with mode 0600, so the only process that can ask a
 * daemon to do anything is one running as the user who started it — which is exactly the
 * policy a shared secret in that same directory would have been standing in for. A browser
 * cannot open a unix socket at all, so the CSRF and DNS-rebinding routes into a local HTTP
 * endpoint simply do not exist here.
 */

import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { CONFIG_DIR } from './prefs';

export interface AddRequest {
  dirs: string[];
  /** Whether the new roots may be written to — `--rw` on the second invocation. */
  rw?: boolean;
}

export interface AddReply {
  url: string;
  /** Every root the daemon now serves, in order. */
  roots: Array<{
    id: string;
    name: string;
    path: string;
    writable: boolean;
    /** This request created it. */
    added: boolean;
    /** This request named it — true for a directory the daemon was already serving. */
    asked: boolean;
  }>;
}

export function controlPath(port: number): string {
  return `${CONFIG_DIR}/control-${port}.sock`;
}

/**
 * Ask the daemon on `port` to serve these directories too.
 *
 * Returns null when nobody is listening — no socket, or a stale file left by a process that
 * was killed rather than stopped. A stale file is removed on the way past: the next daemon to
 * start on this port would otherwise fail to bind it.
 */
export async function askDaemon(port: number, req: AddRequest): Promise<AddReply | { error: string } | null> {
  const path = controlPath(port);
  if (!existsSync(path)) return null;

  try {
    const res = await fetch('http://localhost/add', {
      unix: path,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as AddReply | { error: string } | null;
    if (!body) return { error: `the daemon on ${port} answered ${res.status}` };
    return body;
  } catch {
    try {
      unlinkSync(path);
    } catch {
      /* someone else got there first */
    }
    return null;
  }
}

/**
 * Listen for `askDaemon()` calls. `onAdd` does the work and returns what to reply with.
 *
 * Returns null if the socket cannot be bound — the viewer still works, it simply cannot be
 * handed new directories, which is not worth failing startup over.
 */
export async function serveControl(
  port: number,
  onAdd: (req: AddRequest) => Promise<AddReply>,
): Promise<{ stop: () => void } | null> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const path = controlPath(port);

  // A socket file with nobody behind it is left by a killed process. askDaemon() removes the
  // ones it meets; this catches the case where we are the first to notice.
  const live = existsSync(path) ? await askDaemon(port, { dirs: [] }) : null;
  if (existsSync(path) && !live) {
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
        const url = new URL(req.url);
        if (url.pathname !== '/add' || req.method !== 'POST') {
          return Response.json({ error: 'not found' }, { status: 404 });
        }
        const body = (await req.json().catch(() => null)) as AddRequest | null;
        if (!body || !Array.isArray(body.dirs)) {
          return Response.json({ error: 'expected {dirs: string[]}' }, { status: 400 });
        }
        try {
          return Response.json(await onAdd(body));
        } catch (err) {
          // A directory that has been removed since the caller checked it, a permission
          // problem — the caller is a terminal waiting for an answer, so say what happened.
          return Response.json({ error: (err as Error).message }, { status: 400 });
        }
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
