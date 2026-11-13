// bun scripts/safe-smoke.ts (<root> | --fixtures <dir>) [--port <n>] [--rw] [--cdp [<n>]] [--src <checkout>] -- <cmd…>
// Starts its own mdhouse (and, with --cdp, its own headless Chrome), runs <cmd> against them and stops
// only what it started. <cmd> gets MDH_URL, MDH_ROOT and CDP_PORT; the exit code is <cmd>'s.
// A script imports `startSmoke()` instead and calls `stop()` when done.
//
// - Every port is checked before anything starts: a busy, invalid, duplicate or :7777 port aborts.
//   A port left out is picked from a free one in 62000–62999.
// - Each process starts in a new process group; its pgid must equal the captured pid.
// - A port counts as ours only when every listener on it is in that group, and the server's first
//   root must be the one asked for; otherwise it aborts. Each listener line counts on its own: one
//   whose pid stays hidden past HIDDEN_MS (another user's) is not ours. Nothing is ever stopped by port.
// - Teardown — `stop()`, an error, SIGINT, SIGTERM, SIGHUP: SIGTERM to the groups it started,
//   SIGKILL after a bounded wait, then removes the temp dirs it made. Once it has begun nothing
//   more starts: startup aborts, `run()` throws. A group still alive or a dir left behind rejects
//   `stop()` and makes the CLI exit non-zero.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, cpSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LIVE_PORT = 7777;
const PICK_FROM = 62000;
const PICK_TO = 62999;
const START_MS = 15_000;
const STOP_MS = 3_000;
/** `ss` can list a fresh listener before it can name its pid. */
const HIDDEN_MS = 2_000;

/** A refusal: `usage` for bad options, otherwise a safety check failed. Nothing it started is left running. */
export class SmokeAbort extends Error {
  constructor(message: string, readonly usage = false) {
    super(message);
  }
}

export interface SmokeOptions {
  /** The folder to serve; or `fixtures`. */
  root?: string;
  /** Files copied into a temp git repo (one commit), which is served instead of `root`. */
  fixtures?: string;
  rw?: boolean;
  /** The checkout whose `src/cli.ts` runs; this one by default. */
  src?: string;
  /** Picked when left out. */
  port?: number;
  /** Start a headless Chrome: `true` picks its debugging port. */
  cdp?: number | true;
}

export interface Smoke {
  /** `http://127.0.0.1:<port>` */
  base: string;
  port: number;
  /** The real path served as the first root. */
  root: string;
  /** The temp dir this run made: config, logs, the fixture repo, the Chrome profile. */
  dir: string;
  chromePort: number | null;
  /** The process groups it started, by name. */
  groups: Record<string, number>;
  /** Starts a command in a group of its own, stopped with the rest. */
  run(cmd: string[], env?: NodeJS.ProcessEnv): ChildProcess;
  /** Idempotent. Rejects with `SmokeAbort` when a group outlives SIGKILL or the temp dir stays. */
  stop(): Promise<void>;
}

export function validPort(v: number | string): number {
  if (!/^\d+$/.test(String(v))) throw new SmokeAbort(`invalid port ${v}`, true);
  const n = Number(v);
  if (n < 1024 || n > 65535) throw new SmokeAbort(`port ${n} is outside 1024–65535`, true);
  if (n === LIVE_PORT) throw new SmokeAbort(`port ${LIVE_PORT} is the live instance — refused`, true);
  return n;
}

/** `ss -ltnpH` for a TCP port: one line per listening socket, with its pids when ss can name them. */
function listeners(port: number): string {
  const r = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new SmokeAbort(`ss failed: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * Who holds a port, from `ss` output: `own` when every listening socket names a pid in `pgid`;
 * `foreign` when any names another; `hidden` when one names none (not yet, or another user's).
 */
export function ownership(ss: string, pgid: number, groupOf: (pid: number) => number | null = pgidOf): { state: 'free' | 'own' | 'foreign' | 'hidden'; foreign: number[] } {
  const lines = ss.split('\n').filter((l) => l.trim());
  if (!lines.length) return { state: 'free', foreign: [] };
  const pids = lines.map((l) => [...l.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])));
  const foreign = pids.flat().filter((p) => groupOf(p) !== pgid);
  if (foreign.length) return { state: 'foreign', foreign };
  return { state: pids.some((p) => !p.length) ? 'hidden' : 'own', foreign: [] };
}

function pick(taken: number[]): number {
  for (let i = 0; i < 50; i++) {
    const p = PICK_FROM + Math.floor(Math.random() * (PICK_TO - PICK_FROM + 1));
    if (!taken.includes(p) && !listeners(p)) return p;
  }
  throw new SmokeAbort(`no free port in ${PICK_FROM}–${PICK_TO}`);
}

function pgidOf(pid: number): number | null {
  const r = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' });
  const n = Number(r.stdout.trim());
  return r.status === 0 && n > 0 ? n : null;
}

/** Signals a group; one that is already gone is not an error. */
function signalGroup(pgid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pgid, sig);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function tail(file: string): string {
  try {
    return readFileSync(file, 'utf8').split('\n').slice(-30).join('\n');
  } catch {
    return '';
  }
}

async function fetchOk(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

interface Owned {
  name: string;
  child: ChildProcess;
  pgid: number;
}

const live = new Set<() => Promise<void>>();
let handlers = false;
/** 128 + n once a signal has stopped every smoke; the exit code from then on. */
let signalled: number | null = null;

/** On a signal every running smoke stops, then the process exits 128 + n. */
function installHandlers(): void {
  if (handlers) return;
  handlers = true;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      signalled ??= 128 + constants.signals[sig];
      void Promise.allSettled([...live].map((stop) => stop())).then((done) => {
        for (const d of done) if (d.status === 'rejected') console.error(`safe-smoke: ${(d.reason as Error).message}`);
        process.exit(signalled!);
      });
    });
  }
}

export async function startSmoke(opts: SmokeOptions): Promise<Smoke> {
  if ((opts.root === undefined) === (opts.fixtures === undefined)) throw new SmokeAbort('give root or fixtures, not both', true);
  const port = opts.port === undefined ? null : validPort(opts.port);
  const cdp = opts.cdp === undefined || opts.cdp === true ? null : validPort(opts.cdp);
  if (port !== null && port === cdp) throw new SmokeAbort(`server and CDP port are both ${port}`, true);
  const given = [port, cdp].filter((p): p is number => p !== null);
  const busy = given.filter((p) => listeners(p));
  if (busy.length) throw new SmokeAbort(`port ${busy.join(', ')} busy — abort, nothing started`);
  const src = resolve(opts.src ?? resolve(import.meta.dir, '..'));
  let wanted: string | null = null;
  if (opts.root !== undefined) {
    try {
      wanted = realpathSync(opts.root);
    } catch {
      throw new SmokeAbort(`root ${opts.root} does not exist`, true);
    }
    if (!statSync(wanted).isDirectory()) throw new SmokeAbort(`root ${opts.root} is not a folder`, true);
  }
  const serverPort = port ?? pick(given);
  const chromePort = opts.cdp === undefined ? null : (cdp ?? pick([...given, serverPort]));

  installHandlers();
  const owned: Owned[] = [];
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mdhouse-smoke-')));
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      const gone = async () => {
        const until = Date.now() + STOP_MS;
        while (owned.some((o) => groupAlive(o.pgid)) && Date.now() < until) await Bun.sleep(50);
      };
      const leaks: string[] = [];
      // every group gets its signal even when another one's fails
      const signal = (o: Owned, sig: NodeJS.Signals) => {
        try {
          signalGroup(o.pgid, sig);
        } catch (e) {
          leaks.push(`${sig} to ${o.name} pgid=${o.pgid}: ${(e as Error).message}`);
        }
      };
      for (const o of owned) signal(o, 'SIGTERM');
      await gone();
      for (const o of owned) if (groupAlive(o.pgid)) signal(o, 'SIGKILL');
      await gone();
      live.delete(stop);
      leaks.push(...owned.filter((o) => groupAlive(o.pgid)).map((o) => `group ${o.name} pgid=${o.pgid} still alive after SIGKILL`));
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        leaks.push(`temp dir ${dir} not removed: ${(e as Error).message}`);
      }
      if (leaks.length) throw new SmokeAbort(leaks.join('; '));
    })();
    return stopping;
  };
  live.add(stop);

  /** Starts a process as the leader of a new group and records the group as ours. */
  const start = (name: string, cmd: string, args: string[], o: { cwd?: string; env?: NodeJS.ProcessEnv; log?: string }): Owned => {
    if (stopping) throw new SmokeAbort(`stopping — ${name} not started`);
    const fd = o.log ? openSync(o.log, 'a') : null;
    const child = spawn(cmd, args, {
      cwd: o.cwd,
      env: o.env ?? process.env,
      detached: true,
      stdio: fd === null ? 'inherit' : ['ignore', fd, fd],
    });
    if (fd !== null) closeSync(fd);
    // A spawn failure arrives as an 'error' event after `pid` is already undefined; it is reported below.
    child.on('error', () => {});
    const pid = child.pid;
    if (!pid) throw new SmokeAbort(`${name} did not start`);
    const pgid = pgidOf(pid);
    const mine = pgidOf(process.pid);
    if (pgid !== pid || pgid === mine) {
      child.kill('SIGKILL');
      throw new SmokeAbort(`${name} pid ${pid} is not a group leader (pgid ${pgid}, ours ${mine})`);
    }
    const own = { name, child, pgid };
    owned.push(own);
    return own;
  };

  /** Waits until `p` is served by `o`'s group alone and `ready` passes. */
  const ownPort = async (o: Owned, p: number, ready: () => Promise<boolean>, log: string): Promise<void> => {
    const until = Date.now() + START_MS;
    const fail = (why: string) => new SmokeAbort(`${o.name}: ${why}\n--- ${log}\n${tail(log)}`);
    let hiddenSince: number | null = null;
    while (Date.now() < until) {
      if (stopping) throw new SmokeAbort(`stopped while ${o.name} was starting`);
      if (o.child.exitCode !== null || o.child.signalCode !== null) throw fail(`exited (${o.child.exitCode ?? o.child.signalCode}) before serving :${p}`);
      const held = ownership(listeners(p), o.pgid);
      if (held.state === 'foreign') throw fail(`:${p} is held by a process not ours (${held.foreign.join(' ')}) — not used`);
      if (held.state === 'hidden') {
        hiddenSince ??= Date.now();
        if (Date.now() - hiddenSince > HIDDEN_MS) throw fail(`:${p} is held by a process whose pid stays hidden — not used`);
      } else hiddenSince = null;
      if (held.state === 'own' && (await ready().catch(() => false))) return;
      await Bun.sleep(100);
    }
    throw fail(`did not serve :${p} within ${START_MS} ms`);
  };

  try {
    if (opts.fixtures !== undefined) {
      const repo = join(dir, 'repo');
      cpSync(opts.fixtures, repo, { recursive: true });
      for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=smoke', '-c', 'user.email=smoke@localhost', 'commit', '-qm', 'fixtures']]) {
        const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
        if (r.status !== 0) throw new SmokeAbort(`git ${args.join(' ')}: ${r.stderr}`);
      }
      wanted = repo;
    }
    const cfg = join(dir, 'config');
    const log = join(dir, 'server.log');
    const server = start('mdhouse', process.execPath, ['run', 'src/cli.ts', wanted!, ...(opts.rw ? ['--rw'] : []), '--port', String(serverPort), '--fg'], {
      cwd: src,
      // A fresh config starts the Agent Bus as `auto`: a scratch server must never find this machine's real bus, so it searches nowhere.
      env: { ...process.env, XDG_CONFIG_HOME: cfg, MDHOUSE_AB_SOCKET_DIRS: join(dir, 'no-agent-bus') },
      log,
    });
    const base = `http://127.0.0.1:${serverPort}`;
    let served = null as string | null;
    await ownPort(server, serverPort, async () => {
      const res = await fetchOk(`${base}/api/roots`);
      if (!res) return false;
      served = ((await res.json()) as { roots?: { path?: string }[] }).roots?.[0]?.path ?? null;
      return true;
    }, log);
    if (stopping) throw new SmokeAbort('stopped while mdhouse was starting');
    if (served !== wanted) throw new SmokeAbort(`mdhouse on :${serverPort} serves ${served}, not ${wanted} — abort`);

    if (chromePort !== null) {
      const clog = join(dir, 'chrome.log');
      const chrome = start('chrome', process.env.CHROME ?? 'google-chrome', [
        '--headless=new', '--disable-gpu', `--user-data-dir=${join(dir, 'chrome')}`, `--remote-debugging-port=${chromePort}`, 'about:blank',
      ], { log: clog });
      await ownPort(chrome, chromePort, async () => !!(await fetchOk(`http://127.0.0.1:${chromePort}/json/version`)), clog);
    }
    if (stopping) throw new SmokeAbort('stopped during startup');

    return {
      base,
      port: serverPort,
      root: wanted!,
      dir,
      chromePort,
      get groups() {
        return Object.fromEntries(owned.map((o) => [o.name, o.pgid]));
      },
      run: (cmd, env) => start(`cmd-${owned.length}`, cmd[0]!, cmd.slice(1), { env: env ?? process.env }).child,
      stop,
    };
  } catch (e) {
    const leak = await stop().then(() => null, (x: unknown) => x as Error);
    if (leak) throw new SmokeAbort(`${(e as Error).message}\n${leak.message}`);
    throw e;
  }
}

function parse(argv: string[]): { opts: SmokeOptions; cmd: string[] } {
  const dash = argv.indexOf('--');
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const cmd = dash === -1 ? [] : argv.slice(dash + 1);
  const opts: SmokeOptions = {};
  for (let i = 0; i < own.length; i++) {
    const a = own[i]!;
    const value = () => {
      const v = own[++i];
      if (v === undefined) throw new SmokeAbort(`${a} needs a value`, true);
      return v;
    };
    if (a === '--port') opts.port = validPort(value());
    else if (a === '--cdp') opts.cdp = /^\d+$/.test(own[i + 1] ?? '') ? validPort(value()) : true;
    else if (a === '--rw') opts.rw = true;
    else if (a === '--src') opts.src = value();
    else if (a === '--fixtures') opts.fixtures = value();
    else if (a.startsWith('-')) throw new SmokeAbort(`unknown option ${a}`, true);
    else if (opts.root === undefined) opts.root = a;
    else throw new SmokeAbort(`one root only: ${a}`, true);
  }
  if (!cmd.length) throw new SmokeAbort('a command after -- is required', true);
  return { opts, cmd };
}

if (import.meta.main) {
  let code: number;
  let smoke: Smoke | null = null;
  try {
    const { opts, cmd } = parse(process.argv.slice(2));
    smoke = await startSmoke(opts);
    console.error(`safe-smoke: own ${Object.entries(smoke.groups).map(([n, g]) => `${n} pgid=${g}`).join(' · ')} · ${smoke.base} root=${smoke.root}`);
    const env = { ...process.env, MDH_URL: smoke.base, MDH_ROOT: smoke.root, ...(smoke.chromePort ? { CDP_PORT: String(smoke.chromePort) } : {}) };
    const child = smoke.run(cmd, env);
    const [c, s] = await new Promise<[number | null, NodeJS.Signals | null]>((done) => child.once('exit', (x, y) => done([x, y])));
    code = c ?? 128 + (s ? constants.signals[s] : 0);
  } catch (e) {
    if (!(e instanceof SmokeAbort)) throw e;
    console.error(`safe-smoke: ${e.message}`);
    code = e.usage ? 2 : 3;
  } finally {
    const leak = await smoke?.stop().then(() => null, (x: unknown) => x as Error);
    if (leak) {
      console.error(`safe-smoke: ${leak.message}`);
      code = 3;
    }
  }
  console.error(`safe-smoke: stopped own ${smoke ? Object.values(smoke.groups).join(' ') : 'nothing'}`);
  process.exit(signalled ?? code!);
}
