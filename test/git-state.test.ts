import { describe, expect, test } from 'bun:test';
import { gitStateClass, gitStateOf, GIT_STATE, parentScope } from '../src/ui/git-state';
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
});
