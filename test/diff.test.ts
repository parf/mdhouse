import { describe, expect, test } from 'bun:test';
import { newFileDiff, parsePatch } from '../src/lib/git';

const PATCH = `diff --git a/NOTE.md b/NOTE.md
index 1234567..89abcde 100644
--- a/NOTE.md
+++ b/NOTE.md
@@ -1,5 +1,6 @@ ## Heading
 # Title

 alpha
-beta
+BETA changed
 gamma
+delta added
`;

describe('parsing a unified diff', () => {
  test('carries both line numbers and counts the change', () => {
    const { hunks, added, removed, truncated } = parsePatch(PATCH);

    expect(hunks).toHaveLength(1);
    expect(added).toBe(2);
    expect(removed).toBe(1);
    expect(truncated).toBe(false);

    // git's after-the-@@ text is the enclosing heading, worth keeping for the hunk band.
    expect(hunks[0]!.heading).toBe('## Heading');

    // The removed line exists only on the old side, the added one only on the new side, and
    // context carries both — which is the whole reason the view has two gutters.
    expect(hunks[0]!.lines).toEqual([
      { t: ' ', text: '# Title', a: 1, b: 1 },
      { t: ' ', text: '', a: 2, b: 2 },
      { t: ' ', text: 'alpha', a: 3, b: 3 },
      { t: '-', text: 'beta', a: 4 },
      { t: '+', text: 'BETA changed', b: 4 },
      { t: ' ', text: 'gamma', a: 5, b: 5 },
      { t: '+', text: 'delta added', b: 6 },
    ]);
  });

  test('drops the file headers and git chatter', () => {
    const lines = parsePatch(PATCH).hunks.flatMap((h) => h.lines.map((l) => l.text));
    expect(lines.some((t) => t.startsWith('git a/') || t.includes('100644'))).toBe(false);
  });

  test('a missing final newline is not a line', () => {
    const patch = '@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n';
    const { hunks, added, removed } = parsePatch(patch);
    expect(hunks[0]!.lines.map((l) => l.text)).toEqual(['old', 'new']);
    expect([added, removed]).toEqual([1, 1]);
  });

  test('several hunks keep their own numbering', () => {
    const patch = ['@@ -1,2 +1,2 @@', ' one', '+two', '@@ -40,2 +41,2 @@ heading', ' forty', '-gone'].join('\n');
    const { hunks } = parsePatch(patch);

    expect(hunks).toHaveLength(2);
    expect(hunks[1]!.heading).toBe('heading');
    expect(hunks[1]!.lines[0]).toEqual({ t: ' ', text: 'forty', a: 40, b: 41 });
    expect(hunks[1]!.lines[1]).toEqual({ t: '-', text: 'gone', a: 41 });
  });

  test('a diff too long to read is cut, and says so', () => {
    const body = Array.from({ length: 4500 }, (_, i) => `+line ${i}`).join('\n');
    const { truncated, added } = parsePatch(`@@ -0,0 +1,4500 @@\n${body}\n`);

    expect(truncated).toBe(true);
    expect(added).toBe(4000);
  });

  test('a patch with nothing in it is not a change', () => {
    expect(parsePatch('')).toEqual({ hunks: [], added: 0, removed: 0, truncated: false });
  });
});

describe('a file git has never seen', () => {
  test('is the whole file, added', () => {
    const diff = newFileDiff('# Fresh\n\nbrand new\n');

    expect(diff.kind).toBe('new');
    expect(diff.added).toBe(3);
    expect(diff.removed).toBe(0);
    // The trailing newline ends the last line; it does not start another one.
    expect(diff.hunks[0]!.lines).toEqual([
      { t: '+', text: '# Fresh', b: 1 },
      { t: '+', text: '', b: 2 },
      { t: '+', text: 'brand new', b: 3 },
    ]);
  });

  test('an empty file has no hunks to show', () => {
    expect(newFileDiff('').hunks).toEqual([]);
  });
});
