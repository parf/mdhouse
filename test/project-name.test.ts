import { describe, expect, test } from 'bun:test';
import { checkNameArgs, labelled, normalizeProjectName, parseNameRequest, PROJECT_NAME_MAX } from '../src/lib/project-name';

describe('normalizeProjectName', () => {
  test('trims; empty or blank clears; inner text is kept as written', () => {
    expect(normalizeProjectName('  All MDHouse Projects ')).toEqual({ ok: true, name: 'All MDHouse Projects' });
    expect(normalizeProjectName('a   b')).toEqual({ ok: true, name: 'a   b' });
    expect(normalizeProjectName('<b>x</b> & "y"')).toEqual({ ok: true, name: '<b>x</b> & "y"' }); // text, rendered as text
    for (const blank of ['', '   ', '\u00a0\u3000']) expect(normalizeProjectName(blank)).toEqual({ ok: true, name: null });
  });

  test(`at most ${PROJECT_NAME_MAX} UTF-16 units after trimming; longer is refused, not cut`, () => {
    expect(normalizeProjectName(` ${'x'.repeat(PROJECT_NAME_MAX)} `)).toEqual({ ok: true, name: 'x'.repeat(PROJECT_NAME_MAX) });
    expect(normalizeProjectName('x'.repeat(PROJECT_NAME_MAX + 1)).ok).toBe(false);
    expect(normalizeProjectName('😀'.repeat(40)).ok).toBe(true); // 80 units
    expect(normalizeProjectName('😀'.repeat(41)).ok).toBe(false); // 82 units
    expect(normalizeProjectName('Проекты · 项目 · مشاريع').ok).toBe(true);
  });

  test('non-strings, malformed UTF-16, controls, separators and bidi reordering are refused', () => {
    for (const bad of [null, undefined, 5, true, ['a'], { a: 1 }]) expect(normalizeProjectName(bad).ok).toBe(false);
    for (const bad of ['a\u0000b', 'a\nb', 'a\tb', 'a\rb', 'a\u001bb', 'a\u007fb', 'a\u0085b', 'a\u009fb', 'a\u2028b', 'a\u2029b', 'a\ud800b', 'a\udc00']) {
      expect(normalizeProjectName(bad).ok).toBe(false);
    }
    for (let c = 0x202a; c <= 0x202e; c++) expect(normalizeProjectName(`a${String.fromCharCode(c)}b`).ok).toBe(false);
    for (let c = 0x2066; c <= 0x2069; c++) expect(normalizeProjectName(`a${String.fromCharCode(c)}b`).ok).toBe(false);
    expect(normalizeProjectName('\n').ok).toBe(false); // refused, not trimmed away into a reset
  });
});

describe('parseNameRequest — POST /api/roots/name body', () => {
  test('exactly {id, name}; empty name clears', () => {
    expect(parseNameRequest({ id: 'docs', name: ' Docs ' })).toEqual({ ok: true, id: 'docs', name: 'Docs' });
    expect(parseNameRequest({ name: '', id: 'docs' })).toEqual({ ok: true, id: 'docs', name: null });
  });

  test('any other shape or extra field is refused', () => {
    for (const bad of [
      null,
      'docs',
      [],
      {},
      { id: 'docs' },
      { name: 'x' },
      { id: 'docs', name: 'x', writable: true },
      { id: 'docs', name: 'x', path: '/etc' },
      { id: '', name: 'x' },
      { id: 5, name: 'x' },
      { id: 'docs', name: null },
      { id: 'docs', name: 'a\u202eb' },
    ]) {
      expect(parseNameRequest(bad).ok).toBe(false);
    }
  });
});

describe('checkNameArgs — CLI --name', () => {
  test('one directory: a name, or reset', () => {
    expect(checkNameArgs('All MDHouse Projects', ['~/mdhouse'], { rm: false })).toEqual({ ok: true, name: 'All MDHouse Projects' });
    expect(checkNameArgs('reset', ['.'], { rm: false })).toEqual({ ok: true, name: null });
    expect(checkNameArgs('', ['.'], { rm: false })).toEqual({ ok: true, name: null });
  });

  test('zero or several directories, --rm, or a bad name are refused with a useful error', () => {
    expect(checkNameArgs('X', [], { rm: false })).toEqual({ ok: false, error: '--name names exactly one directory; none was given' });
    expect(checkNameArgs('X', ['a', 'b'], { rm: false })).toEqual({ ok: false, error: '--name names exactly one directory; got 2' });
    expect(checkNameArgs('X', ['a'], { rm: true })).toEqual({ ok: false, error: '--name cannot be combined with --rm' });
    expect(checkNameArgs('a\u0007', ['a'], { rm: false }).ok).toBe(false);
  });
});

describe('labelled — root payload', () => {
  const root = { id: 'mdhouse', name: 'mdhouse', path: '/home/u/mdhouse', kind: 'project', writable: true };

  test('the override becomes the label and is reported; identity fields are untouched', () => {
    expect(labelled(root, 'All MDHouse Projects')).toEqual({ ...root, name: 'All MDHouse Projects', customName: 'All MDHouse Projects' });
  });

  test('no override: the directory label, no customName key', () => {
    for (const none of [undefined, null, '']) {
      const out = labelled(root, none);
      expect(out).toEqual(root);
      expect('customName' in out).toBe(false);
    }
  });

  test('duplicate labels are allowed: ids and paths still tell roots apart', () => {
    const a = labelled({ ...root, id: 'a', path: '/a' }, 'Same');
    const b = labelled({ ...root, id: 'b', path: '/b' }, 'Same');
    expect([a.name, b.name]).toEqual(['Same', 'Same']);
    expect([a.id, b.id, a.path, b.path]).toEqual(['a', 'b', '/a', '/b']);
  });
});
