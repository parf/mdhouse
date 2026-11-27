import { describe, expect, test } from 'bun:test';
import { canOpenEditor, editPageUrl, wantsEdit } from '../src/ui/edit-page';

describe('the editor page address', () => {
  test('`?edit` asks for it; other queries do not', () => {
    expect(wantsEdit('?edit')).toBe(true);
    expect(wantsEdit('?x=1&edit')).toBe(true);
    expect(wantsEdit('?edit=')).toBe(true);
    expect(wantsEdit('')).toBe(false);
    expect(wantsEdit('?editor')).toBe(false);
    expect(wantsEdit('?choose=edit')).toBe(false);
  });

  test('built from the document page, without its query or anchor', () => {
    expect(editPageUrl('/mdhouse/README.md')).toBe('/mdhouse/README.md?edit');
    expect(editPageUrl('/mdhouse/a%23b.md#L3')).toBe('/mdhouse/a%23b.md?edit');
    expect(editPageUrl('/mdhouse/a.md?git')).toBe('/mdhouse/a.md?edit');
  });
});

describe('who may open the editor page', () => {
  const md = { kind: 'md' };
  const rw = { writable: true, viewer: false, draft: false };
  test('a writable Markdown document', () => expect(canOpenEditor(md, rw)).toBe(true));
  test('read-only: only to reach a kept draft', () => {
    expect(canOpenEditor(md, { ...rw, writable: false })).toBe(false);
    expect(canOpenEditor(md, { ...rw, writable: false, draft: true })).toBe(true);
  });
  test('never: Viewer mode, reference material, a file that is not Markdown, no document', () => {
    expect(canOpenEditor(md, { ...rw, viewer: true, draft: true })).toBe(false);
    expect(canOpenEditor({ kind: 'md', reference: true }, { ...rw, draft: true })).toBe(false);
    for (const kind of ['code', 'text', 'html', 'image']) expect(canOpenEditor({ kind }, { ...rw, draft: true })).toBe(false);
    expect(canOpenEditor(null, rw)).toBe(false);
  });
});
