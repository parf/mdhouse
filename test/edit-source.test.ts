import { afterEach, describe, expect, test } from 'bun:test';
import { forEditor, fromEditor, loadDraft, saveDraft, dropDraft, type Draft } from '../src/ui/edit-source';

/** What the editor holds, then the bytes it would save — must equal the source exactly. */
const roundtrip = (text: string) => {
  const e = forEditor(text);
  if ('unsupported' in e) throw new Error(e.unsupported);
  return fromEditor(e, e.lines.join(e.separator));
};

describe('forEditor / fromEditor: the saved text is the source, byte for byte', () => {
  for (const [name, text] of [
    ['LF with final newline', '# A\n\ntext\n'],
    ['LF without final newline', '# A\n\ntext'],
    ['CRLF', '# A\r\n\r\ntext\r\n'],
    ['CRLF without final newline', '# A\r\ntext'],
    ['BOM + LF', '﻿# A\ntext\n'],
    ['BOM + CRLF', '﻿# A\r\ntext\r\n'],
    ['one line, no newline', 'just text'],
    ['empty', ''],
    ['only a BOM', '﻿'],
    ['replacement character kept', 'bad � byte\n'],
    ['legacy forms untouched', '**Q:** why?\n**A:** because\n- [ ] task\n<!-- AB: #a -->\n'],
    ['trailing spaces and tabs', 'a  \n\tb\t\n'],
  ] as const) {
    test(name, () => expect(roundtrip(text)).toBe(text));
  }

  test('the separator follows the file; a BOM stays out of the editable text', () => {
    const crlf = forEditor('﻿a\r\nb\r\n');
    expect('unsupported' in crlf).toBe(false);
    if ('unsupported' in crlf) return;
    expect(crlf.separator).toBe('\r\n');
    expect(crlf.bom).toBe(true);
    expect(crlf.lines).toEqual(['a', 'b', '']);
    const lf = forEditor('a\nb');
    if ('unsupported' in lf) return;
    expect(lf.separator).toBe('\n');
    expect(lf.bom).toBe(false);
  });

  test('an edit is saved with the file\'s own separator', () => {
    const e = forEditor('a\r\nb\r\n');
    if ('unsupported' in e) throw new Error();
    expect(fromEditor(e, ['a', 'new', 'b', ''].join(e.separator))).toBe('a\r\nnew\r\nb\r\n');
  });

  test('mixed or bare-CR line endings are not edited here: saving would change them', () => {
    expect(forEditor('a\nb\r\nc')).toEqual({ unsupported: expect.stringMatching(/mixed line endings/) });
    expect(forEditor('a\rb')).toEqual({ unsupported: expect.stringMatching(/mixed line endings/) });
  });
});

describe('drafts: memory first, localStorage when it works', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g.localStorage;
  afterEach(() => {
    g.localStorage = saved;
    dropDraft('r/a.md');
  });
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  test('kept per document with its base hash, restored after the page reloads (new memory)', () => {
    const s = store();
    g.localStorage = s;
    const d: Draft = { text: 'x\n', base: 'a'.repeat(64) };
    saveDraft('r/a.md', d);
    expect(loadDraft('r/a.md')).toEqual(d);
    expect(JSON.parse(s.m.get('mdhouse.edit.r/a.md')!)).toEqual(d);
    expect(loadDraft('r/b.md')).toBeNull();
  });

  test('storage that throws (full, private) never loses the draft in memory', () => {
    g.localStorage = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('no'); } };
    const d: Draft = { text: 'kept\n', base: 'b'.repeat(64) };
    expect(() => saveDraft('r/a.md', d)).not.toThrow();
    expect(loadDraft('r/a.md')).toEqual(d);
    expect(() => dropDraft('r/a.md')).not.toThrow();
    expect(loadDraft('r/a.md')).toBeNull();
  });

  test('a stored value that is not a draft is ignored', () => {
    const s = store();
    g.localStorage = s;
    s.m.set('mdhouse.edit.r/a.md', JSON.stringify({ text: 1, base: 'x' }));
    expect(loadDraft('r/a.md')).toBeNull();
    s.m.set('mdhouse.edit.r/a.md', '{not json');
    expect(loadDraft('r/a.md')).toBeNull();
  });
});
