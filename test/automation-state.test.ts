import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunIndex } from '../src/lib/automation';
import { Approvals, fileStore, stateDir } from '../src/lib/automation-state';

const tmp = async () => realpath(await mkdtemp(join(tmpdir(), 'mdhouse-auto-state-')));

describe('automation machine state', () => {
  test('stateDir: $XDG_STATE_HOME/mdhouse, else ~/.local/state/mdhouse', () => {
    expect(stateDir({ XDG_STATE_HOME: '/s' })).toBe('/s/mdhouse');
    expect(stateDir({})).toEndWith('/.local/state/mdhouse');
  });

  test('approvals: kept across instances, 0600 in a 0700 folder; a firing needs the same hash and schedule', async () => {
    const dir = join(await tmp(), 'st');
    const path = join(dir, 'automation.json');
    const a = new Approvals(path);
    expect(await a.get('/p', 'r')).toBeNull();
    await a.set('/p', 'r', { hash: 'h1', scheduleId: 's1', at: 't', by: 'admin' });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    const again = new Approvals(path);
    expect(await again.get('/p', 'r')).toEqual({ hash: 'h1', scheduleId: 's1', at: 't', by: 'admin' });
    const check = again.check((id) => (id === 'p' ? '/p' : null));
    const ask = { rootId: 'p', registration: 'r', hash: 'h1', scheduleId: 's1' };
    expect(await check(ask)).toBe(true);
    expect(await check({ ...ask, hash: 'h2' })).toBe(false);
    expect(await check({ ...ask, scheduleId: 's2' })).toBe(false);
    expect(await check({ ...ask, registration: 'other' })).toBe(false);
    expect(await check({ ...ask, rootId: 'unknown' })).toBe(false);
    expect(await again.drop('/p', 'r')).toMatchObject({ hash: 'h1' });
    expect(await check(ask)).toBe(false);
    expect(await new Approvals(path).get('/p', 'r')).toBeNull();
  });

  test('fileStore under RunIndex: concurrent writes all kept, read back by a new instance', async () => {
    const path = join(await tmp(), 'automation-index.json');
    const index = new RunIndex(fileStore(path));
    await Promise.all(Array.from({ length: 20 }, (_, i) => index.record('root', 'reg', { requestId: `s:${i}`, outcome: 'skipped', why: 'late' })));
    expect((await new RunIndex(fileStore(path)).history('root', 'reg', 50)).length).toBe(20);
    await index.outcome('root', 'reg', 'failed', {});
    expect((await new RunIndex(fileStore(path)).state('root', 'reg')).failures).toBe(1);
    expect(JSON.parse(await readFile(path, 'utf8'))).toBeObject();
  });
});
