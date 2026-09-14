/**
 * Per-root state: the file list, git status, git history and user marks.
 *
 * Everything here is cached and invalidated by the filesystem watcher rather than rebuilt per
 * request. A scan of the primary target takes ~50ms and a git log ~200ms; doing either on every
 * keystroke of a search would be absurd.
 */

import type { Registry, Root } from './roots';
import { loadRootRules, type IgnoreRules } from './ignore';
import { scanRoot, type MdFile, type ScanResult } from './scan';
import { recentChanges, workingStatus, currentUser, subdirOf, type FileStatus, type GitChange } from './git';
import type { Prefs, Mark } from './prefs';

export interface FileEntry extends MdFile {
  status?: FileStatus;
  marks?: Mark[];
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
}

interface RootState {
  rules: IgnoreRules;
  scans: Map<boolean, ScanResult>;
  status?: Map<string, FileStatus>;
  changes?: GitChange[];
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
      s = { rules: await loadRootRules(root.path, this.opts.extraDeny), scans: new Map() };
      this.state.set(root.id, s);
    }
    return s;
  }

  /** Drop every cached derivative of a root. Called by the watcher, never by a request. */
  invalidate(rootId: string, gitOnly = false): void {
    const s = this.state.get(rootId);
    if (!s) return;
    delete s.status;
    delete s.changes;
    if (!gitOnly) s.scans.clear();
  }

  async scan(root: Root, includeIgnored: boolean): Promise<ScanResult> {
    const s = await this.stateFor(root);
    const cached = s.scans.get(includeIgnored);
    if (cached) return cached;

    const result = await scanRoot(root, s.rules, { includeIgnored, noGit: this.opts.noGit });
    s.scans.set(includeIgnored, result);
    return result;
  }

  private async status(root: Root, scan: ScanResult): Promise<Map<string, FileStatus>> {
    const s = await this.stateFor(root);
    if (s.status) return s.status;

    const merged = new Map<string, FileStatus>();
    if (!this.opts.noGit) {
      for (const repo of scan.repos) {
        // Two shapes: the root sits inside one big repo (`/rd/vhosts/realty`), or the root
        // holds many repos (`~/src`). Scope the query to whichever is narrower, then restate
        // the answer relative to the root.
        const nested = repo.startsWith(root.path) && repo !== root.path;
        const prefix = nested ? repo.slice(root.path.length + 1) + '/' : '';
        for (const [rel, st] of await workingStatus(repo, nested ? repo : root.path)) {
          merged.set(prefix + rel, st);
        }
      }
    }
    s.status = merged;
    return merged;
  }

  async tree(root: Root, includeIgnored: boolean): Promise<TreePayload> {
    const scan = await this.scan(root, includeIgnored);
    const status = await this.status(root, scan);
    const s = await this.stateFor(root);

    if (s.user === undefined) {
      s.user = this.opts.noGit || !scan.repos.length ? null : await currentUser(scan.repos[0]!);
    }

    const files: FileEntry[] = scan.files.map((f) => {
      const marks = this.prefs.marksFor(root.path, f.rel);
      const st = status.get(f.rel);
      return { ...f, ...(st ? { status: st } : {}), ...(marks.length ? { marks } : {}) };
    });

    return {
      root: { id: root.id, name: root.name, path: root.path, writable: root.writable },
      files,
      repos: scan.repos.length,
      degraded: scan.degraded,
      includeIgnored,
      user: s.user,
      scannedAt: scan.scannedAt,
      marks: this.prefs.get(root.path),
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
   * nothing about — `/rd/tmp`, a scratch folder, a directory outside any repository — still
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
    return out.slice(0, limit);
  }

  /** Every markdown change in the last N commits of every repo under this root, newest first. */
  private async gitChanges(root: Root, scan: ScanResult): Promise<GitChange[]> {
    if (this.opts.noGit) return [];
    const s = await this.stateFor(root);
    if (s.changes) return s.changes;

    const all: GitChange[] = [];
    for (const repo of scan.repos) {
      const inside = repo.startsWith(root.path);
      const prefix = inside && repo !== root.path ? repo.slice(root.path.length + 1) + '/' : '';
      const changes = await recentChanges(repo, inside ? repo : root.path, this.opts.gitLogLimit ?? 200);
      for (const c of changes) all.push(prefix ? { ...c, rel: prefix + c.rel } : c);
    }
    all.sort((a, b) => b.date - a.date);
    s.changes = all;
    return all;
  }

  /** Repo and repo-relative path for a file, for the lazy per-file history call. */
  async repoFor(root: Root, rel: string): Promise<{ repo: string; repoRel: string } | null> {
    const scan = await this.scan(root, true);
    const file = scan.files.find((f) => f.rel === rel);
    const repo = file?.repo ?? scan.repos[0];
    if (!repo) return null;
    const sub = subdirOf(repo, root.path);
    return { repo, repoRel: sub ? `${sub}/${rel}` : rel };
  }
}
