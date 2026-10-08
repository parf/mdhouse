import { describe, expect, test } from 'bun:test';
import { insertBlock, type AddKind, type AddWhere } from '../src/lib/insert';
import { lineHash } from '../src/lib/qa';

const add = (src: string, line: number, where: AddWhere, kind: AddKind, text: string, offset = 0) => {
  const lines = src.split('\n').map((l) => l.replace(/\r$/, ''));
  const r = insertBlock(src, offset, { line, hash: lineHash(lines[offset + line - 1]!), where, kind, text }, 'parf');
  if ('error' in r) throw new Error(r.error);
  return r.src;
};

const doc = '# Top\n\nintro\n\n## A\n\none\n\n### A.1\n\ndeep\n\n## B\n\ntwo\n';

describe('adding a block under a heading', () => {
  test('↓ right under the heading, separated by blank lines', () => {
    expect(add(doc, 5, 'below', 'text', 'new')).toBe('# Top\n\nintro\n\n## A\n\nnew\n\none\n\n### A.1\n\ndeep\n\n## B\n\ntwo\n');
    expect(add('# H\npara\n', 1, 'below', 'text', 'x')).toBe('# H\n\nx\n\npara\n');
  });

  test('⇊ at the end of the section — after its subsections, before the next heading of its level', () => {
    expect(add(doc, 5, 'end', 'text', 'new')).toBe('# Top\n\nintro\n\n## A\n\none\n\n### A.1\n\ndeep\n\nnew\n\n## B\n\ntwo\n');
    expect(add(doc, 13, 'end', 'text', 'last')).toBe(doc + '\nlast\n');
    expect(add('## H\n## next', 1, 'end', 'text', 'x')).toBe('## H\n\nx\n\n## next');
  });

  test('headings and sections as the page renders them — a # in code or a comment is none, a setext one is', () => {
    expect(add('## A\n\n```sh\n# comment\n## not a heading\n```\n\n## B\n', 1, 'end', 'text', 'x')).toBe(
      '## A\n\n```sh\n# comment\n## not a heading\n```\n\nx\n\n## B\n',
    );
    expect(add('## A\n\n```\nx\n```js\n# y\n```\n\n## B\n', 1, 'end', 'text', 'n')).toBe('## A\n\n```\nx\n```js\n# y\n```\n\nn\n\n## B\n');
    expect(add('## A\n\na\n\n<!--\n# x\n-->\n', 1, 'end', 'text', 'n')).toBe('## A\n\na\n\n<!--\n# x\n-->\n\nn\n');
    expect(add('## A\n\na\n\nB\n---\n\nb\n', 1, 'end', 'text', 'n')).toBe('## A\n\na\n\nn\n\nB\n---\n\nb\n');
    expect(add('Two\nlines\n---\n\nx\n', 1, 'below', 'text', 'n')).toBe('Two\nlines\n---\n\nn\n\nx\n');
    expect(add('> # quoted\n\n# H\n', 3, 'below', 'text', 'n')).toBe('> # quoted\n\n# H\n\nn\n');
  });

  test('each kind, in Markdown', () => {
    const cases: [AddKind, string][] = [
      ['text', 'a\n- b'],
      ['quote', '> a\n> - b'],
      ['my-quote', '> **parf:** a\n> - b'],
      ['tip', '> [!TIP]\n> a\n> - b'],
      ['question', '> ❓ a\n> - b'],
      ['disagreement', '> ⁉️ a\n> - b'],
      ['answer', '> 💬 a\n> - b'],
    ];
    for (const [kind, block] of cases) expect(add('# H\n', 1, 'below', kind, 'a\n- b')).toBe(`# H\n\n${block}\n`);
    // A plain quote stays plain even if a line opens with a Q&A mark.
    expect(add('# H\n', 1, 'below', 'quote', '? not a question')).toBe('# H\n\n> \\? not a question\n');
    // Leading blank lines are dropped: the first line is the first one with text.
    expect(add('# H\n', 1, 'below', 'question', '\n \nfoo')).toBe('# H\n\n> ❓ foo\n');
    expect(add('# H\n', 1, 'below', 'quote', '\nfoo')).toBe('# H\n\n> foo\n');
  });

  test('a setext heading, front matter, CRLF', () => {
    expect(add('Title\n=====\n\ntext\n', 1, 'below', 'text', 'x')).toBe('Title\n=====\n\nx\n\ntext\n');
    expect(add('---\nt: 1\n---\n# H\n', 1, 'below', 'text', 'x', 3)).toBe('---\nt: 1\n---\n# H\n\nx\n');
    expect(add('# H\r\n\r\ntext\r\n', 1, 'end', 'quote', 'q')).toBe('# H\r\n\r\ntext\r\n\r\n> q\r\n');
    expect(add('# H\r\ntext', 1, 'end', 'text', 'x')).toBe('# H\r\ntext\r\n\r\nx');
  });

  test('refused: the heading changed, is gone, or the text is empty', () => {
    expect(insertBlock('# Changed\n', 0, { line: 1, hash: lineHash('# H'), where: 'below', kind: 'text', text: 'x' }, '')).toEqual({ error: 'stale' });
    expect(insertBlock('plain\n', 0, { line: 1, hash: lineHash('plain'), where: 'below', kind: 'text', text: 'x' }, '')).toEqual({ error: 'not-a-heading' });
    expect(insertBlock('# H\n', 0, { line: 1, hash: lineHash('# H'), where: 'below', kind: 'text', text: ' ' }, '')).toEqual({ error: 'empty' });
  });
});
