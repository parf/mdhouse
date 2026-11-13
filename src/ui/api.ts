/** Server calls and the live-update socket. */

import type { TreePayload, RecentEntry, Digest } from '../lib/store';

/** What the server adds to a tree for ignored browsing; optional until every server sends it. */
export interface TreeReveal {
  /** Eligible gitignored Markdown exists under the root. */
  hasIgnored?: boolean;
  /** The requested folders the server accepted. */
  revealed?: string[];
  /** Folders cut at the server's file limit. */
  capped?: string[];
}
export type UiTree = TreePayload & TreeReveal;
import type { AnyFile } from '../lib/scan';
import type { SearchResult } from '../lib/search';
import type { Heading } from '../lib/render';
import type { Mark } from '../lib/prefs';
import type { FileDiff, FileHistory, FileStatus } from '../lib/git';
import type { QaChange } from '../lib/qa';
import type { Kind } from '../lib/filetypes';
import type { GitState } from './git-state';
import { routeOf } from '../lib/urls';

export interface AuthorInfo {
  name: string;
  source: 'github' | 'cookie' | 'prefs' | 'git' | 'login';
  /** What this browser's cookie holds; null: none. */
  cookie: string | null;
}

export interface Settings {
  editLink: boolean;
  /** The ✎ link's URL scheme, no `:`. */
  editScheme: string;
  /** Folders under the auto-rw paths are writable. */
  autoRw: boolean;
  /** The name a signed Q&A reply carries; empty: from git. */
  me: string;
  /** Set from the CLI, `mdhouse --auto-rw`; shown, not edited, here. */
  autoRwPaths?: string[];
}

export interface RootInfo {
  id: string;
  /** What the project is called: its own name when one is set, else the folder's. */
  name: string;
  /** The project's own name, only when one is set. */
  customName?: string;
  path: string;
  writable: boolean;
  /** Why it is writable, only while it is: `rw` — `--rw` asked for it; `auto` — an auto-rw path covers it. */
  writableBy?: 'rw' | 'auto';
  /** In the saved list: served on every start, not just this session. */
  saved?: boolean;
  /** `reference`: mdhouse's own read-only material — never removed, written or sent to agents. */
  kind?: 'project' | 'reference';
  /** Asked for write access (`--rw`), whatever auto-RW adds on top. Read-only metadata for the save confirmation. */
  configuredWritable?: boolean;
  /** The fingerprint a save confirms: a staleness check, not an authority. Only on a project that can be saved. */
  saveRev?: string;
  /** Its access as set: `rw` / `ro` chosen for it, else `inherit` — the default and auto-RW decide. `writable` is the effect. */
  mode?: 'inherit' | 'rw' | 'ro';
  /** The fingerprint a mode change confirms, apart from `saveRev`: a staleness check, not an authority. */
  accessRev?: string;
}

/** Who created a file and who last committed it. Arrives with the history, not the document. */
export interface DocAuthors {
  created: { name: string; email: string; at: number } | null;
  last: { name: string; email: string; at: number; hash: string };
}

export interface HistoryPayload extends FileHistory {
  authors: DocAuthors | null;
}

export interface DocPayload {
  /** How the page shows the file; every field below but `html` applies to every kind. */
  kind: Kind;
  /** Identity of the complete normalized source text, including frontmatter, not rendered HTML. */
  contentHash?: string;
  /** Owning repository HEAD, cached per invalidation; null without a known HEAD. */
  gitRevision?: string | null;
  gitState?: GitState;
  root: string;
  rel: string;
  url: string;
  /** The file's bytes, `/api/raw`. */
  raw: string;
  /** Code or text over 5 MB: no body, a download. */
  tooBig?: boolean;
  writable: boolean;
  /** Inside mdhouse's reference material: no edit link, no agents. */
  reference?: boolean;
  frontmatter: string | null;
  lineOffset: number;
  mtime: number;
  size: number;
  marks: Mark[];
  html: string;
  headings: Heading[];
  hasMermaid: boolean;
  /** This render's token: every control the renderer made carries it, a document's own markup cannot. Markdown only. */
  actToken?: string;
  tasks: { done: number; total: number };
  /** Working-tree status, when git has something to say: `modified`, `staged`, `untracked`. */
  status?: FileStatus;
  /** The agents the document names (`<!-- AB: … -->`); present only while the Agent Bus integration is on. */
  ab?: string[];
}

/** Metadata replies carry no rendered body or renderer control token. */
export type DocMetadataFields = Pick<DocPayload, 'kind' | 'root' | 'rel' | 'url' | 'raw' | 'writable' | 'reference' | 'mtime' | 'size' | 'marks' | 'status' | 'gitState'> & { gitRevision: string | null };
export type DocMetadata = DocMetadataFields & { meta: true };
export type DocUnchanged = DocMetadataFields & { unchanged: true; contentHash: string };
export type DocRefreshPayload = DocPayload | DocMetadata | DocUnchanged;

export interface BusAgent {
  name: string;
  descr: string;
  alive: boolean;
}

/** `GET /api/ab`: off, or on — connected or why not, the agents, the default ones. */
export type AbInfo =
  | { enabled: false }
  | { enabled: true; me: string; socket: string; connected: boolean; error?: string; default: string[]; filter: string[]; agents: BusAgent[] };

/** `GET /api/ab?root=`: the root's effective bus — where it is, and whether the project or the instance set it. */
export type AbRootInfo = AbInfo & { endpoint?: string; source?: 'space' | 'instance'; spaceDefault?: string[] };

/** A project's own Agent Bus settings, as stored; nothing here is a credential. */
export interface AbSpace {
  /** Its own bus, when set; else the instance's. */
  endpoint?: string;
  /** A credential for its bus is provisioned on the server — never sent here. */
  hasCredential: boolean;
  /** Its own default agents, when set. */
  default?: string[];
  /** The fingerprint a save confirms. */
  rev: string;
  /** Its stored settings cannot be used as they are. */
  error?: string;
}

/** `GET /api/ab/config`: the stored settings, read without reaching any bus. */
export interface AbConfig {
  enabled: boolean;
  instance: { endpoint: string; hasCredential: boolean; default: string[]; filter?: string[] };
  /** Every project but the reference, by root id. */
  roots: Record<string, AbSpace>;
}

/** `lost` is the page's own: a kept job the server no longer knows — mdhouse restarted while it waited. */
export type AbKind = 'sent' | 'ack' | 'answer' | 'done' | 'timeout' | 'error' | 'lost';
export interface AbEvent {
  job: string;
  to: string;
  kind: AbKind;
  body?: string;
  at: number;
}
export type AbAction = 'updated' | 'target' | 'resolve' | 'review' | 'note';

/** A refused request: the server's message, its status and, when it gives one, its reason. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    /** The project a refusal points at: the one already served, for an add of the same folder. */
    readonly id?: string,
  ) {
    super(message);
  }
}

/** The server refused for lack of an administrator session — none, expired or revoked. */
export const isAdminDenial = (err: unknown): boolean => err instanceof ApiError && err.status === 401 && err.reason === 'admin';

/** `GET /api/admin`: is this browser signed in as the instance administrator, and until when. */
export interface AdminState {
  admin: boolean;
  /** Admin because the request came to mdhouse from loopback, with no users configured. */
  local?: boolean;
  expiresAt?: number;
}

async function refusal(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string; reason?: string; id?: unknown } | null;
  return new ApiError(
    body?.error ?? `${res.status} ${res.statusText}`,
    res.status,
    typeof body?.reason === 'string' ? body.reason : undefined,
    typeof body?.id === 'string' ? body.id : undefined,
  );
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await refusal(res);
  const got = (await res.json().catch(() => null)) as T | null;
  if (!got) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  return got;
}

/** An array value is a repeated parameter (`k=a&k=b`) — a value may itself contain a comma. */
async function get<T>(
  path: string,
  params: Record<string, string | number | boolean | string[] | undefined> = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const one of v) url.searchParams.append(k, one);
    else if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw Object.assign(new Error(body?.error ?? `${res.status} ${res.statusText}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

/** `/api/rag`: the project's RAG source (`source` null: none registered), or why it cannot be read. */
export interface RagStatus {
  enabled: boolean;
  /** The project's folder, for the sync command. */
  path?: string;
  /** The installed guide's page address. */
  guide?: string;
  source?: { sid: string; namespace: string; table: string } | null;
  last?: { startedAt: string; endedAt: string; result: string; confirmed: number | null; remaining: number | null; rounds: number } | null;
  error?: string;
}

export interface RagHit {
  source: string;
  url: string;
  lines?: [number, number];
  heading_path?: string[];
  excerpt: string;
  truncated?: true;
  stale?: true;
  score: number;
}

/** `/api/rag/search`. */
export interface RagSearch {
  hits: RagHit[];
  count: number;
  /** Milliseconds the bus round trip took. */
  took: number;
}

/** A folder's git view — `/api/git`. */
export interface GitInfo {
  repo: string;
  /** The folder, repo-relative; '' for the repo itself. */
  dir: string;
  /** The root, repo-relative: a repo path under it is a root path after this prefix. */
  rootRel: string;
  head: { branch: string; commit: { hash: string; author: string; email: string; date: number; subject: string } | null; pulledAt: number | null } | null;
  dirty: Array<{ path: string; code: string; md: boolean; mtime?: number; size?: number }>;
  commitMessage: string;
  sync: {
    upstream: string | null;
    last: { way: 'pulled' | 'pushed'; at: number } | null;
    ahead: number;
    behind: number;
    unpushed: Array<{ hash: string; author: string; email: string; date: number; subject: string }>;
    busy: string | null;
  } | null;
  me: { name: string; email: string } | null;
  writable: boolean;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: number;
  subject: string;
  files: Array<{ status: string; path: string }>;
}

export interface RemoteState {
  state: 'same' | 'ahead' | 'behind' | 'new' | 'diverged' | 'none';
  ahead?: number;
  behind?: number;
  message?: string;
}

/** A refused git action: the reason, and the files it is about. */
export class GitRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly files: GitInfo['dirty'] = [],
    readonly confirm = false,
  ) {
    super(message);
  }
}

async function gitPost(path: string, body: unknown): Promise<{ ok: true; output: string }> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { error?: string; files?: GitInfo['dirty']; confirm?: boolean; output?: string } | null;
  if (!res.ok) throw new GitRefusal(data?.error ?? `${res.status} ${res.statusText}`, res.status, data?.files, !!data?.confirm);
  return { ok: true, output: data?.output ?? '' };
}

export const api = {
  git: (p: string) => get<GitInfo>('/api/git', { p }),
  gitCommits: (p: string, skip = 0) => get<{ commits: GitCommit[] }>('/api/git/commits', { p, skip }),
  gitFiles: (p: string) => get<{ files: string[]; capped: boolean }>('/api/git/files', { p }),
  gitRemote: (p: string, fresh = false) => get<RemoteState & { cachedAt: number | null }>('/api/git/remote', { p, fresh: fresh ? 1 : undefined }),
  gitCommit: (p: string, message: string, files: string[], nonMd: boolean) => gitPost('/api/git/commit', { p, message, files, nonMd }),
  /** One file, from its own page — `git commit -- <file>`; `p` is `<rootId>/<rel>`. */
  gitCommitFile: (p: string, message: string) => gitPost('/api/git/commit-file', { p, message }),
  gitSync: (p: string, action: 'pull' | 'push', confirmed: boolean) => gitPost(`/api/git/${action}`, { p, confirmed }),
  /** Back to the last commit — only if the file is still the one `hash` (the shown diff's) was taken from. */
  gitReset: (p: string, hash: string) => gitPost('/api/git/reset', { p, hash }),

  roots: () => get<{ roots: RootInfo[]; single: boolean; home?: string }>('/api/roots'),

  /** `reveal`: folders whose gitignored Markdown is listed too, without the global `ignored` switch. */
  tree: (root: string, ignored: boolean, reveal: string[] = []) => get<UiTree>('/api/tree', { root, ignored: ignored ? 1 : 0, reveal }),
  /** Every file under a folder (`p` = `<root>/<dir>`), not only Markdown. */
  files: (p: string) => get<{ files: AnyFile[]; capped: boolean }>('/api/files', { p }),

  /** `d` is the page's pathname, `/<rootId>/<rel>` — the server maps it back to a root and path. */
  /** A file's payload — or, for a folder named without its slash, the folder page's address. */
  doc: (docPath: string) => get<DocPayload | { folder: string }>('/api/doc', { d: docPath }),
  docMeta: (docPath: string) => get<DocMetadata | { folder: string }>('/api/doc', { d: docPath, meta: 1 }),
  docConditional: (docPath: string, contentHash: string) => get<DocPayload | DocUnchanged | { folder: string }>('/api/doc', { d: docPath, ifContent: contentHash }),

  search: (root: string, q: string, ignored: boolean, regex = false) =>
    get<SearchResult>('/api/search', { root, q, ignored: ignored ? 1 : 0, regex: regex ? 1 : 0 }),

  recents: (root: string, ignored: boolean, limit = 80) =>
    get<{ entries: RecentEntry[] }>('/api/recents', { root, limit, ignored: ignored ? 1 : 0 }),

  digest: (root: string, ignored: boolean, limit = 60) =>
    get<Digest>('/api/digest', { root, limit, ignored: ignored ? 1 : 0 }),

  history: (p: string, limit = 5) => get<HistoryPayload>('/api/git/log', { p, limit }),

  /** What changed in one file. Without `rev` the server picks: uncommitted work, else the
      commit that last touched it. */
  diff: (p: string, rev?: string) => get<FileDiff>('/api/git/diff', { p, rev }),

  async setMark(root: string, path: string, mark: Mark, on: boolean): Promise<void> {
    const res = await fetch('/api/marks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root, path, mark, on }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  },

  settings: () => get<Settings>('/api/settings'),

  /** Who a signed reply on document `p` is from. */
  qaMe: (p: string) => get<{ me: string }>('/api/qa', { p }),

  /** A reply's text, to edit; refused (409) when the item changed since the page was rendered. */
  qaReply: (p: string, line: number, hash: string, reply: number) => get<{ me: string; text: string }>('/api/qa', { p, line, hash, reply }),

  /**
   * One change to the Q&A item on `line` of document `p`, if it still has the fingerprint
   * `hash` the page was rendered with. Throws with `status` 409 when the page is older than the file.
   */
  async qa(req: { p: string; line: number; hash: string } & QaChange): Promise<void> {
    const res = await fetch('/api/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw Object.assign(new Error(body?.error ?? `${res.status} ${res.statusText}`), { status: res.status });
    }
  },

  /** Add a block under the heading on `line` of document `p` — right under it, or at the end of its section. */
  async insertBlock(req: { p: string; line: number; hash: string; where: 'below' | 'end'; kind: string; text: string }): Promise<void> {
    const res = await fetch('/api/insert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw Object.assign(new Error(body?.error ?? `${res.status} ${res.statusText}`), { status: res.status });
    }
  },

  /**
   * Tick or untick the task on `line` of document `p` (a wire path), if that line still has the
   * fingerprint `hash` the page was rendered with. A refusal throws with the server's reason;
   * `status` 409 means the page is older than the file.
   */
  async toggleTask(p: string, line: number, hash: string): Promise<{ checked: boolean }> {
    const res = await fetch('/api/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ p, line, hash }),
    });
    const body = (await res.json().catch(() => null)) as { checked?: boolean; error?: string } | null;
    if (!res.ok) throw Object.assign(new Error(body?.error ?? `${res.status} ${res.statusText}`), { status: res.status });
    return { checked: body?.checked === true };
  },

  /** This browser's author name: the one that signs, where it comes from, and its own cookie. */
  author: () => get<AuthorInfo>('/api/author'),

  async setAuthor(name: string): Promise<AuthorInfo> {
    const res = await fetch('/api/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<AuthorInfo>;
  },

  setSettings: (patch: Partial<Settings>) => post<Settings>('/api/settings', patch),

  /** This browser's administrator state; never cached. */
  async admin(): Promise<AdminState> {
    const res = await fetch('/api/admin', { cache: 'no-store' });
    if (!res.ok) throw await refusal(res);
    const got = (await res.json().catch(() => null)) as { admin?: unknown; local?: unknown; expiresAt?: unknown } | null;
    return {
      admin: got?.admin === true,
      ...(got?.admin === true && got.local === true ? { local: true } : {}),
      expiresAt: typeof got?.expiresAt === 'number' ? got.expiresAt : undefined,
    };
  },

  /** Ends this browser's administrator session. */
  async adminLogout(): Promise<void> {
    const res = await fetch('/api/admin/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
    if (!res.ok) throw await refusal(res);
  },

  /** Is the page at `url` still there: a file, or a folder — a root's own always is. */
  async pageExists(url: string): Promise<boolean> {
    const route = routeOf(new URL(url, location.origin).pathname);
    try {
      if (route.kind === 'dir') return !route.dir || (await fetch(`/api/files?p=${encodeURIComponent(`${route.rootId}/${route.dir}`)}`)).ok;
      if (route.kind !== 'file') return false;
      const wire = route.path.slice(1).split('/').map(decodeURIComponent).join('/');
      return (await fetch(`/api/raw?p=${encodeURIComponent(wire)}`, { method: 'HEAD' })).ok;
    } catch {
      return false;
    }
  },

  /** A document's raw source, read once with its SHA-256 — the base a full-source save is checked against. */
  source: (p: string) => get<{ text: string; hash: string; writable: boolean; reference?: boolean }>('/api/source', { p }),
  /** Saves the whole source; refused (409) when the file is no longer at `hash`. */
  saveSource: (p: string, hash: string, text: string) => post<{ hash: string }>('/api/source', { p, hash, text }),
  abInfo: () => get<AbInfo>('/api/ab'),
  /** The project's registered RAG source and latest sync — `/api/rag`. */
  rag: (root: string) => get<RagStatus>('/api/rag', { root }),
  /** A keyword search of the project's RAG — `/api/rag/search`; the server requires `x-mdhouse: 1`. */
  ragSearch: (root: string, q: string) => get<RagSearch>('/api/rag/search', { root, q }, { 'x-mdhouse': '1' }),
  /** The root's bus: connects to it — only on the reader's request. */
  abRootInfo: (root: string) => get<AbRootInfo>('/api/ab', { root }),
  /** The stored Agent Bus settings: no bus is reached. */
  abConfig: () => get<AbConfig>('/api/ab/config'),
  /** A project's own endpoint and default agents; empty clears each; administrator only. */
  setRootAb: (id: string, endpoint: string, names: string[], rev: string) => post<AbConfig>('/api/roots/ab', { id, endpoint, default: names, rev }),
  abDefault: (names: string[]) => post<{ default: string[] }>('/api/ab/default', { names }),
  abFilter: (lines: string[]) => post<{ filter: string[] }>('/api/ab/filter', { lines }),
  /** Ask agents about document `p` (a wire path): the job id; its events come over the live channel. */
  abSend: (req: { p: string; targets: string[]; action: AbAction; note: string }) => post<{ job: string }>('/api/ab/send', req),
  abJob: (id: string) => get<{ events: AbEvent[] }>('/api/ab/job', { id }),

  /** Sets a project's own name; an empty one goes back to the folder's. Returns the served roots. */
  setRootName: (id: string, name: string) => post<{ roots: RootInfo[] }>('/api/roots/name', { id, name }),

  /** Saves a session project as confirmed at `rev`; 409 `stale` when it changed since. Returns the served roots. */
  saveRoot: (id: string, rev: string) => post<{ roots: RootInfo[] }>('/api/roots/save', { id, rev }),
  /** Serves an existing folder, by its absolute path, until mdhouse stops; administrator only. */
  addRoot: (path: string, mode: 'rw' | 'ro') => post<{ roots: RootInfo[]; id: string }>('/api/roots/add', { path, mode }),
  /** Sets a project read and write or read-only; administrator only. */
  setRootMode: (id: string, mode: 'rw' | 'ro', rev: string) => post<{ roots: RootInfo[] }>('/api/roots/mode', { id, mode, rev }),

  /** Forget a directory and stop serving it. */
  async removeRoot(id: string): Promise<void> {
    const res = await fetch('/api/roots/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw await refusal(res);
  },
};

export type LiveMessage =
  | { t: 'hello'; roots: string[] }
  | { t: 'pong' }
  | { t: 'fs'; root: string; paths: string[] }
  | { t: 'git'; root: string; paths: string[] }
  /** The served directories changed: one added by a second `mdhouse`, or one removed. */
  | { t: 'roots'; roots: string[] }
  /** An Agent Bus request's progress — every tab gets it; a page keeps its own jobs'. */
  | ({ t: 'ab' } & AbEvent);

/** Components that follow the live channel themselves; the app hands each message to every one. */
export const liveListeners = new Set<(msg: LiveMessage) => void>();

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
        const msg = JSON.parse(ev.data as string) as LiveMessage;
        onMessage(msg);
        // Topics are subscribed to when the socket opens, so a root added since then has
        // nobody listening to it. Reconnecting — the backoff path that already exists — is
        // how this client starts hearing about the new tree.
        if (msg.t === 'roots') socket?.close();
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
