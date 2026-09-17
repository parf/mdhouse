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
 * The last few commits to one file, newest first, with the line counts the r-doc viewer shows.
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
  /** Line number on the old side, on the new side; absent where the line does not exist. */
  a?: number;
  b?: number;
}

export interface DiffHunk {
  /** What git writes after the `@@ … @@` — usually the enclosing heading. */
  heading: string;
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
      current = { heading: at[3] ?? '', lines: [] };
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

/** What one commit did to one file. `rev` describes it, so the page can say what it is showing. */
export async function commitDiff(repo: string, repoRelPath: string, rev: Commit): Promise<FileDiff | null> {
  const patch = await git(repo, ['show', ...PLAIN_DIFF, '--format=', rev.hash, '--', repoRelPath]);
  if (patch === null) return null;
  return { kind: 'commit', rev, ...parsePatch(patch) };
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
    hunks: kept.length ? [{ heading: '', lines: kept.map((text, i) => ({ t: '+' as const, text, b: i + 1 })) }] : [],
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
