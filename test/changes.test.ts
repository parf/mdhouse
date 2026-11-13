import { describe, expect, test } from 'bun:test';
import { changeOf, changeSummary, commitLabel, initialTicks } from '../src/ui/git-state';

describe('Changes counts', () => {
  test('changeOf: untracked, deleted, added, everything else modified', () => {
    expect(changeOf('??')).toBe('untracked');
    expect(changeOf(' D')).toBe('deleted');
    expect(changeOf('D ')).toBe('deleted');
    expect(changeOf('A ')).toBe('added');
    expect(changeOf('AM')).toBe('added');
    expect(changeOf(' M')).toBe('modified');
    expect(changeOf('R ')).toBe('modified');
    expect(changeOf('UU')).toBe('modified');
  });

  test('changeSummary counts every state, untracked included in the total', () => {
    const s = changeSummary([{ code: ' M' }, { code: '??' }, { code: 'A ' }, { code: ' D' }, { code: 'MM' }]);
    expect(s).toEqual({ modified: 2, added: 1, deleted: 1, untracked: 1, total: 5, label: '5 changes' });
    expect(changeSummary([{ code: '??' }]).label).toBe('1 change');
    expect(changeSummary([]).label).toBe('No changes');
  });

  test('commitLabel names one file, counts several, nothing for none', () => {
    expect(commitLabel(['doc/README.md'])).toBe('Commit README.md');
    expect(commitLabel(['a.md', 'b.md'])).toBe('Commit 2 files');
    expect(commitLabel([])).toBeNull();
  });

  test('initialTicks: all but untracked; scoped to a file, only it', () => {
    const dirty = [{ path: 'a.md', code: ' M' }, { path: 'n.md', code: '??' }, { path: 'g.md', code: ' D' }];
    expect([...initialTicks(dirty)]).toEqual(['a.md', 'g.md']);
    expect([...initialTicks(dirty, 'n.md')]).toEqual(['n.md']);
    expect([...initialTicks(dirty, 'gone.md')]).toEqual([]);
  });
});
