import { afterEach, describe, expect, test } from 'bun:test';
import { ADD_PATH_MAX, addPathProblem } from '../src/ui/project-groups';

describe('addPathProblem', () => {
  test('only an absolute path is sent; nothing is expanded or checked here', () => {
    expect(addPathProblem('/home/me/notes')).toBeNull();
    expect(addPathProblem('/')).toBeNull();
    expect(addPathProblem('/a dir/with spaces')).toBeNull();
    expect(addPathProblem('')).toMatch(/full path/);
    expect(addPathProblem('~/notes')).toMatch(/A full path starts with/);
    expect(addPathProblem('notes')).toMatch(/A full path starts with/);
    expect(addPathProblem('./notes')).toMatch(/A full path starts with/);
    expect(addPathProblem(' /home/me')).toMatch(/A full path starts with/);
    expect(addPathProblem('/a\0b')).toMatch(/NUL/);
    expect(addPathProblem('/' + 'a'.repeat(ADD_PATH_MAX))).toMatch(/longer/);
    expect(addPathProblem('/' + 'a'.repeat(ADD_PATH_MAX - 1))).toBeNull();
  });
});

describe('api.addRoot', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g.fetch;
  afterEach(() => (g.fetch = saved));

  test('posts exactly {path, mode} and returns the roots and the new id', async () => {
    const { api } = await import('../src/ui/api');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    g.fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ roots: [{ id: 'n', name: 'n', path: '/x/n', writable: false, mode: 'ro' }], id: 'n' });
    };
    const got = await api.addRoot('/x/n', 'ro');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/roots/add');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ path: '/x/n', mode: 'ro' });
    expect(got.id).toBe('n');
  });

  test('a duplicate names the served project; other refusals carry no id', async () => {
    const { api, ApiError, isAdminDenial } = await import('../src/ui/api');
    g.fetch = async () => Response.json({ error: 'already served', reason: 'served', id: 'repo' }, { status: 409 });
    const dup = await api.addRoot('/x/repo', 'rw').catch((e: unknown) => e);
    expect(dup instanceof ApiError && dup.status === 409 && dup.reason === 'served' && dup.id === 'repo').toBe(true);
    g.fetch = async () => Response.json({ error: 'changed meanwhile', reason: 'stale' }, { status: 409 });
    const stale = await api.addRoot('/x/n', 'rw').catch((e: unknown) => e);
    expect(stale instanceof ApiError && stale.reason === 'stale' && stale.id === undefined).toBe(true);
    g.fetch = async () => Response.json({ error: 'administrator session required', reason: 'admin' }, { status: 401 });
    expect(isAdminDenial(await api.addRoot('/x/n', 'rw').catch((e: unknown) => e))).toBe(true);
    g.fetch = async () => Response.json({ error: 'x', reason: 'served', id: 7 }, { status: 409 });
    expect(((await api.addRoot('/x/n', 'rw').catch((e: unknown) => e)) as InstanceType<typeof ApiError>).id).toBeUndefined();
  });
});
