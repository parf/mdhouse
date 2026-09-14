/**
 * Finding every .md file under a root.
 *
 * The r-doc viewer globs its whole tree and then subtracts a hardcoded skip list. That is both
 * slow and blind to `.gitignore`. mdHouse asks git instead: one `git ls-files` per repository
 * returns tracked plus untracked-but-not-ignored files, so `.gitignore` is honoured with no
 * configuration at all. Globbing is the fallback for ground that is not in any repo.
 */

import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Root } from './roots';
import { isDenied, type IgnoreRules } from './ignore';

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

const MD = /\.mdx?$/i;

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
 * One process, no pathspec arithmetic.
 */
async function listViaGit(dir: string, includeIgnored: boolean): Promise<string[] | null> {
  const tracked = await git(dir, ['ls-files', '-co', '--exclude-standard', '-z']);
  if (tracked === null) return null;

  const paths = tracked.split('\0').filter(Boolean);
  if (includeIgnored) {
    const ignored = await git(dir, ['ls-files', '-o', '-i', '--exclude-standard', '-z']);
    if (ignored) paths.push(...ignored.split('\0').filter(Boolean));
  }
  return paths.filter((p) => MD.test(p));
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
    } else if (entry.isFile() && MD.test(entry.name)) {
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

  if (ownRepo && !gitBlind) {
    // The root is inside a repository: one listing covers the whole subtree.
    repos.push(ownRepo);
    const listed = await listViaGit(root.path, includeIgnored);
    if (listed) for (const p of listed) relPaths.set(p, ownRepo);
    else degraded = true;
  } else {
    // Not a repo: walk for loose files and for repositories nested below.
    const found = { files: [] as string[], repos: [] as string[] };
    await walk(root.path, rules, 0, maxDepth, found);

    for (const abs of found.files) relPaths.set(relative(root.path, abs).split(sep).join('/'), undefined);

    for (const repo of found.repos) {
      repos.push(repo);
      const listed = noGit ? null : await listViaGit(repo, includeIgnored);
      const prefix = relative(root.path, repo).split(sep).join('/');

      if (listed) {
        for (const p of listed) relPaths.set(prefix ? `${prefix}/${p}` : p, repo);
      } else {
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
