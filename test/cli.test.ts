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
      expect((await at(61940, '/api/roots/remove', { id: '_mdhouse' })).status).toBe(403);
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
