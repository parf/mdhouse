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
    expect(after).toEqual({ editLink: true });
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
