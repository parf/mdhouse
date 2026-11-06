/**
 * Per-root state: the file list, git status, git history and user marks.
 *
 * Everything here is cached and invalidated by the filesystem watcher rather than rebuilt per
 * request. A scan of the primary target takes ~50ms and a git log ~200ms; doing either on every
 * keystroke of a search would be absurd.
 */

import { sep, resolve as resolvePath, relative } from 'node:path';
import type { Registry, Root } from './roots';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isExplicitlyDenied, loadRootRules, type IgnoreRules } from './ignore';
import { LIST_CAP, repoToplevel, scanRoot, type MdFile, type ScanResult } from './scan';
import {
  recentChanges,
  repoHead,
  headCommit,
  type RepoHead,
  workingStatus,
  untrackedPaths,
  currentUser,
  authorship,
  type FileStatus,
  type GitChange,
  type Commit,
} from './git';

/** Who created a file and who last touched it. */
export type Authorship = { created: Commit | null; last: Commit | null };
import type { Prefs, Mark } from './prefs';

/** What git says of a file it does not track; absent for a tracked file or without git evidence. */
export type GitState = 'ignored' | 'untracked';

export interface FileEntry extends MdFile {
  status?: FileStatus;
  marks?: Mark[];
  gitState?: GitState;
}

/** One repository's untracked paths, relative to the root; directories end with `/`, `''` is the whole prefix. */
interface RepoPaths {
  prefix: string;
  ignored: Set<string>;
  untracked: Set<string>;
}

/**
 * The state of the root-relative `rel` (a file or a folder): the repository with the longest
 * prefix owning it decides, from the path itself or the nearest listed directory above it.
 */
/** The rows, each with `gitState` when git does not track it; new objects, cached rows stay as they are. */
function withGitState<T extends { rel: string; gitState?: GitState }>(repos: readonly RepoPaths[], rows: readonly T[]): T[] {
  return rows.map((r) => {
    const gs = gitStateIn(repos, r.rel);
    return gs ? { ...r, gitState: gs } : r;
  });
}

export function gitStateIn(repos: readonly RepoPaths[], rel: string): GitState | undefined {
  const own = repos.find((r) => !r.prefix || rel === r.prefix || rel.startsWith(`${r.prefix}/`));
  if (!own) return undefined;
  const inner = own.prefix ? rel.slice(own.prefix.length + 1) : rel;
  const keys = [inner, ''];
  for (let i = inner.indexOf('/'); i !== -1; i = inner.indexOf('/', i + 1)) keys.push(inner.slice(0, i + 1));
  if (keys.some((k) => own.ignored.has(k))) return 'ignored';
  if (keys.some((k) => own.untracked.has(k))) return 'untracked';
  return undefined;
}

export interface TreePayload {
  root: { id: string; name: string; path: string; writable: boolean };
  files: FileEntry[];
  repos: number;
  degraded: boolean;
  includeIgnored: boolean;
  user: { name: string; email: string } | null;
  scannedAt: number;
  /**
   * The raw mark lists for this root, as stored. The Favorites view reads these rather than
   * deriving them from file marks: a directory rule marks every file beneath it, which would
   * otherwise flood the list with a hundred entries the user never picked individually.
   */
  marks: { favorite: string[]; muted: string[]; ignored: string[] };
  /** The root has Markdown that git ignores and "show ignored" would list. */
  hasIgnored: boolean;
  /** The revealed scopes applied, as root-relative directories; a refused one is absent. */
  revealed: string[];
  /** Revealed scopes cut at `REVEAL.files`. */
  capped: string[];
}

/** Bounds of the `reveal` scopes of one tree request. */
export const REVEAL = Object.freeze({ scopes: 32, bytes: 1024, totalBytes: 16 * 1024, files: LIST_CAP, cached: 64 });

/**
 * The `reveal` values of a request, each a root-relative directory without trailing slashes;
 * a string naming the problem when one is malformed (empty, absolute, NUL, `.`/`..`/empty
 * segments) or a bound is passed. Traversal is refused, never normalized.
 */
export function parseReveal(values: readonly string[]): string[] | string {
  if (values.length > REVEAL.scopes) return `at most ${REVEAL.scopes} reveal scopes`;
  let total = 0;
  const out: string[] = [];
  for (const v of values) {
    const bytes = Buffer.byteLength(v);
    total += bytes;
    if (bytes > REVEAL.bytes || total > REVEAL.totalBytes) return 'reveal scope too long';
    const rel = v.replace(/\/+$/, '');
    if (!rel || rel.startsWith('/') || rel.includes('\0') || rel.split('/').some((seg) => !seg || seg === '.' || seg === '..')) return 'malformed reveal scope';
    out.push(rel);
  }
  return out;
}

export interface RecentEntry {
  rel: string;
  name: string;
  dir: string;
  at: number;
  author?: string;
  email?: string;
  subject?: string;
  hash?: string;
  /** Git status code for an uncommitted entry, or the commit's name-status letter. */
  status?: string;
  /** Changed in the working tree and not committed. Always counted as the user's own. */
  uncommitted?: boolean;
  gitState?: GitState;
}

/** One commit and the Markdown it is the newest change to. */
export interface CommitGroup {
  hash: string;
  author: string;
  email: string;
  date: number;
  subject: string;
  files: Array<{ rel: string; name: string; dir: string; status: string; gitState?: GitState }>;
}

export interface Digest {
  uncommitted: RecentEntry[];
  commits: CommitGroup[];
  /**
   * Newest files by modification time, filled only when git had nothing to say — a root
   * outside any repository, or one its repository ignores. Without it the front page of such
   * a root would be blank, which is the least useful thing it could be.
   */
  recent: RecentEntry[];
  /** The line above it all: branch, last commit and last pull. Null without git. */
  head: (RepoHead & { repo: string }) | null;
}

interface RootState {
  /** The root's `.mdhouseignore` and the deny list; reloaded with the scans. */
  rules?: IgnoreRules;
  scans: Map<boolean, ScanResult>;
  /** Revealed scopes by root-relative directory, least recently used first; at most `REVEAL.cached`. */
  scopes: Map<string, ScanResult>;
  status?: Map<string, FileStatus>;
  /** Every repository's untracked paths, longest prefix first; dropped with any invalidate. */
  gitPaths?: RepoPaths[];
  changes?: GitChange[];
  head?: (RepoHead & { repo: string }) | null;
  /** HEAD commit by repository; dropped with any invalidate. */
  revisions?: Map<string, string | null>;
  authors?: Map<string, Authorship>;
  user?: { name: string; email: string } | null;
}

export interface StoreOptions {
  noGit?: boolean;
  gitLogLimit?: number;
  extraDeny?: string[];
}

export class Store {
  private readonly state = new Map<string, RootState>();

  constructor(
    readonly registry: Registry,
    readonly prefs: Prefs,
    private readonly opts: StoreOptions = {},
  ) {}

  private async stateFor(root: Root): Promise<RootState> {
    let s = this.state.get(root.id);
    if (!s) {
      s = { scans: new Map(), scopes: new Map() };
      this.state.set(root.id, s);
    }
    return s;
  }

  /** Forget a root entirely — it is no longer served. */
  drop(rootId: string): void {
    this.state.delete(rootId);
  }

  /** Drop every cached derivative of a root. Called by the watcher, never by a request. */
  invalidate(rootId: string, gitOnly = false): void {
    const s = this.state.get(rootId);
    if (!s) return;
    delete s.status;
    delete s.gitPaths;
    delete s.changes;
    delete s.head;
    delete s.revisions;
    delete s.authors;
    if (!gitOnly) {
      s.scans.clear();
      s.scopes.clear();
      delete s.rules;
    }
  }

  /** The root's deny rules: built-in, the CLI's extra names and its `.mdhouseignore`. */
  async rules(root: Root): Promise<IgnoreRules> {
    const s = await this.stateFor(root);
    s.rules ??= await loadRootRules(root.path, this.opts.extraDeny);
    return s.rules;
  }

  async scan(root: Root, includeIgnored: boolean): Promise<ScanResult> {
    const s = await this.stateFor(root);
    const cached = s.scans.get(includeIgnored);
    if (cached) return cached;

    const allow = async (rel: string) => (await this.allowedRel(root, rel))?.abs ?? null;
    const result = await scanRoot(root, await this.rules(root), { includeIgnored, noGit: this.opts.noGit, allow });
    s.scans.set(includeIgnored, result);
    return result;
  }

  /**
   * The served location of the root-relative `rel` as a canonical root-relative path, or null
   * when it is outside the root, the root itself, or under `.git` or an explicit exclusion —
   * checked on both the requested and the resolved path.
   */
  async allowedRel(root: Root, rel: string): Promise<{ rel: string; abs: string } | null> {
    const rules = await this.rules(root);
    if (isExplicitlyDenied(rules, rel)) return null;
    const loc = await this.registry.resolve(`${root.id}/${rel}`);
    if (!loc || loc.root.id !== root.id || isExplicitlyDenied(rules, loc.rel)) return null;
    return { rel: loc.rel, abs: loc.abs };
  }

  /**
   * A revealed scope: what a scan of the directory as its own root lists with ignored files on.
   * Built-in defaults are lifted for the scope's own path only; inside it every rule holds. Each
   * file must resolve inside the root and outside `.git` and explicit exclusions before its
   * metadata is read.
   */
  private async scope(root: Root, rel: string): Promise<ScanResult> {
    const s = await this.stateFor(root);
    const hit = s.scopes.get(rel);
    if (hit) {
      s.scopes.delete(rel);
      s.scopes.set(rel, hit);
      return hit;
    }
    const rules = await this.rules(root);
    const res = await scanRoot({ path: join(root.path, rel) } as Root, rules, {
      includeIgnored: true,
      noGit: this.opts.noGit,
      limit: REVEAL.files,
      markBlind: true,
      allow: async (f) => (await this.allowedRel(root, `${rel}/${f}`))?.abs ?? null,
    });
    const files = res.files.map((f) => ({ ...f, rel: `${rel}/${f.rel}`, dir: f.dir ? `${rel}/${f.dir}` : rel }));
    const out = { ...res, files };
    s.scopes.set(rel, out);
    while (s.scopes.size > REVEAL.cached) s.scopes.delete(s.scopes.keys().next().value!);
    return out;
  }

  private async status(root: Root, scan: ScanResult): Promise<Map<string, FileStatus>> {
    const s = await this.stateFor(root);
    if (s.status) return s.status;

    const merged = new Map<string, FileStatus>();
    if (!this.opts.noGit) {
      // Two shapes: the root is a subtree of one big repo, or the root holds many repos
      // (`~/src`). Scope the query to whichever is narrower, then restate the answer
      // relative to the root. The repos are asked in parallel.
      const all = await Promise.all(
        scan.repos.map(async (repo) => {
          const nested = repo.startsWith(root.path) && repo !== root.path;
          const prefix = nested ? repo.slice(root.path.length + 1) + '/' : '';
          return { prefix, status: await workingStatus(repo, nested ? repo : root.path) };
        }),
      );
      for (const { prefix, status } of all) for (const [rel, st] of status) merged.set(prefix + rel, st);
    }
    s.status = merged;
    return merged;
  }

  /**
   * The working-tree status of one file, from the same cached map the tree badges are made of.
   *
   * The document page asks for it so it knows whether the file has uncommitted changes — which
   * is what decides whether it opens on the diff or on the rendered text.
   */
  async statusOf(root: Root, rel: string): Promise<FileStatus | undefined> {
    if (this.opts.noGit) return undefined;
    return (await this.status(root, await this.anyScan(root))).get(rel);
  }

  /**
   * Every repository's untracked paths under the root, built once per invalidation: two `git
   * ls-files` per repository — the root's own, listed from the root, and each one nested below it.
   * Empty without git.
   */
  async gitPaths(root: Root): Promise<RepoPaths[]> {
    const s = await this.stateFor(root);
    if (s.gitPaths) return s.gitPaths;
    if (this.opts.noGit) return (s.gitPaths = []);
    const own = await repoToplevel(root.path);
    const nested = (await this.anyScan(root)).repos.filter((r) => r.startsWith(`${root.path}${sep}`));
    const where = [...(own ? [{ cwd: root.path, prefix: '' }] : []), ...nested.map((r) => ({ cwd: r, prefix: relative(root.path, r).split(sep).join('/') }))];
    const repos: RepoPaths[] = [];
    await Promise.all(
      where.map(async ({ cwd, prefix }) => {
        const listed = await untrackedPaths(cwd);
        // `./` is the listed directory itself
        const set = (paths: string[]) => new Set(paths.map((p) => (p === './' ? '' : p)));
        if (listed) repos.push({ prefix, ignored: set(listed.ignored), untracked: set(listed.untracked) });
      }),
    );
    repos.sort((a, b) => b.prefix.length - a.prefix.length);
    s.gitPaths = repos;
    return repos;
  }

  /** What git says of the root-relative `rel` when it does not track it; see `gitStateIn`. */
  async gitStateOf(root: Root, rel: string): Promise<GitState | undefined> {
    return gitStateIn(await this.gitPaths(root), rel);
  }

  /**
   * The HEAD commit of the repository holding the root-relative `rel` — the innermost one the
   * scan knows — once per repository per invalidation. Null without git, outside any repository
   * and for an unborn HEAD.
   */
  async gitRevision(root: Root, rel: string): Promise<string | null> {
    if (this.opts.noGit) return null;
    const s = await this.stateFor(root);
    // The map read here: a change to the repository mid-call drops it, and the answer with it.
    const revisions = (s.revisions ??= new Map());
    const abs = resolvePath(root.path, rel);
    const repo = (await this.anyScan(root)).repos
      .filter((r) => abs === r || abs.startsWith(`${r}${sep}`))
      .reduce<string | null>((best, r) => (best && best.length >= r.length ? best : r), null);
    if (!repo) return null;
    const hit = revisions.get(repo);
    if (hit !== undefined) return hit;
    const rev = await headCommit(repo);
    revisions.set(repo, rev);
    return rev;
  }

  /** A cached scan, either setting — the repos are the same — else the scan without ignored files. */
  private async anyScan(root: Root): Promise<ScanResult> {
    const s = await this.stateFor(root);
    return s.scans.get(false) ?? s.scans.get(true) ?? this.scan(root, false);
  }

  /**
   * The tree: the scan (with ignored files when asked) and the files of each revealed scope.
   * `reveal` holds parsed scopes (`parseReveal`); one that is not an allowed directory is left out.
   */
  async tree(root: Root, includeIgnored: boolean, reveal: readonly string[] = []): Promise<TreePayload> {
    const scan = await this.scan(root, includeIgnored);
    const status = await this.status(root, scan);
    const s = await this.stateFor(root);

    if (s.user === undefined) {
      s.user = this.opts.noGit || !scan.repos.length ? null : await currentUser(scan.repos[0]!);
    }

    const git = await this.gitPaths(root);
    const entry = (f: MdFile): FileEntry => {
      const marks = this.prefs.marksFor(root.path, f.rel);
      const st = status.get(f.rel);
      const gs = gitStateIn(git, f.rel);
      return { ...f, ...(st ? { status: st } : {}), ...(marks.length ? { marks } : {}), ...(gs ? { gitState: gs } : {}) };
    };
    const files: FileEntry[] = scan.files.map(entry);

    const revealed: string[] = [];
    const capped: string[] = [];
    const seen = new Set(files.map((f) => f.rel));
    for (const want of reveal) {
      const loc = await this.allowedRel(root, want);
      if (!loc || !loc.rel || revealed.includes(loc.rel) || !(await stat(loc.abs).catch(() => null))?.isDirectory()) continue;
      revealed.push(loc.rel);
      const sc = await this.scope(root, loc.rel);
      if (sc.capped) capped.push(loc.rel);
      for (const f of sc.files) if (!seen.has(f.rel)) (seen.add(f.rel), files.push(entry(f)));
    }
    if (revealed.length) files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }));

    return {
      root: { id: root.id, name: root.name, path: root.path, writable: root.writable },
      files,
      repos: scan.repos.length,
      degraded: scan.degraded,
      includeIgnored,
      user: s.user,
      scannedAt: scan.scannedAt,
      marks: this.prefs.get(root.path),
      hasIgnored: scan.hasIgnored,
      revealed: revealed.sort(),
      capped: capped.sort(),
    };
  }

  /**
   * One recents list: what is uncommitted, then what git committed most recently.
   *
   * These used to be two tabs — mtime order and git order — which mostly showed the same
   * files in a different sequence. Uncommitted work is what "recent" actually means while
   * you are editing, and it is always yours, so it sorts to the top and needs no committer
   * filter. Muted entries are dropped from both halves.
   *
   * Whatever git cannot account for is topped up by modification time, so a root git knows
   * nothing about — a scratch folder, an ignored directory, anything outside a repository — still
   * has a working Recent rather than an empty one. A file in no repository is untracked by
   * definition, which is how it is labelled and coloured.
   */
  async recents(root: Root, limit: number, includeIgnored: boolean): Promise<RecentEntry[]> {
    const scan = await this.scan(root, includeIgnored);
    const status = await this.status(root, scan);
    const byPath = new Map(scan.files.map((f) => [f.rel, f]));

    const out: RecentEntry[] = [];
    const seen = new Set<string>();

    for (const [rel, st] of status) {
      // A deleted file has nothing to open, and the tree cannot show it either.
      if (st === 'deleted') continue;
      if (this.prefs.hasMark(root.path, rel, 'muted')) continue;
      const file = byPath.get(rel);
      if (!file) continue;
      seen.add(rel);
      out.push({
        rel,
        name: file.name,
        dir: file.dir,
        at: file.mtime,
        status: st,
        uncommitted: true,
      });
    }
    out.sort((a, b) => b.at - a.at);

    for (const c of await this.gitChanges(root, scan)) {
      if (out.length >= limit) break;
      if (seen.has(c.rel)) continue;
      if (c.status === 'D' || !byPath.has(c.rel)) continue;
      if (this.prefs.hasMark(root.path, c.rel, 'muted')) continue;
      seen.add(c.rel);

      const file = byPath.get(c.rel)!;
      out.push({
        rel: c.rel,
        name: file.name,
        dir: file.dir,
        at: c.date,
        author: c.author,
        email: c.email,
        subject: c.subject,
        hash: c.hash.slice(0, 8),
        status: c.status,
      });
    }

    // Everything git had to say, said. Fill the rest by modification time.
    if (out.length < limit) {
      const rest = scan.files
        .filter((f) => !seen.has(f.rel) && !this.prefs.hasMark(root.path, f.rel, 'muted'))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit - out.length);

      for (const f of rest) {
        out.push({
          rel: f.rel,
          name: f.name,
          dir: f.dir,
          at: f.mtime,
          // No repository owns it, so it is untracked — the same standing as uncommitted work,
          // and nobody else's to claim.
          ...(f.repo ? {} : { status: 'untracked', uncommitted: true }),
        });
      }
    }
    return withGitState(await this.gitPaths(root), out.slice(0, limit));
  }

  /**
   * The same material as `recents()`, grouped by commit instead of by file — the shape the
   * front page wants.
   *
   * A file appears exactly once, under the newest commit that touched it, and a commit that
   * contributes nothing new is dropped entirely rather than repeating a file the reader has
   * already seen two rows above. That is what makes a long `git log` readable: on a busy day
   * twenty commits touch the same four plan files, and nineteen of those rows say nothing.
   */
  async digest(root: Root, limit: number, includeIgnored: boolean): Promise<Digest> {
    const scan = await this.scan(root, includeIgnored);
    const status = await this.status(root, scan);
    const byPath = new Map(scan.files.map((f) => [f.rel, f]));
    const seen = new Set<string>();

    const uncommitted: RecentEntry[] = [];
    for (const [rel, st] of status) {
      if (st === 'deleted') continue;
      if (this.prefs.hasMark(root.path, rel, 'muted')) continue;
      const file = byPath.get(rel);
      if (!file) continue;
      seen.add(rel);
      uncommitted.push({ rel, name: file.name, dir: file.dir, at: file.mtime, status: st, uncommitted: true });
    }
    uncommitted.sort((a, b) => b.at - a.at);

    const groups = new Map<string, CommitGroup>();
    let files = 0;

    for (const c of await this.gitChanges(root, scan)) {
      if (files >= limit) break;
      if (seen.has(c.rel) || c.status === 'D' || !byPath.has(c.rel)) continue;
      if (this.prefs.hasMark(root.path, c.rel, 'muted')) continue;
      seen.add(c.rel);
      files++;

      let group = groups.get(c.hash);
      if (!group) {
        group = {
          hash: c.hash.slice(0, 8),
          author: c.author,
          email: c.email,
          date: c.date,
          subject: c.subject,
          files: [],
        };
        groups.set(c.hash, group);
      }
      const file = byPath.get(c.rel)!;
      group.files.push({ rel: c.rel, name: file.name, dir: file.dir, status: c.status });
    }

    const commits = [...groups.values()];
    const recent =
      commits.length > 0
        ? []
        : scan.files
            .filter((f) => !seen.has(f.rel) && !this.prefs.hasMark(root.path, f.rel, 'muted'))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 20)
            .map((f) => ({ rel: f.rel, name: f.name, dir: f.dir, at: f.mtime }));

    const git = await this.gitPaths(root);
    return {
      uncommitted: withGitState(git, uncommitted),
      commits: commits.map((c) => ({ ...c, files: withGitState(git, c.files) })),
      recent: withGitState(git, recent),
      head: await this.head(root, scan),
    };
  }

  /**
   * The repository the root belongs to, as of now. A root inside one checkout — the usual
   * case — has exactly one answer. A root holding many (`~/src`) shows whichever moved last,
   * named, since that is the one the reader most likely came to look at.
   */
  private async head(root: Root, scan: ScanResult): Promise<(RepoHead & { repo: string }) | null> {
    if (this.opts.noGit || !scan.repos.length) return null;
    const s = await this.stateFor(root);
    if (s.head !== undefined) return s.head;

    const heads = await Promise.all(scan.repos.map(async (repo) => ({ repo, head: await repoHead(repo) })));
    let best: (RepoHead & { repo: string }) | null = null;
    for (const { repo, head } of heads) {
      if (!head) continue;
      if (!best || (head.commit?.date ?? 0) > (best.commit?.date ?? 0)) {
        // Name the repo only when the root holds several; otherwise it is the root itself.
        const name = scan.repos.length > 1 ? relative(root.path, repo).split(sep).join('/') || '.' : '';
        best = { ...head, repo: name };
      }
    }
    s.head = best;
    return best;
  }

  /** Every markdown change in the last N commits of every repo under this root, newest first. */
  private async gitChanges(root: Root, scan: ScanResult): Promise<GitChange[]> {
    if (this.opts.noGit) return [];
    const s = await this.stateFor(root);
    if (s.changes) return s.changes;

    const all: GitChange[] = [];
    const perRepo = await Promise.all(
      scan.repos.map(async (repo) => {
        const inside = repo.startsWith(root.path);
        const prefix = inside && repo !== root.path ? repo.slice(root.path.length + 1) + '/' : '';
        return { prefix, changes: await recentChanges(repo, inside ? repo : root.path, this.opts.gitLogLimit ?? 200) };
      }),
    );
    for (const { prefix, changes } of perRepo) for (const c of changes) all.push(prefix ? { ...c, rel: prefix + c.rel } : c);
    all.sort((a, b) => b.date - a.date);
    s.changes = all;
    return all;
  }

  /** Repo and repo-relative path for a file, for the lazy per-file history call. */
  /**
   * Who created a file and who last touched it, cached per file.
   *
   * The creating commit costs a `git log --follow --diff-filter=A --reverse`, which cannot
   * stop early: git has to walk the whole history to know which end is the oldest. On a
   * hundred-thousand-commit repository that is most of a second, for two names in a header.
   * It is the same answer every time until git moves, so it is computed once and then kept
   * until the watcher says the repository changed.
   */
  async authorship(root: Root, rel: string): Promise<Authorship | null> {
    if (this.opts.noGit) return null;
    const s = await this.stateFor(root);
    // The map read here: a change to the repository mid-call drops it, and the answer with it.
    const authors = (s.authors ??= new Map());

    const hit = authors.get(rel);
    if (hit) return hit;

    const where = await this.repoFor(root, rel);
    if (!where) return null;

    const by = await authorship(where.repo, where.repoRel);
    authors.set(rel, by);
    return by;
  }

  async repoFor(root: Root, rel: string): Promise<{ repo: string; repoRel: string } | null> {
    // The cached scan first; the scan with ignored files only for a file it does not list.
    let scan = await this.anyScan(root);
    let file = scan.files.find((f) => f.rel === rel);
    if (!file) {
      scan = await this.scan(root, true);
      file = scan.files.find((f) => f.rel === rel);
    }
    const repo = file?.repo ?? scan.repos[0];
    if (!repo) return null;
    // Measure from the repo to the file itself. Going via the root breaks when the repo is
    // *inside* the root — serving ~/src, a directory of repos — where the root is not under
    // the repo at all and the old subdirOf() answered `..`.
    const abs = resolvePath(root.path, rel);
    return { repo, repoRel: relative(repo, abs).split(sep).join('/') };
  }
}
