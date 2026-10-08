#!/usr/bin/env bun
/**
 * `mdhouse [dir ...] [options]`, `mdhouse exit`, `mdhouse service …` and the access commands.
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
import { pageUrl, serve } from './server';
import { answered, askDaemon, askExit, askPing, askRemove, knownPorts, type AddReply, type PingReply } from './lib/control';
import { ownUnit, runService } from './lib/service';
import { logHints } from './lib/loghint';
import { hashPassword, parseCidr, validLogin } from './lib/access';

const USAGE = `mdhouse — browse every .md file under a directory

  mdhouse [dir ...] [options]     start it (in the background)
  mdhouse exit [options]          stop the one running  (also: stop)
  mdhouse service install         run it as a systemd --user service, started at login
  mdhouse service uninstall|status
  mdhouse user-add <login>        ask for a login from then on (any user turns it on);
                                  the password is asked for, or read from stdin
                                  (<login:pwd> also works, but stays in shell history)
  mdhouse user-rm <login>
  mdhouse users                   list users and allowed networks

Options
  -p, --perm           save the folders (and any --port/--host given): used on every start
      --rw             the folders named may be written (checkbox ticks, answers, notes
                       under headings); with -p, saved writable
      --rm             forget the folders and stop serving them
      --host <addr>    address to bind              (default 127.0.0.1)
      --port <n>       port to listen on            (default 7777)
      --allow <cidr,…> only these networks (and this machine) get in; saved
                       --allow none: every address again
      --auto-rw <p,…>  folders under these are writable (switch in settings); saved
                       --auto-rw none: no such paths
  -o, --open           open a browser on start
  -a, --all            include gitignored .md files
                       with \`exit\`: stop every mdhouse, whatever its port
      --fg             stay in the foreground; Ctrl+C stops it
      --git-log <n>    commits scanned for recents and the front page (default 200)
      --no-git         skip git entirely; filesystem recents only
      --help           show this

No folder passed - serves saved from ~/.config/mdhouse/prefs.json
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
  /** `--allow`: the networks to save, or null when not given. */
  allow: string[] | null;
  /** `--auto-rw`: the paths to save, or null when not given. */
  autoRw: string[] | null;
  /** Given flags that only a fresh start applies — a running mdhouse keeps its own. */
  startOnly: Set<string>;
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
    allow: null,
    autoRw: null,
    startOnly: new Set(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';

    switch (arg) {
      case '--port': o.port = Number(next()); o.portGiven = true; break;
      case '--host': o.host = next(); o.hostGiven = true; break;
      case '-o': case '--open': o.open = true; break;
      case '-a': case '--all': o.all = true; o.startOnly.add('-a'); break;
      case '--fg': case '--foreground': o.fg = true; break;
      case '--git-log': {
        const n = next();
        o.gitLog = Number(n);
        if (!/^\d+$/.test(n) || o.gitLog <= 0) {
          console.error(`mdhouse: --git-log: not a count: ${n}`);
          process.exit(2);
        }
        o.startOnly.add('--git-log');
        break;
      }
      case '--no-git': o.noGit = true; o.startOnly.add('--no-git'); break;
      case '--rw': o.rw = true; break;
      case '-p': case '--perm': o.perm = true; break;
      case '--rm': o.rm = true; break;
      case '--auto-rw': o.autoRw = [...(o.autoRw ?? []), ...next().split(',').map((c) => c.trim()).filter(Boolean)]; break;
      case '--allow': o.allow = [...(o.allow ?? []), ...next().split(',').map((c) => c.trim()).filter(Boolean)]; break;
      case '--help': console.log(USAGE); process.exit(0);
      // Retired short forms: say what replaced them rather than just "unknown".
      case '-P': case '-f': case '-h': {
        const now = { '-P': '-p (--perm)', '-f': '--fg', '-h': '--host' }[arg];
        console.error(`mdhouse: ${arg} is now ${now}`);
        process.exit(2);
      }
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
const USER_COMMANDS = ['user-add', 'user-rm', 'users'];
const command =
  argv[0] === 'exit' || argv[0] === 'stop'
    ? 'exit'
    : argv[0] === 'service'
      ? 'service'
      : USER_COMMANDS.includes(argv[0] ?? '')
        ? 'access'
        : 'serve';
// `mdhouse service install --port 8080` and `mdhouse service --port 8080 install` are the same
// request: the action is whichever word names one, wherever it sits.
const SERVICE_ACTIONS = ['install', 'uninstall', 'status'];
const serviceAction = command === 'service' ? (argv.slice(1).find((a) => SERVICE_ACTIONS.includes(a)) ?? '') : '';
const opts = parse(
  command === 'serve'
    ? argv
    : command === 'service'
      ? argv.slice(1).filter((a) => a !== serviceAction)
      : command === 'access'
        ? argv.slice(2).filter((a) => a.startsWith('-'))
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
 * and host saved in the config (`-p --port …`), else 7777 on 127.0.0.1. Every command resolves it
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

/** Said after "not answering": the usual reason, and the way out. */
const FROZEN = '  (stopped with Ctrl+Z? resume it with fg, or kill it)';

/** The mdhouse on the port when one answers; one that is there but does not answer ends the command. */
const running = async (): Promise<PingReply | null> => {
  const reply = await askPing(opts.port);
  if (reply && 'error' in reply) {
    console.error(`mdhouse: ${reply.error}${FROZEN}`);
    process.exit(1);
  }
  return reply;
};

// ---------------------------------------------------------------- mdhouse exit

if (command === 'exit') {
  const ports = opts.all ? knownPorts() : [opts.port];
  let stopped = 0;
  let units = 0;
  let frozen = 0;

  for (const port of ports) {
    const ping = await askPing(port);
    const who = ping && !('error' in ping) && !ping.service ? await askExit(port) : ping;
    if (who && 'error' in who) {
      frozen++;
      console.error(`mdhouse: ${who.error}${FROZEN}`);
      continue;
    }
    const unit = who?.service;
    if (unit) {
      units++;
      console.error(`mdhouse: port ${port} is the systemd unit ${unit} — stop it with:  systemctl --user stop ${unit}`);
      continue;
    }
    if (!who) continue;
    stopped++;
    console.log(`mdhouse  stopped ${who.url}  (pid ${who.pid})`);
    for (const root of who.roots) console.log(`  ${root.path}${root.writable ? '  [RW]' : ''}`);
  }

  if (units || frozen) process.exit(1);
  if (!stopped) {
    console.error(
      opts.all ? 'mdhouse: nothing running.' : `mdhouse: nothing running on port ${opts.port}.`,
    );
    // A daemon on another port is the likely reason someone is here; naming it saves a hunt.
    const live = (await Promise.all(knownPorts().map(async (p) => ((await answered(p)) ? p : null))))
      .filter((p): p is number => p !== null);
    if (live.length) console.error(`         Running on: ${live.join(', ')}  (mdhouse exit --port <n>)`);
    process.exit(1);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- mdhouse service …

if (command === 'service') {
  const from = opts.portGiven ? 'flag' : process.env.MDHOUSE_PORT ? 'env' : 'config';
  process.exit(await runService(serviceAction, { port: opts.port, from }));
}

// ---------------------------------------------------------------- access: users, --allow

/** The access settings, as `mdhouse users` and every change print them. */
const printAccess = (): void => {
  const { allow, users } = prefs.access;
  const logins = Object.keys(users).sort();
  console.log(`mdhouse  users:  ${logins.length ? logins.join(', ') : 'none — no login asked'}`);
  console.log(`mdhouse  allow:  ${allow.length ? `${allow.join(', ')} + this machine` : 'every address'}`);
};

/**
 * The password for `user-add <login>`: asked for on a terminal with echo off, else the first line
 * of stdin — never in argv, where shell history and the process list keep it.
 */
async function readPassword(): Promise<string> {
  const tty = !!process.stdin.isTTY;
  const echo = (on: boolean) => {
    if (tty) Bun.spawnSync(['stty', on ? 'echo' : '-echo'], { stdin: 'inherit' });
  };
  if (tty) process.stderr.write('password: ');
  echo(false);
  process.once('SIGINT', () => {
    echo(true);
    process.stderr.write('\n');
    process.exit(130);
  });
  try {
    for await (const line of console) return line.replace(/\r$/, '');
    return '';
  } finally {
    echo(true);
    if (tty) process.stderr.write('\n');
  }
}

if (command === 'access') {
  const [verb = '', arg = ''] = argv;
  if (verb === 'user-add') {
    const colon = arg.indexOf(':');
    const login = colon < 0 ? arg : arg.slice(0, colon);
    if (!validLogin(login)) {
      console.error('mdhouse: user-add <login> — a login without spaces or ":"');
      process.exit(2);
    }
    const password = colon < 0 ? await readPassword() : arg.slice(colon + 1);
    if (!password) {
      console.error('mdhouse: user-add — no password given');
      process.exit(2);
    }
    const isNew = await prefs.setUser(login, await hashPassword(password));
    console.log(`mdhouse  ${login}  ${isNew ? 'added' : 'password changed'}`);
  } else if (verb === 'user-rm') {
    if (!(await prefs.removeUser(arg))) {
      console.error(`mdhouse: no user ${arg || '(none given)'}`);
      process.exit(1);
    }
    console.log(`mdhouse  ${arg}  removed`);
  }
  printAccess();
  process.exit(0);
}

if (opts.allow) {
  const allow = opts.allow.length === 1 && opts.allow[0] === 'none' ? [] : opts.allow;
  const bad = allow.filter((c) => !parseCidr(c));
  if (bad.length) {
    console.error(`mdhouse: not a network: ${bad.join(', ')}  (like 192.168.1.0/24, 10.0.0.5, fd00::/8)`);
    process.exit(2);
  }
  await prefs.setAllow(allow);
  printAccess();
  if (!opts.dirs.length) process.exit(0);
}

if (opts.autoRw) {
  const paths = opts.autoRw.length === 1 && opts.autoRw[0] === 'none' ? [] : opts.autoRw.map(canonical);
  const saved = await prefs.setAutoRw(paths);
  const on = prefs.settings.autoRw ? '' : '  (switched off in settings)';
  console.log(`mdhouse  auto-rw:  ${saved.length ? saved.join(', ') : 'none'}${saved.length ? on : ''}`);
  if (!opts.dirs.length) process.exit(0);
}

// ---------------------------------------------------------------- mdhouse --rm [dir ...]

if (opts.rm) {
  const asked = (opts.dirs.length ? opts.dirs : [process.cwd()]).map(canonical);
  // A running daemon serves them: it forgets them and stops serving them in one step, and its
  // open tabs hear about it.
  if (await running()) {
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

/**
 * `-p` saves where to listen as well as what to serve: `mdhouse ~/notes -p --port 8080` makes
 * 8080 the port every later start — and the service — comes up on. Called only once the port is
 * known to hold this server or a running mdhouse, never a port something else has.
 */
const saveServer = async (): Promise<void> => {
  if (!opts.perm || !(opts.portGiven || opts.hostGiven)) return;
  const server = await prefs.setServer({
    ...(opts.portGiven ? { port: opts.port } : {}),
    ...(opts.hostGiven ? { host: opts.host } : {}),
  });
  console.log(`mdhouse  saved: listen on ${server.host ?? '127.0.0.1'}:${server.port ?? 7777}`);
};

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

if (!dirs.length && !saved.length) {
  if (process.env.MDHOUSE_SERVICE === '1') {
    // Nothing to serve. Exit cleanly rather than fail, so the unit is not restarted in a loop.
    console.error('mdhouse: no saved directories — nothing to serve. Save one with:  mdhouse <dir> -p');
    process.exit(0);
  } else if (!opts.fg && (await running())) {
    // One is running already (with folders added for the session): say what it serves.
    await handOver(await askDaemon(opts.port, { dirs: [], rw: false, save: false }));
  } else {
    // Nothing named, nothing saved: ask for a folder rather than guess one.
    console.error('mdhouse: which folder? Name one, and -p saves it for every later start:');
    console.error('           mdhouse <dir> -p');
    process.exit(1);
  }
}

/**
 * What a running mdhouse is asked for: the folders named, with `--rw` and `-p`; with none named,
 * the saved ones as they are — `--rw` and `-p` never apply to the saved list.
 */
const request = dirs.length ? { dirs, rw: opts.rw, save: opts.perm } : { dirs: saved, rw: false, save: false };

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
  await saveServer();

  const grew = reply.roots.some((r) => r.added);
  console.log(`mdhouse  ${reply.url}  (already running — ${grew ? 'added to it' : 'already serving that'})`);
  printRoots(reply.roots, reply.roots.length > 1);

  const ignored = [...(opts.hostGiven && reply.url !== pageUrl(opts.host, opts.port) ? ['--host'] : []), ...opts.startOnly];
  if (ignored.length) {
    console.error(`\nmdhouse: already running, so not applied: ${ignored.join(' ')}`);
    console.error(`         They take effect after  mdhouse exit${portHint}  and a fresh start.`);
  }

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
  if (await running()) await handOver(await askDaemon(opts.port, request));

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
      if (await running()) await handOver(await askDaemon(opts.port, request));
    }
    console.error(`mdhouse: port ${opts.port} is in use by something that is not mdhouse.`);
    console.error('         Stop it, or pass --port <n>.');
    process.exit(1);
  }

  // The port is free and nothing is running: save here, and the daemon about to start reads them.
  await saveServer();
  if (opts.perm) for (const dir of dirs) await prefs.addSaved(canonical(dir), opts.rw);

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
  // `-p` is done already: the directories are in the prefs the daemon will read.
  const forwarded = argv.filter((a) => !['-o', '--open', '-p', '--perm'].includes(a));
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
    live = await answered(opts.port);
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
    console.log('\n  Serve these on every start:  mdhouse <dir> -p');
  }
  console.log(writeNote(live.roots));
  console.log(`\n  Running in the background (pid ${live.pid}).  Stop it with:  ${stopHint}`);
  console.log(`  Point it at more directories any time:  mdhouse <dir>`);
  console.log(LOG ? `  Watch what it does:  ${LOG.follow}` : `  Its output is not kept on this system — ${FG_HINT}`);

  if (opts.open) openBrowser(live.url);
  process.exit(0);
}

// The daemon itself: what it was asked for, plus everything saved.
// Writability per folder: `--rw` covers the folders named on this command, and a saved folder is
// writable only if it was saved with `-p --rw`. One `--rw` never spreads to the others. A folder
// named with `-p` is saved as asked once the port is bound, so its saved mark does not count.
const named = new Set(dirs.map(canonical));
const registry = await Registry.create(
  [...new Set([...named, ...saved.map(canonical)])].map((path) => ({
    path,
    writable: named.has(path) && opts.perm ? opts.rw : (named.has(path) && opts.rw) || prefs.isWritableSaved(path),
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
  if (process.env.MDHOUSE_SERVICE === '1') {
    // Under systemd, handing over would end the unit "successfully" while another copy serves:
    // fail instead, so Restart=on-failure keeps trying until the port is free.
    console.error(`mdhouse: port ${opts.port} is taken — not starting; systemd will retry`);
    process.exit(1);
  }

  /**
   * The port is taken. If an mdhouse is behind it, hand it these directories rather than
   * failing: `mdhouse <dir>` should end on a page, not on an error telling you to pick a
   * port. The daemon adds them to what it already serves — it never swaps its trees out from
   * under a tab someone is reading.
   */
  await handOver(await askDaemon(opts.port, request));
  throw err; // unreachable: handOver never returns
}
const { server, shutdown, control } = started;
// `-p` is a promise that a directory comes back on every start, however the start was asked for.
await saveServer();
if (opts.perm) for (const dir of named) await prefs.addSaved(dir, opts.rw);

const url = pageUrl(opts.host, server.port);
console.log(`mdhouse  ${url}`);
printRoots(
  registry.list().map((r) => ({ ...r, saved: prefs.isSaved(r.path) })),
  !registry.single,
);
console.log(writeNote(registry.list()));
const unit = ownUnit();
console.log(
  unit
    ? `\n  Running as ${unit} — stop it with:  systemctl --user stop ${unit}`
    : !control
      ? `\n  ${stopHint} cannot reach it: another mdhouse on port ${opts.port} holds the control socket.` +
        `\n  ${process.env.MDHOUSE_DAEMON === '1' ? `kill ${process.pid}` : 'Ctrl+C'} stops it.`
      : process.env.MDHOUSE_DAEMON === '1'
        ? `\n  Started in the background — stop it with ${stopHint}.`
        : `\n  In the foreground — Ctrl+C stops it, and so does ${stopHint}.`,
);

if (opts.open) openBrowser(url);

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);
