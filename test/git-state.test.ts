import { describe, expect, test } from 'bun:test';
import { fetchesHistory, gitStateClass, gitStateOf, GIT_STATE, heldFor, parentScope, showsHistory, shownStatus } from '../src/ui/git-state';
import { revealScopes } from '../src/ui/views';

describe('git state', () => {
  test('only the two reported states are a state; everything else is no badge', () => {
    expect(gitStateOf({ gitState: 'ignored' })).toBe('ignored');
    expect(gitStateOf({ gitState: 'untracked' })).toBe('untracked');
    for (const none of [undefined, null, {}, 'untracked', 1, { gitState: 'tracked' }, { gitState: '' }, { gitState: null }, { gitState: ['ignored'] }]) {
      expect(gitStateOf(none)).toBeNull();
    }
  });

  test('not worked out from status, marks, ignored flag or missing metadata', () => {
    expect(gitStateOf({ status: 'untracked' })).toBeNull();
    expect(gitStateOf({ marks: ['ignored'] })).toBeNull();
    expect(gitStateOf({ ignored: true })).toBeNull();
    expect(gitStateClass({ status: 'untracked', marks: ['ignored'], ignored: true })).toBe('');
  });

  test('the two states have distinct names and classes', () => {
    expect(GIT_STATE.ignored.name).toBe('Gitignored');
    expect(GIT_STATE.untracked.name).toBe('Untracked');
    expect(gitStateClass({ gitState: 'ignored' })).toBe(' git-ignored');
    expect(gitStateClass({ gitState: 'untracked' })).toBe(' git-untracked');
  });

  test('parentScope: the folder of a file, none at the root', () => {
    expect(parentScope('.ai-team/README.md')).toBe('.ai-team');
    expect(parentScope('realty/.ai-team/README.md')).toBe('realty/.ai-team');
    expect(parentScope('README.md')).toBeNull();
  });

  test('a directly opened file asks for its folder on every tab, view tabs keep their own folders', () => {
    const views = { V1: ['a/'], V2: ['b/'] };
    const open = parentScope('realty/.ai-team/README.md');
    expect(revealScopes(views, open).scopes).toEqual(['realty/.ai-team', 'a', 'b']);
    expect(revealScopes(views, open, 'V1').scopes).toEqual(['realty/.ai-team', 'a']);
    expect(revealScopes({ V1: [], V2: [] }, parentScope('README.md')).scopes).toEqual([]);
  });

  test('shownStatus: untracked is never a status badge, the others pass through', () => {
    expect(shownStatus('untracked')).toBeUndefined();
    expect(shownStatus(undefined)).toBeUndefined();
    for (const st of ['modified', 'staged', 'deleted'] as const) expect(shownStatus(st)).toBe(st);
  });
});

describe('file history visibility', () => {
  const none = { commits: [] };
  const some = { commits: [{}] };

  test('a Gitignored file is never asked for history and never shows the panel', () => {
    expect(fetchesHistory('ignored')).toBe(false);
    expect(showsHistory('ignored', null)).toBe(false);
    expect(showsHistory('ignored', some)).toBe(false);
  });

  test('an untracked file is asked, and shows history only once the current file has commits', () => {
    expect(fetchesHistory('untracked')).toBe(true);
    expect(showsHistory('untracked', null)).toBe(false);
    expect(showsHistory('untracked', none)).toBe(false);
    expect(showsHistory('untracked', some)).toBe(true);
  });

  test('tracked, no repository and unknown keep the panel as it was, whatever the log', () => {
    for (const state of [null]) {
      expect(fetchesHistory(state)).toBe(true);
      expect(showsHistory(state, null)).toBe(true);
      expect(showsHistory(state, none)).toBe(true);
      expect(showsHistory(state, some)).toBe(true);
    }
    // nothing but the server's gitState decides: status, marks and the ignored flag do not
    expect(showsHistory(gitStateOf({ status: 'untracked', marks: ['ignored'], ignored: true }), none)).toBe(true);
  });

  test('an answer is held for its file: another file, none, or a moved path gets nothing', () => {
    const held = { path: 'r/a.md', value: 'A-commits' };
    expect(heldFor(held, 'r/a.md')).toBe('A-commits');
    expect(heldFor(held, 'r/b.md')).toBeNull();
    expect(heldFor(held, null)).toBeNull();
    expect(heldFor(null, 'r/a.md')).toBeNull();
  });
});
