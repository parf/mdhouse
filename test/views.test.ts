import { describe, expect, test } from 'bun:test';
import { inView, toggle } from '../src/ui/views';

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
