import { describe, expect, test } from 'bun:test';
import { inView, inViewTab, MAX_REVEAL, revealNote, revealScopes, scopeOf, toggle } from '../src/ui/views';

describe('views', () => {
  test('inView: the file itself, or under a folder entry', () => {
    const entries = ['Plans/', 'README.md', 'a/b/'];
    expect(inView('Plans/TODO.md', entries)).toBe(true);
    expect(inView('Plans/x/y.md', entries)).toBe(true);
    expect(inView('README.md', entries)).toBe(true);
    expect(inView('a/b/c.md', entries)).toBe(true);
    // a name that only starts like a folder is not in it
    expect(inView('PlansOld/x.md', entries)).toBe(false);
    expect(inView('a/bc/x.md', entries)).toBe(false);
    expect(inView('doc/README.md', entries)).toBe(false);
    expect(inView('x.md', [])).toBe(false);
  });

  test('toggle: adds, or takes out', () => {
    expect(toggle(['a.md'], 'b/')).toEqual(['a.md', 'b/']);
    expect(toggle(['a.md', 'b/'], 'a.md')).toEqual(['b/']);
  });
});

describe('ignored browsing scopes', () => {
  test('scopeOf: folders only, no root, absolute or `..`', () => {
    expect(scopeOf('a/b/')).toBe('a/b');
    expect(scopeOf('.ai-team/')).toBe('.ai-team');
    for (const bad of ['a.md', '/', '', '/abs/', '../x/', 'a/../b/', 'a//b/']) expect(scopeOf(bad)).toBeNull();
  });

  test('revealScopes: the union of V1 and V2 folders, files left out, duplicates once, open folder first', () => {
    const views = { V1: ['x/', 'f.md', 'y/'], V2: ['y/', 'z/w/'] };
    expect(revealScopes(views)).toEqual({ scopes: ['x', 'y', 'z/w'], omitted: 0 });
    expect(revealScopes(views, 'y')).toEqual({ scopes: ['y', 'x', 'z/w'], omitted: 0 });
    expect(revealScopes({ V1: [], V2: [] })).toEqual({ scopes: [], omitted: 0 });
  });

  test('revealScopes: a view tab asks for its own folders (and the open folder) only', () => {
    const views = { V1: ['x/'], V2: ['y/'] };
    expect(revealScopes(views, null, 'V1').scopes).toEqual(['x']);
    expect(revealScopes(views, 'o', 'V2').scopes).toEqual(['o', 'y']);
    expect(revealScopes(views, null, null).scopes).toEqual(['x', 'y']);
  });

  test('revealScopes: the open folder is requested whatever the root holds, newlines in names stay distinct', () => {
    expect(revealScopes({ V1: [], V2: [] }, 'vendor').scopes).toEqual(['vendor']);
    expect(revealScopes({ V1: [], V2: [] }, '.ai-team/runs').scopes).toEqual(['.ai-team/runs']);
    const a = JSON.stringify(['r', revealScopes({ V1: ['a\nb/'], V2: [] }).scopes]);
    const b = JSON.stringify(['r', revealScopes({ V1: ['a/', 'b/'], V2: [] }).scopes]);
    expect(a).not.toBe(b);
  });

  test('revealScopes: over the limits, the rest is counted, not dropped silently', () => {
    const many = Array.from({ length: MAX_REVEAL + 3 }, (_, i) => `d${i}/`);
    const r = revealScopes({ V1: many, V2: [] });
    expect(r.scopes.length).toBe(MAX_REVEAL);
    expect(r.omitted).toBe(3);
    expect(revealScopes({ V1: [`${'é'.repeat(600)}/`], V2: [] })).toEqual({ scopes: [], omitted: 1 });
  });

  test('inViewTab: a view lists only its own entries; a revealed ignored file needs the global switch or its own folder', () => {
    const own = ['gen/'];
    const ign = { rel: 'gen/r.md', ignored: true };
    const other = { rel: 'tmp/r.md', ignored: true };
    expect(inViewTab(ign, own, false)).toBe(true);
    expect(inViewTab(other, own, false)).toBe(false);
    expect(inViewTab(other, own, true)).toBe(false);
    // an own folder lists what is ignored under it; an own file entry only with the global switch
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/'], false)).toBe(true);
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/r.md'], false)).toBe(false);
    expect(inViewTab({ rel: 'docs/gen/r.md', ignored: true }, ['docs/gen/r.md'], true)).toBe(true);
    expect(inViewTab({ rel: 'a.md' }, ['a.md'], false)).toBe(true);
  });

  test('revealNote: null when complete, else says what is missing', () => {
    expect(revealNote(0)).toBeNull();
    expect(revealNote(0, [])).toBeNull();
    expect(revealNote(2)).toMatch(/2 selected folders not revealed/);
    expect(revealNote(0, ['big'])).toMatch(/big/);
  });
});
