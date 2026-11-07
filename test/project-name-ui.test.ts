import { afterEach, describe, expect, test } from 'bun:test';
import type { RootInfo } from '../src/ui/api';
import { rootLabel } from '../src/ui/format';
import { chooserLabels, customName } from '../src/ui/project-groups';

const root = (id: string, path: string, extra: Partial<RootInfo> = {}): RootInfo => ({ id, name: path.split('/').pop()!, path, writable: false, ...extra });
const label = (p: string) => rootLabel(p);

describe('customName', () => {
  test('only a non-blank string counts', () => {
    expect(customName(root('a', '/x/a', { customName: 'Notes' }))).toBe('Notes');
    expect(customName(root('a', '/x/a'))).toBeNull();
    expect(customName(root('a', '/x/a', { customName: '   ' }))).toBeNull();
    expect(customName({ ...root('a', '/x/a'), customName: 7 } as unknown as RootInfo)).toBeNull();
  });
});

describe('chooserLabels', () => {
  test('a project with its own name shows it; the rest keep their path label', () => {
    const got = chooserLabels([root('a', '/home/u/docs', { customName: 'All MDHouse Projects', name: 'All MDHouse Projects' }), root('b', '/srv/notes')], label);
    expect(got.get('a')).toBe('All MDHouse Projects');
    expect(got.get('b')).toBe(label('/srv/notes'));
  });

  test('a shared own name is told apart by each folder', () => {
    const got = chooserLabels([root('a', '/one/docs', { customName: 'Docs' }), root('b', '/two/docs', { customName: 'Docs' }), root('c', '/three/c')], label);
    expect(got.get('a')).toBe(`Docs — ${label('/one/docs')}`);
    expect(got.get('b')).toBe(`Docs — ${label('/two/docs')}`);
    expect(got.get('c')).toBe(label('/three/c'));
  });

  test('an own name equal to another folder label marks only the named one', () => {
    const got = chooserLabels([root('a', '/x/a', { customName: label('/y/b') }), root('b', '/y/b')], label);
    expect(got.get('a')).toBe(`${label('/y/b')} — ${label('/x/a')}`);
    expect(got.get('b')).toBe(label('/y/b'));
  });

  test('labels the short path context cannot tell apart fall back to the full path', () => {
    // rootLabel(…, above 1) gives `team/repo` for both folders.
    const full = (p: string) => rootLabel(p, { above: 'all', max: Infinity, home: '/home/u' });
    const named = chooserLabels([root('a', '/a/team/repo', { customName: 'Shared' }), root('b', '/b/team/repo', { customName: 'Shared' }), root('c', '/c/x')], label, full);
    expect(named.get('a')).toBe('Shared — /a/team/repo');
    expect(named.get('b')).toBe('Shared — /b/team/repo');
    expect(named.get('c')).toBe(label('/c/x'));
    const plain = chooserLabels([root('a', '/home/u/a/team/repo'), root('b', '/b/team/repo'), root('c', '/c/x')], label, full);
    expect(plain.get('a')).toBe('~/a/team/repo');
    expect(plain.get('b')).toBe('/b/team/repo');
    expect(plain.get('c')).toBe(label('/c/x'));
    for (const got of [named, plain]) expect(new Set(got.values()).size).toBe(got.size);
  });

  test('names are labels, never markup', () => {
    const got = chooserLabels([root('a', '/x/a', { customName: '<b>x</b> & "y"' })], label);
    expect(got.get('a')).toBe('<b>x</b> & "y"');
  });
});

describe('api.setRootName', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g.fetch;
  afterEach(() => (g.fetch = saved));

  test('posts exactly {id, name} and returns the roots', async () => {
    const { api } = await import('../src/ui/api');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    g.fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ roots: [root('a', '/x/a', { customName: 'N', name: 'N' })] });
    };
    const got = await api.setRootName('a', ' N ');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/roots/name');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ id: 'a', name: ' N ' });
    expect(got.roots[0]!.customName).toBe('N');
  });

  test('an administrator denial is typed', async () => {
    const { api, isAdminDenial } = await import('../src/ui/api');
    g.fetch = async () => Response.json({ error: 'administrator session required', reason: 'admin' }, { status: 401 });
    expect(isAdminDenial(await api.setRootName('a', 'x').catch((e: unknown) => e))).toBe(true);
    g.fetch = async () => Response.json({ error: 'reference is read-only' }, { status: 403 });
    const err = await api.setRootName('ref', 'x').catch((e: unknown) => e);
    expect(isAdminDenial(err)).toBe(false);
    expect((err as Error).message).toBe('reference is read-only');
  });
});
