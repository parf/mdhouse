#!/usr/bin/env bun
/**
 * `mdhouse [dir ...] [options]`
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Registry } from './lib/roots';
import { Prefs } from './lib/prefs';
import { serve } from './server';
import { askDaemon } from './lib/control';

const USAGE = `mdhouse — browse every .md file under a directory

  mdhouse [dir ...] [options]

Options
  -p, --port <n>       port to listen on            (default 7777)
  -h, --host <addr>    address to bind              (default 127.0.0.1)
  -o, --open           open a browser on start
  -a, --all            include gitignored .md files
      --git-log <n>    commits scanned for git recents (default 200)
      --no-git         skip git entirely; filesystem recents only
      --rw             allow mdhouse to write to the trees it serves
      --help           show this

With no directory, the current one is used.
`;

interface Options {
  dirs: string[];
  port: number;
  host: string;
  open: boolean;
  all: boolean;
  gitLog: number;
  noGit: boolean;
  rw: boolean;
}

function parse(argv: string[]): Options {
  const o: Options = {
    dirs: [],
    port: Number(process.env.MDHOUSE_PORT ?? 7777),
    host: process.env.MDHOUSE_HOST ?? '127.0.0.1',
    open: false,
    all: false,
    gitLog: 200,
    noGit: false,
    rw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';

    switch (arg) {
      case '-p': case '--port': o.port = Number(next()); break;
      case '-h': case '--host': o.host = next(); break;
      case '-o': case '--open': o.open = true; break;
      case '-a': case '--all': o.all = true; break;
      case '--git-log': o.gitLog = Number(next()); break;
      case '--no-git': o.noGit = true; break;
      case '--rw': o.rw = true; break;
      case '--help': console.log(USAGE); process.exit(0);
      default:
        if (arg.startsWith('-')) {
          console.error(`mdhouse: unknown option ${arg}\n`);
          console.error(USAGE);
          process.exit(2);
        }
        o.dirs.push(arg);
    }
  }

  if (!o.dirs.length) o.dirs.push(process.env.MDHOUSE_ROOT ?? process.cwd());
  return o;
}

const opts = parse(process.argv.slice(2));

const dirs: string[] = [];
for (const dir of opts.dirs) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    console.error(`mdhouse: not a directory: ${dir}`);
    process.exit(1);
  }
  dirs.push(abs);
}

const registry = await Registry.create(dirs, opts.rw);
const prefs = await Prefs.load();

/** The root list, ids and paths in columns: `+` for one just added, `·` for one already served. */
const printRoots = (
  roots: Array<{ id: string; path: string; writable: boolean; added?: boolean; asked?: boolean }>,
  showIds: boolean,
): void => {
  const width = Math.max(...roots.map((r) => r.id.length)) + 2;
  for (const root of roots) {
    const mark = root.added ? '+' : root.asked ? '·' : ' ';
    const id = showIds ? root.id.padEnd(width) : '';
    console.log(`${mark} ${id}${root.path}${root.writable ? '  [RW]' : ''}`);
  }
};

const openBrowser = (target: string): void => {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  Bun.spawn([opener, target], { stdout: 'ignore', stderr: 'ignore' }).unref();
};

let started: Awaited<ReturnType<typeof serve>>;
try {
  started = await serve({
    registry,
    prefs,
    port: opts.port,
    hostname: opts.host,
    noGit: opts.noGit,
    gitLogLimit: opts.gitLog,
    includeIgnoredDefault: opts.all,
  });
} catch (err) {
  const code = (err as { code?: string }).code;
  if (code !== 'EADDRINUSE') throw err;

  /**
   * The port is taken. If an mdhouse is behind it, hand it these directories rather than
   * failing: `mdhouse <dir>` should end on a page, not on an error telling you to pick a
   * port. The daemon adds them to what it already serves — it never swaps its trees out from
   * under a tab someone is reading.
   */
  const reply = await askDaemon(opts.port, { dirs, rw: opts.rw });
  if (!reply) {
    console.error(`mdhouse: port ${opts.port} is in use by something that is not mdhouse.`);
    console.error('         Stop it, or pass --port <n>.');
    process.exit(1);
  }
  if ('error' in reply) {
    console.error(`mdhouse: the mdhouse on ${opts.port} refused: ${reply.error}`);
    process.exit(1);
  }

  const grew = reply.roots.some((r) => r.added);
  console.log(`mdhouse  ${reply.url}  (already running — ${grew ? 'added to it' : 'already serving that'})`);
  printRoots(reply.roots, reply.roots.length > 1);

  // Writability belongs to a root, and this one already exists with its own answer. Say so
  // rather than pretending `--rw` did something.
  for (const root of reply.roots) {
    if (root.asked && !root.added && opts.rw && !root.writable) {
      console.log(`\n  ${root.path} is already served read-only.`);
      console.log('  Stop that mdhouse and start it again with --rw to change that.');
    }
  }

  const fresh = reply.roots.find((r) => r.asked);
  const target =
    fresh && reply.roots.length > 1 ? `${reply.url}/?root=${encodeURIComponent(fresh.id)}` : reply.url;
  if (opts.open) openBrowser(target);
  process.exit(0);
}
const { server, watcher, control } = started;

const url = `http://${opts.host}:${server.port}`;
console.log(`mdhouse  ${url}`);
printRoots(registry.list(), !registry.single);
if (!opts.rw) {
  console.log('\n  Read-only — mdhouse will not write to these trees. Pass --rw to allow it.');
}

if (opts.open) openBrowser(url);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    watcher.close();
    control?.stop();
    server.stop(true);
    process.exit(0);
  });
}
