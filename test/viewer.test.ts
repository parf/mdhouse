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
  test('2.3.3 (version-1 code) finds no RW grant and no auto-rw; it refuses to write the file', async () => {
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

  test('a version-2 build (bfd08fc) reads it as newer: blocked, no saved RW, never rewritten', async () => {
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
  expect([...VIEWER_REFUSED].sort()).toEqual(['attribution', 'doc-write', 'external-send', 'flow', 'git-sync', 'git-write', 'shared-prefs']);
  // Kept: the administrator switches the mode and manages roots on the web; `control` is the OS-owner socket.
  const kept = ['admin-session', 'control', ...ADMIN_FAMILIES];
  expect([...VIEWER_REFUSED, ...kept].sort()).toEqual([...FAMILIES].sort());
});

describe('a Viewer over HTTP', () => {
  async function start(port: number) {
    const dir = await tmp('mdhouse-viewer-srv-');
    const proj = join(dir, 'proj');
    await mkdir(proj);
    await writeFile(join(proj, 'a.md'), '- [ ] t\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    await prefs.addSaved(proj, 'rw');
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
    return { ...s, dir, proj, prefs, registry, origin, post, writable, stop };
  }

  test('every refused-family route is 403 reason:viewer; the mode switches back from Settings', async () => {
    const t = await start(61791);
    try {
      expect(await t.writable()).toBe(true);
      expect((await t.post('/api/settings', { mode: 'viewer' })).status).toBe(200);
      expect(((await (await fetch(`${t.origin}/api/settings`)).json()) as { mode: string }).mode).toBe('viewer');
      expect(await t.writable()).toBe(false);

      const refused = t.routes.filter((r) => r.family && VIEWER_REFUSED.has(r.family));
      expect(refused.length).toBeGreaterThan(10);
      for (const r of refused) {
        const res = await t.post(r.path, {});
        expect([r.path, res.status, await res.json()]).toEqual([r.path, 403, { error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' }]);
      }
      expect(readFileSync(join(t.proj, 'a.md'), 'utf8')).toBe('- [ ] t\n');

      expect((await t.post('/api/settings', { mode: 'Viewer' })).status).toBe(400);
      expect((await t.post('/api/settings', { mode: 'workspace' })).status).toBe(200);
      expect(await t.writable()).toBe(true);
      expect((await t.post('/api/task', {})).status).toBe(400); // past the gate: the body is checked
    } finally {
      await t.stop();
    }
  });

  test('switching needs the administrator: with users configured, a signed-in user cannot', async () => {
    const t = await start(61792);
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
    const t = await start(61793);
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
