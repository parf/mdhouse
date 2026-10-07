import { expect, test } from 'bun:test';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';

test('doc/prefs.json.dist, comments and all, loads as a config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-dist-'));
  try {
    const path = join(dir, 'prefs.json');
    await copyFile(join(import.meta.dir, '../doc/prefs.json.dist'), path);
    const prefs = await Prefs.load(path);
    expect(prefs.savedDirs()).toEqual(['/home/you/notes', '/home/you/src/project']);
    expect(prefs.isWritableSaved('/home/you/notes')).toBe(true);
    expect(prefs.server).toEqual({ port: 7777, host: '127.0.0.1' });
    expect(prefs.access.allow).toEqual(['192.168.1.0/24']);
    expect(Object.keys(prefs.access.users)).toEqual(['ann']);
    expect(prefs.settings).toEqual({ editLink: true, autoRw: true });
    expect(prefs.autoRw).toEqual(['/home/you/src']);
    expect(prefs.get('/home/you/notes').favorite).toEqual(['inbox.md', 'plans/']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
