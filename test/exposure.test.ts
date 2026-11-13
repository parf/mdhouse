import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exposedNote, exposureOk, hashPassword } from '../src/lib/access';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

const none = { allow: [] as string[], users: {} as Record<string, string>, hostNames: [] as string[] };

describe('exposureOk (Q-R3-EXPOSE1, Q-R3-HOSTNAME1)', () => {
  test('a loopback bind may write', () => {
    for (const host of ['127.0.0.1', '127.1.2.3', '::1', '[::1]', 'localhost', 'LocalHost', '::ffff:127.0.0.1']) expect([host, exposureOk(host, none)]).toEqual([host, true]);
  });

  test('a network bind with no policy may not', () => {
    for (const host of ['0.0.0.0', '::', '192.168.1.5', '10.0.0.1', 'myhost', 'myhost.local', '::ffff:192.168.1.5']) expect([host, exposureOk(host, none)]).toEqual([host, false]);
  });

  test('users, an allow list or host names are each a policy', () => {
    expect(exposureOk('0.0.0.0', { ...none, users: { ann: 'h' } })).toBe(true);
    expect(exposureOk('0.0.0.0', { ...none, allow: ['192.168.1.0/24'] })).toBe(true);
    expect(exposureOk('0.0.0.0', { ...none, hostNames: ['md.example'] })).toBe(true);
  });

  test('the start line names the bind and the fix', () => {
    expect(exposedNote('0.0.0.0')).toContain('served on 0.0.0.0');
    expect(exposedNote('0.0.0.0')).toContain('mdhouse user-add');
    expect(exposedNote('0.0.0.0')).toContain('mdhouse --allow');
  });
});

describe('serve() on 0.0.0.0', () => {
  test('every project read-only until a policy is set; each policy lifts it at once; a write is refused meanwhile', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-expose-')));
    const proj = join(dir, 'proj');
    await mkdir(proj);
    await writeFile(join(proj, 'a.md'), '- [ ] t\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const registry = await Registry.create([{ path: proj, mode: 'rw' }]);
    const port = testPort(61960);
    const s = await serve({ registry, prefs, port, hostname: '0.0.0.0', noGit: true });
    const origin = `http://127.0.0.1:${port}`;
    const root = registry.list()[0]!;
    try {
      expect(root.writable).toBe(false);
      const roots = (await (await fetch(`${origin}/api/roots`)).json()) as { roots: Array<{ writable: boolean }> };
      expect(roots.roots[0]!.writable).toBe(false);
      const doc = (await (await fetch(`${origin}/api/doc?p=${root.id}/a.md`)).json()) as { writable: boolean };
      expect(doc.writable).toBe(false);
      const tick = await fetch(`${origin}/api/task`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ p: `${root.id}/a.md`, line: 0, hash: 'x', checked: true }) });
      expect([tick.status, ((await tick.json()) as { error: string }).error]).toEqual([403, expect.stringContaining('read-only')]);
      expect(await readFile(join(proj, 'a.md'), 'utf8')).toBe('- [ ] t\n');
      await expect(registry.writeFile(`${root.id}/a.md`, 'x')).rejects.toThrow();

      await prefs.setAllow(['192.168.1.0/24']);
      expect(root.writable).toBe(true);
      await prefs.setAllow([]);
      expect(root.writable).toBe(false);

      await prefs.setHostNames(['md.example']);
      expect(root.writable).toBe(true);
      await prefs.setHostNames([]);
      expect(root.writable).toBe(false);

      await prefs.setUser('ann', await hashPassword('secret'));
      expect(root.writable).toBe(true);
      await prefs.removeUser('ann');
      expect(root.writable).toBe(false);

      // The CLI is another process: its change to prefs.json applies at once.
      const cli = await Prefs.load(join(dir, 'prefs.json'));
      await cli.setAllow(['10.0.0.0/8']);
      expect(root.writable).toBe(true);
      await cli.setAllow([]);
      expect(root.writable).toBe(false);
    } finally {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a loopback bind writes as before', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-expose-lo-')));
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const registry = await Registry.create([{ path: dir, mode: 'rw' }]);
    const s = await serve({ registry, prefs, port: testPort(61961), hostname: '127.0.0.1', noGit: true });
    try {
      expect(registry.list()[0]!.writable).toBe(true);
    } finally {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
