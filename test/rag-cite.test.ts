import { describe, expect, test } from 'bun:test';
import { cite } from '../src/lib/rag-cite';

const DOC = ['# Title', '', 'intro', '', '## Part', '', 'alpha', 'beta', '', '### Deep', '', 'gamma', '', '## Next', '', 'delta', ''].join('\n');

describe('cite — lines and heading chain of an excerpt', () => {
  test('a one-line excerpt: its line and the headings above it', () => {
    expect(cite(DOC, 'gamma')).toEqual({ lines: [12, 12], heading_path: ['Title', 'Part', 'Deep'] });
    expect(cite(DOC, 'intro')).toEqual({ lines: [3, 3], heading_path: ['Title'] });
  });

  test('a multi-line excerpt ends on its last line, a trailing newline not counted', () => {
    expect(cite(DOC, 'alpha\nbeta')).toEqual({ lines: [7, 8], heading_path: ['Title', 'Part'] });
    expect(cite(DOC, 'alpha\nbeta\n')).toEqual({ lines: [7, 8], heading_path: ['Title', 'Part'] });
    expect(cite(DOC, DOC)).toEqual({ lines: [1, 16], heading_path: ['Title'] });
  });

  test('a heading on the start line is in the chain; a sibling replaces its sibling', () => {
    expect(cite(DOC, '### Deep\n\ngamma')).toEqual({ lines: [10, 12], heading_path: ['Title', 'Part', 'Deep'] });
    expect(cite(DOC, 'delta')).toEqual({ lines: [16, 16], heading_path: ['Title', 'Next'] });
  });

  test('no heading above: an empty chain', () => {
    expect(cite('plain\ntext\n', 'text')).toEqual({ lines: [2, 2], heading_path: [] });
  });

  test('the first exact match wins', () => {
    expect(cite('x\nsame\ny\nsame\n', 'same')).toEqual({ lines: [2, 2], heading_path: [] });
  });

  test('headings in fenced code are ignored, an unfenced one after the fence counts', () => {
    const text = ['# A', '```sh', '# not a heading', '```', '', '~~~~', '## nor this', '~~~', '## still fenced', '~~~~', '', '## B', 'x'].join('\n');
    expect(cite(text, 'x')).toEqual({ lines: [13, 13], heading_path: ['A', 'B'] });
    expect(cite(text, 'nor this')).toEqual({ lines: [7, 7], heading_path: ['A'] });
  });

  test('a closing fence needs no info string and a backtick fence ends only on backticks', () => {
    const text = ['# A', '```js', '~~~', '# inside', '```', '## After', 'y'].join('\n');
    expect(cite(text, 'y')).toEqual({ lines: [7, 7], heading_path: ['A', 'After'] });
  });

  test('ATX forms: closing hashes, an empty heading, up to three spaces, not seven hashes or a missing space', () => {
    const text = ['## Closed ##', '   ### Indented', '####### seven', '#nospace', '#### ', 'z'].join('\n');
    expect(cite(text, 'z')).toEqual({ lines: [6, 6], heading_path: ['Closed', 'Indented', ''] });
  });

  test('not found, or empty: null', () => {
    expect(cite(DOC, 'nowhere')).toBeNull();
    expect(cite(DOC, '')).toBeNull();
    expect(cite(DOC, '\n\n')).toBeNull();
  });

  test('CRLF files match an LF excerpt and the other way round, with the same lines', () => {
    const crlf = DOC.replace(/\n/g, '\r\n');
    expect(cite(crlf, 'alpha\nbeta')).toEqual({ lines: [7, 8], heading_path: ['Title', 'Part'] });
    expect(cite(DOC, 'alpha\r\nbeta')).toEqual({ lines: [7, 8], heading_path: ['Title', 'Part'] });
    expect(cite(crlf, '### Deep\r\n\r\ngamma')).toEqual({ lines: [10, 12], heading_path: ['Title', 'Part', 'Deep'] });
  });

  test('an excerpt that differs by one character is not found', () => {
    expect(cite(DOC, 'alpha\nbeta ')).toBeNull();
  });
});
