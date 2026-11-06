import type { Dirent, Stats } from 'node:fs';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ownName, validTarget } from './lib/agent-bus';
import { planRagSync, RagSyncPlanError, type RagSyncPlan } from './lib/rag-sync-plan';
import { Registry } from './lib/roots';

/**
 * `mdhouse-rag-sync` — the separate, on-demand RAG sync bin.
 *
 * Today it plans only: `plan` lists a root's Markdown files by metadata (path, size, mtime) and
 * prints what a sync would send where. It reads no file content, makes no network or Agent Bus
 * call, reads no credential and starts nothing. `sync` and `search` are not wired yet and say so.
 * Importing this module does nothing; the bin calls `main`.
 */

/** Files above this size are skipped by the current RAG sink — listed, never dropped silently. */
export const OVERSIZE_BYTES = 32 * 1024;
/** Walk bounds; reaching one stops the walk and marks the listing incomplete. */
export const LIMITS = { files: 10_000, dirs: 5_000, depth: 32 } as const;
/** Names never walked into or listed, at any depth, besides dot entries (`.git`, `.scratch`, dotfiles). */
export const EXCLUDED_NAMES = ['node_modules', 'bower_components', 'jspm_packages'] as const;
/** The same exclusions in the planner's grammar. */
export const EXCLUDE_GLOBS = ['**/.*', ...EXCLUDED_NAMES.map((n) => `**/${n}/**`)];

export const EXIT = { ok: 0, runtime: 1, usage: 2, notWired: 3 } as const;

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const stdio: Io = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
};

export const HELP = `mdhouse-rag-sync — plan a RAG sync of one folder's Markdown files

Usage:
  mdhouse-rag-sync plan --root <dir> --filescan <agent> --rag <agent> --namespace <ns> --table <name>
  mdhouse-rag-sync sync …     not wired yet: exits 3, does nothing
  mdhouse-rag-sync search …   not wired yet: exits 3, does nothing
  mdhouse-rag-sync --help

plan prints a JSON sync plan: the root's *.md files (path, size, mtime — never their content),
files over ${OVERSIZE_BYTES / 1024} KiB that the RAG sink skips today, entries it could not list and why, and the
target it would sync to. It makes no network or Agent Bus call and reads no credential. Dot
entries (.git, .scratch, dotfiles) and ${EXCLUDED_NAMES.join(', ')} are not walked; symlinks and
special files are never followed. The plan is a local preview: nothing is synced or verified.

Exit: 0 ok · 1 error or incomplete listing (the plan is still printed) · 2 usage · 3 not wired
`;

/** Thrown for a bad command line; the message never repeats an argument's value. */
class UsageError extends Error {}

const FLAGS = ['root', 'filescan', 'rag', 'namespace', 'table'] as const;
type Flag = (typeof FLAGS)[number];
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `--flag value` and `--flag=value` for the five plan flags, each exactly once. */
export function parsePlanArgs(args: readonly string[]): Record<Flag, string> {
  const got: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const m = /^--([a-z]+)(?:=(.*))?$/s.exec(a);
    const flag = m && (FLAGS as readonly string[]).includes(m[1]!) ? (m[1] as Flag) : null;
    if (!flag) {
      const named = /^--[a-z][a-z-]{0,31}$/.test(a.split('=')[0]!) ? `unknown option ${a.split('=')[0]}` : `unexpected argument ${i + 1}`;
      throw new UsageError(named);
    }
    if (flag in got) throw new UsageError(`--${flag} given twice`);
    const value = m![2] ?? args[++i];
    if (value === undefined || value === '') throw new UsageError(`--${flag} needs a value`);
    got[flag] = value;
  }
  for (const f of FLAGS) if (got[f] === undefined) throw new UsageError(`--${f} is required`);
  const v = got as Record<Flag, string>;
  if (!validTarget(v.filescan)) throw new UsageError('--filescan is not an agent name');
  if (!validTarget(v.rag)) throw new UsageError('--rag is not an agent name');
  if (!NAME.test(v.namespace)) throw new UsageError('--namespace must be 1–64 of a-z 0-9 _ -, starting with a letter or digit');
  if (!NAME.test(v.table)) throw new UsageError('--table must be 1–64 of a-z 0-9 _ -, starting with a letter or digit');
  return v;
}

export interface Source {
  /** Root-relative, `/`-separated. */
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export type IssueReason = 'unreadable' | 'changed' | 'limit' | 'unsupported';
export interface Issue {
  readonly path: string;
  readonly reason: IssueReason;
}

/** A root's identity: its real path and device/inode, decimal. */
export interface RootId {
  readonly path: string;
  readonly dev: string;
  readonly ino: string;
}

export interface Inventory {
  readonly root: RootId;
  /** True only when there is no issue: any issue makes the listing partial. */
  readonly complete: boolean;
  readonly issues: readonly Issue[];
  readonly sources: readonly Source[];
}

/** Thrown when `--root` is not a readable directory. */
export class InventoryError extends Error {}

const errno = (err: unknown) => (err as NodeJS.ErrnoException).code;

/**
 * Lists the root's regular `*.md` files by metadata, through a read-only one-root Registry: every
 * file is resolved by `registry.resolve` and kept only if it resolves to the walked path. Dot
 * entries and dependency trees are not walked; symlinks and special files are never followed and
 * become `unsupported` issues. Any issue makes it incomplete; a bound reached stops the walk.
 */
export async function inventory(rootArg: string, limits: { files: number; dirs: number; depth: number } = LIMITS): Promise<Inventory> {
  const real = await realpath(rootArg).catch(() => null);
  const rst = real ? await stat(real, { bigint: true }).catch(() => null) : null;
  if (!real || !rst?.isDirectory()) throw new InventoryError('--root is not a readable directory');
  const root: RootId = { path: real, dev: String(rst.dev), ino: String(rst.ino) };
  const registry = await Registry.create([real], false);
  const id = registry.list()[0]!.id;

  const sources: Source[] = [];
  const issues: Issue[] = [];
  let dirs = 0;
  /** Returns false once a bound is reached: the walk stops. */
  const walk = async (rel: string, depth: number): Promise<boolean> => {
    if (++dirs > limits.dirs || depth > limits.depth) {
      issues.push({ path: rel, reason: 'limit' });
      return false;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(join(real, rel), { withFileTypes: true });
    } catch (err) {
      issues.push({ path: rel, reason: errno(err) === 'ENOENT' ? 'changed' : 'unreadable' });
      return true;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.name.startsWith('.') || (EXCLUDED_NAMES as readonly string[]).includes(e.name)) continue;
      const path = rel ? `${rel}/${e.name}` : e.name;
      let st: Stats;
      try {
        st = await lstat(join(real, path));
      } catch (err) {
        issues.push({ path, reason: errno(err) === 'ENOENT' ? 'changed' : 'unreadable' });
        continue;
      }
      if (st.isDirectory()) {
        if (!(await walk(path, depth + 1))) return false;
      } else if (st.isSymbolicLink() || !st.isFile()) {
        issues.push({ path, reason: 'unsupported' });
      } else if (e.name.endsWith('.md')) {
        const loc = await registry.resolve(`${id}/${path}`);
        if (!loc || loc.abs !== join(real, path)) {
          issues.push({ path, reason: 'unsupported' });
          continue;
        }
        if (sources.length >= limits.files) {
          issues.push({ path, reason: 'limit' });
          return false;
        }
        sources.push({ path, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
    return true;
  };
  await walk('', 0);
  return { root, complete: issues.length === 0, issues, sources };
}

/** The planner's input for one `plan` run. */
export function planInput(args: Record<Flag, string>, inv: Inventory, caller: string) {
  return {
    caller,
    target: { filescan: args.filescan, rag: args.rag, namespace: args.namespace, table: args.table },
    root: inv.root,
    include: ['*.md'],
    exclude: EXCLUDE_GLOBS,
    inventory: { root: inv.root, complete: inv.complete, issues: inv.issues },
    sources: inv.sources,
    oversizeLimit: OVERSIZE_BYTES,
  };
}

/** Runs one command line; returns the exit code. */
export async function main(argv: readonly string[], io: Io = stdio): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    io.out(HELP);
    return cmd === undefined ? EXIT.usage : EXIT.ok;
  }
  if (cmd === 'sync' || cmd === 'search') {
    io.err(`mdhouse-rag-sync: ${cmd} is not wired yet — nothing was done\n`);
    io.out(`${JSON.stringify({ error: 'not-wired', command: cmd, effects: 'none' })}\n`);
    return EXIT.notWired;
  }
  if (cmd !== 'plan') {
    io.err(`mdhouse-rag-sync: unknown command — see --help\n`);
    return EXIT.usage;
  }
  let args: Record<Flag, string>;
  try {
    args = parsePlanArgs(rest);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.err(`mdhouse-rag-sync: ${err.message}\n`);
    return EXIT.usage;
  }
  let inv: Inventory;
  try {
    inv = await inventory(args.root);
  } catch (err) {
    io.err(`mdhouse-rag-sync: ${err instanceof InventoryError ? err.message : `cannot list the root: ${(err as NodeJS.ErrnoException).code ?? 'error'}`}\n`);
    return EXIT.runtime;
  }
  let plan: RagSyncPlan;
  try {
    plan = planRagSync(planInput(args, inv, ownName()));
  } catch (err) {
    if (!(err instanceof RagSyncPlanError)) throw err;
    io.err(`mdhouse-rag-sync: the plan was refused: ${err.message}\n`);
    return EXIT.runtime;
  }
  io.out(`${JSON.stringify(plan, null, 2)}\n`);
  if (!inv.complete) {
    io.err(`mdhouse-rag-sync: the listing is incomplete — see inventory issues\n`);
    return EXIT.runtime;
  }
  return EXIT.ok;
}
