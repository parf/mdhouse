import { afterEach, describe, expect, test } from 'bun:test';
import { api } from '../src/ui/api';
import { isViewer, refusalText, switchConfirm, VIEWER_BADGE, VIEWER_DENIED, VIEWER_MESSAGE, VIEWER_SIGN_IN, VIEWER_TITLE } from '../src/ui/viewer-text';

describe('what the page says in a Viewer', () => {
  test('the words the owner chose', () => {
    expect(VIEWER_BADGE).toBe('Viewer — read-only');
    expect(VIEWER_TITLE).toBe('Every project is read-only — an administrator switches it in Settings (sign in with mdhouse admin)');
    expect(VIEWER_SIGN_IN.join('')).toBe('Viewer — sign in with mdhouse admin to switch back');
    expect(VIEWER_MESSAGE).toContain('Viewer — read-only');
    expect(VIEWER_MESSAGE).toContain('mdhouse admin');
  });

  test('only a settings answer that says viewer is a Viewer', () => {
    expect(isViewer({ mode: 'viewer' })).toBe(true);
    for (const s of [{ mode: 'workspace' }, {}, { mode: 'Viewer' }, { mode: 1 }, null, undefined]) expect(isViewer(s)).toBe(false);
  });

  test('the switch asks only when the mode changes; to Viewer it names the loss and the way back', () => {
    expect(switchConfirm('viewer', 'viewer')).toBeNull();
    expect(switchConfirm('workspace', 'workspace')).toBeNull();
    const toViewer = switchConfirm('workspace', 'viewer')!;
    expect(toViewer).toContain('read-only for everyone, including you');
    expect(toViewer).toContain('marks and Agent Bus sends');
    expect(toViewer).toContain('Workspace brings it back');
    expect(toViewer).toContain('You will need mdhouse admin to switch back.');
    const toWorkspace = switchConfirm('viewer', 'workspace')!;
    expect(toWorkspace).toContain('writable again by their own RW/RO settings');
    expect(toWorkspace).not.toContain('mdhouse admin');
  });

  test('a refusal reads as the Viewer\'s own words for reason viewer, else as the server wrote it', () => {
    expect(refusalText({ error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' }, '403 Forbidden')).toBe(VIEWER_MESSAGE);
    expect(refusalText({ error: 'cross-origin request refused' }, '403 Forbidden')).toBe('cross-origin request refused');
    expect(refusalText({ error: '' }, '403 Forbidden')).toBe('403 Forbidden');
    expect(refusalText(null, '500 Internal Server Error')).toBe('500 Internal Server Error');
  });
});

describe('a refused write through the api', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const refuseWith = (status: number, body: unknown) => {
    globalThis.fetch = (async () => Response.json(body, { status })) as unknown as typeof fetch;
  };
  const denied = () => {
    const seen: number[] = [];
    const on = () => seen.push(1);
    addEventListener(VIEWER_DENIED, on);
    return { seen, off: () => removeEventListener(VIEWER_DENIED, on) };
  };

  test.each([
    ['a mark', () => api.setMark('r', 'a.md', 'favorite', true)],
    ['a tick', () => api.toggleTask('r/a.md', 1, 'h')],
    ['an answer', () => api.qa({ p: 'r/a.md', line: 1, hash: 'h' } as never)],
    ['an insert', () => api.insertBlock({ p: 'r/a.md', line: 1, hash: 'h', where: 'below', kind: 'text', text: 'x' })],
    ['the author name', () => api.setAuthor('me')],
    ['an Agent Bus send', () => api.abSend({ p: 'r/a.md', targets: ['#a@h'], action: 'note', note: 'x' } as never)],
  ])('%s: the Viewer message, and the app is told to re-read the mode', async (_, call) => {
    refuseWith(403, { error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' });
    const d = denied();
    try {
      await expect(call()).rejects.toThrow(VIEWER_MESSAGE);
      expect(d.seen).toHaveLength(1);
    } finally {
      d.off();
    }
  });

  test('any other refusal keeps the server\'s words and says nothing about a Viewer', async () => {
    refuseWith(403, { error: 'cross-origin request refused' });
    const d = denied();
    try {
      await expect(api.setMark('r', 'a.md', 'favorite', true)).rejects.toThrow('cross-origin request refused');
      expect(d.seen).toHaveLength(0);
    } finally {
      d.off();
    }
  });
});
