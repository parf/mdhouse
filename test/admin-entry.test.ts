import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROOF = 'A'.repeat(21) + '_-' + 'b9'.repeat(10);

const g = globalThis as unknown as Record<string, unknown>;
const saved = { location: g.location, history: g.history, fetch: g.fetch };
afterEach(() => Object.assign(g, saved));

// The module runs on import; give it a page without a sign-in link for the pure-function tests.
g.location = { pathname: '/', search: '', hash: '' };
const { takeAdminProof, exchangeAdminProof } = await import('../src/ui/admin-entry');
Object.assign(g, saved);
const { api, isAdminDenial, ApiError } = await import('../src/ui/api');

/** A live `location` stub, as the browser's: replacing the URL changes `hash`. */
function page(href: string) {
  const url = new URL(href, 'http://127.0.0.1:7792');
  const calls: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
  const replaced: string[] = [];
  const loc = {
    get pathname() {
      return url.pathname;
    },
    get search() {
      return url.search;
    },
    get hash() {
      return url.hash;
    },
  };
  const replace = (to: string) => {
    replaced.push(to);
    const next = new URL(to, url);
    url.hash = next.hash;
    url.pathname = next.pathname;
    url.search = next.search;
  };
  return { loc, url, calls, replaced, replace };
}

describe('takeAdminProof', () => {

  test('a well-formed proof is taken and the fragment removed', () => {
    const p = page(`/settings?x=1#admin=${PROOF}`);
    expect(takeAdminProof(p.loc, p.replace)).toBe(PROOF);
    expect(p.replaced).toEqual(['/settings?x=1']);
    expect(p.url.hash).toBe('');
  });

  test.each([
    '#admin=',
    '#admin=short',
    `#admin=${PROOF}x`,
    `#admin=${PROOF.slice(1)}!`,
    `#ADMIN=${PROOF}`,
    `#admin%3D${PROOF}`,
    `#admin=${PROOF}&next=/`,
  ])('a malformed one %p is removed too and refused', (hash) => {
    const p = page(`/settings${hash}`);
    expect(takeAdminProof(p.loc, p.replace)).toBeNull();
    expect(p.replaced).toEqual(['/settings']);
    expect(p.url.hash).toBe('');
  });

  test.each(['', '#admin', '#administration', '#L12', '#x-admin=abc'])('another address %p is left alone', (hash) => {
    const p = page(`/a/doc.md${hash}`);
    expect(takeAdminProof(p.loc, p.replace)).toBe('none');
    expect(p.replaced).toEqual([]);
  });
});

describe('exchangeAdminProof', () => {
  const answer = (status: number | Error) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (status instanceof Error) throw status;
      return new Response(status === 204 ? null : '{"error":"x"}', { status });
    }) as unknown as typeof fetch;
    return { calls, send };
  };

  test('posts the proof once, uncached, without a referrer', async () => {
    const a = answer(204);
    expect(await exchangeAdminProof(PROOF, a.send)).toBe('signed-in');
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0]!.url).toBe('/api/admin/session');
    expect(a.calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(a.calls[0]!.init.body as string)).toEqual({ proof: PROOF });
    expect(a.calls[0]!.init.cache).toBe('no-store');
    expect(a.calls[0]!.init.referrerPolicy).toBe('no-referrer');
  });

  test.each([
    [403, 'invalid'],
    [400, 'invalid'],
    [421, 'invalid'],
    [500, 'failed'],
    [200, 'failed'],
  ] as const)('%p → %p, no retry', async (status, outcome) => {
    const a = answer(status);
    expect(await exchangeAdminProof(PROOF, a.send)).toBe(outcome);
    expect(a.calls).toHaveLength(1);
  });

  test('a network failure → failed, no retry', async () => {
    const a = answer(new Error('offline'));
    expect(await exchangeAdminProof(PROOF, a.send)).toBe('failed');
    expect(a.calls).toHaveLength(1);
  });
});

describe('the module entry', () => {
  /** Loads a fresh copy of the module against a stubbed page and returns what it did. */
  async function load(href: string, status = 204) {
    const p = page(href);
    const seen: string[] = [];
    g.location = p.loc;
    g.history = { state: { keep: 1 }, replaceState: (_s: unknown, _t: string, url: string) => p.replace(url) };
    g.fetch = async (url: string, init?: RequestInit) => {
      // Every request is made after the fragment is gone.
      seen.push(`${url} hash=${p.url.hash}`);
      p.calls.push({ url, init });
      return new Response(null, { status });
    };
    const mod = (await import(`../src/ui/admin-entry.ts?case=${Math.random()}`)) as typeof import('../src/ui/admin-entry');
    // The fragment is gone as soon as the module has run, before it settles.
    const synchronouslyClean = p.url.hash === '';
    return { entry: await mod.adminEntry, p, seen, synchronouslyClean };
  }

  test('valid link: cleaned at load, exchanged once', async () => {
    const r = await load(`/settings#admin=${PROOF}`);
    expect(r.synchronouslyClean).toBe(true);
    expect(r.entry).toBe('signed-in');
    expect(r.seen).toEqual(['/api/admin/session hash=']);
    expect(r.p.replaced).toEqual(['/settings']);
  });

  test('replayed or expired link: invalid, no second try', async () => {
    const r = await load(`/settings#admin=${PROOF}`, 403);
    expect(r.entry).toBe('invalid');
    expect(r.seen).toHaveLength(1);
  });

  test('malformed link: cleaned, nothing sent', async () => {
    const r = await load('/settings#admin=not-a-proof');
    expect(r.synchronouslyClean).toBe(true);
    expect(r.entry).toBe('invalid');
    expect(r.seen).toEqual([]);
  });

  test('the next module already sees a clean address', async () => {
    // As in app.tsx: a module that imports admin-entry first runs right after its body, before any microtask.
    const dir = mkdtempSync(join(tmpdir(), 'admin-entry-'));
    try {
      const entry = join(import.meta.dir, '../src/ui/admin-entry.ts');
      writeFileSync(join(dir, 'probe.ts'), `import ${JSON.stringify(`${entry}?probe`)};\nexport const hash = location.hash;\n`);
      const p = page(`/settings#admin=${PROOF}`);
      g.location = p.loc;
      g.history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => p.replace(url) };
      g.fetch = async () => new Response(null, { status: 204 });
      const probe = (await import(join(dir, 'probe.ts'))) as { hash: string };
      expect(probe.hash).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a link opened in a loaded page is cleaned, exchanged once and reported', async () => {
    const r = await load('/a/doc.md');
    const mod = await import('../src/ui/admin-entry');
    const got: string[] = [];
    const stop = mod.onAdminEntry((e) => got.push(e));
    try {
      r.p.replace(`/settings#admin=${PROOF}`);
      r.p.replaced.length = 0;
      dispatchEvent(new Event('hashchange'));
      expect(r.p.url.hash).toBe('');
      expect(r.p.replaced).toEqual(['/settings']);
      await Bun.sleep(0);
      await Bun.sleep(0);
      expect(r.seen).toEqual(['/api/admin/session hash=']);
      expect(got).toEqual(['signed-in']);
      // An ordinary anchor change afterwards is neither touched nor reported.
      r.p.replace('/settings#intro');
      dispatchEvent(new Event('hashchange'));
      await Bun.sleep(0);
      expect(r.p.url.hash).toBe('#intro');
      expect(got).toEqual(['signed-in']);
    } finally {
      stop();
    }
  });

  test('no link: nothing touched or sent', async () => {
    const r = await load('/a/doc.md#intro');
    expect(r.entry).toBe('none');
    expect(r.p.url.hash).toBe('#intro');
    expect(r.seen).toEqual([]);
  });
});

describe('admin refusals', () => {
  const reply = (status: number, body: unknown) => {
    g.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };

  test('a protected write refused for the session is an admin denial', async () => {
    reply(401, { error: 'administrator session required', reason: 'admin' });
    const err = await api.setSettings({ editLink: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isAdminDenial(err)).toBe(true);
    expect((err as Error).message).toBe('administrator session required');
  });

  test.each([
    [401, { error: 'login' }],
    [403, { error: 'cross-origin', reason: 'admin' }],
    [409, { error: 'stale', reason: 'stale' }],
  ])('%p %p is not', async (status, body) => {
    reply(status, body);
    for (const call of [() => api.removeRoot('r'), () => api.abFilter(['x']), () => api.abDefault(['x'])]) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(isAdminDenial(err)).toBe(false);
    }
  });

  test('admin state: only a literal true is admin; non-numbers drop', async () => {
    reply(200, { admin: 'yes', expiresAt: '1' });
    expect(await api.admin()).toEqual({ admin: false, expiresAt: undefined });
    reply(200, { admin: true, expiresAt: 5 });
    expect(await api.admin()).toEqual({ admin: true, expiresAt: 5 });
  });
});
