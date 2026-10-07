/**
 * The git view of a folder: every commit that touched it (any file type), the files git tracks
 * there, links to the repository's web pages, a read-only check of the remote, and — in a
 * writable folder — commit, pull and push.
 *
 * Only `origin` is used. Network calls never prompt: a remote that wants a password fails with
 * git's message instead of hanging the request.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export interface RunResult {
  code: number;
  out: string;
  err: string;
}

/**
 * The ssh agent, for a pull or push over ssh. A systemd user service does not inherit the
 * login session's SSH_AUTH_SOCK, so where it is unset the usual places are tried: the systemd
 * user ssh-agent, GNOME's gcr and keyring.
 */
export function agentSocket(env: Record<string, string | undefined> = process.env, exists = existsSync): string | undefined {
  if (env.SSH_AUTH_SOCK) return env.SSH_AUTH_SOCK;
  const dir = env.XDG_RUNTIME_DIR || (process.getuid ? `/run/user/${process.getuid()}` : '');
  if (!dir) return undefined;
  return ['ssh-agent.socket', 'gcr/ssh', 'keyring/ssh', 'openssh_agent'].map((f) => `${dir}/${f}`).find((p) => exists(p));
}

/** git with its exit code and stderr — the messages commit, pull and push report. */
export async function run(cwd: string, args: string[], timeoutMs = 20_000): Promise<RunResult> {
  try {
    const proc = Bun.spawn(['git', '-c', 'core.quotepath=false', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
        GIT_OPTIONAL_LOCKS: '0',
        ...(agentSocket() ? { SSH_AUTH_SOCK: agentSocket() } : {}),
      },
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    clearTimeout(timer);
    return { code, out, err };
  } catch (e) {
    return { code: -1, out: '', err: (e as Error).message };
  }
}

const SEP = '\x1f';
const REC = '\x00';

/** A folder as git names it: repo-relative, '' for the repo itself. */
export function repoRel(repo: string, abs: string): string {
  const rel = relative(repo, abs).split(sep).join('/');
  return rel === '.' ? '' : rel;
}

export interface LogFile {
  /** A, M, D, R, C, T… */
  status: string;
  /** Repo-relative, as it is after this commit. */
  path: string;
}

export interface LogCommit {
  hash: string;
  author: string;
  email: string;
  date: number;
  subject: string;
  files: LogFile[];
}

/** Commits touching `dir` (repo-relative, '' = all), newest first, `limit` from `skip`. */
export async function folderLog(repo: string, dir: string, skip = 0, limit = 50): Promise<LogCommit[]> {
  const r = await run(repo, [
    'log',
    `--skip=${skip}`,
    `-n${limit}`,
    '-M',
    '--name-status',
    '--format=%x00%H%x1f%an%x1f%ae%x1f%aI%x1f%s',
    '--',
    dir || '.',
  ]);
  if (r.code !== 0) return [];
  const commits: LogCommit[] = [];
  for (const record of r.out.split(REC)) {
    if (!record.trim()) continue;
    const [header = '', ...lines] = record.split('\n');
    const [hash = '', author = '', email = '', iso = '', ...rest] = header.split(SEP);
    const date = Date.parse(iso);
    const files: LogFile[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const path = parts.length > 2 ? parts[parts.length - 1] : parts[1];
      if (path) files.push({ status: (parts[0] ?? '?')[0] ?? '?', path });
    }
    commits.push({ hash, author, email, date: Number.isNaN(date) ? 0 : date, subject: rest.join(SEP), files });
  }
  return commits;
}

/** Every file git tracks under `dir`, repo-relative, sorted. */
export async function trackedFiles(repo: string, dir: string): Promise<string[]> {
  const r = await run(repo, ['ls-files', '-z', '--', dir || '.']);
  return r.code === 0 ? r.out.split(REC).filter(Boolean).sort() : [];
}

export interface DirtyFile {
  /** Repo-relative. */
  path: string;
  /** The two porcelain status letters, e.g. ` M`, `A `, `??`. */
  code: string;
  md: boolean;
}

export const isMd = (path: string): boolean => /\.mdx?$/i.test(path);

/** Uncommitted changes in the whole repo — what `commit -a` takes, plus untracked files. */
export async function dirtyFiles(repo: string): Promise<DirtyFile[]> {
  const r = await run(repo, ['status', '--porcelain=v1', '-z']);
  if (r.code !== 0) return [];
  const out: DirtyFile[] = [];
  const entries = r.out.split(REC);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] ?? '';
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    const path = e.slice(3);
    // A rename carries its old path as the next entry.
    if (code[0] === 'R' || code[0] === 'C') i++;
    out.push({ path, code, md: isMd(path) });
  }
  return out;
}

/** The files `git commit -a` would take: tracked and changed, or staged — not untracked ones. */
export const commitable = (dirty: DirtyFile[]): DirtyFile[] => dirty.filter((f) => f.code !== '??' && f.code !== '!!');

/** Where the repository lives on the web, and how its commit and file pages are addressed. */
export interface Host {
  /** The repository's page. */
  web: string;
  /** `{sha}` replaced. */
  commit: string;
  /** `{sha}` and `{path}` replaced. */
  blob: string;
  /** github, gitlab, gitea, bitbucket — or "guess": the GitHub shape, a possible url. */
  kind: string;
}

/** The web address of a remote url: `git@host:o/r.git`, `ssh://git@host/o/r`, `https://host/o/r.git`. */
export function hostOf(url: string): Host | null {
  let host = '';
  let path = '';
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/)(.+)$/.exec(url);
  if (scp && !/^[a-z]+:\/\//i.test(url)) {
    host = scp[1] ?? '';
    path = scp[2] ?? '';
  } else {
    try {
      const u = new URL(url);
      if (!/^(https?|ssh|git):$/.test(u.protocol)) return null;
      host = u.hostname;
      path = u.pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!host || !path) return null;
  const web = `https://${host}/${path}`;
  const h = host.toLowerCase();
  if (h === 'github.com' || h.startsWith('github.')) return { web, kind: 'github', commit: `${web}/commit/{sha}`, blob: `${web}/blob/{sha}/{path}` };
  if (h.includes('gitlab')) return { web, kind: 'gitlab', commit: `${web}/-/commit/{sha}`, blob: `${web}/-/blob/{sha}/{path}` };
  if (h.includes('bitbucket')) return { web, kind: 'bitbucket', commit: `${web}/commits/{sha}`, blob: `${web}/src/{sha}/{path}` };
  if (h.includes('gitea') || h.includes('forgejo') || h === 'codeberg.org') {
    return { web, kind: 'gitea', commit: `${web}/commit/{sha}`, blob: `${web}/src/commit/{sha}/{path}` };
  }
  return { web, kind: 'guess', commit: `${web}/commit/{sha}`, blob: `${web}/blob/{sha}/{path}` };
}

export async function origin(repo: string): Promise<Host | null> {
  const r = await run(repo, ['remote', 'get-url', 'origin']);
  return r.code === 0 ? hostOf(r.out.trim()) : null;
}

export interface RemoteState {
  /** same, ahead (unpushed), behind, new (the remote has commits not fetched), diverged, none. */
  state: 'same' | 'ahead' | 'behind' | 'new' | 'diverged' | 'none';
  ahead?: number;
  behind?: number;
  message?: string;
}

/**
 * Has `origin` moved? Asks with `ls-remote`, which writes nothing — no fetch. How far ahead or
 * behind is known only for commits this checkout already has.
 */
export async function remoteState(repo: string, branch: string): Promise<RemoteState> {
  const r = await run(repo, ['ls-remote', 'origin', `refs/heads/${branch}`], 20_000);
  if (r.code !== 0) return { state: 'none', message: r.err.trim().split('\n')[0] || 'no origin' };
  const sha = r.out.split('\t')[0]?.trim();
  if (!sha) return { state: 'none', message: `origin has no branch ${branch}` };
  const head = (await run(repo, ['rev-parse', 'HEAD'])).out.trim();
  if (sha === head) return { state: 'same' };
  if ((await run(repo, ['cat-file', '-e', `${sha}^{commit}`])).code !== 0) return { state: 'new' };
  const counts = (await run(repo, ['rev-list', '--left-right', '--count', `${sha}...HEAD`])).out.trim().split(/\s+/);
  const behind = Number(counts[0] ?? 0);
  const ahead = Number(counts[1] ?? 0);
  return { state: behind && ahead ? 'diverged' : ahead ? 'ahead' : 'behind', ahead, behind };
}

/** A message for a commit of these files, when one is obvious. */
export function suggestMessage(files: DirtyFile[]): string {
  const names = [...new Set(files.map((f) => f.path.split('/').pop() ?? f.path))];
  if (names.length === 1) return `Update ${names[0]}`;
  if (names.length <= 3) return `Update ${names.join(', ')}`;
  return '';
}

export interface SyncState {
  /** The branch's upstream, `origin/main` — or null: it was never pushed. */
  upstream: string | null;
  /** The last exchange with origin, whichever way it went; null when there was none. */
  last: { way: 'pulled' | 'pushed'; at: number } | null;
  /** Commits here and not on the upstream (as of the last fetch). */
  ahead: number;
  /** Commits on the upstream and not here (as of the last fetch). */
  behind: number;
  /** The commits not on origin, newest first — `ahead` of them, or every one when no upstream. */
  unpushed: Array<{ hash: string; author: string; email: string; date: number; subject: string }>;
  /** merge, rebase, cherry-pick or revert under way; conflicts. Commit / pull / push wait. */
  busy: string | null;
}

/**
 * How the branch stands with origin — all local, no network. The time of the last exchange
 * comes from the reflog of `origin/<branch>`: "update by push" for a push, "fetch" / "pull"
 * for a pull; FETCH_HEAD's time when that reflog is gone.
 */
export async function syncState(repo: string, branch: string): Promise<SyncState> {
  const up = await run(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  let upstream = up.code === 0 ? up.out.trim() : null;
  if (!upstream && (await run(repo, ['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`])).code === 0) {
    upstream = `origin/${branch}`;
  }

  let last: SyncState['last'] = null;
  if (upstream) {
    const log = await run(repo, ['reflog', 'show', '--date=unix', '--format=%gd%x1f%gs', `refs/remotes/${upstream}`]);
    for (const line of log.out.split('\n')) {
      const [ref = '', what = ''] = line.split(SEP);
      const at = Number(/@\{(\d+)\}/.exec(ref)?.[1]) * 1000;
      if (!at) continue;
      const way = what.startsWith('update by push') ? 'pushed' : /^(fetch|pull)/.test(what) ? 'pulled' : null;
      if (way) {
        last = { way, at };
        break;
      }
    }
    if (!last) {
      const path = (await run(repo, ['rev-parse', '--git-path', 'FETCH_HEAD'])).out.trim();
      const fetched = Bun.file(isAbsolute(path) ? path : join(repo, path));
      if (await fetched.exists()) last = { way: 'pulled', at: fetched.lastModified };
    }
  }

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = (await run(repo, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`])).out.trim().split(/\s+/);
    behind = Number(counts[0]) || 0;
    ahead = Number(counts[1]) || 0;
  }
  // Without an upstream: every commit no remote has.
  const range = upstream ? [`${upstream}..HEAD`] : ['HEAD', '--not', '--remotes'];
  const out = await run(repo, ['log', '-n100', '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s', ...range]);
  const unpushed = out.out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash = '', author = '', email = '', iso = '', ...rest] = line.split(SEP);
      return { hash, author, email, date: Date.parse(iso) || 0, subject: rest.join(SEP) };
    });

  const marks: Array<[string, string]> = [
    ['MERGE_HEAD', 'a merge'],
    ['rebase-merge', 'a rebase'],
    ['rebase-apply', 'a rebase'],
    ['CHERRY_PICK_HEAD', 'a cherry-pick'],
    ['REVERT_HEAD', 'a revert'],
  ];
  // --git-path: right in a linked worktree too, where these live in its own git dir.
  const paths = (await run(repo, ['rev-parse', ...marks.flatMap(([f]) => ['--git-path', f])])).out.split('\n');
  let busy: string | null = null;
  for (const [i, [, what]] of marks.entries()) {
    const path = paths[i]?.trim();
    if (path && existsSync(isAbsolute(path) ? path : join(repo, path))) {
      busy = `${what} is under way`;
      break;
    }
  }
  if (!busy) {
    const dirty = await dirtyFiles(repo);
    if (dirty.some((f) => /^(DD|AU|UD|UA|DU|AA|UU)$/.test(f.code))) busy = 'there are conflicts';
  }
  return { upstream, last, ahead, behind, unpushed, busy };
}
