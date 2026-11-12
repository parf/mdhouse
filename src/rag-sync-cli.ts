import { createHash } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ownName, validTarget } from './lib/agent-bus';
import { cite } from './lib/rag-cite';
import { planRagSync, RagSyncPlanError, type RagSyncPlan, type RagSyncPlanInput } from './lib/rag-sync-plan';
import { openBus, RagBusError, type BusOptions, type RagBus } from './lib/rag-sync-bus';
import { runSearch, runSync, RagSyncRuntimeError, type Citation, type SyncRunResult } from './lib/rag-sync-runtime';
import { Registry } from './lib/roots';

/**
 * `mdhouse-rag-sync` — the separate, on-demand RAG sync bin.
 *
 * `plan` lists a root's Markdown files by metadata (path, size, mtime) and prints what a sync would
 * send where; it reads no file content, credential or network. `sync --apply` asks the owner-
 * provisioned FileScan for one finite sync; `search` asks the RAG once. Both go through the
 * account socket as `#mdhouse@<host>` and only for a complete listing. Importing this module does
 * nothing; the bin calls `main`.
 */

/** Files above this size need the RAG's large-file support; the plan lists them, never drops them. */
export const OVERSIZE_BYTES = 32_768;
/** Walk bounds; reaching one stops the walk and marks the listing incomplete. */
export const LIMITS = { files: 10_000, dirs: 5_000, depth: 32 } as const;
/** Names never walked into or listed, at any depth, besides dot entries (`.git`, `.scratch`, dotfiles). */
export const EXCLUDED_NAMES = ['node_modules', 'bower_components', 'jspm_packages'] as const;
/** The same exclusions in the planner's grammar. */
export const EXCLUDE_GLOBS = ['**/.*', ...EXCLUDED_NAMES.map((n) => `**/${n}/**`)];

export const EXIT = { ok: 0, runtime: 1, usage: 2, unknown: 4, incomplete: 5 } as const;

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const stdio: Io = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
};

export const HELP = `mdhouse-rag-sync — sync one folder's Markdown files to RAG, on demand

Usage:
  mdhouse-rag-sync plan   <target>
  mdhouse-rag-sync sync   <target> --apply [--until-done]
  mdhouse-rag-sync search <target> --query <text> [--mode keyword|semantic|hybrid] [--paid] [--limit 1-16]
  mdhouse-rag-sync --help

  <target>  --root <dir> --filescan #filescan/<instance>@<realm> --rag #rag/<instance>@<realm>
            --namespace <ns> --table <name>

plan prints a JSON sync plan: the root's *.md files (path, size, mtime — never their content),
files over ${OVERSIZE_BYTES / 1024} KiB (they need the RAG's large-file support, checked before a sync), entries it
could not list and why, and the target. It makes no network or Agent Bus call and reads no credential. Dot entries (.git,
.scratch, dotfiles) and ${EXCLUDED_NAMES.join(', ')} are not walked; symlinks and special files
are never followed.

sync asks the FileScan for one finite sync and prints its answer. It sends only with --apply and
a complete listing; a file sent before with no confirmation is sent again, and each send is paid.
--until-done repeats the sync until every file is confirmed: 5 s after progress, doubling to
15 min while nothing moves (provider down or throttled); it stops on a refusal. search asks the RAG once; keyword is free, semantic and hybrid need --paid.
Both talk as #mdhouse@<host> through the local account socket.

Exit: 0 ok · 1 error, refused or failed · 2 usage · 4 outcome unknown · 5 sync incomplete
`;

/** Thrown for a bad command line; the message never repeats an argument's value. */
class UsageError extends Error {}

const TARGET = ['root', 'filescan', 'rag', 'namespace', 'table'] as const;
const SPEC = {
  plan: { values: TARGET, bools: [] },
  sync: { values: TARGET, bools: ['apply', 'until-done'] },
  search: { values: [...TARGET, 'query', 'mode', 'limit'], bools: ['paid'] },
} as const satisfies Record<string, { values: readonly string[]; bools: readonly string[] }>;
export type Command = keyof typeof SPEC;
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** The exact provisioned instances: never a root `#rag`, `#ai` or another service. */
const FILESCAN = /^#filescan\/[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*$/;
const RAG = /^#rag\/[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*$/;
export const MODES = ['keyword', 'semantic', 'hybrid'] as const;
export type Mode = (typeof MODES)[number];

export interface Args {
  root: string;
  filescan: string;
  rag: string;
  namespace: string;
  table: string;
  query?: string;
  mode?: Mode;
  limit?: number;
  apply: boolean;
  untilDone: boolean;
  paid: boolean;
}

/** `--flag value` / `--flag=value` and bare `--switch`, each at most once; the command's flags only. */
export function parseArgs(cmd: Command, args: readonly string[]): Args {
  const spec: { values: readonly string[]; bools: readonly string[] } = SPEC[cmd];
  const vals: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const m = /^--([a-z][a-z-]{0,31})(?:=(.*))?$/s.exec(a);
    const name = m?.[1];
    if (!name || (!spec.values.includes(name) && !spec.bools.includes(name))) {
      throw new UsageError(m ? `unknown option --${name}` : /^--[a-z][a-z-]{0,31}=/.test(a) ? `unknown option ${a.split('=')[0]}` : `unexpected argument ${i + 1}`);
    }
    if (name in vals || bools.has(name)) throw new UsageError(`--${name} given twice`);
    if (spec.bools.includes(name)) {
      if (m![2] !== undefined) throw new UsageError(`--${name} takes no value`);
      bools.add(name);
      continue;
    }
    const value = m![2] ?? args[++i];
    if (value === undefined || value === '') throw new UsageError(`--${name} needs a value`);
    vals[name] = value;
  }
  for (const f of TARGET) if (vals[f] === undefined) throw new UsageError(`--${f} is required`);
  if (!validTarget(vals.filescan) || !FILESCAN.test(vals.filescan!)) throw new UsageError('--filescan must be a #filescan/<instance>@<realm> agent');
  if (!validTarget(vals.rag) || !RAG.test(vals.rag!)) throw new UsageError('--rag must be a #rag/<instance>@<realm> agent');
  if (!NAME.test(vals.namespace!)) throw new UsageError('--namespace must be 1–64 of a-z 0-9 _ -, starting with a letter or digit');
  if (!NAME.test(vals.table!)) throw new UsageError('--table must be 1–64 of a-z 0-9 _ -, starting with a letter or digit');
  const out: Args = {
    root: vals.root!,
    filescan: vals.filescan!,
    rag: vals.rag!,
    namespace: vals.namespace!,
    table: vals.table!,
    apply: bools.has('apply'),
    untilDone: bools.has('until-done'),
    paid: bools.has('paid'),
  };
  if (cmd === 'sync' && !out.apply) throw new UsageError('sync sends paid work: add --apply (see plan first)');
  if (cmd === 'search') {
    if (vals.query === undefined) throw new UsageError('--query is required');
    out.query = vals.query;
    if (vals.mode !== undefined) {
      if (!(MODES as readonly string[]).includes(vals.mode)) throw new UsageError(`--mode must be one of ${MODES.join(', ')}`);
      out.mode = vals.mode as Mode;
    }
    if ((out.mode ?? 'keyword') !== 'keyword' && !out.paid) throw new UsageError(`--mode ${out.mode} is paid: add --paid`);
    if (vals.limit !== undefined) {
      if (!/^(?:[1-9]|1[0-6])$/.test(vals.limit)) throw new UsageError('--limit must be 1–16');
      out.limit = Number(vals.limit);
    }
  }
  return out;
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
        // FileScan's include also matches a path's directories: every file under it would be sent
        if (e.name.endsWith('.md')) issues.push({ path, reason: 'unsupported' });
        else if (!(await walk(path, depth + 1))) return false;
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
export function planInput(args: Args, inv: Inventory, caller: string): RagSyncPlanInput {
  return {
    caller,
    target: { filescan: args.filescan, rag: args.rag, namespace: args.namespace, table: args.table },
    root: inv.root,
    include: ['*.md'],
    exclude: EXCLUDE_GLOBS,
    inventory: { root: inv.root, complete: inv.complete, issues: [...inv.issues] },
    sources: [...inv.sources],
    oversizeLimit: OVERSIZE_BYTES,
  };
}

/** How long one request waits for its answer. */
export const REPLY_MS = { sync: 120_000, search: 60_000 } as const;

export interface Deps {
  /** Opens the Agent Bus session; tests inject a fake daemon. */
  openBus: (opts: BusOptions) => Promise<RagBus>;
  /** Waits between `--until-done` rounds; tests inject a fake clock. */
  sleep?: (ms: number) => Promise<void>;
}

/** `--until-done` pacing: the wait after a round with progress, and the cap it doubles to without. */
export const BACKOFF = { baseMs: 5_000, maxMs: 900_000 } as const;

/**
 * Repeats `once` until the sync is confirmed. Retries a reported or unknown outcome, and a refusal
 * before sending once a round has reached the FileScan (the provider went down); a first-round
 * refusal stops it. Waits `baseMs` after a round that confirmed more, else doubles up to `maxMs`.
 * Prints one progress line per round to stderr and the last result to stdout.
 */
export async function untilDone(once: () => Promise<SyncRunResult>, io: Io, sleep: (ms: number) => Promise<void>, backoff: { baseMs: number; maxMs: number } = BACKOFF): Promise<number> {
  let delay = backoff.baseMs;
  let best = -1;
  let reached = false;
  for (let round = 1; ; round++) {
    const res = await once();
    const code = resultExit('sync', res);
    const r = res.report;
    io.err(`round ${round}: ${res.result ?? res.effect}${r ? ` — confirmed ${r.confirmed}, remaining ${r.remaining}, sent ${r.sent}` : ''}${res.reason ? ` (${res.reason})` : ''}\n`);
    const retry = res.effect === 'unknown' || (res.effect === 'reported' && r !== null) || (reached && res.effect === 'notsent');
    if (code === EXIT.ok || !retry) {
      io.out(`${JSON.stringify(res, null, 2)}\n`);
      return code;
    }
    if (res.effect !== 'notsent') reached = true;
    const progress = !!r && r.confirmed > best;
    if (r) best = Math.max(best, r.confirmed);
    delay = progress ? backoff.baseMs : Math.min(delay * 2, backoff.maxMs);
    await sleep(delay);
  }
}

/** 0 only for a confirmed sync or a reported search; an outcome that may have happened is 4. */
export function resultExit(cmd: 'sync' | 'search', r: { effect: string; result: unknown }): number {
  if (r.effect === 'unknown') return EXIT.unknown;
  if (r.effect !== 'reported' || r.result === null) return EXIT.runtime;
  if (cmd === 'search') return EXIT.ok;
  return r.result === 'confirmed' ? EXIT.ok : r.result === 'incomplete' ? EXIT.incomplete : r.result === 'unknown' ? EXIT.unknown : EXIT.runtime;
}

/** Local files larger than this are not read for a citation. */
const CITE_MAX_BYTES = 1_048_576;

/**
 * Fills in `lines` and `heading_path` for the records the RAG returned without them. The record's
 * `source` is looked up only through the root's jailed path resolution; a file that is not there, not
 * Markdown or not a plain file leaves its record as it was. A file whose sha256 differs from the
 * record's `content_hash` marks the record `stale: true` — no citation; an excerpt not found in the
 * file leaves the record as it was.
 */
export async function citeRecords(records: readonly Citation[], rootPath: string): Promise<Array<Citation & { stale?: true }>> {
  const registry = await Registry.create([rootPath], false);
  const id = registry.list()[0]!.id;
  const files = new Map<string, Promise<{ hash: string; text: string } | null>>();
  const load = (source: string) => {
    let f = files.get(source);
    if (!f) {
      f = (async () => {
        if (!source.endsWith('.md')) return null;
        const loc = await registry.resolve(`${id}/${source}`);
        if (!loc) return null;
        try {
          const st = await stat(loc.abs);
          if (!st.isFile() || st.size > CITE_MAX_BYTES) return null;
          const bytes = await readFile(loc.abs);
          return { hash: createHash('sha256').update(bytes).digest('hex'), text: bytes.toString('utf8') };
        } catch {
          return null;
        }
      })();
      files.set(source, f);
    }
    return f;
  };
  return Promise.all(
    records.map(async (r) => {
      if (r.lines) return r;
      const file = await load(r.source);
      if (!file) return r;
      if (file.hash !== r.content_hash.toLowerCase()) {
        const { heading_path: _h, lines: _l, ...rest } = r;
        return { ...rest, stale: true as const };
      }
      const found = cite(file.text, r.excerpt);
      return found ? { ...r, ...found } : r;
    }),
  );
}

/** Runs one command line; returns the exit code. */
export async function main(argv: readonly string[], io: Io = stdio, deps: Deps = { openBus }): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    io.out(HELP);
    return cmd === undefined ? EXIT.usage : EXIT.ok;
  }
  if (cmd !== 'plan' && cmd !== 'sync' && cmd !== 'search') {
    io.err(`mdhouse-rag-sync: unknown command — see --help\n`);
    return EXIT.usage;
  }
  const fail = (msg: string, code: number = EXIT.runtime) => {
    io.err(`mdhouse-rag-sync: ${msg}\n`);
    return code;
  };
  let args: Args;
  try {
    args = parseArgs(cmd, rest);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    return fail(err.message, EXIT.usage);
  }
  let inv: Inventory;
  try {
    inv = await inventory(args.root);
  } catch (err) {
    return fail(err instanceof InventoryError ? err.message : `cannot list the root: ${(err as NodeJS.ErrnoException).code ?? 'error'}`);
  }
  const input = planInput(args, inv, ownName());

  if (cmd === 'plan') {
    let plan: RagSyncPlan;
    try {
      plan = planRagSync(input);
    } catch (err) {
      if (!(err instanceof RagSyncPlanError)) throw err;
      return fail(`the plan was refused: ${err.message}`);
    }
    io.out(`${JSON.stringify(plan, null, 2)}\n`);
    return inv.complete ? EXIT.ok : fail('the listing is incomplete — see inventory issues');
  }

  // nothing reaches the bus for a listing that cannot be proven whole
  if (!inv.complete) return fail('the listing is incomplete — run plan to see why; nothing was sent');
  try {
    const bus = await deps.openBus({ replyMs: REPLY_MS[cmd], root: inv.root, targets: [args.filescan, args.rag] });
    if (cmd === 'sync') {
      const ownerConfig = await bus.ownerConfig(args.filescan);
      const once = () => runSync({ plan: input, ownerConfig, intent: { apply: args.apply } }, bus);
      if (args.untilDone) return await untilDone(once, io, deps.sleep ?? ((ms) => Bun.sleep(ms)));
      const res = await once();
      io.out(`${JSON.stringify(res, null, 2)}\n`);
      return resultExit('sync', res);
    }
    const res = await runSearch(
      { plan: input, query: args.query!, ...(args.mode ? { mode: args.mode } : {}), ...(args.limit ? { limit: args.limit } : {}), intent: { paid: args.paid } },
      bus,
    );
    const cited = res.result ? { ...res, result: { ...res.result, records: await citeRecords(res.result.records, inv.root.path) } } : res;
    io.out(`${JSON.stringify(cited, null, 2)}\n`);
    return resultExit('search', res);
  } catch (err) {
    if (err instanceof RagBusError || err instanceof RagSyncRuntimeError) return fail(`${cmd} refused: ${err.message}; nothing was sent`);
    throw err;
  }
}
