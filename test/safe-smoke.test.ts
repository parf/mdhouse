import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { testPort } from './ports';

const SCRIPT = resolve(import.meta.dir, '../scripts/safe-smoke.ts');
const P = [61741, 61742, 61743, 61744, 61745].map(testPort);

/**
 * A stand-in for `src/cli.ts`: `FIX` picks what it does. It serves `/api/roots` like mdhouse, and
 * writes the pids it leaves behind to `$FIX_OUT` so a test can check they are gone.
 */
const FIXTURE = `
const [root, , port] = process.argv.slice(2);
const out = process.env.FIX_OUT!;
const note = (k: string, v: number) => require('node:fs').appendFileSync(out, k + '=' + v + '\\n');
const mode = process.env.FIX ?? 'ok';
note('server', process.pid);
if (mode === 'exit') { console.error('fixture: cannot start'); process.exit(1); }
if (mode === 'foreign') {
  const { spawn } = require('node:child_process');
  const c = spawn(process.execPath, ['-e', 'Bun.serve({ hostname: "127.0.0.1", port: ' + port + ', fetch: () => Response.json({ roots: [{ path: ' + JSON.stringify(root) + ' }] }) }); setInterval(() => {}, 1e6)'], { detached: true, stdio: 'ignore' });
  c.unref();
  note('foreign', c.pid);
  setInterval(() => {}, 1e6);
} else {
  if (mode === 'stubborn' || mode === 'slow') process.on('SIGTERM', () => {});
  const ready = Date.now() + (mode === 'slow' ? 1000 : 0);
  const kid = require('node:child_process').spawn('sleep', ['300'], { stdio: 'ignore' });
  note('grandchild', kid.pid);
  Bun.serve({ hostname: '127.0.0.1', port: Number(port), fetch: () => Date.now() < ready ? new Response('starting', { status: 503 }) : Response.json({ roots: [{ path: mode === 'wrongroot' ? '/elsewhere' : root }] }) });
}
`;

/** A stand-in for Chrome: serves `/json/version` on its debugging port and notes its pid. */
const FAKE_CHROME = `
const port = Number(process.argv.find((a) => a.startsWith('--remote-debugging-port='))!.split('=')[1]);
require('node:fs').appendFileSync(process.env.FIX_OUT!, 'chrome=' + process.pid + '\\n');
Bun.serve({ hostname: '127.0.0.1', port, fetch: () => Response.json({ Browser: 'fake' }) });
`;

let dir: string;
/** This run's own temp dir: the launcher's `mdhouse-smoke-*` dirs land here, not beside a concurrent run's. */
let temps: string;
const outerTmp = process.env.TMPDIR;
let fixture: string;
let fakeChrome: string;
let root: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'safe-smoke-test-'));
  temps = join(dir, 'tmp');
  mkdirSync(temps);
  process.env.TMPDIR = temps;
  fixture = join(dir, 'fixture');
  mkdirSync(join(fixture, 'src'), { recursive: true });
  writeFileSync(join(fixture, 'src/cli.ts'), FIXTURE);
  writeFileSync(join(dir, 'fake-chrome.ts'), FAKE_CHROME);
  fakeChrome = join(dir, 'fake-chrome');
  writeFileSync(fakeChrome, `#!/bin/sh\nexec ${process.execPath} ${join(dir, 'fake-chrome.ts')} "$@"\n`, { mode: 0o755 });
  root = join(dir, 'notes');
  mkdirSync(root);
  writeFileSync(join(root, 'a.md'), '# A\n');
});
afterAll(() => {
  if (outerTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = outerTmp;
  rmSync(dir, { recursive: true, force: true });
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const listening = (port: number) => spawnSync('ss', ['-ltnH', `sport = :${port}`], { encoding: 'utf8' }).stdout.trim() !== '';
const ownTemps = () => readdirSync(temps).filter((f) => f.startsWith('mdhouse-smoke-'));
/** Stops groups this test captured itself, whatever the launcher under test managed. */
const killGroups = (...pgids: (number | undefined)[]) => {
  for (const g of pgids) {
    if (!g) continue;
    try {
      process.kill(-g, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
};

let outN = 0;
/** Runs the launcher; resolves with its exit code, stderr and the pids the fixture wrote. */
async function run(args: string[], env: Record<string, string> = {}, onStart?: (pid: number) => void, termAfter?: number) {
  const out = join(dir, `pids-${++outN}`);
  writeFileSync(out, '');
  const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, FIX_OUT: out, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (d) => {
    stderr += d;
    if (onStart && stderr.includes('safe-smoke: own ')) {
      onStart(child.pid!);
      onStart = undefined;
    }
  });
  child.stdout.on('data', (d) => (stdout += d));
  if (termAfter !== undefined) setTimeout(() => child.kill('SIGTERM'), termAfter);
  const code = await new Promise<number | null>((done) => child.once('exit', (c) => done(c)));
  const pids = Object.fromEntries(readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('=')).map(([k, v]) => [k!, Number(v)]));
  return { code, stderr, stdout, pids };
}

describe('refuses before starting anything', () => {
  for (const [why, args] of [
    ['no root and no fixtures', ['--port', String(P[0]), '--', 'true']],
    ['a root and fixtures', ['ROOT', '--fixtures', 'ROOT', '--port', String(P[0]), '--', 'true']],
    ['the live port', ['ROOT', '--port', '7777', '--', 'true']],
    ['a port out of range', ['ROOT', '--port', '80', '--', 'true']],
    ['a non-numeric port', ['ROOT', '--port', '61741x', '--', 'true']],
    ['a duplicate port', ['ROOT', '--port', String(P[0]), '--cdp', String(P[0]), '--', 'true']],
    ['the live port as --cdp', ['ROOT', '--port', String(P[0]), '--cdp', '7777', '--', 'true']],
    ['a zero test timeout', ['ROOT', '--port', String(P[0]), '--timeout', '0', '--', 'true']],
    ['a test timeout over an hour', ['ROOT', '--port', String(P[0]), '--timeout', '3601', '--', 'true']],
    ['no command', ['ROOT', '--port', String(P[0])]],
    ['a missing root', ['/nonexistent-safe-smoke', '--port', String(P[0]), '--', 'true']],
  ] as const) {
    test(why, async () => {
      const r = await run(args.map((a) => (a === 'ROOT' ? root : a)), {});
      expect([r.code, r.pids]).toEqual([2, {}]);
      expect(listening(P[0]!)).toBe(false);
    });
  }

  test('a busy server or CDP port: aborts, and the listener there keeps serving', async () => {
    const foreign = Bun.serve({ hostname: '127.0.0.1', port: P[1]!, fetch: () => new Response('foreign') });
    try {
      for (const args of [['--port', String(P[1])], ['--port', String(P[2]), '--cdp', String(P[1])]]) {
        const r = await run([root, ...args, '--src', fixture, '--', 'true']);
        expect(r.code).toBe(3);
        expect(r.stderr).toContain(`port ${P[1]} busy`);
        expect(r.pids).toEqual({});
        expect(await (await fetch(`http://127.0.0.1:${P[1]}/`)).text()).toBe('foreign');
        expect(listening(P[2]!)).toBe(false);
      }
    } finally {
      foreign.stop(true);
    }
  });
});

describe('owns what it starts, and only that', () => {
  test('real mdhouse: the command sees its own server; afterwards nothing of it is left', async () => {
    const before = ownTemps();
    const probe = `const r = await fetch(process.env.MDH_URL + '/api/roots'); console.log(JSON.stringify({ ok: r.ok, root: (await r.json()).roots[0].path, env: process.env.MDH_ROOT }))`;
    const r = await run([root, '--port', String(P[0]), '--', process.execPath, '-e', probe]);
    expect(r.code).toBe(0);
    const seen = JSON.parse(r.stdout.trim()) as { ok: boolean; root: string; env: string };
    expect([seen.ok, seen.root, seen.env]).toEqual([true, root, root]);
    const pgid = Number(/mdhouse pgid=(\d+)/.exec(r.stderr)![1]);
    expect(alive(pgid)).toBe(false);
    expect(listening(P[0]!)).toBe(false);
    expect(ownTemps()).toEqual(before);
  }, 30_000);

  test("the command's exit code comes back; the server's whole group is stopped", async () => {
    const r = await run([root, '--port', String(P[0]), '--src', fixture, '--', 'sh', '-c', 'exit 7']);
    expect(r.code).toBe(7);
    expect(alive(r.pids.server!)).toBe(false);
    expect(alive(r.pids.grandchild!)).toBe(false);
    expect(listening(P[0]!)).toBe(false);
  }, 30_000);

  test('an unresponsive test command times out and its server and Chrome are stopped', async () => {
    const before = ownTemps();
    const command = ['sh', '-c', 'printf "cmd=%s\\n" "$$" >> "$FIX_OUT"; exec sleep 12'];
    const r = await run([root, '--port', String(P[0]), '--cdp', String(P[1]), '--src', fixture, '--timeout', '1', '--', ...command], { CHROME: fakeChrome });
    try {
      expect(r.code).toBe(124);
      expect(r.stderr).toContain('test exceeded its 1s deadline');
      for (const name of ['cmd', 'server', 'grandchild', 'chrome']) {
        expect(r.pids[name]).toBeGreaterThan(0);
        expect(alive(r.pids[name]!)).toBe(false);
      }
      expect(listening(P[0]!)).toBe(false);
      expect(listening(P[1]!)).toBe(false);
      expect(ownTemps()).toEqual(before);
    } finally {
      killGroups(r.pids.cmd, r.pids.server, r.pids.chrome);
    }
  }, 30_000);

  test('a server ignoring SIGTERM is killed after the bounded wait', async () => {
    const r = await run([root, '--port', String(P[0]), '--src', fixture, '--', 'true'], { FIX: 'stubborn' });
    expect(r.code).toBe(0);
    expect(alive(r.pids.server!)).toBe(false);
    expect(alive(r.pids.grandchild!)).toBe(false);
  }, 30_000);

  test('a server that fails to start: aborts with its log', async () => {
    const before = ownTemps();
    const r = await run([root, '--port', String(P[0]), '--src', fixture, '--', 'true'], { FIX: 'exit' });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('exited (1)');
    expect(r.stderr).toContain('fixture: cannot start');
    expect(ownTemps()).toEqual(before);
  }, 30_000);

  test('a server with another root: aborts, the command never runs', async () => {
    const mark = join(dir, 'ran');
    const r = await run([root, '--port', String(P[0]), '--src', fixture, '--', 'touch', mark], { FIX: 'wrongroot' });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('serves /elsewhere');
    expect(existsSync(mark)).toBe(false);
    expect(alive(r.pids.server!)).toBe(false);
    expect(listening(P[0]!)).toBe(false);
  }, 30_000);

  test('a listener outside its groups on the port: never used, never stopped', async () => {
    const mark = join(dir, 'ran-foreign');
    const r = await run([root, '--port', String(P[3]), '--src', fixture, '--', 'touch', mark], { FIX: 'foreign' });
    try {
      expect(r.code).toBe(3);
      expect(r.stderr).toContain('not ours');
      expect(existsSync(mark)).toBe(false);
      expect(alive(r.pids.server!)).toBe(false);
      // the foreign listener is another group: still alive and serving
      expect(alive(r.pids.foreign!)).toBe(true);
      expect((await fetch(`http://127.0.0.1:${P[3]}/api/roots`)).ok).toBe(true);
    } finally {
      process.kill(r.pids.foreign!, 'SIGKILL');
    }
  }, 30_000);

  test('stopped by SIGTERM mid-command: stops its groups, the command included', async () => {
    const cmdPid = join(dir, 'cmd-pid');
    const r = await run([root, '--port', String(P[4]), '--src', fixture, '--', 'sh', '-c', `echo $$ > ${cmdPid}; exec sleep 300`], {}, (pid) => {
      setTimeout(() => process.kill(pid, 'SIGTERM'), 300);
    });
    expect(r.code).toBe(143);
    expect(alive(r.pids.server!)).toBe(false);
    expect(alive(r.pids.grandchild!)).toBe(false);
    expect(alive(Number(readFileSync(cmdPid, 'utf8')))).toBe(false);
    expect(listening(P[4]!)).toBe(false);
  }, 30_000);
});

describe('startSmoke(): the API scripts import', () => {
  test('fixtures become a committed temp repo; a free port is picked; run() and stop() own their groups', async () => {
    const { startSmoke } = await import('../scripts/safe-smoke');
    const before = ownTemps();
    const smoke = await startSmoke({ fixtures: root });
    try {
      expect(smoke.port).toBeGreaterThanOrEqual(62000);
      expect(smoke.port).toBeLessThanOrEqual(62999);
      expect(smoke.root).toBe(join(smoke.dir, 'repo'));
      expect(spawnSync('git', ['-C', smoke.root, 'log', '--oneline'], { encoding: 'utf8' }).stdout.trim().split('\n')).toHaveLength(1);
      const roots = (await (await fetch(`${smoke.base}/api/roots`)).json()) as { roots: { path: string }[] };
      expect(roots.roots[0]!.path).toBe(smoke.root);
      const child = smoke.run(['sleep', '300']);
      expect(Object.keys(smoke.groups)).toEqual(['mdhouse', 'cmd-1']);
      expect(alive(child.pid!)).toBe(true);
      await smoke.stop();
      await smoke.stop();
      expect(alive(child.pid!)).toBe(false);
      expect(alive(smoke.groups.mdhouse!)).toBe(false);
      expect(listening(smoke.port)).toBe(false);
      expect(existsSync(smoke.dir)).toBe(false);
      expect(ownTemps()).toEqual(before);
    } finally {
      await smoke.stop();
    }
  }, 30_000);

  test('a server that fails to start: SmokeAbort, nothing left behind', async () => {
    const { startSmoke, SmokeAbort } = await import('../scripts/safe-smoke');
    const before = ownTemps();
    const out = join(dir, 'pids-api');
    writeFileSync(out, '');
    Object.assign(process.env, { FIX: 'exit', FIX_OUT: out });
    try {
      const err = await startSmoke({ root, port: P[0], src: fixture }).then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(SmokeAbort);
      expect([(err as InstanceType<typeof SmokeAbort>).usage, (err as Error).message.includes('exited (1)')]).toEqual([false, true]);
      expect(alive(Number(readFileSync(out, 'utf8').split('=')[1]))).toBe(false);
      expect(listening(P[0]!)).toBe(false);
      expect(ownTemps()).toEqual(before);
    } finally {
      delete process.env.FIX;
      delete process.env.FIX_OUT;
    }
  });
});

describe('nothing starts once stopping has begun', () => {
  test('SIGTERM during startup: the rest of startup and the command never run', async () => {
    const mark = join(dir, 'ran-after-stop');
    const r = await run([root, '--port', String(P[0]), '--cdp', String(P[1]), '--src', fixture, '--', 'touch', mark], { FIX: 'slow', CHROME: fakeChrome }, undefined, 300);
    expect(r.code).toBe(143);
    expect(existsSync(mark)).toBe(false);
    expect(r.pids.chrome).toBeUndefined();
    expect(alive(r.pids.server!)).toBe(false);
    expect(alive(r.pids.grandchild!)).toBe(false);
    expect([listening(P[0]!), listening(P[1]!)]).toEqual([false, false]);
  }, 30_000);

  test('run() after stop() refuses and starts nothing', async () => {
    const { startSmoke, SmokeAbort } = await import('../scripts/safe-smoke');
    const out = join(dir, 'pids-run-after');
    writeFileSync(out, '');
    process.env.FIX_OUT = out;
    const smoke = await startSmoke({ root, port: P[0], src: fixture });
    let late: ReturnType<typeof smoke.run> | null = null;
    try {
      await smoke.stop();
      let err: unknown = null;
      try {
        late = smoke.run(['sleep', '300']);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(SmokeAbort);
      expect(late).toBeNull();
    } finally {
      // only the process this test itself may have started
      if (late?.pid) process.kill(-late.pid, 'SIGKILL');
      delete process.env.FIX_OUT;
      await smoke.stop();
    }
  }, 30_000);

  test('a group that vanishes mid-teardown (ESRCH) does not stop the cleanup', async () => {
    const { startSmoke } = await import('../scripts/safe-smoke');
    const out = join(dir, 'pids-esrch');
    writeFileSync(out, '');
    process.env.FIX_OUT = out;
    const smoke = await startSmoke({ root, port: P[0], src: fixture });
    const kill = process.kill;
    // the group dies between the liveness check and the signal
    process.kill = ((pid: number, sig?: string | number) => {
      if (pid === -smoke.groups.mdhouse! && sig === 'SIGTERM') {
        kill.call(process, pid, 'SIGKILL');
        const e = new Error('kill ESRCH') as NodeJS.ErrnoException;
        e.code = 'ESRCH';
        throw e;
      }
      return kill.call(process, pid, sig as never);
    }) as typeof process.kill;
    const pgid = smoke.groups.mdhouse;
    try {
      await smoke.stop();
    } finally {
      process.kill = kill;
      delete process.env.FIX_OUT;
      killGroups(pgid);
    }
    expect(existsSync(smoke.dir)).toBe(false);
    expect(listening(P[0]!)).toBe(false);
  }, 30_000);
});

describe('every listener line must be ours', () => {
  const own = 4242;
  const pgidOf = (pid: number) => (pid === 4243 || pid === own ? own : 9999);
  const line = (addr: string, pid?: number) => `LISTEN 0 512 ${addr} 0.0.0.0:*${pid ? ` users:(("bun",pid=${pid},fd=5))` : ''}`;

  test('one line per listener: free, own, foreign, hidden, and a mix', async () => {
    const { ownership } = await import('../scripts/safe-smoke');
    const cases: [string, string][] = [
      ['', 'free'],
      [line('127.0.0.1:62001', own), 'own'],
      [[line('127.0.0.1:62001', own), line('[::1]:62001', 4243)].join('\n'), 'own'],
      [line('127.0.0.1:62001', 5000), 'foreign'],
      [line('127.0.0.1:62001'), 'hidden'],
      // our listener visible, another address of the port held by a process ss cannot name
      [[line('127.0.0.1:62001', own), line('[::1]:62001')].join('\n'), 'hidden'],
      [[line('127.0.0.1:62001', own), line('[::1]:62001', 5000)].join('\n'), 'foreign'],
    ];
    for (const [ss, state] of cases) expect([ss, ownership(ss, own, pgidOf).state]).toEqual([ss, state]);
  });
});

test('a process that cannot be spawned: a clean abort, no crash afterwards', async () => {
  const r = await run([root, '--port', String(P[0]), '--cdp', String(P[1]), '--', 'true'], { CHROME: join(dir, 'no-such-chrome') });
  expect(r.code).toBe(3);
  expect(r.stderr).toContain('chrome');
  expect(r.stderr).not.toContain('posix_spawn');
  expect([listening(P[0]!), listening(P[1]!)]).toEqual([false, false]);
}, 30_000);

test('a group that outlives SIGKILL rejects stop(); the temp dir still goes', async () => {
  const { startSmoke, SmokeAbort } = await import('../scripts/safe-smoke');
  const out = join(dir, 'pids-survivor');
  writeFileSync(out, '');
  process.env.FIX_OUT = out;
  const smoke = await startSmoke({ root, port: P[0], src: fixture });
  const pgid = smoke.groups.mdhouse!;
  const kill = process.kill;
  // the group is really stopped, but every liveness probe of it says it is still there
  process.kill = ((pid: number, sig?: string | number) => {
    if (pid === -pgid && sig === 0) return true;
    return kill.call(process, pid, sig as never);
  }) as typeof process.kill;
  let err: unknown = null;
  try {
    await smoke.stop();
  } catch (e) {
    err = e;
  } finally {
    process.kill = kill;
    delete process.env.FIX_OUT;
    killGroups(pgid);
  }
  expect(err).toBeInstanceOf(SmokeAbort);
  expect((err as Error).message).toContain(`pgid=${pgid} still alive after SIGKILL`);
  expect(existsSync(smoke.dir)).toBe(false);
  expect(alive(Number(/server=(\d+)/.exec(readFileSync(out, 'utf8'))![1]))).toBe(false);
}, 30_000);

test('a refused signal or a temp dir that will not go: stop() still does the rest, then rejects', async () => {
  const { startSmoke, SmokeAbort } = await import('../scripts/safe-smoke');
  const out = join(dir, 'pids-refused');
  writeFileSync(out, '');
  process.env.FIX_OUT = out;
  const smoke = await startSmoke({ root, port: P[0], src: fixture });
  const cmd = smoke.run(['sleep', '300']);
  const pgid = smoke.groups.mdhouse!;
  // a directory the cleanup cannot empty
  const stuck = join(smoke.dir, 'stuck');
  mkdirSync(stuck);
  writeFileSync(join(stuck, 'f'), '');
  chmodSync(stuck, 0o500);
  const kill = process.kill;
  // SIGTERM to the server's group is refused; SIGKILL still reaches it
  process.kill = ((pid: number, sig?: string | number) => {
    if (pid === -pgid && sig === 'SIGTERM') {
      const e = new Error('kill EPERM') as NodeJS.ErrnoException;
      e.code = 'EPERM';
      throw e;
    }
    return kill.call(process, pid, sig as never);
  }) as typeof process.kill;
  let err: unknown = null;
  try {
    await smoke.stop();
  } catch (e) {
    err = e;
  } finally {
    process.kill = kill;
    delete process.env.FIX_OUT;
    killGroups(pgid, cmd.pid);
    chmodSync(stuck, 0o700);
    rmSync(smoke.dir, { recursive: true, force: true });
  }
  expect(err).toBeInstanceOf(SmokeAbort);
  expect((err as Error).message).toContain(`SIGTERM to mdhouse pgid=${pgid}: kill EPERM`);
  expect((err as Error).message).toContain(`temp dir ${smoke.dir} not removed`);
  expect(alive(Number(/server=(\d+)/.exec(readFileSync(out, 'utf8'))![1]))).toBe(false);
  expect(alive(cmd.pid!)).toBe(false);
  expect(listening(P[0]!)).toBe(false);
}, 30_000);

test('a wrapper that exits and leaves its child: the child dies with the group', async () => {
  const { startSmoke } = await import('../scripts/safe-smoke');
  const out = join(dir, 'pids-orphan');
  const kid = join(dir, 'orphan-pid');
  writeFileSync(out, '');
  process.env.FIX_OUT = out;
  const smoke = await startSmoke({ root, port: P[2], src: fixture });
  let pgid: number | undefined;
  try {
    // like `(cd … && bun … &)`: the wrapper is gone at once, its child keeps running
    const wrapper = smoke.run(['sh', '-c', `sleep 300 & echo $! > ${kid}`]);
    pgid = wrapper.pid;
    await new Promise((done) => wrapper.once('exit', done));
    const child = Number(readFileSync(kid, 'utf8'));
    expect([alive(wrapper.pid!), alive(child)]).toEqual([false, true]);
    await smoke.stop();
    expect(alive(child)).toBe(false);
  } finally {
    delete process.env.FIX_OUT;
    killGroups(pgid, smoke.groups.mdhouse);
    await smoke.stop().catch(() => {});
  }
}, 30_000);
