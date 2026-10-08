import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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
    expect(after).toEqual({ editLink: true, autoRw: true, me: '' });
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
    await prefs.addSaved('/a', true);
    await prefs.addSaved('/b');
    expect((await Prefs.load(f)).isWritableSaved('/a')).toBe(true);
    expect((await Prefs.load(f)).isWritableSaved('/b')).toBe(false);

    await prefs.addSaved('/a'); // saved again without --rw: write access taken away
    expect((await Prefs.load(f)).isWritableSaved('/a')).toBe(false);
  });

  test('forgetting a folder forgets its write access; only saved folders can be writable', async () => {
    const f = join(dir, 'rw2.json');
    const prefs = await Prefs.load(f);
    await prefs.addSaved('/c', true);
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
      registry.setWritable(a!.id, true);
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
