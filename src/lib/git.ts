/**
 * Git queries, batched.
 *
 * Never one `git log -1` per displayed row — that is what makes a viewer slow on a big tree.
 * mdHouse makes **one** `git log` call per repository and derives every recents row, author and status
 * badge from that single result. Committer filtering then happens client-side on data already
 * in hand, so changing the filter costs no round-trip at all.
 */

import { stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { MD_EXT } from './filetypes';

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
    // core.quotepath=false keeps non-ASCII filenames as themselves. Without it `--name-status`
    // hands back `"r\303\251sum\303\251.md"` — quoted, octal-escaped, and matching no file we
    // ever scanned, so the row would be unopenable. Set here so every git call gets it.
    const proc = Bun.spawn(['git', '-c', 'core.quotepath=false', ...args], {
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
      if (!path || !MD_EXT.test(path)) continue;
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
    if (!MD_EXT.test(path)) continue;
    if (prefix && !path.startsWith(prefix)) continue;
    path = path.slice(prefix.length);

    const status: FileStatus =
      code === '??' ? 'untracked' : code[1] === 'D' || code[0] === 'D' ? 'deleted' : code[0] !== ' ' ? 'staged' : 'modified';
    result.set(path, status);
  }
  return result;
}

/**
 * The last few commits to one file, newest first, with the lines each one added and removed.
 *
 * One `git log`, nothing else: the document header already names who created the file and
 * when — from `authorship()`, which the page fetches anyway — so the panel neither looks up
 * the creating commit nor says whether older ones exist.
 *
 * `--follow` chases renames, which is the whole point for a docs tree where a plan folder
 * gets renamed when its ticket does.
 */
export async function fileHistory(repo: string, repoRelPath: string, limit = 5): Promise<FileHistory> {
  return { commits: await logNumstat(repo, repoRelPath, [`-n${limit}`]) };
}

/**
 * Who wrote a file and who last touched it: the creating commit and the newest one.
 *
 * Two processes in parallel, both `-1`-shaped, because this runs on every document open and
 * the header only wants two names. The heavier `fileHistory()` is still what the history
 * panel asks for when it is opened.
 */
export async function authorship(
  repo: string,
  repoRelPath: string,
): Promise<{ created: Commit | null; last: Commit | null }> {
  const [last, created] = await Promise.all([
    oneCommit(repo, repoRelPath, ['-1']),
    // --reverse orders oldest first; --diff-filter=A keeps only the commit that added the
    // file, and --follow means a rename does not reset its authorship.
    oneCommit(repo, repoRelPath, ['--follow', '--diff-filter=A', '--reverse']),
  ]);
  return { created, last };
}

/** The first commit of a `git log` shaped by `extra`, or null when there is none. */
async function oneCommit(repo: string, repoRelPath: string, extra: string[]): Promise<Commit | null> {
  const out = await git(repo, [
    'log',
    `--format=%H${FMT_SEP}%an${FMT_SEP}%ae${FMT_SEP}%aI${FMT_SEP}%s`,
    ...extra,
    '--',
    repoRelPath,
  ]);
  const line = out?.split('\n').find((l) => l.trim());
  if (!line) return null;

  const [hash = '', author = '', email = '', iso = '', ...rest] = line.split(SEP);
  const date = Date.parse(iso);
  return { hash, author, email, date: Number.isNaN(date) ? 0 : date, subject: rest.join(SEP) };
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

/* ── diffs ─────────────────────────────────────────────────────────────────── */

export interface DiffLine {
  /** ' ' context, '+' added, '-' removed. */
  t: ' ' | '+' | '-';
  text: string;
  /** The line with its Markdown rendered, filled in by `markupHunks()` before it is served. */
  html?: string;
  /** Line number on the old side, on the new side; absent where the line does not exist. */
  a?: number;
  b?: number;
}

export interface DiffHunk {
  /** What git writes after the `@@ … @@` — usually the enclosing heading. */
  heading: string;
  /** The hunk's first line on the new side, straight from `@@ … +b,… @@`. */
  b: number;
  lines: DiffLine[];
}

export interface FileDiff {
  /** What is being compared: the working tree against HEAD, one commit, or a file git never saw. */
  kind: 'working' | 'commit' | 'new' | 'none';
  /** The commit shown, for `kind: 'commit'`. */
  rev?: Commit;
  added: number;
  removed: number;
  hunks: DiffHunk[];
  /** True when the diff was cut short; the page says so rather than lying by omission. */
  truncated: boolean;
  /**
   * Whether the new side of this diff is the file as it is on disk right now.
   *
   * It is what decides whether the change marks can be laid over the rendered document: an
   * older revision's diff describes a text the page is not showing.
   */
  current?: boolean;
  /** A working diff: the fingerprint (`lineHash`) of the file it was taken from — what Reset sends back. */
  hash?: string;
}

/** Lines of patch body kept. A diff longer than this is being read by a machine, not a person. */
const MAX_DIFF_LINES = 4000;

/**
 * Parse a unified diff for a single file into hunks, carrying both line numbers.
 *
 * Only the body matters here: the caller already knows which file this is, so the `diff --git`,
 * `index`, `---` and `+++` headers are dropped rather than parsed.
 */
export function parsePatch(patch: string): Omit<FileDiff, 'kind' | 'rev'> {
  const hunks: DiffHunk[] = [];
  let added = 0;
  let removed = 0;
  let truncated = false;
  let a = 0;
  let b = 0;
  let current: DiffHunk | null = null;
  let kept = 0;

  // One trailing newline ends the last line of the patch; splitting on it would otherwise
  // invent an empty context line at the end of every diff.
  for (const raw of patch.replace(/\n$/, '').split('\n')) {
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(raw);
    if (at) {
      a = Number(at[1]);
      b = Number(at[2]);
      current = { heading: at[3] ?? '', b, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue; // still in the header block
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"

    if (kept >= MAX_DIFF_LINES) {
      truncated = true;
      break;
    }

    const mark = raw[0];
    const text = raw.slice(1);
    if (mark === '+') {
      current.lines.push({ t: '+', text, b: b++ });
      added++;
    } else if (mark === '-') {
      current.lines.push({ t: '-', text, a: a++ });
      removed++;
    } else if (mark === ' ' || raw === '') {
      current.lines.push({ t: ' ', text, a: a++, b: b++ });
    } else {
      continue; // a stray header line between hunks
    }
    kept++;
  }

  // A patch cut in the middle can leave an empty trailing hunk; nothing to show for it.
  return { hunks: hunks.filter((h) => h.lines.length), added, removed, truncated };
}

/**
 * Flags that make git produce a patch we can parse, whatever the user's config says.
 *
 * `diff.external` (difftastic, delta and friends) replaces the unified diff wholesale, and
 * `git diff` honours it — so a perfectly normal developer setup would hand this parser a
 * side-by-side rendering with no `@@` in it at all. `--no-textconv` is the same argument for
 * binary-ish filters.
 */
const PLAIN_DIFF = ['--no-ext-diff', '--no-textconv', '--no-color', '-U3'];

/** Uncommitted changes to one file: the working tree, staged or not, against HEAD. */
export async function workingDiff(repo: string, repoRelPath: string): Promise<FileDiff | null> {
  const patch = await git(repo, ['diff', ...PLAIN_DIFF, 'HEAD', '--', repoRelPath]);
  if (patch === null) return null;
  return { kind: 'working', ...parsePatch(patch) };
}

/**
 * What one commit did to one file. `rev` describes it, so the page can say what it is showing.
 * Diffs the file under its name at that commit, and both names of a rename, with `-M`.
 */
export async function commitDiff(repo: string, repoRelPath: string, rev: Commit): Promise<FileDiff | null> {
  const paths = (await pathsAt(repo, repoRelPath, rev.hash)) ?? [repoRelPath];
  const patch = await git(repo, ['show', ...PLAIN_DIFF, '-M', '--format=', rev.hash, '--', ...paths]);
  if (patch === null) return null;
  return { kind: 'commit', rev, ...parsePatch(patch) };
}

/**
 * The file's path(s) in commit `hash`, as `git log --follow` names them: one, or old and new
 * for a rename. Null when that commit is not in the file's history. Stops git once found.
 */
async function pathsAt(repo: string, repoRelPath: string, hash: string): Promise<string[] | null> {
  let proc;
  try {
    proc = Bun.spawn(
      ['git', '-c', 'core.quotepath=false', 'log', '--follow', '-M', '--name-status', `--format=${FMT_REC}%H`, '--', repoRelPath],
      { cwd: repo, stdout: 'pipe', stderr: 'ignore', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
    );
  } catch {
    return null;
  }
  const timer = setTimeout(() => proc.kill(), 15_000);
  let buffer = '';
  let found: string[] | null = null;
  const decoder = new TextDecoder();
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    // A record is complete once the next one starts.
    const records = buffer.split(REC);
    buffer = records.pop() ?? '';
    for (const record of records) {
      const [head = '', ...lines] = record.split('\n');
      if (head !== hash) continue;
      const row = lines.find((l) => l.trim());
      found = row ? row.split('\t').slice(1) : null;
      break;
    }
    if (found) break;
  }
  if (!found && buffer) {
    const [head = '', ...lines] = buffer.split('\n');
    const row = head === hash ? lines.find((l) => l.trim()) : undefined;
    if (row) found = row.split('\t').slice(1);
  }
  proc.kill();
  clearTimeout(timer);
  await proc.exited;
  return found?.length ? found : null;
}

/**
 * A file git has never seen, as a diff against nothing.
 *
 * Synthesised rather than shelled out to `git diff --no-index`: it is the same answer, and it
 * also covers a file in no repository at all, where there is no git to ask.
 */
export function newFileDiff(text: string): FileDiff {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();

  const truncated = lines.length > MAX_DIFF_LINES;
  const kept = truncated ? lines.slice(0, MAX_DIFF_LINES) : lines;
  return {
    kind: 'new',
    added: kept.length,
    removed: 0,
    truncated,
    hunks: kept.length ? [{ heading: '', b: 1, lines: kept.map((text, i) => ({ t: '+' as const, text, b: i + 1 })) }] : [],
  };
}

/** One commit's own description, for a revision the page was asked to show. */
export async function commitInfo(repo: string, rev: string): Promise<Commit | null> {
  const out = await git(repo, ['show', '-s', `--format=%H${FMT_SEP}%an${FMT_SEP}%ae${FMT_SEP}%aI${FMT_SEP}%s`, rev]);
  const line = out?.split('\n').find((l) => l.trim());
  if (!line) return null;

  const [hash = '', author = '', email = '', iso = '', ...rest] = line.split(SEP);
  const date = Date.parse(iso);
  return { hash, author, email, date: Number.isNaN(date) ? 0 : date, subject: rest.join(SEP) };
}

/** Where a repository stands: its branch, its newest commit, and when it last fetched. */
export interface RepoHead {
  /** Branch name, or the short hash when HEAD is detached. */
  branch: string;
  /** HEAD itself — the newest commit of any kind, not only the ones that touched Markdown. */
  commit: Commit | null;
  /**
   * When the checkout last talked to its remote: the mtime of FETCH_HEAD, which every fetch
   * and pull rewrites. Not the mtime of `.git` itself — that moves on every commit, staging
   * and checkout, so it would only ever repeat the commit's age. Null for a repo that has never
   * fetched.
   */
  pulledAt: number | null;
}

export async function repoHead(repo: string): Promise<RepoHead | null> {
  const [refs, commit] = await Promise.all([
    git(repo, ['rev-parse', '--abbrev-ref', 'HEAD', '--absolute-git-dir', '--git-common-dir']),
    commitInfo(repo, 'HEAD'),
  ]);
  if (refs === null) return null;

  const [branch = '', gitDir = '', commonDir = ''] = refs.split('\n').map((l) => l.trim());
  // A linked worktree keeps its own HEAD but shares FETCH_HEAD with the main checkout, so look
  // in both. --git-common-dir may come back relative to the repo.
  // --git-common-dir is relative in the main checkout and absolute in a linked worktree;
  // `resolve` handles both, where `join` glued an absolute one under the repo.
  const dirs = [gitDir, commonDir && resolve(repo, commonDir)].filter(Boolean);
  let pulledAt: number | null = null;
  for (const dir of dirs) {
    const info = await stat(join(dir, 'FETCH_HEAD')).catch(() => null);
    if (info) pulledAt = Math.max(pulledAt ?? 0, info.mtimeMs);
  }

  return {
    branch: branch === 'HEAD' ? (commit?.hash.slice(0, 8) ?? 'HEAD') : branch,
    commit,
    pulledAt,
  };
}
