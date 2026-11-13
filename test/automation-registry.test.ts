import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { contentHash } from '../src/lib/automation';
import { loadRegistrations, readRegistration, registrationLookup } from '../src/lib/automation-registry';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { Registry } from '../src/lib/roots';

const catalog = await loadFlowCatalog(resolve(import.meta.dir, '../doc/flows'));
const good = (o: Record<string, unknown> = {}) => JSON.stringify({ id: 'weekly', flow: 'recent-commits-review', range: 'since-last-run', when: { cron: '30 8 * * 1-5' }, ...o });

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
  dirs = [];
});
async function project(files: Record<string, string>) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'mdh-auto-reg-')));
  dirs.push(base);
  const proj = join(base, 'proj');
  await mkdir(join(proj, '.mdhouse', 'automation'), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(proj, '.mdhouse', 'automation', name), text);
  const registry = await Registry.create([proj]);
  return { base, proj, registry, rootId: registry.list()[0]!.id };
}

describe('the registrations of a project', () => {
  test('a valid file loads, with the hash of its exact bytes', async () => {
    const p = await project({ 'weekly.json': good() });
    const r = await loadRegistrations(p.registry, p.rootId, catalog);
    expect(r.errors).toEqual([]);
    expect(r.loaded).toHaveLength(1);
    expect(r.loaded[0]).toMatchObject({ rootId: p.rootId, hash: contentHash(good()), reg: { id: 'weekly', flow: 'recent-commits-review' } });
  });

  test('each bad file is an error with its reason, and the good ones still load', async () => {
    const p = await project({
      'weekly.json': good(),
      'docs.json': good({ id: 'docs', flow: 'docs-refresh-verify' }),
      'trust.json': good({ id: 'trust', flow: 'docs-trust-report' }),
      'ghost.json': good({ id: 'ghost', flow: 'no-such-flow' }),
      'wrong-id.json': good({ id: 'other' }),
      'broken.json': '{',
      'Bad Name.json': good(),
      'notes.txt': 'ignored',
    });
    const r = await loadRegistrations(p.registry, p.rootId, catalog);
    expect(r.loaded.map((l) => l.reg.id)).toEqual(['docs', 'weekly']);
    const why = Object.fromEntries(r.errors.map((e) => [e.file, e.error]));
    expect(why['trust.json']).toMatch(/not analysis-only with a range/);
    expect(why['ghost.json']).toMatch(/not an installed package/);
    expect(why['wrong-id.json']).toMatch(/not the file's name/);
    expect(why['broken.json']).toMatch(/not JSON/);
    expect(why['Bad Name.json']).toMatch(/not a registration id/);
    expect(Object.keys(why)).not.toContain('notes.txt');
  });

  test('a project with no automation folder, an unknown root and the reference root hold none', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdh-auto-reg-')));
    dirs.push(base);
    await mkdir(join(base, 'p'));
    await mkdir(join(base, 'ref'));
    const registry = await Registry.create([join(base, 'p')]);
    await registry.addReference(join(base, 'ref'), '_ref');
    expect(await loadRegistrations(registry, registry.list()[0]!.id, catalog)).toEqual({ loaded: [], errors: [] });
    expect(await loadRegistrations(registry, 'nope', catalog)).toEqual({ loaded: [], errors: [] });
    expect(await loadRegistrations(registry, '_ref', catalog)).toEqual({ loaded: [], errors: [] });
    expect(await readRegistration(registry, '_ref', 'weekly', catalog)).toBeNull();
  });

  test('a file that is a link out of the project, a directory, or oversize is never read as a registration', async () => {
    const p = await project({ 'big.json': good({ notify: '#' + 'a'.repeat(20_000) }) });
    const outside = join(p.base, 'outside.json');
    await writeFile(outside, good({ id: 'leak' }));
    await symlink(outside, join(p.proj, '.mdhouse', 'automation', 'leak.json'));
    await mkdir(join(p.proj, '.mdhouse', 'automation', 'dir.json'));
    const r = await loadRegistrations(p.registry, p.rootId, catalog);
    expect(r.loaded).toEqual([]);
    const why = Object.fromEntries(r.errors.map((e) => [e.file, e.error]));
    expect(why['big.json']).toMatch(/over 16384 bytes/);
    expect(why['leak.json']).toMatch(/not a plain file inside the project/);
    expect(why['dir.json']).toMatch(/not a plain file inside the project/);
  });

  test('a lookup by id reads only that file, and an id that is a path reads nothing', async () => {
    const p = await project({ 'weekly.json': good() });
    await writeFile(join(p.proj, 'secret.json'), good({ id: 'secret' }));
    const lookup = registrationLookup(p.registry, async () => catalog);
    expect(await lookup(p.rootId, 'weekly')).toMatchObject({ loaded: { reg: { id: 'weekly' } } });
    expect(await lookup(p.rootId, 'missing')).toBeNull();
    for (const id of ['../../secret', '../secret', 'a/b', '', '.', 'WEEKLY']) expect(await lookup(p.rootId, id)).toBeNull();
    expect(await lookup('nope', 'weekly')).toBeNull();
  });

  test('the file is read each time: a changed file is a different hash', async () => {
    const p = await project({ 'weekly.json': good() });
    const a = await readRegistration(p.registry, p.rootId, 'weekly', catalog);
    await writeFile(join(p.proj, '.mdhouse', 'automation', 'weekly.json'), good({ maxLate: '5m' }));
    const b = await readRegistration(p.registry, p.rootId, 'weekly', catalog);
    expect(a && 'loaded' in a && b && 'loaded' in b && a.loaded.hash !== b.loaded.hash).toBe(true);
  });
});
