/** Server calls and the live-update socket. */

import type { TreePayload, RecentEntry } from '../lib/store';
import type { SearchResult } from '../lib/search';
import type { Heading } from '../lib/render';
import type { Mark } from '../lib/prefs';
import type { Commit } from '../lib/git';

export interface RootInfo {
  id: string;
  name: string;
  path: string;
  writable: boolean;
}

export interface DocPayload {
  root: string;
  rel: string;
  url: string;
  writable: boolean;
  frontmatter: string | null;
  lineOffset: number;
  mtime: number;
  size: number;
  marks: Mark[];
  html: string;
  headings: Heading[];
  hasMermaid: boolean;
  tasks: { done: number; total: number };
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  roots: () => get<{ roots: RootInfo[]; single: boolean }>('/api/roots'),

  tree: (root: string, ignored: boolean) => get<TreePayload>('/api/tree', { root, ignored: ignored ? 1 : 0 }),

  /** `d` is the part of the URL after `/d/` — the server maps it back to a root and path. */
  doc: (docPath: string) => get<DocPayload>('/api/doc', { d: docPath }),

  search: (root: string, q: string, ignored: boolean, regex = false) =>
    get<SearchResult>('/api/search', { root, q, ignored: ignored ? 1 : 0, regex: regex ? 1 : 0 }),

  recents: (root: string, kind: 'fs' | 'git', ignored: boolean, limit = 60) =>
    get<{ kind: string; entries: RecentEntry[] }>('/api/recents', { root, kind, limit, ignored: ignored ? 1 : 0 }),

  history: (p: string) => get<{ commits: Commit[] }>('/api/git/log', { p }),

  async setMark(root: string, path: string, mark: Mark, on: boolean): Promise<void> {
    await fetch('/api/marks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root, path, mark, on }),
    });
  },
};

export type LiveMessage =
  | { t: 'hello'; roots: string[] }
  | { t: 'pong' }
  | { t: 'fs'; root: string; paths: string[] }
  | { t: 'git'; root: string; paths: string[] };

/**
 * The live channel. Reconnects with backoff; never polls. `onStatus` drives the dot in the
 * sidebar footer so a dead connection is visible rather than silently stale.
 */
export function connectLive(onMessage: (msg: LiveMessage) => void, onStatus: (live: boolean) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const open = () => {
    if (closed) return;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

    socket.onopen = () => {
      attempt = 0;
      onStatus(true);
      heartbeat = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send('ping'), 30_000);
    };
    socket.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data as string) as LiveMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      onStatus(false);
      if (closed) return;
      retry = setTimeout(open, Math.min(500 * 2 ** attempt++, 15_000));
    };
    socket.onerror = () => socket?.close();
  };

  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (heartbeat) clearInterval(heartbeat);
    socket?.close();
  };
}
