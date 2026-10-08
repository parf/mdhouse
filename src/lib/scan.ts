/**
 * Finding every .md file under a root.
 *
 * Globbing a whole tree and subtracting a skip list is both slow and blind to `.gitignore`.
 * mdHouse asks git instead: one `git ls-files` per repository
 * returns tracked plus untracked-but-not-ignored files, so `.gitignore` is honoured with no
 * configuration at all. Globbing is the fallback for ground that is not in any repo.
 */

import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Root } from './roots';
import { isDenied, type IgnoreRules } from './ignore';
import { MD_EXT } from './filetypes';

export interface MdFile {
  /** Root-relative path, forward slashes. */
  rel: string;
  name: string;
  /** Root-relative directory, '' at the root. */
  dir: string;
  mtime: number;
  size: number;
  /** Absolute toplevel of the repo owning this file, if any. */
  repo?: string;
  /** True when the file is only visible because "show ignored" is on. */
  ignored?: boolean;
}

export interface ScanResult {
  files: MdFile[];
  /** Absolute repo toplevels discovered under (or above) the root. */
  repos: string[];
  scannedAt: number;
  /** Set when git was unavailable and everything came from the glob fallback. */
  degraded: boolean;
}

export interface ScanOptions {
  /** Include files git would ignore (the user's own `*.local.md`, build output, …). */
  includeIgnored?: boolean;
  /** Skip git entirely — glob everything. */
  noGit?: boolean;
  /** Directory depth searched for nested repos when the root is not itself in one. */
  maxDepth?: number;
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    const out = await new Response(proc.stdout).text();
    return (await proc.exited) === 0 ? out : null;
  } catch {
    return null;
  }
}

/** The repository containing `dir`, or null when it is not in one. */
export async function repoToplevel(dir: string): Promise<string | null> {
  const out = await git(dir, ['rev-parse', '--show-toplevel']);
  return out ? out.trim() || null : null;
}

/**
 * Whether the repository containing `dir` ignores `dir` itself — a `tmp/` directory named in
 * the repository's own `.gitignore`, say. `check-ignore -q` exits 0 when the path is ignored.
 */
async function isIgnoredByGit(dir: string): Promise<boolean> {
  return (await git(dir, ['check-ignore', '-q', '.'])) !== null;
}

/** A path is hidden when any of its directory segments is on the deny list. */
function passesDeny(rel: string, rules: IgnoreRules): boolean {
  const parts = rel.split('/');
  return !parts.slice(0, -1).some((seg) => isDenied(rules, seg));
}

/**
 * `git ls-files` run with cwd inside a repo lists only what is under that directory, which is
 * exactly the scoping we want for a root that is one subtree of a much larger repository.
 * One process, no pathspec arithmetic. `-s` marks submodules: a cached entry carries its mode,
 * 160000 for a gitlink. An embedded repository comes back as `name/`. Both go to `nested`.
 */
async function listViaGit(dir: string, includeIgnored: boolean): Promise<{ md: string[]; nested: string[] } | null> {
  const listed = await git(dir, ['ls-files', '-co', '-s', '--exclude-standard', '-z']);
  if (listed === null) return null;

  const md: string[] = [];
  const nested: string[] = [];
  for (const entry of listed.split('\0')) {
    if (!entry) continue;
    const staged = STAGED.exec(entry);
    const path = staged ? staged[2]! : entry;
    if (staged?.[1] === '160000') nested.push(path);
    else if (!staged && path.endsWith('/')) nested.push(path.slice(0, -1));
    else if (MD_EXT.test(path)) md.push(path);
  }
  if (includeIgnored) {
    const ignored = await git(dir, ['ls-files', '-o', '-i', '--exclude-standard', '-z']);
    if (ignored) md.push(...ignored.split('\0').filter((p) => MD_EXT.test(p)));
  }
  return { md, nested };
}

/** A cached `ls-files -s` entry: mode, object, stage, tab, path. */
const STAGED = /^(\d{6}) [0-9a-f]+ \d\t([^]*)$/;

/**
 * Lists the Markdown of the repository `repo` from `dir` into `out` under the root-relative
 * `prefix`, then every repository nested in it the same way — a checked-out submodule or an
 * embedded clone — unless it is past `maxDepth` or under a denied directory. False when git
 * could not list `dir`.
 */
async function listRepo(
  repo: string,
  dir: string,
  prefix: string,
  ctx: { rules: IgnoreRules; includeIgnored: boolean; maxDepth: number; out: Map<string, string | undefined>; repos: string[] },
): Promise<boolean> {
  const listed = await listViaGit(dir, ctx.includeIgnored);
  if (!listed) return false;
  for (const p of listed.md) ctx.out.set(prefix ? `${prefix}/${p}` : p, repo);

  await Promise.all(
    listed.nested.map(async (p) => {
      const rel = prefix ? `${prefix}/${p}` : p;
      const segs = rel.split('/');
      if (segs.length > ctx.maxDepth || segs.some((seg) => isDenied(ctx.rules, seg))) return;
      const abs = join(dir, p);
      // An uninitialised submodule is an empty directory: nothing to list.
      if (!existsSync(join(abs, '.git'))) return;
      if (await listRepo(abs, abs, rel, ctx)) ctx.repos.push(abs);
    }),
  );
  return true;
}

/**
 * Walk for .md files and nested repositories at once, stopping at every repo boundary so the
 * git listing can take over there. `~/src` resolves to ~40 repos in one shallow pass this way.
 */
async function walk(
  dir: string,
  rules: IgnoreRules,
  depth: number,
  maxDepth: number,
  found: { files: string[]; repos: string[] },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((e) => e.name === '.git')) {
    found.repos.push(dir);
    return;
  }

  const subdirs: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!isDenied(rules, entry.name) && !entry.name.startsWith('.')) subdirs.push(join(dir, entry.name));
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      found.files.push(join(dir, entry.name));
    }
  }

  if (depth >= maxDepth) return;
  await Promise.all(subdirs.map((sub) => walk(sub, rules, depth + 1, maxDepth, found)));
}

export async function scanRoot(root: Root, rules: IgnoreRules, opts: ScanOptions = {}): Promise<ScanResult> {
  const { includeIgnored = false, noGit = false, maxDepth = 12 } = opts;

  const relPaths = new Map<string, string | undefined>(); // root-relative path -> owning repo
  const repos: string[] = [];
  let degraded = false;

  const ownRepo = noGit ? null : await repoToplevel(root.path);

  // A root its own repository ignores — a build directory, a scratch folder — lists
  // as completely empty. Git is not wrong: nothing there is tracked, and nothing there ever
  // will be. But the user pointed mdhouse at that directory on purpose, so fall through to the
  // filesystem walk and show what is actually in it.
  const gitBlind = ownRepo !== null && (await isIgnoredByGit(root.path));

  const ctx = { rules, includeIgnored, maxDepth, out: relPaths, repos };
  if (ownRepo && !gitBlind) {
    // The root is inside a repository: one listing covers the whole subtree.
    repos.push(ownRepo);
    if (!(await listRepo(ownRepo, root.path, '', ctx))) degraded = true;
  } else {
    // Not a repo: walk for loose files and for repositories nested below.
    const found = { files: [] as string[], repos: [] as string[] };
    await walk(root.path, rules, 0, maxDepth, found);

    for (const abs of found.files) relPaths.set(relative(root.path, abs).split(sep).join('/'), undefined);

    for (const repo of found.repos) {
      repos.push(repo);
      const prefix = relative(root.path, repo).split(sep).join('/');

      if (noGit || !(await listRepo(repo, repo, prefix, ctx))) {
        // No git here after all — glob this subtree instead of losing it.
        degraded = true;
        const glob = new Bun.Glob('**/*.{md,mdx,MD}');
        for await (const p of glob.scan({ cwd: repo, onlyFiles: true, dot: false })) {
          relPaths.set(prefix ? `${prefix}/${p}` : p, repo);
        }
      }
    }
  }

  const files: MdFile[] = [];
  await Promise.all(
    [...relPaths].map(async ([rel, repo]) => {
      if (!passesDeny(rel, rules)) return;
      const info = await stat(join(root.path, rel)).catch(() => null);
      if (!info || !info.isFile()) return;

      const slash = rel.lastIndexOf('/');
      files.push({
        rel,
        name: slash === -1 ? rel : rel.slice(slash + 1),
        dir: slash === -1 ? '' : rel.slice(0, slash),
        mtime: info.mtimeMs,
        size: info.size,
        repo,
      });
    }),
  );

  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }));
  return { files, repos: [...new Set(repos)], scannedAt: Date.now(), degraded };
}

/** A file of any type under a folder — the folder page's ALL view. */
export interface AnyFile {
  rel: string;
  name: string;
  dir: string;
  mtime: number;
  size: number;
}

/** At most this many files: a folder page is not a file manager. */
const LIST_CAP = 5000;

/**
 * Every file under `abs` (a folder inside the root at `rootPath`), root-relative: in a repository
 * what git lists (tracked plus untracked-not-ignored, so `.gitignore` holds), elsewhere — and in a
 * folder its repository ignores, as `scanRoot` does — a walk that skips dot-folders and `node_modules`. `capped` says the list was cut at LIST_CAP.
 */
export async function listFiles(rootPath: string, abs: string, opts: { noGit?: boolean } = {}): Promise<{ files: AnyFile[]; capped: boolean }> {
  const viaGit = !opts.noGit && (await repoToplevel(abs)) !== null && !(await isIgnoredByGit(abs));
  let paths = viaGit ? ((await git(abs, ['ls-files', '-co', '--exclude-standard', '-z']))?.split('\0').filter(Boolean) ?? null) : null;
  if (!paths) {
    paths = [];
    for await (const p of new Bun.Glob('**/*').scan({ cwd: abs, onlyFiles: true, dot: false })) {
      if (p.split('/').some((seg) => seg === 'node_modules')) continue;
      paths.push(p);
      if (paths.length > LIST_CAP) break;
    }
  }
  const capped = paths.length > LIST_CAP;
  const prefix = relative(rootPath, abs).split(sep).join('/');
  const files: AnyFile[] = [];
  await Promise.all(
    paths.slice(0, LIST_CAP).map(async (p) => {
      const info = await stat(join(abs, p)).catch(() => null);
      if (!info?.isFile()) return;
      const rel = prefix ? `${prefix}/${p}` : p;
      const slash = rel.lastIndexOf('/');
      files.push({ rel, name: rel.slice(slash + 1), dir: slash === -1 ? '' : rel.slice(0, slash), mtime: info.mtimeMs, size: info.size });
    }),
  );
  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }));
  return { files, capped };
}
