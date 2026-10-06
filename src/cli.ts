#!/usr/bin/env bun
/**
 * `mdhouse [dir ...] [options]`, `mdhouse exit` and `mdhouse service …`.
 *
 * By default this process is only a launcher: it starts the real server detached, in its own
 * session, waits until it answers on the control socket, prints where it is, and returns the
 * terminal. The daemon outlives the shell that started it, so the way to stop it is
 * `mdhouse exit` rather than Ctrl+C. `--fg` keeps everything in one process instead.
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Registry } from './lib/roots';
import { Prefs } from './lib/prefs';
import { serve } from './server';
import { askDaemon, askExit, askPing, askRemove, knownPorts, type AddReply } from './lib/control';
import { runService } from './lib/service';
import { logHints } from './lib/loghint';

const USAGE = `mdhouse — browse every .md file under a directory

  mdhouse [dir ...] [options]     start it (in the background)
  mdhouse exit [options]          stop the one running  (also: stop)
  mdhouse service install         run it as a systemd --user service, started at login
  mdhouse service uninstall|status

Options
  -p, --port <n>       port to listen on            (default 7777)
  -h, --host <addr>    address to bind              (default 127.0.0.1; -h is not help)
  -o, --open           open a browser on start
  -a, --all            include gitignored .md files
                       with \`exit\`: stop every mdhouse, whatever its port
  -f, --fg             stay in the foreground; Ctrl+C stops it
      --git-log <n>    commits scanned for recents and the front page (default 200)
      --no-git         skip git entirely; filesystem recents only
      --rw             the folders named may be written (ticking a checkbox saves it);
                       with -P, saved writable. Other folders are not affected
  -P, --perm           save the folders (and any --port/--host given): used on every start
      --rm             forget the folders and stop serving them
      --help           show this

With no folder named, the saved ones are served — or $MDHOUSE_ROOT, or the current folder,
when none are saved. Saved folders live in ~/.config/mdhouse/prefs.json, beside the favourites.
Port and host: the flag, else $MDHOUSE_PORT / $MDHOUSE_HOST, else what -P saved, else
127.0.0.1:7777.
`;

interface Options {
  dirs: string[];
  port: number;
  host: string;
  /** Given on this command line, as opposed to coming from the environment or the config. */
  portGiven: boolean;
  hostGiven: boolean;
  open: boolean;
  all: boolean;
  gitLog: number;
  noGit: boolean;
  rw: boolean;
  fg: boolean;
  perm: boolean;
  rm: boolean;
}

function parse(argv: string[]): Options {
  const o: Options = {
    dirs: [],
    // Filled in below, once the config has been read: flag, then environment, then config.
    port: 0,
    host: '',
    portGiven: false,
    hostGiven: false,
    open: false,
    all: false,
    gitLog: 200,
    noGit: false,
    rw: false,
    fg: false,
    perm: false,
    rm: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';

    switch (arg) {
      case '-p': case '--port': o.port = Number(next()); o.portGiven = true; break;
      case '-h': case '--host': o.host = next(); o.hostGiven = true; break;
      case '-o': case '--open': o.open = true; break;
      case '-a': case '--all': o.all = true; break;
      case '-f': case '--fg': case '--foreground': o.fg = true; break;
      case '--git-log': o.gitLog = Number(next()); break;
      case '--no-git': o.noGit = true; break;
      case '--rw': o.rw = true; break;
      case '-P': case '--perm': o.perm = true; break;
      case '--rm': o.rm = true; break;
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

  // No directory is decided later: the saved list comes first, and reading it needs the prefs.
  return o;
}

const argv = process.argv.slice(2);
const command =
  argv[0] === 'exit' || argv[0] === 'stop' ? 'exit' : argv[0] === 'service' ? 'service' : 'serve';
// `mdhouse service install --port 8080` and `mdhouse service --port 8080 install` are the same
// request: the action is whichever word names one, wherever it sits.
const SERVICE_ACTIONS = ['install', 'uninstall', 'status'];
const serviceAction = command === 'service' ? (argv.slice(1).find((a) => SERVICE_ACTIONS.includes(a)) ?? '') : '';
const opts = parse(
  command === 'serve'
    ? argv
    : command === 'service'
      ? argv.slice(1).filter((a) => a !== serviceAction)
      : argv.slice(1),
);

const LOG = logHints({ platform: process.platform, which: (c) => !!Bun.which(c), exists: existsSync });
/** For when there is no log to point at: the same command, in the foreground, shows it all. */
const FG_HINT = 'run it in the foreground to see its output:  mdhouse … --fg';

/** The root list, ids and paths in columns: `+` for one just added, `·` for one already served. */
const printRoots = (
  roots: Array<{ id: string; path: string; writable: boolean; added?: boolean; asked?: boolean; saved?: boolean }>,
  showIds: boolean,
): void => {
  const width = Math.max(...roots.map((r) => r.id.length)) + 2;
  for (const root of roots) {
    const mark = root.added ? '+' : root.asked ? '·' : ' ';
    const id = showIds ? root.id.padEnd(width) : '';
    console.log(`${mark} ${id}${root.path}${root.writable ? '  [RW]' : ''}${root.saved ? '  [saved]' : ''}`);
  }
};

/** What mdhouse may write, said once under the root list, which marks each writable one `[RW]`. */
const writeNote = (roots: Array<{ writable: boolean }>): string =>
  roots.some((r) => r.writable)
    ? '\n  Folders marked [RW]: ticking a checkbox saves the file. The rest are read-only.'
    : '\n  Read-only — mdhouse does not write to the trees it serves.';

/** A directory as the config stores it: absolute and symlink-resolved, or as written if gone. */
const canonical = (dir: string): string => {
  const abs = resolve(dir);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
};

const openBrowser = (target: string): void => {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  Bun.spawn([opener, target], { stdout: 'ignore', stderr: 'ignore' }).unref();
};

/**
 * Where to listen: a flag on this command, else `MDHOUSE_PORT` / `MDHOUSE_HOST`, else the port
 * and host saved in the config (`-P --port …`), else 7777 on 127.0.0.1. Every command resolves it
 * the same way, so a plain `mdhouse exit` finds the daemon a plain `mdhouse` started, and the
 * service comes up where a start by hand would.
 */
const prefs = await Prefs.load();
{
  const saved = prefs.server;
  if (!opts.portGiven) opts.port = Number(process.env.MDHOUSE_PORT || saved.port || 7777);
  if (!opts.hostGiven) opts.host = process.env.MDHOUSE_HOST || saved.host || '127.0.0.1';
  if (!Number.isInteger(opts.port) || opts.port <= 0 || opts.port > 65535) {
    console.error(`mdhouse: not a port: ${opts.port}`);
    process.exit(2);
  }
}

/** `--port` for a hint, only when this command needed one to find the daemon. */
const portHint = opts.portGiven ? ` --port ${opts.port}` : '';

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

// ---------------------------------------------------------------- mdhouse service …

if (command === 'service') {
  process.exit(await runService(serviceAction, { port: opts.port, explicit: opts.portGiven }));
}

// ---------------------------------------------------------------- mdhouse --rm [dir ...]

if (opts.rm) {
  const asked = (opts.dirs.length ? opts.dirs : [process.cwd()]).map(canonical);
  // A running daemon holds the prefs in memory and rewrites the whole file on its next change,
  // so it has to be the one to forget them — editing the file under it would be undone.
  if (await askPing(opts.port)) {
    const reply = await askRemove(opts.port, { dirs: asked });
    if (!reply || 'error' in reply) {
      console.error(`mdhouse: the mdhouse on ${opts.port} refused: ${reply ? reply.error : 'no answer'}`);
      process.exit(1);
    }
    for (const r of reply.results) {
      const what = r.removed
        ? `removed${r.unsaved ? ' and forgotten' : ''}`
        : r.kept
          ? `forgotten, but still served until exit — it is the last directory`
          : r.unsaved
            ? 'forgotten (it was not being served)'
            : 'not saved, and not served — nothing to do';
      console.log(`mdhouse  ${r.path}  ${what}`);
    }
  } else {
    for (const dir of asked) {
      console.log(`mdhouse  ${dir}  ${(await prefs.removeSaved(dir)) ? 'forgotten' : 'was not saved — nothing to do'}`);
    }
  }
  process.exit(0);
}

// ---------------------------------------------------------------- mdhouse [dir ...]

// `-P` saves where to listen as well as what to serve: `mdhouse ~/notes -P --port 8080` makes
// 8080 the port every later start — and the service — comes up on.
if (opts.perm && (opts.portGiven || opts.hostGiven)) {
  const server = await prefs.setServer({
    ...(opts.portGiven ? { port: opts.port } : {}),
    ...(opts.hostGiven ? { host: opts.host } : {}),
  });
  console.log(`mdhouse  saved: listen on ${server.host ?? '127.0.0.1'}:${server.port ?? 7777}`);
}

/** Is this a directory we can serve? Saved ones may have been deleted since. */
const isDir = (abs: string): boolean => existsSync(abs) && statSync(abs).isDirectory();

const dirs: string[] = [];
for (const dir of opts.dirs) {
  const abs = resolve(dir);
  if (!isDir(abs)) {
    console.error(`mdhouse: not a directory: ${dir}`);
    process.exit(1);
  }
  dirs.push(abs);
}

const saved = prefs.savedDirs().filter((dir) => {
  if (isDir(dir)) return true;
  console.error(`mdhouse: saved directory is gone, skipping: ${dir}  (mdhouse --rm ${dir} forgets it)`);
  return false;
});

if (!dirs.length) {
  if (saved.length) dirs.push(...saved);
  else if (process.env.MDHOUSE_SERVICE === '1') {
    // Under systemd the current directory is $HOME, and serving all of it is never what was
    // meant. Exit cleanly rather than fail, so the unit is not restarted in a loop.
    console.error('mdhouse: no saved directories — nothing to serve. Save one with:  mdhouse <dir> -P');
    process.exit(0);
  } else dirs.push(resolve(process.env.MDHOUSE_ROOT ?? process.cwd()));
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

  // `--rw` for a folder that was already served read-only switched it over in place.
  for (const root of reply.roots) {
    if (root.upgraded) console.log(`\n  ${root.path} is writable now.`);
  }

  console.log(`\n  Stop it with:  mdhouse exit${portHint}`);

  const fresh = reply.roots.find((r) => r.asked);
  const target =
    fresh && reply.roots.length > 1 ? `${reply.url}/?root=${encodeURIComponent(fresh.id)}` : reply.url;
  if (opts.open) openBrowser(target);
  process.exit(0);
}

const stopHint = `mdhouse exit${portHint}`;

if (!opts.fg) {
  // Already running? Hand it the directories without starting anything.
  if (await askPing(opts.port)) await handOver(await askDaemon(opts.port, { dirs, rw: opts.rw, save: opts.perm }));

  // Nothing running, so nothing holds the prefs in memory: save here, and the daemon about to
  // start reads them back.
  if (opts.perm) for (const dir of dirs) await prefs.addSaved(canonical(dir), opts.rw);

  // Nobody answered on the control socket, so if the port is taken it is taken by something
  // else. Finding that out here, rather than in a detached child whose output has gone to the
  // system log, is the difference between an answer and a hunt.
  try {
    Bun.serve({ port: opts.port, hostname: opts.host, reusePort: false, fetch: () => new Response('') }).stop(true);
  } catch (err) {
    if ((err as { code?: string }).code !== 'EADDRINUSE') throw err;
    // An mdhouse that is still starting — the service, a moment after `systemctl start` — holds
    // the port before its control socket is up. Give it a few seconds to answer before calling
    // it something else.
    for (let i = 0; i < 50; i++) {
      await Bun.sleep(100);
      if (await askPing(opts.port)) await handOver(await askDaemon(opts.port, { dirs, rw: opts.rw, save: opts.perm }));
    }
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
  // The launcher opens the browser itself, once it knows the daemon answered. Passing `-o` on
  // would have the daemon open a second tab the moment it binds.
  // `-P` is done already: the directories are in the prefs the daemon will read.
  const forwarded = argv.filter((a) => !['-o', '--open', '-P', '--perm'].includes(a));
  const self = [process.execPath, process.argv[1]!, ...forwarded, '--fg'].map(quote).join(' ');
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
    console.error(LOG ? `         What it said:  ${LOG.recent}` : `         Nothing kept its output here — ${FG_HINT}`);
    process.exit(1);
  }

  console.log(`mdhouse  ${live.url}`);
  printRoots(
    live.roots.map((r) => ({ ...r, id: '' })),
    false,
  );
  if (!opts.perm && !prefs.savedDirs().length) {
    console.log('\n  Serve these on every start:  mdhouse <dir> -P');
  }
  console.log(writeNote(live.roots));
  console.log(`\n  Running in the background (pid ${live.pid}).  Stop it with:  ${stopHint}`);
  console.log(`  Point it at more directories any time:  mdhouse <dir>`);
  console.log(LOG ? `  Watch what it does:  ${LOG.follow}` : `  Its output is not kept on this system — ${FG_HINT}`);

  if (opts.open) openBrowser(live.url);
  process.exit(0);
}

// The daemon itself: what it was asked for, plus everything saved — `-P` is a promise that a
// directory comes back on every start, however the start was asked for.
if (opts.perm) for (const dir of dirs) await prefs.addSaved(canonical(dir), opts.rw);
// Writability per folder: `--rw` covers the folders named on this command, and a saved folder is
// writable only if it was saved with `-P --rw`. One `--rw` never spreads to the others.
const named = new Set(dirs.map(canonical));
const registry = await Registry.create(
  [...new Set([...named, ...saved.map(canonical)])].map((path) => ({
    path,
    writable: (named.has(path) && opts.rw) || prefs.isWritableSaved(path),
  })),
);

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
  await handOver(await askDaemon(opts.port, { dirs, rw: opts.rw, save: opts.perm }));
  throw err; // unreachable: handOver never returns
}
const { server, shutdown } = started;

const url = `http://${opts.host}:${server.port}`;
console.log(`mdhouse  ${url}`);
printRoots(
  registry.list().map((r) => ({ ...r, saved: prefs.isSaved(r.path) })),
  !registry.single,
);
console.log(writeNote(registry.list()));
console.log(
  process.env.MDHOUSE_DAEMON === '1'
    ? `\n  Started in the background — stop it with ${stopHint}.`
    : `\n  In the foreground — Ctrl+C stops it, and so does ${stopHint}.`,
);

if (opts.open) openBrowser(url);

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);
