import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';

let dir: string;
let file: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mdhouse-prefs-'));
  file = join(dir, 'prefs.json');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('saved directories', () => {
  test('round-trip through the file, sorted and without duplicates', async () => {
    const prefs = await Prefs.load(file);
    expect(await prefs.addSaved('/b')).toBe(true);
    expect(await prefs.addSaved('/a')).toBe(true);
    expect(await prefs.addSaved('/b')).toBe(false);

    const again = await Prefs.load(file);
    expect(again.savedDirs()).toEqual(['/a', '/b']);
    expect(again.isSaved('/a')).toBe(true);
  });

  test('removing says whether there was anything to remove', async () => {
    const prefs = await Prefs.load(file);
    expect(await prefs.removeSaved('/a')).toBe(true);
    expect(await prefs.removeSaved('/a')).toBe(false);
    expect((await Prefs.load(file)).savedDirs()).toEqual(['/b']);
  });

  test('marks survive a change to the saved list, and the list survives a mark', async () => {
    const prefs = await Prefs.load(file);
    await prefs.set('/b', 'README.md', 'favorite', true);
    await prefs.addSaved('/c');

    const again = await Prefs.load(file);
    expect(again.marksFor('/b', 'README.md')).toEqual(['favorite']);
    expect(again.savedDirs()).toEqual(['/b', '/c']);
  });

  test('a prefs file from before saved directories loads with none', async () => {
    const old = join(dir, 'old.json');
    await writeFile(old, JSON.stringify({ version: 1, roots: { '/x': { favorite: ['a.md'], muted: [], ignored: [] } } }));
    const prefs = await Prefs.load(old);
    expect(prefs.savedDirs()).toEqual([]);
    expect(prefs.marksFor('/x', 'a.md')).toEqual(['favorite']);
  });
});

describe('settings', () => {
  test('the edit link is on by default, and a change is kept', async () => {
    const f = join(dir, 'settings.json');
    const prefs = await Prefs.load(f);
    expect(prefs.settings.editLink).toBe(true);

    expect((await prefs.updateSettings({ editLink: false })).editLink).toBe(false);
    expect((await Prefs.load(f)).settings.editLink).toBe(false);
  });

  test('unknown keys and wrong types are ignored', async () => {
    const prefs = await Prefs.load(join(dir, 'settings2.json'));
    const after = await prefs.updateSettings({ editLink: 'no', nonsense: 1 });
    expect(after).toEqual({ editLink: true, editScheme: 'edit', autoRw: true, me: '' });
  });
});

describe('more than one writer', () => {
  test("two processes' changes both survive — each change is made against the file as it is now", async () => {
    const f = join(dir, 'shared.json');
    const daemon = await Prefs.load(f);
    const cli = await Prefs.load(f);

    await cli.addSaved('/x');
    await daemon.set('/r', 'a.md', 'favorite', true); // used to rewrite the file without /x
    await daemon.addSaved('/y');

    const after = await Prefs.load(f);
    expect(after.savedDirs()).toEqual(['/x', '/y']);
    expect(after.marksFor('/r', 'a.md')).toEqual(['favorite']);
  });

  test('no temporary file is left behind', async () => {
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(dir)).filter((n) => n.includes('.tmp'))).toEqual([]);
  });
});

describe('an unreadable prefs file', () => {
  test('is set aside, never written over', async () => {
    const { readdir, readFile: read } = await import('node:fs/promises');
    const f = join(dir, 'typo.json');
    const original = '{"saved": ["/keep"], "roots": {'; // a hand edit cut short
    await writeFile(f, original);

    const prefs = await Prefs.load(f);
    expect(prefs.savedDirs()).toEqual([]);
    await prefs.addSaved('/new');

    const backups = (await readdir(dir)).filter((n) => n.startsWith('typo.json.broken-'));
    expect(backups).toHaveLength(1);
    expect(await read(join(dir, backups[0]!), 'utf8')).toBe(original);
    expect((await Prefs.load(f)).savedDirs()).toEqual(['/new']);
  });

  test('a setting of the wrong type in the file falls back to its default', async () => {
    const f = join(dir, 'badtype.json');
    await writeFile(f, JSON.stringify({ settings: { editLink: 'no' } }));
    expect((await Prefs.load(f)).settings.editLink).toBe(true);
  });

  test('the edit scheme: default edit, a valid one kept and normalized, a bad one refused with the old value kept', async () => {
    const f = join(dir, 'scheme.json');
    const prefs = await Prefs.load(f);
    expect(prefs.settings.editScheme).toBe('edit');
    expect((await prefs.updateSettings({ editScheme: ' MdEdit: ' })).editScheme).toBe('mdedit');
    expect((await Prefs.load(f)).settings.editScheme).toBe('mdedit');
    for (const bad of ['javascript', 'http:', 'a b', '', 7]) {
      expect((await prefs.updateSettings({ editScheme: bad })).editScheme).toBe('mdedit');
    }
    expect((await prefs.updateSettings({ editLink: false })).editScheme).toBe('mdedit'); // Edit link off keeps it
    expect((await Prefs.load(f)).settings.editScheme).toBe('mdedit');
  });

  test('a file with no scheme, or a hand-edited bad one, loads as edit', async () => {
    const f = join(dir, 'noscheme.json');
    await writeFile(f, JSON.stringify({ settings: { editLink: false } }));
    expect((await Prefs.load(f)).settings).toMatchObject({ editLink: false, editScheme: 'edit' });
    for (const bad of ['javascript', 'data:', 'a b', 5]) {
      await writeFile(f, JSON.stringify({ settings: { editScheme: bad } }));
      expect((await Prefs.load(f)).settings.editScheme).toBe('edit');
    }
  });
});

describe('where to listen', () => {
  test('port and host are saved, and survive other changes', async () => {
    const f = join(dir, 'server.json');
    const prefs = await Prefs.load(f);
    expect(prefs.server).toEqual({});

    await prefs.setServer({ port: 8080 });
    await prefs.setServer({ host: '0.0.0.0' });
    await prefs.addSaved('/z');
    expect((await Prefs.load(f)).server).toEqual({ port: 8080, host: '0.0.0.0' });
  });

  test('a bad port is refused, and a bad one in the file is ignored', async () => {
    const prefs = await Prefs.load(join(dir, 'server2.json'));
    await expect(prefs.setServer({ port: 70000 })).rejects.toThrow();

    const f = join(dir, 'server3.json');
    await writeFile(f, JSON.stringify({ server: { port: 'eighty', host: 42 } }));
    expect((await Prefs.load(f)).server).toEqual({});
  });
});

describe('changes made at once, in one process', () => {
  test('none is lost and none fails — they run one after another', async () => {
    const f = join(dir, 'burst.json');
    const prefs = await Prefs.load(f);
    const names = Array.from({ length: 8 }, (_, i) => `f${i}.md`);

    await Promise.all([
      ...names.map((n) => prefs.set('/r', n, 'favorite', true)),
      prefs.updateSettings({ editLink: false }),
      prefs.addSaved('/burst'),
    ]);

    const after = await Prefs.load(f);
    expect(after.get('/r').favorite).toEqual(names);
    expect(after.settings.editLink).toBe(false);
    expect(after.savedDirs()).toEqual(['/burst']);
  });
});

describe('writable saved folders', () => {
  test('-P records a folder as asked: with rw writable, without it read-only again', async () => {
    const f = join(dir, 'rw.json');
    const prefs = await Prefs.load(f);
    await prefs.addSaved('/a', 'rw');
    await prefs.addSaved('/b');
    expect((await Prefs.load(f)).isWritableSaved('/a')).toBe(true);
    expect((await Prefs.load(f)).isWritableSaved('/b')).toBe(false);

    await prefs.addSaved('/a'); // saved again without --rw: write access taken away
    expect((await Prefs.load(f)).isWritableSaved('/a')).toBe(false);
  });

  test('forgetting a folder forgets its write access; only saved folders can be writable', async () => {
    const f = join(dir, 'rw2.json');
    const prefs = await Prefs.load(f);
    await prefs.addSaved('/c', 'rw');
    await prefs.removeSaved('/c');
    await prefs.addSaved('/c');
    expect((await Prefs.load(f)).isWritableSaved('/c')).toBe(false);

    const g = join(dir, 'rw3.json');
    await writeFile(g, JSON.stringify({ saved: ['/x'], writable: ['/x', '/not-saved', 3] }));
    const loaded = await Prefs.load(g);
    expect(loaded.isWritableSaved('/x')).toBe(true);
    expect(loaded.isWritableSaved('/not-saved')).toBe(false);
  });
});

describe('auto-rw', () => {
  test('a folder under an auto-rw path is writable while the setting is on; the CLI applies at once', async () => {
    const { Registry } = await import('../src/lib/roots');
    const { mkdtemp, mkdir: mk, rm: rmd } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-autorw-'));
    try {
      await mk(join(base, 'src/a'), { recursive: true });
      await mk(join(base, 'srcx'), { recursive: true });
      const f = join(base, 'prefs.json');
      const daemon = await Prefs.load(f);
      const registry = await Registry.create([join(base, 'src/a'), join(base, 'srcx')]);
      registry.autoRw = (d) => daemon.autoRwCovers(d);
      const [a, x] = registry.list();
      expect([a!.writable, x!.writable]).toEqual([false, false]);

      const cli = await Prefs.load(f);
      await Bun.sleep(5);
      await cli.setAutoRw([join(base, 'src')]);
      expect([a!.writable, x!.writable]).toEqual([true, false]); // srcx is not under src/

      await Bun.sleep(5);
      await cli.updateSettings({ autoRw: false });
      expect(a!.writable).toBe(false);

      // --rw for it still counts, whatever the switch.
      registry.setMode(a!.id, 'rw');
      expect(a!.writable).toBe(true);
    } finally {
      await rmd(base, { recursive: true, force: true });
    }
  });
});

test('a read while another process saves never sees a half file (D1)', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFile } = await import('../src/lib/prefs');
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-prefs-race-'));
  const path = join(dir, 'prefs.json');
  await Bun.write(path, '{"saved":[]}');
  // another process saving as Prefs does: a temp file renamed over, the size changing each time
  const writer = Bun.spawn(['bun', '-e', `
    const { writeFileSync, renameSync } = require('node:fs');
    for (let i = 0; i < 3000; i++) { writeFileSync(process.argv[1] + '.tmp', JSON.stringify({ saved: Array(i % 7).fill('/x') })); renameSync(process.argv[1] + '.tmp', process.argv[1]); }
  `, path]);
  try {
    let broken = 0;
    while (writer.exitCode === null) {
      if ((await readFile(path)) === 'broken') broken++;
      await Bun.sleep(0);
    }
    expect(broken).toBe(0);
  } finally {
    writer.kill();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a hand-written root entry missing a mark array loads with it empty (D2)', async () => {
  const f = join(dir, 'partial-root.json');
  await writeFile(f, JSON.stringify({ roots: { '/r': { favorite: ['a.md', 7] }, '/bad': 'x' } }));
  const prefs = await Prefs.load(f);
  expect(prefs.marksFor('/r', 'a.md')).toEqual(['favorite']);
  expect(prefs.hasMark('/r', 'a.md', 'muted')).toBe(false);
  expect(prefs.get('/r')).toEqual({ favorite: ['a.md'], muted: [], ignored: [] });
  expect(prefs.marksFor('/bad', 'a.md')).toEqual([]);
  expect((await prefs.set('/r', 'b.md', 'muted', true)).muted).toEqual(['b.md']);
});

describe('a file from a newer mdhouse (D5)', () => {
  test('unknown top-level keys survive a save', async () => {
    const { readFile: read } = await import('node:fs/promises');
    const f = join(dir, 'unknown-keys.json');
    await writeFile(f, JSON.stringify({ version: 1, theme: 'dark', newThing: { a: [1] } }));
    await (await Prefs.load(f)).addSaved('/x');
    const saved = JSON.parse(await read(f, 'utf8'));
    expect(saved).toMatchObject({ version: 2, theme: 'dark', newThing: { a: [1] }, saved: ['/x'] });
  });

  test('a file with a newer version is read, never written', async () => {
    const { readFile: read } = await import('node:fs/promises');
    const f = join(dir, 'version9.json');
    const original = JSON.stringify({ version: 9, saved: ['/keep'], theme: 'dark' });
    await writeFile(f, original);
    const prefs = await Prefs.load(f);
    expect(prefs.savedDirs()).toEqual(['/keep']);
    await expect(prefs.addSaved('/x')).rejects.toThrow(/version 9/);
    expect(await read(f, 'utf8')).toBe(original);
    expect(prefs.savedDirs()).toEqual(['/keep']);
  });
});

test('prefs.json is written 0600 in a config dir created 0700 — it holds password hashes (D3)', async () => {
  const { stat } = await import('node:fs/promises');
  const f = join(dir, 'private', 'cfg', 'prefs.json');
  const old = process.umask(0o002);
  try {
    await (await Prefs.load(f)).setUser('ann', '$argon2id$x');
    expect((await stat(f)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'private', 'cfg'))).mode & 0o777).toBe(0o700);
    await (await Prefs.load(f)).addSaved('/x');
    expect((await stat(f)).mode & 0o777).toBe(0o600);
  } finally {
    process.umask(old);
  }
});

test('a symlinked prefs.json stays a link; the save goes to its target (D6)', async () => {
  const { lstat, mkdir, readFile: read, symlink } = await import('node:fs/promises');
  await mkdir(join(dir, 'dotfiles'));
  const real = join(dir, 'dotfiles', 'prefs.json');
  const link = join(dir, 'linked.json');
  await writeFile(real, '{}');
  await symlink(real, link);
  await (await Prefs.load(link)).addSaved('/x');
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
  expect(JSON.parse(await read(real, 'utf8')).saved).toEqual(['/x']);
});

describe('processes saving at once (D4)', () => {
  test('no change is lost — one process at a time holds prefs.json.lock', async () => {
    const f = join(dir, 'many.json');
    const procs = Array.from({ length: 6 }, (_, i) =>
      Bun.spawn(['bun', '-e', `
        const { Prefs } = await import(${JSON.stringify(join(import.meta.dir, '../src/lib/prefs'))});
        const p = await Prefs.load(process.argv[1]);
        for (let j = 0; j < 5; j++) await p.addSaved('/p${i}-' + j);
      `, f]),
    );
    expect(await Promise.all(procs.map((p) => p.exited))).toEqual([0, 0, 0, 0, 0, 0]);
    expect((await Prefs.load(f)).savedDirs()).toHaveLength(30);
    expect(await Bun.file(`${f}.lock`).exists()).toBe(false);
  }, 30000);

  test("a lock left by a killed process is taken over, not waited on forever", async () => {
    const f = join(dir, 'stale-lock.json');
    await writeFile(`${f}.lock`, '999999\n');
    const t0 = Date.now();
    await (await Prefs.load(f)).addSaved('/x');
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await Prefs.load(f)).savedDirs()).toEqual(['/x']);
    expect(await Bun.file(`${f}.lock`).exists()).toBe(false);
  }, 10000);

  test('a lock that cannot be removed fails the change instead of hanging', async () => {
    const { mkdir } = await import('node:fs/promises');
    const f = join(dir, 'stuck-lock.json');
    await mkdir(`${f}.lock`);
    await expect((await Prefs.load(f)).addSaved('/x')).rejects.toThrow();
    expect(await Bun.file(f).exists()).toBe(false);
  }, 10000);
});

describe('a failed save changes neither the file nor what this process reads', () => {
  test('every mutation kind: the file, memory and a later refresh stay as before; the next save works', async () => {
    const { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync } = await import('node:fs');
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-prefs-fail-'));
    try {
      // The lock is taken beside the link; the write goes beside the target, in a directory made read-only.
      const store = join(base, 'store');
      mkdirSync(store);
      const target = join(store, 'prefs.json');
      const seed = await Prefs.load(target);
      await seed.addSaved('/x');
      await seed.setSavedName('/x', 'X');
      const link = join(base, 'prefs.json');
      symlinkSync(target, link);
      const prefs = await Prefs.load(link);
      const disk = readFileSync(target, 'utf8');
      const view = () =>
        JSON.stringify({
          saved: prefs.savedDirs(),
          writableX: prefs.isWritableSaved('/x'),
          name: prefs.savedName('/x') ?? null,
          settings: prefs.settings,
          autoRw: prefs.autoRw,
          marks: prefs.get('/x'),
          access: prefs.access,
        });
      const before = view();
      const ops: Array<[string, () => Promise<unknown>]> = [
        ['addSaved', () => prefs.addSaved('/y', 'rw')],
        ['addSaved rw', () => prefs.addSaved('/x', 'rw')],
        ['removeSaved', () => prefs.removeSaved('/x')],
        ['setSavedName', () => prefs.setSavedName('/x', 'Leak')],
        ['updateSettings', () => prefs.updateSettings({ editLink: false, autoRw: false })],
        ['setAutoRw', () => prefs.setAutoRw(['/x'])],
        ['marks', () => prefs.set('/x', 'a.md', 'favorite', true)],
        ['setAllow', () => prefs.setAllow(['10.0.0.0/8'])],
      ];
      chmodSync(store, 0o500);
      try {
        for (const [what, op] of ops) {
          let failed = false;
          await op().catch(() => (failed = true));
          expect([what, failed]).toEqual([what, true]);
          prefs.refresh();
          expect([what, view()]).toEqual([what, before]);
        }
      } finally {
        chmodSync(store, 0o700);
      }
      expect(readFileSync(target, 'utf8')).toBe(disk);
      expect(readdirSync(store)).toEqual(['prefs.json']); // no temporary file left behind
      await prefs.setSavedName('/x', 'After');
      expect(prefs.savedName('/x')).toBe('After');
      expect((await Prefs.load(link)).savedName('/x')).toBe('After');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

test('a failed save over a broken file leaves the fallback copy in memory untouched', async () => {
  // A copy taken before mocking: the mock replaces the module namespace's own bindings too.
  const real = { ...(await import('node:fs/promises')) };
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const base = mkdtempSync(join(tmpdir(), 'mdhouse-prefs-broken-'));
  let failNext = false;
  // Fails exactly one temp-file write; every other call is the real one, so the mock is inert afterwards.
  mock.module('node:fs/promises', () => ({
    ...real,
    writeFile: async (...args: Parameters<typeof real.writeFile>) => {
      if (failNext) {
        failNext = false;
        throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
      }
      return real.writeFile(...args);
    },
  }));
  try {
    const path = join(base, 'prefs.json');
    const prefs = await Prefs.load(path);
    await prefs.addSaved('/a');
    writeFileSync(path, '{ broken'); // the save that follows falls back to what this process holds
    failNext = true;
    let code = '';
    await prefs.addSaved('/b').catch((e: { code?: string }) => (code = e.code ?? ''));
    expect(code).toBe('EIO');
    expect(prefs.savedDirs()).toEqual(['/a']);
    // The broken file was set aside by the failed save; the next one starts a new file (existing recovery policy).
    await prefs.addSaved('/b');
    expect((await Prefs.load(path)).savedDirs()).toEqual(['/b']);
  } finally {
    mock.module('node:fs/promises', () => real);
    await rm(base, { recursive: true, force: true });
  }
});
