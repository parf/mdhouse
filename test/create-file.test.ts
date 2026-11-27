import { describe, expect, test } from 'bun:test';
import { canCreateFile, newFileDir, newFileName } from '../src/ui/create-file';

describe('newFileName', () => {
  test('adds .md to a bare name', () => {
    expect(newFileName('notes')).toBe('notes.md');
    expect(newFileName('v1.2')).toBe('v1.2.md');
    expect(newFileName('readme.txt')).toBe('readme.txt.md');
  });
  test('keeps a Markdown suffix in any case', () => {
    expect(newFileName('notes.md')).toBe('notes.md');
    expect(newFileName('NOTES.MD')).toBe('NOTES.MD');
    expect(newFileName('page.mdx')).toBe('page.mdx');
  });
  test('trims, and is empty for blank input', () => {
    expect(newFileName('  plan  ')).toBe('plan.md');
    expect(newFileName('')).toBe('');
    expect(newFileName('   ')).toBe('');
  });
  test('leaves the rest of validation to the server', () => {
    expect(newFileName('a/b')).toBe('a/b.md');
    expect(newFileName('.md')).toBe('.md');
  });
});

describe('newFileDir', () => {
  test('a top-level document goes to the root', () => expect(newFileDir('r1', 'README.md')).toBe('r1'));
  test('a nested document goes to its folder', () => {
    expect(newFileDir('r1', 'docs/a.md')).toBe('r1/docs');
    expect(newFileDir('r1', 'docs/deep/a.md')).toBe('r1/docs/deep');
  });
});

describe('canCreateFile', () => {
  test('only writable and not Viewer', () => {
    expect(canCreateFile({ writable: true, viewer: false })).toBe(true);
    expect(canCreateFile({ writable: false, viewer: false })).toBe(false);
    expect(canCreateFile({ writable: true, viewer: true })).toBe(false);
    expect(canCreateFile({ writable: false, viewer: true })).toBe(false);
  });
});
