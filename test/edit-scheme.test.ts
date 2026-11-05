import { describe, expect, test } from 'bun:test';
import { RESERVED_EDIT_SCHEMES, editTarget, editUrl, normalizeEditScheme } from '../src/lib/urls';

describe('normalizeEditScheme', () => {
  test('trailing colons dropped, lower-cased, custom schemes kept', () => {
    expect(normalizeEditScheme('edit')).toBe('edit');
    expect(normalizeEditScheme(' MdEdit: ')).toBe('mdedit');
    expect(normalizeEditScheme('vscode')).toBe('vscode');
    expect(normalizeEditScheme('x-my.editor+v2')).toBe('x-my.editor+v2');
    expect(normalizeEditScheme('typora-long-scheme-name-with-no-length-assumption')).toBe('typora-long-scheme-name-with-no-length-assumption');
  });

  test('not a URL scheme is refused', () => {
    for (const bad of ['', ' ', ':', '1edit', 'a b', 'a:b', 'ed/it', 'édit', '-x', 5, null, undefined, {}]) {
      expect(normalizeEditScheme(bad)).toBeNull();
    }
  });

  test('every reserved scheme is refused, in any case and with colons', () => {
    for (const s of RESERVED_EDIT_SCHEMES) {
      expect(normalizeEditScheme(s)).toBeNull();
      expect(normalizeEditScheme(`${s.toUpperCase()}:`)).toBeNull();
    }
    for (const s of ['javascript', 'data', 'vbscript', 'http', 'https', 'file', 'blob', 'mailto', 'tel', 'sms']) {
      expect(RESERVED_EDIT_SCHEMES.has(s)).toBe(true);
    }
  });
});

describe('editUrl', () => {
  test('the default is edit: and each segment is encoded', () => {
    expect(editUrl('edit', '/home/me/a b/c#d.md')).toBe('edit:/home/me/a%20b/c%23d.md');
    expect(editUrl('mdedit', '/n/x.md')).toBe('mdedit:/n/x.md');
  });

  test('a scheme that is not allowed falls back to edit:, never reaches the URL', () => {
    for (const bad of ['javascript', 'http', 'data', 'x y', undefined, 3]) {
      expect(editUrl(bad, '/n/x.md').startsWith('edit:/')).toBe(true);
    }
  });

  test('a file name with code in it stays text behind a custom scheme', () => {
    const url = editUrl('mdedit', '/n/a;alert(1);//.md');
    expect(url.startsWith('mdedit:/n/')).toBe(true);
    expect(url).not.toContain(';');
  });
});

describe('editTarget', () => {
  test('drops the scheme whatever its length', () => {
    expect(editTarget('edit:/n/x.md:3')).toBe('/n/x.md:3');
    expect(editTarget('mdedit:/n/x.md:3')).toBe('/n/x.md:3');
    expect(editTarget('x:/n/x.md')).toBe('/n/x.md');
  });
});
