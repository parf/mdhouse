import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hostIsLocal } from '../src/lib/access';

// Every run gets its own config dir and a 619xx port; every daemon is stopped by `exit --all`
// with that same config dir, so nothing here can reach ~/.config/mdhouse or :7777.
const CLI = resolve(import.meta.dir, '../src/cli.ts');
const configs: string[] = [];

const scratch = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mdhouse-cli-')));
  const cfg = join(dir, 'cfg');
  configs.push(cfg);
  const folder = (name: string) => {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'a.md'), '# A\n');
    return join(dir, name);
  };
  const run = (args: string[], env: Record<string, string> = {}, stdin?: string) => {
    const p = Bun.spawnSync([process.execPath, CLI, ...args], {
      env: { ...process.env, XDG_CONFIG_HOME: cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '', ...env },
      stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const prefs = () => {
    try {
      return JSON.parse(readFileSync(join(cfg, 'mdhouse/prefs.json'), 'utf8'));
    } catch {
      return { saved: [], writable: [], server: {} }; // nothing saved yet
    }
  };
  return { dir, cfg, folder, run, prefs };
};

afterAll(() => {
  for (const cfg of configs) {
    Bun.spawnSync([process.execPath, CLI, 'exit', '--all'], { env: { ...process.env, XDG_CONFIG_HOME: cfg } });
  }
});

describe('--rw and -p apply to the folders named only', () => {
  test('-p --port with no folder keeps each saved folder as it was saved (C1)', () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '--rw', '-p', '--port', '61911']).code).toBe(0);
    s.run(['exit', '--port', '61911']);
    expect(s.run([b, '-p', '--port', '61911']).code).toBe(0);
    s.run(['exit', '--port', '61911']);
    expect(s.prefs().writable).toEqual([a]);

    expect(s.run(['-p', '--port', '61912']).out).toContain(`${a}  [RW]`);
    expect(s.prefs().writable).toEqual([a]);
    // Handed to the running one: the same.
    expect(s.run(['-p', '--rw', '--port', '61912']).code).toBe(0);
    expect(s.prefs().writable).toEqual([a]);
    s.run(['exit', '--port', '61912']);

    // The daemon itself: a forwarded --rw with no folder makes nothing writable.
    const out = s.run(['--rw', '--port', '61913']).out;
    expect(out).toContain(`${a}  [RW]`);
    expect(out).not.toContain(`${b}  [RW]`);
    s.run(['exit', '--port', '61913']);
  });
});

describe('-p saves only once the port is known to be free', () => {
  test('a port held by something else: nothing saved, launcher or --fg (C6)', () => {
    const s = scratch();
    const a = s.folder('a');
    const other = Bun.serve({ port: 61914, hostname: '127.0.0.1', fetch: () => new Response('not mdhouse') });
    try {
      const bg = s.run([a, '-p', '--port', '61914']);
      expect(bg.code).toBe(1);
      expect(bg.err).toContain('not mdhouse');
      const fg = s.run([a, '-p', '--port', '61914', '--fg']);
      expect(fg.code).toBe(1);
      expect(fg.err).toContain('not mdhouse');
      expect(s.prefs().saved).toEqual([]);
      expect(s.prefs().server).toEqual({});
    } finally {
      other.stop(true);
    }
  }, 20000);

  test('a free port, or a running mdhouse on it: saved', () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '-p', '--rw', '--port', '61915']).code).toBe(0);
    expect(s.prefs()).toMatchObject({ saved: [a], writable: [a], server: { port: 61915 } });
    expect(s.run([b, '-p', '--port', '61915', '--host', '127.0.0.1', '--fg']).code).toBe(0); // handed over
    expect(s.prefs()).toMatchObject({ saved: [a, b], writable: [a], server: { port: 61915, host: '127.0.0.1' } });
    s.run(['exit', '--port', '61915']);
  });
});

describe('handing over to a running mdhouse', () => {
  test('names the flags only a fresh start applies (C2)', () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '--port', '61917']).code).toBe(0);
    const r = s.run([b, '--port', '61917', '--host', '127.0.0.2', '--no-git', '--git-log', '5', '-a']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('already running');
    expect(r.err).toContain('not applied: --host --no-git --git-log -a');
    expect(r.err).toContain('mdhouse exit --port 61917');
    // The same host, or none of them: nothing to say.
    expect(s.run([b, '--port', '61917', '--host', '127.0.0.1']).err).toBe('');
    s.run(['exit', '--port', '61917']);
  });
});

describe('a daemon that does not answer', () => {
  test('exit, exit --all and a start say so instead of hanging (C4)', () => {
    const s = scratch();
    const a = s.folder('a');
    const started = s.run([a, '--port', '61920']);
    const pid = Number(/pid (\d+)/.exec(started.out)?.[1]);
    expect(pid).toBeGreaterThan(0);
    process.kill(pid, 'SIGSTOP');
    try {
      for (const args of [['exit', '--port', '61920'], ['exit', '--all'], [a, '--port', '61920']]) {
        const t0 = Date.now();
        const r = s.run(args);
        expect(r.code).toBe(1);
        expect(r.err).toContain('the mdhouse on port 61920 is not answering');
        expect(Date.now() - t0).toBeLessThan(5000);
      }
    } finally {
      process.kill(pid, 'SIGCONT');
    }
    expect(s.run(['exit', '--port', '61920']).code).toBe(0);
  }, 30000);
});

describe('two servers on one port, bound to different hosts', () => {
  test('the second never takes the first one’s control socket (C3)', async () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '--port', '61922']).code).toBe(0);
    // another loopback address: every 127.x on Linux; macOS has only 127.0.0.1, and ::1
    const other = hostIsLocal('127.0.0.2') ? '127.0.0.2' : '::1';
    const fg = Bun.spawn([process.execPath, CLI, b, '--port', '61922', '--host', other, '--fg'], {
      env: { ...process.env, XDG_CONFIG_HOME: s.cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '' },
      stdout: 'pipe',
    });
    try {
      const reader = fg.stdout.getReader();
      let out = '';
      while (!out.includes('stops it')) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`the --fg one exited:\n${out}`);
        out += new TextDecoder().decode(value);
      }
      expect(out).toContain('mdhouse exit --port 61922 cannot reach it');
      const r = s.run(['exit', '--all']);
      expect(r.out).toContain('stopped http://127.0.0.1:61922');
      expect(fg.exitCode).toBeNull(); // the --fg one is still up, for its own Ctrl+C
    } finally {
      fg.kill();
    }
  }, 20000);
});

describe('service install', () => {
  test('a systemctl that fails leaves the hand-started mdhouse running (C8)', () => {
    const s = scratch();
    const a = s.folder('a');
    // A fake systemctl first on PATH and a temp HOME: the real one and ~/.config/systemd stay untouched.
    const bin = join(s.dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\necho "$*" >> ${join(s.dir, 'systemctl.log')}\nexit 1\n`);
    chmodSync(join(bin, 'systemctl'), 0o755);
    const env = { HOME: s.dir, PATH: `${bin}:${process.env.PATH}` };

    expect(s.run([a, '-p', '--port', '61923']).code).toBe(0);
    const r = s.run(['service', 'install', '--port', '61923'], env);
    expect(r.code).toBe(1);
    expect(readFileSync(join(s.dir, 'systemctl.log'), 'utf8')).toBe('--user daemon-reload\n');
    expect(existsSync(join(s.dir, '.config/systemd/user/mdhouse-61923.service'))).toBe(true);
    expect(s.run(['exit', '--port', '61923']).code).toBe(0); // still running
  });
});

test('--git-log takes a positive whole number, like --port (C9)', () => {
  const s = scratch();
  const a = s.folder('a');
  for (const bad of ['abc', '0', '-5', '2.5', '']) {
    const r = s.run([a, '--git-log', bad, '--port', '61924']);
    expect(r.code).toBe(2);
    expect(r.err).toContain(`mdhouse: --git-log: not a count: ${bad}`);
  }
});

test('under systemd the banner names systemctl, not `mdhouse exit` (C10)', async () => {
  const s = scratch();
  const a = s.folder('a');
  expect(s.run([a, '-p', '--port', '61925']).code).toBe(0);
  s.run(['exit', '--port', '61925']);
  const svc = Bun.spawn([process.execPath, CLI, '--fg', '--port', '61925'], {
    env: { ...process.env, XDG_CONFIG_HOME: s.cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '1', MDHOUSE_DAEMON: '' },
    stdout: 'pipe',
  });
  try {
    const reader = svc.stdout.getReader();
    let out = '';
    while (!out.includes('stop')) out += new TextDecoder().decode((await reader.read()).value);
    expect(out).toMatch(/stop it with: {2}systemctl --user stop \S+\.service/);
    expect(out).not.toContain('mdhouse exit');
  } finally {
    svc.kill();
  }
}, 20000);

describe('user-add', () => {
  test('with no :pwd reads the password from stdin, so it is not in argv (C11)', () => {
    const s = scratch();
    const r = s.run(['user-add', 'ann'], {}, 's3cret\n');
    expect(r.code).toBe(0);
    expect(r.out).toContain('ann  added');
    expect(s.prefs().access.users.ann).toStartWith('$argon2id$');
    expect(s.run(['user-add', 'bob'], {}, '').code).toBe(2); // no password
    expect(s.run(['user-add', 'cy:pw']).out).toContain('cy  added'); // login:pwd still works
  });
});

describe('the reference root (MW.0f.2)', () => {
  const REF = realpathSync(resolve(import.meta.dir, '../doc'));
  const at = (port: number, path: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('every start serves the installed doc/ read-only as _mdhouse, after the projects', async () => {
    const s = scratch();
    const a = s.folder('a');
    const started = s.run([a, '--rw', '--port', '61940']);
    try {
      expect(started.code).toBe(0);
      expect(started.out).toContain(`${REF}  [reference]`);
      const { roots, single } = (await (await at(61940, '/api/roots')).json()) as { roots: Array<{ id: string; path: string; kind: string; writable: boolean }>; single: boolean };
      expect(single).toBe(true);
      expect(roots.map((r) => [r.id, r.kind, r.writable])).toEqual([['a', 'project', true], ['_mdhouse', 'reference', false]]);
      expect(roots[1]!.path).toBe(REF);
      const doc = (await (await at(61940, '/api/doc?p=_mdhouse/syntax.md')).json()) as { writable: boolean; reference?: boolean };
      expect(doc).toMatchObject({ writable: false, reference: true });
      expect((await at(61940, '/api/task', { p: '_mdhouse/qa-playground.md', line: 1, hash: '00000000' })).status).toBe(403);
      expect((await at(61940, '/api/roots/remove', { id: '_mdhouse' })).status).toBe(401); // no administrator session
      expect(s.run(['--rm', REF, '--port', '61940']).code).toBe(1);
    } finally {
      s.run(['exit', '--port', '61940']);
    }
  });

  test('naming doc/ — or a symlink to it — is refused, and nothing is saved', () => {
    const s = scratch();
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    symlinkSync(REF, join(s.dir, 'ref-link'));
    for (const dir of [REF, join(s.dir, 'ref-link')]) {
      const r = s.run([dir, '-p', '--rw', '--port', '61941']);
      expect(r.code).toBe(1);
      expect(r.err).toContain("mdhouse's reference material");
    }
    expect(s.prefs().saved).toEqual([]);
  });

  test('a saved doc/ from before is served as the reference only — never as a project, prefs untouched', async () => {
    const s = scratch();
    const a = s.folder('a');
    mkdirSync(join(s.cfg, 'mdhouse'), { recursive: true });
    const before = { version: 1, saved: [REF, a].sort(), writable: [REF] };
    writeFileSync(join(s.cfg, 'mdhouse/prefs.json'), JSON.stringify(before));
    const started = s.run(['--port', '61942']);
    try {
      expect(started.code).toBe(0);
      expect(started.err).toContain('served read-only as _mdhouse instead');
      const { roots } = (await (await at(61942, '/api/roots')).json()) as { roots: Array<{ id: string; kind: string; writable: boolean }> };
      expect(roots.map((r) => [r.id, r.kind, r.writable])).toEqual([['a', 'project', false], ['_mdhouse', 'reference', false]]);
      expect(s.prefs().saved).toEqual(before.saved);
      expect(s.prefs().writable).toEqual(before.writable);
    } finally {
      s.run(['exit', '--port', '61942']);
    }
  });
});

describe('--name: a human name for one project, display only', () => {
  type Root = { id: string; name: string; customName?: string; path: string; writable: boolean; saved: boolean };
  const rootsAt = async (port: number) => ((await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()) as { roots: Root[] }).roots;

  test('zero or several directories, --rm, a bad name or another command are refused before anything changes', () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    const cases: Array<[string[], string]> = [
      [['--name', 'X', '--port', '61943'], 'exactly one directory; none was given'],
      [[a, b, '--name', 'X', '--port', '61943'], 'exactly one directory; got 2'],
      [[a, '-p', '--rm', '--name', 'X', '--port', '61943'], 'cannot be combined with --rm'],
      [[a, '-p', '--name', 'a\tb', '--port', '61943'], 'control and text-direction'],
      [[a, '-p', '--name', 'x'.repeat(81), '--port', '61943'], 'at most 80'],
      [['exit', '--name', 'X', '--port', '61943'], '--name is not an option of exit'],
      [[a, '-p', '--allow', '10.0.0.0/8', '--name', 'X', a, '--port', '61943'], 'exactly one directory; got 2'],
    ];
    for (const [args, error] of cases) {
      const r = s.run(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain(error);
    }
    expect(s.prefs()).toEqual({ saved: [], writable: [], server: {} }); // no prefs file was written
  });

  test('--name with no value is an error, not a reset; an explicit empty value still resets', async () => {
    const s = scratch();
    const a = s.folder('a');
    expect(s.run([a, '-p', '--name', 'Keep', '--port', '61947']).code).toBe(0);
    try {
      const before = JSON.stringify(s.prefs());
      for (const args of [[a, '--name'], [a, '-p', '--name'], [a, '--rw', '--name']]) {
        const r = s.run([...args.slice(0, 1), '--port', '61947', ...args.slice(1)]);
        expect([r.code, r.err]).toEqual([2, 'mdhouse: --name needs a value (--name reset restores the directory name)\n']);
        expect(JSON.stringify(s.prefs())).toBe(before);
        expect((await rootsAt(61947))[0]).toMatchObject({ name: 'Keep', customName: 'Keep', saved: true, writable: false });
      }
      expect(s.run([a, '--name', '', '--port', '61947']).code).toBe(0);
      expect(s.prefs().names).toEqual({});
      expect((await rootsAt(61947))[0]!.name).toBe('a');
    } finally {
      s.run(['exit', '--port', '61947']);
    }
  });

  test('cold start with -p saves the name; a handoff resets it; the root stays read-only and unrenamed', async () => {
    const s = scratch();
    const a = s.folder('a');
    const started = s.run([a, '-p', '--name', 'All MDHouse Projects', '--port', '61944']);
    try {
      expect(started.code).toBe(0);
      expect(s.prefs().names).toEqual({ [a]: 'All MDHouse Projects' });
      expect((await rootsAt(61944))[0]).toMatchObject({ id: 'a', name: 'All MDHouse Projects', customName: 'All MDHouse Projects', path: a, writable: false, saved: true });

      expect(s.run([a, '--name', 'reset', '--port', '61944']).code).toBe(0);
      expect(s.prefs().names).toEqual({});
      const reset = (await rootsAt(61944))[0]!;
      expect([reset.id, reset.name, 'customName' in reset]).toEqual(['a', 'a', false]);
    } finally {
      s.run(['exit', '--port', '61944']);
    }
  });

  test('--fg -p --name: the foreground daemon saves the name, and a restart keeps it', async () => {
    const s = scratch();
    const a = s.folder('a');
    const env = { ...process.env, XDG_CONFIG_HOME: s.cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '' };
    // The server answers before the foreground daemon has saved (-p) and named the root: wait for that, not just for HTTP.
    const fg = async (args: string[]) => {
      const p = Bun.spawn([process.execPath, CLI, ...args, '--port', '61946', '--fg'], { env, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
      for (let i = 0; i < 100; i++) {
        const named = await rootsAt(61946).then((roots) => roots[0]?.name === 'Foreground Saved', () => false);
        if (named) return p;
        await Bun.sleep(50);
      }
      p.kill();
      await p.exited;
      throw new Error('foreground mdhouse did not answer with the name within 5 s');
    };
    let p = await fg([a, '-p', '--name', 'Foreground Saved']);
    try {
      expect((await rootsAt(61946))[0]).toMatchObject({ name: 'Foreground Saved', customName: 'Foreground Saved', saved: true, writable: false });
      expect(s.prefs().names).toEqual({ [a]: 'Foreground Saved' });
    } finally {
      p.kill();
      await p.exited;
    }
    p = await fg([]);
    try {
      expect((await rootsAt(61946))[0]).toMatchObject({ path: a, name: 'Foreground Saved' });
    } finally {
      p.kill();
      await p.exited;
    }
  });

  test('without -p the name lives only as long as the daemon; a later -p carries it into prefs', async () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '--name', 'Cold Session', '--port', '61945']).code).toBe(0);
    try {
      expect((await rootsAt(61945))[0]).toMatchObject({ name: 'Cold Session', saved: false, writable: false });
      expect(s.prefs().names ?? {}).toEqual({});

      expect(s.run([b, '--name', 'Handoff Session', '--port', '61945']).code).toBe(0);
      expect((await rootsAt(61945)).find((r) => r.path === b)).toMatchObject({ name: 'Handoff Session', saved: false });
      expect(s.prefs().names ?? {}).toEqual({});
      expect(s.prefs().saved).toEqual([]);

      expect(s.run([b, '-p', '--port', '61945']).code).toBe(0);
      expect(s.prefs().names).toEqual({ [b]: 'Handoff Session' });
    } finally {
      s.run(['exit', '--port', '61945']);
    }
    // a fresh start serves the saved one by its saved name; the session name is gone with its daemon
    expect(s.run([a, '--port', '61945']).code).toBe(0);
    try {
      const roots = await rootsAt(61945);
      expect(roots.find((r) => r.path === a)!.name).toBe('a');
      expect(roots.find((r) => r.path === b)!.name).toBe('Handoff Session');
    } finally {
      s.run(['exit', '--port', '61945']);
    }
  });
});

describe('explicit RO from prefs: start, re-open, -p and --rw', () => {
  type Root = { path: string; mode?: string; writable: boolean; saved: boolean };
  const rootsAt = async (port: number) => ((await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()) as { roots: Root[] }).roots;
  const modeOf = async (port: number, path: string) => {
    const r = (await rootsAt(port)).find((x) => x.path === path)!;
    return [r.mode, r.writable];
  };

  test('a saved RO folder stays RO under auto-rw across starts; re-open and -p keep it; --rw grants for the session, -p --rw saves RW', async () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    mkdirSync(join(s.cfg, 'mdhouse'), { recursive: true });
    writeFileSync(
      join(s.cfg, 'mdhouse/prefs.json'),
      JSON.stringify({ version: 2, saved: [a, b], writable: [], readonly: [a], autoRwRules: [s.dir], settings: { autoRw: true } }),
    );
    try {
      expect(s.run(['--port', '61948']).code).toBe(0);
      expect(await modeOf(61948, a)).toEqual(['ro', false]);
      expect(await modeOf(61948, b)).toEqual(['inherit', true]);

      expect(s.run([a, '--port', '61948']).code).toBe(0); // bare re-open
      expect(await modeOf(61948, a)).toEqual(['ro', false]);
      expect(s.run([a, '-p', '--port', '61948']).code).toBe(0); // -p without --rw
      expect(await modeOf(61948, a)).toEqual(['ro', false]);
      expect(s.prefs().readonly).toEqual([a]);

      expect(s.run([a, '--rw', '--port', '61948']).code).toBe(0); // the OS owner's grant, this session
      expect(await modeOf(61948, a)).toEqual(['rw', true]);
      expect(s.prefs()).toMatchObject({ readonly: [a], writable: [] });

      expect(s.run(['exit', '--port', '61948']).code).toBe(0);
      expect(s.run(['--port', '61948']).code).toBe(0); // a fresh start reads the saved RO again
      expect(await modeOf(61948, a)).toEqual(['ro', false]);

      expect(s.run([a, '-p', '--rw', '--port', '61948']).code).toBe(0);
      expect(await modeOf(61948, a)).toEqual(['rw', true]);
      expect(s.prefs()).toMatchObject({ readonly: [], writable: [a] });

      // saved RO by another process after the start, then opened: RO, not auto-rw's grant
      const c = s.folder('c');
      writeFileSync(join(s.cfg, 'mdhouse/prefs.json'), JSON.stringify({ ...s.prefs(), saved: [a, b, c], readonly: [c] }));
      expect(s.run([c, '--port', '61948']).code).toBe(0);
      expect(await modeOf(61948, c)).toEqual(['ro', false]);
    } finally {
      s.run(['exit', '--port', '61948']);
    }
  });
});
