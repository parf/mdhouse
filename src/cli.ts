#!/usr/bin/env bun
/**
 * `mdhouse [dir ...] [options]` and `mdhouse exit`.
 *
 * By default this process is only a launcher: it starts the real server detached, in its own
 * session, waits until it answers on the control socket, prints where it is, and returns the
 * terminal. The daemon outlives the shell that started it, so the way to stop it is
 * `mdhouse exit` rather than Ctrl+C. `--fg` keeps everything in one process instead.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Registry } from './lib/roots';
import { Prefs } from './lib/prefs';
import { serve } from './server';
import { askDaemon, askExit, askPing, knownPorts, type AddReply } from './lib/control';

const USAGE = `mdhouse — browse every .md file under a directory

  mdhouse [dir ...] [options]     start it (in the background)
  mdhouse exit [options]          stop the one running

Options
  -p, --port <n>       port to listen on            (default 7777)
  -h, --host <addr>    address to bind              (default 127.0.0.1)
  -o, --open           open a browser on start
  -a, --all            include gitignored .md files
                       with \`exit\`: stop every mdhouse, whatever its port
  -f, --fg             stay in the foreground; Ctrl+C stops it
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
  fg: boolean;
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
    fg: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';

    switch (arg) {
      case '-p': case '--port': o.port = Number(next()); break;
      case '-h': case '--host': o.host = next(); break;
      case '-o': case '--open': o.open = true; break;
      case '-a': case '--all': o.all = true; break;
      case '-f': case '--fg': case '--foreground': o.fg = true; break;
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

const argv = process.argv.slice(2);
const command = argv[0] === 'exit' || argv[0] === 'stop' ? 'exit' : 'serve';
const opts = parse(command === 'exit' ? argv.slice(1) : argv);

/** How to read what the daemon has said since it started. */
const LOG_HINT =
  process.platform === 'darwin'
    ? `log show --last 10m --predicate 'process == "logger"'`
    : 'journalctl -t mdhouse -n 20';

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

// ---------------------------------------------------------------- mdhouse exit

if (command === 'exit') {
  const ports = opts.all ? knownPorts() : [opts.port];
  let stopped = 0;

  for (const port of ports) {
    const who = await askExit(port);
    if (!who) continue;
    stopped++;
    console.log(`mdhouse  stopped ${who.url}  (pid ${who.pid})`);
    for (const root of who.roots) console.log(`  ${root.path}${root.writable ? '  [RW]' : ''}`);
  }

  if (!stopped) {
    console.error(
      opts.all ? 'mdhouse: nothing running.' : `mdhouse: nothing running on port ${opts.port}.`,
    );
    // A daemon on another port is the likely reason someone is here; naming it saves a hunt.
    const live = (await Promise.all(knownPorts().map(async (p) => ((await askPing(p)) ? p : null))))
      .filter((p): p is number => p !== null);
    if (live.length) console.error(`         Running on: ${live.join(', ')}  (mdhouse exit --port <n>)`);
    process.exit(1);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- mdhouse [dir ...]

const dirs: string[] = [];
for (const dir of opts.dirs) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    console.error(`mdhouse: not a directory: ${dir}`);
    process.exit(1);
  }
  dirs.push(abs);
}

/**
 * Hand these directories to the mdhouse already on the port and print what it now serves.
 *
 * Adding rather than replacing is the daemon's decision, not this one's; here we only report
 * it. Never returns.
 */
async function handOver(reply: AddReply | { error: string } | null): Promise<never> {
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

  console.log(`\n  Stop it with:  mdhouse exit${opts.port === 7777 ? '' : ` --port ${opts.port}`}`);

  const fresh = reply.roots.find((r) => r.asked);
  const target =
    fresh && reply.roots.length > 1 ? `${reply.url}/?root=${encodeURIComponent(fresh.id)}` : reply.url;
  if (opts.open) openBrowser(target);
  process.exit(0);
}

const stopHint = `mdhouse exit${opts.port === 7777 ? '' : ` --port ${opts.port}`}`;

if (!opts.fg) {
  // Already running? Hand it the directories without starting anything.
  if (await askPing(opts.port)) await handOver(await askDaemon(opts.port, { dirs, rw: opts.rw }));

  // Nobody answered on the control socket, so if the port is taken it is taken by something
  // else. Finding that out here, rather than in a detached child whose output has gone to the
  // system log, is the difference between an answer and a hunt.
  try {
    Bun.serve({ port: opts.port, hostname: opts.host, reusePort: false, fetch: () => new Response('') }).stop(true);
  } catch (err) {
    if ((err as { code?: string }).code !== 'EADDRINUSE') throw err;
    console.error(`mdhouse: port ${opts.port} is in use by something that is not mdhouse.`);
    console.error('         Stop it, or pass --port <n>.');
    process.exit(1);
  }

  /**
   * Start the server detached and wait for it to answer.
   *
   * `setsid` puts it in a session of its own, so it survives the terminal closing and a later
   * Ctrl+C in that terminal never reaches it. Without setsid (macOS has no such binary) a
   * detached child still outlives its parent, which is the part that matters.
   *
   * Its output goes through `logger` to the system log rather than to a file of our own: a
   * background process that writes somewhere only it knows about is a process whose failures
   * nobody reads, and syslog is already rotated, timestamped and greppable.
   */
  const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  const self = [process.execPath, process.argv[1]!, ...argv, '--fg'].map(quote).join(' ');
  // Without `logger` there is nowhere to put the output; discard it rather than leave the
  // daemon writing into a pipe whose other end does not exist.
  const line = Bun.which('logger')
    ? `exec ${self} 2>&1 | exec logger -t mdhouse -p user.notice`
    : `exec ${self} >/dev/null 2>&1`;
  const setsid = Bun.which('setsid');
  const child = Bun.spawn(setsid ? [setsid, 'sh', '-c', line] : ['sh', '-c', line], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: !setsid,
    env: { ...process.env, MDHOUSE_DAEMON: '1' },
  });
  child.unref();

  let live = null;
  for (let i = 0; i < 300 && !live; i++) {
    live = await askPing(opts.port);
    if (live) break;
    if (child.exitCode !== null) break;
    await Bun.sleep(100);
  }

  if (!live) {
    // It never came up. Whatever it said on the way down is in the system log, which is the
    // only place it exists — so say how to read it rather than leaving a silent failure.
    console.error(`mdhouse: the server did not start${child.exitCode !== null ? '' : ' in time'}.`);
    console.error(`         What it said:  ${LOG_HINT}`);
    process.exit(1);
  }

  console.log(`mdhouse  ${live.url}`);
  printRoots(
    live.roots.map((r) => ({ ...r, id: '' })),
    false,
  );
  if (!opts.rw) {
    console.log('\n  Read-only — mdhouse will not write to these trees. Pass --rw to allow it.');
  }
  console.log(`\n  Running in the background (pid ${live.pid}).  Stop it with:  ${stopHint}`);
  console.log(`  Point it at more directories any time:  mdhouse <dir>`);
  console.log(`  Watch what it does:  ${LOG_HINT.replace('-n 20', '-f')}`);

  if (opts.open) openBrowser(live.url);
  process.exit(0);
}

const registry = await Registry.create(dirs, opts.rw);
const prefs = await Prefs.load();

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
  await handOver(await askDaemon(opts.port, { dirs, rw: opts.rw }));
  throw err; // unreachable: handOver never returns
}
const { server, shutdown } = started;

const url = `http://${opts.host}:${server.port}`;
console.log(`mdhouse  ${url}`);
printRoots(registry.list(), !registry.single);
if (!opts.rw) {
  console.log('\n  Read-only — mdhouse will not write to these trees. Pass --rw to allow it.');
}
console.log(
  process.env.MDHOUSE_DAEMON === '1'
    ? `\n  Started in the background — stop it with ${stopHint}.`
    : `\n  In the foreground — Ctrl+C stops it, and so does ${stopHint}.`,
);

if (opts.open) openBrowser(url);

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);
