import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';

let base: string;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-projroots-')));
  for (const d of ['rw', 'auto', 'ro', 'ref']) {
    await mkdir(join(base, d));
    await writeFile(join(base, d, 'a.md'), '# a\n');
  }
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

test('/api/roots: the allowlisted project fields, with why a project is writable', async () => {
  const { serve: start } = await import('../src/server');
  const registry = await Registry.create([{ path: join(base, 'rw'), writable: true }, join(base, 'auto'), join(base, 'ro')]);
  await registry.addReference(join(base, 'ref'), '_ref', 'reference');
  const prefs = await Prefs.load(join(base, 'prefs.json'));
  await prefs.setAutoRw([join(base, 'auto')]);
  const port = 61750;
  const { server, watcher, control } = await start({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  type Row = Record<string, unknown>;
  const roots = async () => {
    const body = (await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()) as { roots: Row[] } & Row;
    expect(Object.keys(body).sort()).toEqual(['home', 'roots', 'single']);
    return Object.fromEntries(body.roots.map((r) => [r.id as string, r]));
  };
  try {
    const on = await roots();
    for (const r of Object.values(on)) {
      const want = ['id', 'kind', 'name', 'path', 'saved', 'writable', ...(r.writable ? ['writableBy'] : [])];
      expect(Object.keys(r).sort()).toEqual(want.sort());
    }
    expect(on.rw).toMatchObject({ kind: 'project', path: join(base, 'rw'), writable: true, writableBy: 'rw' });
    expect(on.auto).toMatchObject({ writable: true, writableBy: 'auto' });
    expect(on.ro).toMatchObject({ writable: false });
    expect(on.ro!.writableBy).toBeUndefined();
    expect(on._ref).toMatchObject({ kind: 'reference', writable: false });
    expect(on._ref!.writableBy).toBeUndefined();

    // auto-rw off: the covered project is read-only again, `--rw` still holds
    await prefs.updateSettings({ autoRw: false });
    const off = await roots();
    expect(off.auto).toMatchObject({ writable: false });
    expect(off.auto!.writableBy).toBeUndefined();
    expect(off.rw).toMatchObject({ writable: true, writableBy: 'rw' });

    // reading grants nothing: reference material still cannot be removed
    const remove = await fetch(`http://127.0.0.1:${port}/api/roots/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: '_ref' }) });
    expect(remove.status).toBe(403);
    expect(Object.keys(await roots())).toContain('_ref');
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
  }
});
