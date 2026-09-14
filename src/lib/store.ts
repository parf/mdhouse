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
  status?: string;
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

  /** Filesystem recents: newest mtime first. Muted entries are dropped. */
  async recentsFs(root: Root, limit: number, includeIgnored: boolean): Promise<RecentEntry[]> {
    const scan = await this.scan(root, includeIgnored);
    return scan.files
      .filter((f) => !this.prefs.hasMark(root.path, f.rel, 'muted'))
      .sort((a, b) => b.mtime - a.mtime || a.rel.localeCompare(b.rel))
      .slice(0, limit)
      .map((f) => ({ rel: f.rel, name: f.name, dir: f.dir, at: f.mtime }));
  }

  /**
   * Git recents: the newest commit touching each Markdown file, from a single `git log` per
   * repo. The full author set is returned unfiltered — the client filters by committer with no
   * further round-trip.
   */
  async recentsGit(root: Root, limit: number, includeIgnored: boolean): Promise<RecentEntry[]> {
    if (this.opts.noGit) return [];
    const scan = await this.scan(root, includeIgnored);
    const s = await this.stateFor(root);

    if (!s.changes) {
      const all: GitChange[] = [];
      for (const repo of scan.repos) {
        const inside = repo.startsWith(root.path);
        const prefix = inside && repo !== root.path ? repo.slice(root.path.length + 1) + '/' : '';
        const changes = await recentChanges(repo, inside ? repo : root.path, this.opts.gitLogLimit ?? 200);
        for (const c of changes) all.push(prefix ? { ...c, rel: prefix + c.rel } : c);
      }
      all.sort((a, b) => b.date - a.date);
      s.changes = all;
    }

    const known = new Set(scan.files.map((f) => f.rel));
    const seen = new Set<string>();
    const out: RecentEntry[] = [];

    for (const c of s.changes) {
      if (seen.has(c.rel)) continue;
      if (c.status === 'D' || !known.has(c.rel)) continue;
      if (this.prefs.hasMark(root.path, c.rel, 'muted')) continue;
      seen.add(c.rel);

      const slash = c.rel.lastIndexOf('/');
      out.push({
        rel: c.rel,
        name: slash === -1 ? c.rel : c.rel.slice(slash + 1),
        dir: slash === -1 ? '' : c.rel.slice(0, slash),
        at: c.date,
        author: c.author,
        email: c.email,
        subject: c.subject,
        hash: c.hash.slice(0, 8),
        status: c.status,
      });
      if (out.length >= limit) break;
    }
    return out;
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
