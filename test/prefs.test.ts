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
