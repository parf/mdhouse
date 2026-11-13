import { describe, expect, test } from 'bun:test';
import { NAV, changesUrl, currentNav, navItems, onChanges, type NavState } from '../src/ui/nav';

const base: NavState = { askAvailable: true, askOpen: false, changes: false, rag: false, drawerOpen: false };

describe('the phone destinations', () => {
  test('Files · Changes · Search · Ask, in that order', () => expect(NAV.map((n) => n.label)).toEqual(['Files', 'Changes', 'Search', 'Ask']));
  test('Ask is there only when it can do something', () => {
    expect(navItems({ askAvailable: true })).toEqual(['files', 'changes', 'search', 'ask']);
    expect(navItems({ askAvailable: false })).toEqual(['files', 'changes', 'search']);
  });
  test('the Changes address is the project\'s ?git=changes, scoped to a file when one is given', () => {
    expect(changesUrl('repo')).toBe('/repo/?git=changes');
    expect(changesUrl('repo', 'notes/a b.md')).toBe('/repo/?git=changes&file=notes%2Fa%20b.md');
    expect(onChanges('?git=changes')).toBe(true);
    expect(onChanges('?git=changes&file=x')).toBe(true);
    expect(onChanges('?git')).toBe(false);
    expect(onChanges('?git=commits')).toBe(false);
    expect(onChanges('')).toBe(false);
  });
  test('one is current: the open Agent Bus panel, then Changes, the index search, the open drawer', () => {
    expect(currentNav(base)).toBeNull();
    expect(currentNav({ ...base, drawerOpen: true })).toBe('files');
    expect(currentNav({ ...base, drawerOpen: true, rag: true })).toBe('search');
    expect(currentNav({ ...base, drawerOpen: true, rag: true, changes: true })).toBe('changes');
    expect(currentNav({ ...base, changes: true, askOpen: true })).toBe('ask');
    expect(currentNav({ ...base, askAvailable: false, askOpen: true })).toBeNull();
  });
});
