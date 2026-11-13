import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ADMIN_FAMILIES, FAMILIES, VIEWER_REFUSED } from '../src/lib/authz';
import { run } from '../src/lib/gitpage';
import { Prefs, VIEWER_VERSION } from '../src/lib/prefs';
import { ReadOnlyError, Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));
const disk = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
const LIB = resolve(import.meta.dir, '../src/lib');

/** A saved RW `rw`, a saved RO `ro`, a saved inherit `auto` under an auto-rw path. */
async function fixture(dir: string) {
  const at = (n: string) => join(dir, n);
  for (const n of ['rw', 'ro', 'auto']) await mkdir(at(n), { recursive: true });
  const f = join(dir, 'prefs.json');
  const prefs = await Prefs.load(f);
  await prefs.addSaved(at('rw'), 'rw');
  await prefs.addSaved(at('ro'));
  await prefs.commitMode(at('ro'), 'ro', () => null);
  await prefs.addSaved(at('auto'));
  await prefs.setAutoRw([at('auto')]);
  return { at, f, prefs };
}

/** Is `rev` in this clone's history? A shallow clone or an exported tree has none. */
const hasRev = (rev: string): boolean =>
  Bun.spawnSync(['git', 'cat-file', '-e', `${rev}^{commit}`], { cwd: import.meta.dir, stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;

/** `src/lib/prefs.ts` as of `rev`, its sibling imports pointed at today's tree. */
async function prefsAt(rev: string, dir: string): Promise<typeof Prefs> {
  const shown = await run(import.meta.dir, ['show', `${rev}:src/lib/prefs.ts`]);
  if (shown.code !== 0) throw new Error(`git show ${rev}:src/lib/prefs.ts: ${shown.err}`);
  const file = join(dir, `prefs-${rev.replace(/\W/g, '')}.ts`);
  await writeFile(file, shown.out.replace(/from '\.\/([\w-]+)'/g, (_, m: string) => `from '${LIB}/${m}'`));
  return ((await import(file)) as { Prefs: typeof Prefs }).Prefs;
}

describe('Viewer in prefs.json: version 3, RW grants under viewerWritable', () => {
  test('workspace → viewer → workspace: one write each, stored modes kept, the file back as it was', async () => {
    const dir = await tmp('mdhouse-viewer-');
    try {
      const { at, f, prefs } = await fixture(dir);
      const before = disk(f);
      expect(before).toMatchObject({ version: 2, writable: [at('rw')], readonly: [at('ro')] });
      expect(before).not.toHaveProperty('mode');

      expect(await prefs.setMode('viewer')).toBe('viewer');
      const viewer = disk(f);
      expect(viewer).toMatchObject({ version: VIEWER_VERSION, mode: 'viewer', writable: [], viewerWritable: [at('rw')], readonly: [at('ro')] });
      expect(prefs.savedMode(at('rw'))).toBe('rw');
      expect(prefs.savedMode(at('ro'))).toBe('ro');
      expect(prefs.accessBlocked()).toBeNull();

      // idempotent: the same mode again leaves the same file
      await prefs.setMode('viewer');
      expect(disk(f)).toEqual(viewer);
      // a fresh reader of the Viewer file sees the same grants
      const again = await Prefs.load(f);
      expect([again.mode(), again.savedMode(at('rw')), again.savedMode(at('ro'))]).toEqual(['viewer', 'rw', 'ro']);

      expect(await prefs.setMode('workspace')).toBe('workspace');
      expect(disk(f)).toEqual(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a failed write changes nothing: grants stay in exactly one key', async () => {
    const dir = await tmp('mdhouse-viewer-fail-');
    try {
      const { at, f, prefs } = await fixture(dir);
      const text = readFileSync(f, 'utf8');
      await chmod(dir, 0o500); // no temp file, no rename
      try {
        await expect(prefs.setMode('viewer')).rejects.toThrow();
      } finally {
        await chmod(dir, 0o700);
      }
      expect(readFileSync(f, 'utf8')).toBe(text);
      expect(prefs.mode()).toBe('workspace');
      expect(prefs.savedMode(at('rw'))).toBe('rw');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['version 3 without mode', { version: 3, saved: ['/s'], viewerWritable: ['/s'], readonly: [], autoRwRules: [] }],
    ['version 3 with writable entries', { version: 3, mode: 'viewer', saved: ['/s'], writable: ['/s'], viewerWritable: [], readonly: [], autoRwRules: [] }],
    ['version 3 without viewerWritable', { version: 3, mode: 'viewer', saved: ['/s'], readonly: [], autoRwRules: [] }],
    ['version 2 with viewerWritable', { version: 2, saved: ['/s'], viewerWritable: ['/s'], readonly: [], autoRwRules: [] }],
    ['an unknown mode', { version: 2, mode: 'Viewer', saved: ['/s'], writable: ['/s'], readonly: [], autoRwRules: [] }],
  ])('%s: blocked — no writes granted, never rewritten', async (_what, content) => {
    const dir = await tmp('mdhouse-viewer-bad-');
    try {
      const f = join(dir, 'prefs.json');
      const text = JSON.stringify(content);
      await writeFile(f, text);
      const prefs = await Prefs.load(f);
      expect(prefs.accessBlocked()).not.toBeNull();
      expect(prefs.savedMode('/s')).not.toBe('rw');
      await expect(prefs.setMode('workspace')).rejects.toThrow();
      expect(readFileSync(f, 'utf8')).toBe(text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('an older mdhouse reading a Viewer file', () => {
  test.skipIf(!hasRev('v2.3.3'))('2.3.3 (version-1 code) finds no RW grant and no auto-rw; it refuses to write the file', async () => {
    const dir = await tmp('mdhouse-viewer-233-');
    try {
      const { at, f, prefs } = await fixture(dir);
      await prefs.setMode('viewer');
      const text = readFileSync(f, 'utf8');
      const Old = await prefsAt('v2.3.3', dir);
      const reader = await Old.load(f);
      for (const n of ['rw', 'ro', 'auto']) expect(reader.isWritableSaved(at(n)) || reader.autoRwCovers(at(n))).toBe(false);
      await expect(reader.addSaved('/x')).rejects.toThrow(/version 3/);
      expect(readFileSync(f, 'utf8')).toBe(text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(!hasRev('bfd08fc'))('a version-2 build (bfd08fc) reads it as newer: blocked, no saved RW, never rewritten', async () => {
    const dir = await tmp('mdhouse-viewer-v2-');
    try {
      const { at, f, prefs } = await fixture(dir);
      await prefs.setMode('viewer');
      const text = readFileSync(f, 'utf8');
      const V2 = await prefsAt('bfd08fc', dir);
      const reader = await V2.load(f);
      expect(reader.accessBlocked()).toMatch(/version 3/);
      for (const n of ['rw', 'auto']) expect(reader.savedMode(at(n)) === 'rw' || reader.autoRwCovers(at(n))).toBe(false);
      await expect(reader.addSaved('/x')).rejects.toThrow(/version 3/);
      expect(readFileSync(f, 'utf8')).toBe(text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test('every mutation family is classified for a Viewer: refused, or administrator-only', () => {
  expect([...VIEWER_REFUSED].sort()).toEqual(['attribution', 'automation', 'doc-write', 'external-send', 'flow', 'git-sync', 'git-write', 'shared-prefs']);
  // Kept: the administrator switches the mode and manages roots on the web; `control` is the OS-owner socket.
  // `automation` is both: administrator-only, and refused by a Viewer.
  const kept = ['admin-session', 'control', ...ADMIN_FAMILIES];
  expect([...new Set([...VIEWER_REFUSED, ...kept])].sort()).toEqual([...FAMILIES].sort());
  expect([...ADMIN_FAMILIES].filter((f) => VIEWER_REFUSED.has(f))).toEqual(['automation']);
});

describe('a Viewer over HTTP', () => {
  async function start(port: number, hostNames: string[] = []) {
    const dir = await tmp('mdhouse-viewer-srv-');
    const proj = join(dir, 'proj');
    await mkdir(proj);
    await mkdir(join(dir, 'other'));
    await writeFile(join(proj, 'a.md'), '- [ ] t\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    await prefs.addSaved(proj, 'rw');
    if (hostNames.length) await prefs.setHostNames(hostNames);
    const registry = await Registry.create([{ path: proj, mode: 'rw' }]);
    const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true, localAdmin: true });
    const origin = `http://127.0.0.1:${port}`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
    const writable = async () => ((await (await fetch(`${origin}/api/roots`)).json()) as { roots: Array<{ writable: boolean }> }).roots[0]!.writable;
    const stop = async () => {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      await rm(dir, { recursive: true, force: true });
    };
    return { ...s, port, dir, proj, prefs, registry, origin, post, writable, stop };
  }

  test('every refused-family route is 403 reason:viewer; the mode switches back from Settings', async () => {
    const t = await start(testPort(61791));
    try {
      expect(await t.writable()).toBe(true);
      expect((await t.post('/api/settings', { mode: 'viewer' })).status).toBe(200);
      expect(((await (await fetch(`${t.origin}/api/settings`)).json()) as { mode: string }).mode).toBe('viewer');
      expect(await t.writable()).toBe(false);

      // read() routes with external effects are listed by hand: a Viewer serves them (reading).
      const readsWithEffects = ['/api/rag/search'];
      for (const p of readsWithEffects) expect(t.routes.find((r) => r.path === p)).toMatchObject({ family: null });
      const refused = t.routes.filter((r) => r.family && VIEWER_REFUSED.has(r.family));
      expect(refused.length).toBeGreaterThan(10);
      for (const r of refused) {
        const res = await t.post(r.path, {});
        // An administrator family a Viewer refuses (`automation`) is refused as a Viewer first.
        expect([r.path, res.status, await res.json()]).toEqual([r.path, 403, { error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' }]);
      }
      expect(readFileSync(join(t.proj, 'a.md'), 'utf8')).toBe('- [ ] t\n');

      // a Viewer has no local administrator: switching back takes a minted session
      expect((await t.post('/api/settings', { mode: 'workspace' })).status).toBe(401);
      const cookie = { cookie: await adminLogin(t.port) };
      expect((await t.post('/api/settings', { mode: 'Viewer' }, cookie)).status).toBe(400);
      expect((await t.post('/api/settings', { mode: 'workspace' }, cookie)).status).toBe(200);
      expect(await t.writable()).toBe(true);
      expect((await t.post('/api/task', {})).status).toBe(400); // past the gate: the body is checked
    } finally {
      await t.stop();
    }
  });

  test.each([
    ['plain loopback', [] as string[]],
    ['behind a host-name proxy, X-Forwarded-For', ['notes.example']],
  ])('%s: no local administrator in a Viewer — switching back and roots/add are 401', async (_how, names) => {
    const t = await start(names.length ? testPort(61801) : testPort(61805), names);
    try {
      const proxied: Record<string, string> = names.length ? { host: names[0]!, origin: `http://${names[0]}`, 'x-forwarded-for': '203.0.113.7' } : {};
      const admin = async (h: Record<string, string> = {}) => (await (await fetch(`${t.origin}/api/admin`, { headers: { ...proxied, ...h } })).json()) as Record<string, unknown>;
      expect(await admin()).toEqual({ admin: true, local: true });
      expect((await t.post('/api/settings', { mode: 'viewer' }, proxied)).status).toBe(200);
      expect(await admin()).toEqual({ admin: false });
      for (const [path, body] of [
        ['/api/settings', { mode: 'workspace' }],
        ['/api/roots/add', { path: join(t.dir, 'other'), mode: 'rw' }],
      ] as const) {
        const res = await t.post(path, body, proxied);
        expect([path, res.status, await res.json()]).toEqual([path, 401, { error: 'administrator session required', reason: 'admin' }]);
      }
      expect(t.prefs.mode()).toBe('viewer');
      if (names.length) {
        // --host-name refuses localhost, so no session can be minted: switching back is the CLI's (`mdhouse --workspace`)
        await expect(adminLogin(t.port)).rejects.toThrow(/--host-name is set/);
        await t.prefs.setMode('workspace');
      } else {
        const cookie = { cookie: await adminLogin(t.port) };
        expect((await t.post('/api/settings', { mode: 'workspace' }, cookie)).status).toBe(200);
      }
      expect(await admin()).toEqual({ admin: true, local: true });
    } finally {
      await t.stop();
    }
  });

  test.each([
    ['newer version', { version: 9 }],
    ['malformed version 3', { version: 3, mode: 'viewer' }],
    ['unknown mode', { version: 2, mode: 'x', readonly: [], autoRwRules: [] }],
  ])('a blocked prefs file (%s) fails closed: writes 403 reason:blocked, no local administrator, settings 409', async (_what, content) => {
    const t = await start(testPort(61806));
    try {
      const f = join(t.dir, 'prefs.json');
      const text = JSON.stringify({ saved: [t.proj], writable: [t.proj], ...content });
      await writeFile(f, text);
      expect(t.prefs.accessBlocked()).not.toBeNull();
      const send = await t.post('/api/ab/send', {});
      expect([send.status, ((await send.json()) as { reason: string }).reason]).toEqual([403, 'blocked']);
      expect(await (await fetch(`${t.origin}/api/admin`)).json()).toEqual({ admin: false });
      expect((await t.post('/api/settings', { mode: 'workspace' })).status).toBe(401);
      const cookie = { cookie: await adminLogin(t.port) };
      const res = await t.post('/api/settings', { mode: 'workspace', editLink: false }, cookie);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'blocked' });
      expect(readFileSync(f, 'utf8')).toBe(text);
    } finally {
      await t.stop();
    }
  });

  test('settings and the mode change in one write', async () => {
    const t = await start(testPort(61807));
    try {
      const f = join(t.dir, 'prefs.json');
      expect((await t.post('/api/settings', { mode: 'viewer', editLink: false })).status).toBe(200);
      expect(disk(f)).toMatchObject({ version: 3, mode: 'viewer', settings: { editLink: false } });
    } finally {
      await t.stop();
    }
  });

  test('switching needs the administrator: with users configured, a signed-in user cannot', async () => {
    const t = await start(testPort(61792));
    try {
      await t.prefs.setUser('ann', await Bun.password.hash('pw'));
      const res = await t.post('/api/settings', { mode: 'viewer' }, { authorization: `Basic ${btoa('ann:pw')}` });
      expect(res.status).toBe(401);
      expect(t.prefs.mode()).toBe('workspace');
    } finally {
      await t.stop();
    }
  });

  test('another process turning Viewer on refuses a write already past the route check', async () => {
    const t = await start(testPort(61793));
    try {
      const rel = `${t.registry.list()[0]!.id}/a.md`;
      await (await Prefs.load(join(t.dir, 'prefs.json'))).setMode('viewer'); // the CLI, say
      await expect(t.registry.writeFile(rel, 'x\n')).rejects.toBeInstanceOf(ReadOnlyError);
      expect(await readFile(join(t.proj, 'a.md'), 'utf8')).toBe('- [ ] t\n');
    } finally {
      await t.stop();
    }
  });
});

test('CLI: --viewer saves version 3, --workspace version 2', async () => {
  const cfg = await tmp('mdhouse-viewer-cli-');
  try {
    const cli = (...args: string[]) =>
      Bun.spawnSync([process.execPath, join(import.meta.dir, '../src/cli.ts'), ...args], {
        env: { ...process.env, XDG_CONFIG_HOME: cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '' },
      });
    const f = join(cfg, 'mdhouse', 'prefs.json');
    const on = cli('--viewer');
    expect([on.exitCode, on.stdout.toString()]).toEqual([0, 'mdhouse  mode:  viewer  (every project read-only)\n']);
    expect(disk(f)).toMatchObject({ version: 3, mode: 'viewer' });
    const off = cli('--workspace');
    expect([off.exitCode, off.stdout.toString()]).toEqual([0, 'mdhouse  mode:  workspace\n']);
    expect(disk(f)).toMatchObject({ version: 2 });
    expect(disk(f)).not.toHaveProperty('mode');
  } finally {
    await rm(cfg, { recursive: true, force: true });
  }
});
