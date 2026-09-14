/**
 * Git queries, batched.
 *
 * The r-doc viewer this replaces shells out to `git log -1` once per row it displays. mdHouse
 * makes **one** `git log` call per repository and derives every recents row, author and status
 * badge from that single result. Committer filtering then happens client-side on data already
 * in hand, so changing the filter costs no round-trip at all.
 */

import { relative, sep } from 'node:path';

export interface Commit {
  hash: string;
  author: string;
  email: string;
  date: number;
  subject: string;
  /** Lines added and removed in this file by this commit, when `--numstat` is asked for. */
  added?: number;
  deleted?: number;
  /** The path this commit touched, when it differs from today's — a rename `--follow` chased. */
  path?: string;
}

export interface FileHistory {
  commits: Commit[];
  /** The commit that introduced the file, even when it is older than the returned window. */
  created: Commit | null;
  /** True when more commits exist than were returned. */
  truncated: boolean;
}

export interface GitChange extends Commit {
  /** Path relative to the *root*, matching MdFile.rel. */
  rel: string;
  /** A, M, D, R… as reported by --name-status. */
  status: string;
}

export type FileStatus = 'modified' | 'untracked' | 'staged' | 'deleted';

// Output field and record separators. They are written into the --format string using git's
// own %xNN escapes: a literal NUL cannot travel inside an argv string, it would truncate the
// argument. The bytes still arrive in the output, which is what the parser splits on.
const SEP = '\x1f';
const REC = '\x00';
const FMT_SEP = '%x1f';
const FMT_REC = '%x00';

async function git(cwd: string, args: string[], timeoutMs = 15_000): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    clearTimeout(timer);
    return code === 0 ? out : null;
  } catch {
    return null;
  }
}

/** Root-relative pathspecs restricting a query to the Markdown under one root. */
function pathspec(subdir: string): string[] {
  return subdir ? [`${subdir}/*.md`, `${subdir}/*.MD`] : ['*.md', '*.MD'];
}

/** How far the root sits inside its repo; '' when the root is the repo. */
export function subdirOf(repo: string, rootPath: string): string {
  const sub = relative(repo, rootPath).split(sep).join('/');
  return sub === '.' ? '' : sub;
}

/**
 * Markdown changes from the last `limit` commits touching this root, newest first.
 *
 * One process. Merge commits contribute no file rows (git reports no name-status for them),
 * which is what we want — a merge is not an edit.
 */
export async function recentChanges(repo: string, rootPath: string, limit = 200): Promise<GitChange[]> {
  const subdir = subdirOf(repo, rootPath);
  const out = await git(repo, [
    'log',
    `-n${limit}`,
    '--name-status',
    '--date=iso-strict',
    `--format=${FMT_REC}%H${FMT_SEP}%an${FMT_SEP}%ae${FMT_SEP}%aI${FMT_SEP}%s`,
    '--',
    ...pathspec(subdir),
  ]);
  if (out === null) return [];

  const changes: GitChange[] = [];
  const prefix = subdir ? `${subdir}/` : '';

  for (const record of out.split(REC)) {
    if (!record.trim()) continue;
    const [header = '', ...lines] = record.split('\n');
    const [hash = '', author = '', email = '', iso = '', ...rest] = header.split(SEP);
    const subject = rest.join(SEP);
    const date = Date.parse(iso);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const status = parts[0]!;
      // Renames report old and new path; the new one is what exists now.
      const path = parts.length > 2 ? parts[parts.length - 1]! : parts[1];
      if (!path || !/\.mdx?$/i.test(path)) continue;
      if (prefix && !path.startsWith(prefix)) continue;

      changes.push({
        hash,
        author,
        email,
        date: Number.isNaN(date) ? 0 : date,
        subject,
        status: status[0]!,
        rel: path.slice(prefix.length),
      });
    }
  }
  return changes;
}

/** Working-tree state for the Markdown under a root, as `rel -> status`. */
export async function workingStatus(repo: string, rootPath: string): Promise<Map<string, FileStatus>> {
  const subdir = subdirOf(repo, rootPath);
  const out = await git(repo, ['status', '--porcelain=v1', '-z', '--', ...pathspec(subdir)]);
  const result = new Map<string, FileStatus>();
  if (out === null) return result;

  const prefix = subdir ? `${subdir}/` : '';
  const entries = out.split('\0').filter(Boolean);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const code = entry.slice(0, 2);
    let path = entry.slice(3);
    // A rename record is followed by its original path in the next NUL field.
    if (code[0] === 'R') i++;
    if (!/\.mdx?$/i.test(path)) continue;
    if (prefix && !path.startsWith(prefix)) continue;
    path = path.slice(prefix.length);

    const status: FileStatus =
      code === '??' ? 'untracked' : code[1] === 'D' || code[0] === 'D' ? 'deleted' : code[0] !== ' ' ? 'staged' : 'modified';
    result.set(path, status);
  }
  return result;
}

/**
 * The history of one file, newest first, with the line counts and the creation commit the
 * r-doc viewer shows. Lazy — this runs only when the history panel is opened, never during a
 * scan or a recents query.
 *
 * `--follow` chases renames, which is the whole point for a docs tree where a plan folder
 * gets renamed when its ticket does.
 */
export async function fileHistory(repo: string, repoRelPath: string, limit = 20): Promise<FileHistory> {
  const commits = await logNumstat(repo, repoRelPath, [`-n${limit}`]);
  if (!commits.length) return { commits, created: null, truncated: false };

  // Fewer commits than asked for means we already have the oldest one, so the extra process
  // is only paid for by a file with a long history.
  if (commits.length < limit) {
    return { commits, created: commits[commits.length - 1]!, truncated: false };
  }
  const birth = await logNumstat(repo, repoRelPath, ['--diff-filter=A', '--reverse']);
  return { commits, created: birth[0] ?? null, truncated: true };
}

/** `git log --follow --numstat` for one file, parsed. One process. */
async function logNumstat(repo: string, repoRelPath: string, extra: string[]): Promise<Commit[]> {
  const out = await git(repo, [
    'log',
    '--follow',
    '--numstat',
    '--date=iso-strict',
    `--format=${FMT_REC}%H${FMT_SEP}%an${FMT_SEP}%ae${FMT_SEP}%aI${FMT_SEP}%s`,
    ...extra,
    '--',
    repoRelPath,
  ]);
  if (out === null) return [];

  const commits: Commit[] = [];
  for (const record of out.split(REC)) {
    if (!record.trim()) continue;
    const [header = '', ...lines] = record.split('\n');
    const [hash = '', author = '', email = '', iso = '', ...rest] = header.split(SEP);
    const date = Date.parse(iso);

    const commit: Commit = {
      hash,
      author,
      email,
      date: Number.isNaN(date) ? 0 : date,
      subject: rest.join(SEP),
    };

    // numstat rows are `added\tdeleted\tpath`; a binary file reports `-`. --follow restricts
    // the output to this one file, so the first row is always ours.
    for (const line of lines) {
      if (!line.trim()) continue;
      const [added = '', deleted = '', ...where] = line.split('\t');
      commit.added = added === '-' ? 0 : Number(added) || 0;
      commit.deleted = deleted === '-' ? 0 : Number(deleted) || 0;
      // A rename row is `old => new` or `dir/{old => new}/file`; keep it as git wrote it.
      const path = where.join('\t');
      if (path) commit.path = path;
      break;
    }
    commits.push(commit);
  }
  return commits;
}

/** The configured identity, so the UI can offer a "mine" filter that means something. */
export async function currentUser(repo: string): Promise<{ name: string; email: string } | null> {
  const name = (await git(repo, ['config', 'user.name']))?.trim();
  const email = (await git(repo, ['config', 'user.email']))?.trim();
  if (!name && !email) return null;
  return { name: name ?? '', email: email ?? '' };
}
