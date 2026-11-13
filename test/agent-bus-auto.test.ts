import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { abLine, accountSocket, useSystemSocketDir } from '../src/lib/agent-bus';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

const login = userInfo().username;
const disk = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { agentBus?: { enabled?: unknown } };

/** A sandbox: an empty runtime dir and an empty "system" dir, so the machine's real Agent Bus is never looked at. */
async function sandbox() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'mdh-auto-')));
  const runtime = join(base, 'run');
  const system = join(base, 'sys');
  await mkdir(join(runtime, 'agent-bus'), { recursive: true });
  await mkdir(system);
  const before = process.env.XDG_RUNTIME_DIR;
  const override = process.env.MDHOUSE_AB_SOCKET_DIRS;
  delete process.env.MDHOUSE_AB_SOCKET_DIRS; // the preload's "no bus anywhere"; this sandbox names its own directories
  process.env.XDG_RUNTIME_DIR = runtime;
  useSystemSocketDir(system);
  const socket = join(runtime, 'agent-bus', `user-${login}.sock`);
  return {
    base, runtime, system, socket,
    done: async () => {
      useSystemSocketDir();
      if (override !== undefined) process.env.MDHOUSE_AB_SOCKET_DIRS = override;
      if (before === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = before;
      await rm(base, { recursive: true, force: true });
    },
  };
}
let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup.reverse()) await c();
  cleanup = [];
});
const sb = async () => {
  const s = await sandbox();
  cleanup.push(s.done);
  return s;
};

describe('the stored setting', () => {
  test('a prefs file that does not exist yet starts as auto, and writes it as the string auto', async () => {
    const s = await sb();
    const path = join(s.base, 'prefs.json');
    const prefs = await Prefs.load(path);
    expect(prefs.agentBus.stored).toBe('auto');
    await prefs.addSaved(s.base);
    expect(disk(path).agentBus?.enabled).toBe('auto');
    // an older mdhouse reads `enabled === true`: auto is off for it
    expect(disk(path).agentBus?.enabled === true).toBe(false);
    expect((await Prefs.load(path)).agentBus.stored).toBe('auto');
  });

  test('a file that exists keeps its own value: missing key and false are off, true is on, auto stays auto', async () => {
    const s = await sb();
    const at = async (name: string, body: unknown) => {
      const p = join(s.base, name);
      await writeFile(p, JSON.stringify(body));
      return (await Prefs.load(p)).agentBus;
    };
    await writeFile(s.socket, ''); // the account socket is there: still off for a file that says false or says nothing
    expect((await at('none.json', { version: 2 })).stored).toBe(false);
    expect((await at('none.json', { version: 2 })).enabled).toBe(false);
    expect((await at('off.json', { version: 2, agentBus: { enabled: false } })).enabled).toBe(false);
    expect((await at('on.json', { version: 2, agentBus: { enabled: true } })).stored).toBe(true);
    expect((await at('auto.json', { version: 2, agentBus: { enabled: 'auto' } })).stored).toBe('auto');
  });

  test('auto is looked at every time: on while the account socket exists, off when it is gone', async () => {
    const s = await sb();
    const prefs = await Prefs.load(join(s.base, 'prefs.json'));
    expect(prefs.agentBus.enabled).toBe(false);
    await writeFile(s.socket, '');
    expect(prefs.agentBus.enabled).toBe(true);
    await unlink(s.socket);
    expect(prefs.agentBus.enabled).toBe(false);
    await prefs.setAgentBus({ enabled: true });
    expect([prefs.agentBus.enabled, prefs.agentBus.stored]).toEqual([true, true]);
    await prefs.setAgentBus({ enabled: 'auto' });
    expect(prefs.agentBus.stored).toBe('auto');
  });
});

describe('the lines', () => {
  test('on, auto and off, with and without the socket', async () => {
    const s = await sb();
    const path = `${s.runtime}/agent-bus/user-${login}.sock`;
    const system = `${s.system}/user-${login}.sock`;
    expect(accountSocket()).toEqual({ path: system, found: false, tried: [path, system] });
    expect(abLine('auto', '')).toBe(`auto — not installed (no ${path} or ${system})`);
    expect(abLine(false, '')).toBe('off');
    expect(abLine(true, '')).toBe(`on — ${system} (not found)`);
    await writeFile(s.socket, '');
    expect(accountSocket()).toEqual({ path, found: true, tried: [path, system] });
    expect(abLine('auto', '')).toBe(`on — ${path} (found; auto)`);
    expect(abLine(true, '')).toBe(`on — ${path} (found)`);
    expect(abLine(false, '')).toBe(`off — found ${path}: mdhouse --agent-bus on`);
    expect(abLine(true, 'http://127.0.0.1:6767')).toBe('on — http://127.0.0.1:6767');
  });

  test('the system directory is the fallback when there is no runtime directory', async () => {
    const s = await sb();
    delete process.env.XDG_RUNTIME_DIR;
    expect(accountSocket().path).toBe(`${s.system}/user-${login}.sock`);
    await writeFile(`${s.system}/user-${login}.sock`, '');
    expect(accountSocket().found).toBe(true);
  });
});

describe('MDHOUSE_AB_SOCKET_DIRS', () => {
  test('replaces the search: only the named directories are looked in', async () => {
    const s = await sb();
    const only = join(s.base, 'only');
    await mkdir(only);
    await writeFile(s.socket, ''); // present in the XDG dir, but not where the override looks
    const env = { ...process.env, MDHOUSE_AB_SOCKET_DIRS: only };
    expect(accountSocket(env)).toEqual({ path: `${only}/user-${login}.sock`, found: false, tried: [`${only}/user-${login}.sock`] });
    await writeFile(`${only}/user-${login}.sock`, '');
    expect(accountSocket(env).found).toBe(true);
  });
});

describe('serve() with the account socket present and absent', () => {
  test('/api/ab follows the socket without a restart', async () => {
    const s = await sb();
    const proj = join(s.base, 'p');
    await mkdir(proj);
    await writeFile(join(proj, 'a.md'), '# a\n');
    const prefs = await Prefs.load(join(s.base, 'prefs.json'));
    await prefs.addSaved(proj);
    const registry = await Registry.create([proj]);
    const port = testPort(61960);
    const srv = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
    cleanup.push(async () => {
      srv.server.stop(true);
      srv.watcher.close();
      srv.control?.stop();
    });
    const status = async () => (await (await fetch(`http://127.0.0.1:${port}/api/ab`)).json()) as { enabled: boolean; connected?: boolean };
    expect((await status()).enabled).toBe(false);
    const daemon = Bun.serve({
      unix: s.socket,
      fetch: (req) => {
        const p = new URL(req.url).pathname;
        if (p === '/identity') return Response.json({ protocol: 1, protocol_min: 1 });
        if (p === '/status') return Response.json({ you: 'test' });
        return Response.json([]);
      },
    });
    cleanup.push(async () => daemon.stop(true));
    const on = await status();
    expect(on.enabled).toBe(true);
    daemon.stop(true);
    await unlink(s.socket).catch(() => {});
    expect((await status()).enabled).toBe(false);
  });
});
