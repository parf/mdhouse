import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry, RootScopeError, withRootScope, type Root } from '../src/lib/roots';
import { TeamAccess, type TeamState } from '../src/lib/team-access';
import { activationBlockers, hasTeamRoute, overlappingPaths, TEAM_ROUTES, teamRoute } from '../src/lib/team-runtime';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const profiles: Record<string, { id: number; login: string }> = {
  'gh-admin': { id: 11, login: 'gh-admin' },
  alice: { id: 12, login: 'alice' },
  bob: { id: 13, login: 'bob' },
  carol: { id: 14, login: 'carol' },
  mallory: { id: 15, login: 'mallory' },
};
const user = (p: { id: number; login: string }) => ({ ...p, name: p.login.toUpperCase(), type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/1' });

/** A GitHub that never leaves the process: user lookups, the PKCE-checked token exchange and the profile read. */
function fakeGitHub() {
  const challenges = new Map<string, string>();
  const tokens = new Map<string, string>();
  const calls: string[] = [];
  const request = Object.assign(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
    if (url.origin === 'https://api.github.com' && url.pathname.startsWith('/users/')) {
      const p = profiles[decodeURIComponent(url.pathname.slice(7))];
      return p ? Response.json(user(p)) : Response.json({}, { status: 404 });
    }
    if (url.href === 'https://github.com/login/oauth/access_token') {
      const body = new URLSearchParams(init!.body as URLSearchParams);
      const code = body.get('code')!;
      const challenge = challenges.get(code.split(':')[1] ?? '');
      if (!challenge || createHash('sha256').update(body.get('code_verifier')!).digest('base64url') !== challenge) return Response.json({ error: 'bad_verifier' });
      const token = `tok-${code.split(':')[0]}`;
      tokens.set(token, code.split(':')[0]!);
      return Response.json({ access_token: token });
    }
    if (url.href === 'https://api.github.com/user') {
      const who = tokens.get(String((init!.headers as Record<string, string>).authorization).slice(7));
      return who ? Response.json(user(profiles[who]!)) : Response.json({}, { status: 401 });
    }
    return Response.json({}, { status: 500 });
  }, { preconnect: fetch.preconnect }) as typeof fetch;
  return { request, challenges, calls };
}

describe('Team routes: every registered route has a reviewed Team classification', () => {
  test('unlisted is refused; the table names no route the server does not have', async () => {
    expect(teamRoute('GET', '/api/never-reviewed')).toEqual({ policy: 'denied', why: 'This route has not been reviewed for Team.' });
    expect(teamRoute('POST', '/api/task').policy).toBe('write');
    expect(teamRoute('*', '/api/git/push').policy).toBe('denied');
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-team-routes-')));
    await mkdir(join(base, 'a'));
    const prefs = await Prefs.load(join(base, 'config', 'prefs.json'));
    const s = await serve({ registry: await Registry.create([join(base, 'a')]), prefs, port: 0, hostname: '127.0.0.1', noGit: true });
    try {
      const unclassified = s.routes.filter((r) => r.path !== '/__app/' ? !hasTeamRoute(r.method, r.path) : false).map((r) => `${r.method} ${r.path}`);
      expect(unclassified).toEqual([]);
      // a bare handler answers every method: its entry must be the wildcard, never one method that would leave the others unlisted
      for (const r of s.routes.filter((r) => r.method === '*' && r.path !== '/__app/')) expect([r.path, `* ${r.path}` in TEAM_ROUTES]).toEqual([r.path, true]);
      for (const m of ['GET', 'POST', 'HEAD']) expect(teamRoute(m, '/api/tree').policy).toBe('read');
    } finally {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('registry scope', () => {
  test('a scoped lookup sees only what the scope allows; writes need canWrite; safety checks still see everything', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-scope-')));
    await mkdir(join(base, 'a'));
    await mkdir(join(base, 'b'));
    await writeFile(join(base, 'a', 'x.md'), '# x\n');
    await writeFile(join(base, 'b', 'y.md'), '# y\n');
    try {
      const registry = await Registry.create([join(base, 'a'), join(base, 'b')], 'rw');
      const [a, b] = registry.all() as [Root, Root];
      const scope = { allows: (r: Root) => r === a, canWrite: () => false };
      expect(registry.list().length).toBe(2);
      await withRootScope(scope, async () => {
        expect(registry.list().map((r) => r.id)).toEqual([a.id]);
        expect(registry.get(b.id)).toBeUndefined();
        expect(registry.projects().length).toBe(1);
        expect(await registry.resolve(`${b.id}/y.md`)).toBeNull();
        expect(await registry.fromDocUrl(`/${b.id}/y.md`)).toBeNull();
        const loc = await registry.resolve(`${a.id}/x.md`);
        expect(loc).not.toBeNull();
        expect(registry.writableAt(loc!)).toBe(false);
        await expect(registry.writeFile(`${a.id}/x.md`, 'no')).rejects.toThrow();
        expect(registry.all().length).toBe(2);
      });
      const none = { allows: () => false, canWrite: () => false };
      expect(() => withRootScope(none, () => registry.defaultRoot())).toThrow(RootScopeError);
      expect(registry.defaultRoot().id).toBe(a.id);
      await registry.writeFile(`${a.id}/x.md`, '# changed\n');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('activation rules', () => {
  const state = (over: Partial<TeamState> = {}): TeamState => ({ revision: 'r', active: false, adminId: '11', users: [{ id: '11', login: 'gh-admin', name: null, groups: ['all-users'], banned: false }], groups: [], projects: [], ...over });
  test('needs sign-in configured, a registered unbanned administrator and no overlapping projects', () => {
    const ok = { state: state(), oauthReady: true, projects: [{ name: 'a', path: '/srv/a' }, { name: 'b', path: '/srv/b' }] };
    expect(activationBlockers(ok)).toEqual([]);
    expect(activationBlockers({ ...ok, oauthReady: false }).join()).toContain('GitHub sign-in is not configured');
    expect(activationBlockers({ ...ok, state: state({ adminId: null, users: [] }) }).join()).toContain('Add the Team administrator');
    expect(activationBlockers({ ...ok, state: state({ users: [{ id: '11', login: 'gh-admin', name: null, groups: ['all-users'], banned: true }] }) }).join()).toContain('banned');
    expect(activationBlockers({ ...ok, projects: [{ name: 'a', path: '/srv/a' }, { name: 'sub', path: '/srv/a/sub' }] }).join()).toContain('Projects overlap: a and sub');
    expect(activationBlockers({ ...ok, projects: [{ name: 'root', path: '/' }] }).join()).toContain('whole filesystem');
    expect(activationBlockers({ ...ok, projects: [{ name: 'cfg', path: '/home/u/.config/mdhouse', instance: true }] }).join()).toContain("holds mdhouse's own configuration");
  });

  test('overlap: equal, nested either way, and symlink aliases; a name that only starts alike is not', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-overlap-')));
    try {
      await mkdir(join(base, 'a', 'sub'), { recursive: true });
      await mkdir(join(base, 'ab'));
      await Bun.$`ln -s ${join(base, 'a')} ${join(base, 'alias')}`;
      expect(overlappingPaths([join(base, 'a'), join(base, 'ab')])).toEqual([]);
      expect(overlappingPaths([join(base, 'a'), join(base, 'a', 'sub')]).length).toBe(1);
      expect(overlappingPaths([join(base, 'a', 'sub'), join(base, 'a')]).length).toBe(1);
      expect(overlappingPaths([join(base, 'a'), join(base, 'alias')]).length).toBe(1);
      expect(overlappingPaths(['/', join(base, 'a')]).length).toBe(1);
      expect(overlappingPaths([join(base, 'a'), '/']).length).toBe(1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('a failed activation is written back and Team stays off; a failed ban refresh fails closed', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-rollback-')));
    chmodSync(dir, 0o700);
    try {
      let fail = false;
      const seen: boolean[] = [];
      const access = TeamAccess.open({ dir, syncAuth: (next) => { seen.push(next.active); if (fail && next.active) throw new Error('refresh'); } });
      access.update(access.snapshot().revision, { action: 'add', user: { id: '11', login: 'gh-admin', name: null } });
      fail = true;
      const before = readFileSync(join(dir, 'team-access.json'), 'utf8');
      expect(() => access.update(access.snapshot().revision, { action: 'activation', active: true })).toThrow('previous state was restored');
      expect(access.snapshot().active).toBe(false);
      expect(JSON.parse(readFileSync(join(dir, 'team-access.json'), 'utf8')).active).toBe(false);
      expect(readFileSync(join(dir, 'team-access.json'), 'utf8')).not.toBe(before);
      expect(seen.slice(-2)).toEqual([true, false]);
      fail = false;
      expect(access.update(access.snapshot().revision, { action: 'activation', active: true }).active).toBe(true);
      access.update(access.snapshot().revision, { action: 'add', user: { id: '12', login: 'alice', name: null } });
      fail = true;
      expect(() => access.update(access.snapshot().revision, { action: 'ban', userId: '12', banned: true })).toThrow('authorization refresh failed');
      expect(() => access.snapshot()).toThrow('unavailable');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('the administrator must exist, unbanned, to activate', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-activate-')));
    chmodSync(dir, 0o700);
    try {
      const access = TeamAccess.open({ dir });
      expect(() => access.update(access.snapshot().revision, { action: 'activation', active: true })).toThrow('registered, unbanned administrator');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

interface World {
  base: string;
  origin: string;
  port: number;
  a: Root;
  b: Root;
  owner: string;
  gh: ReturnType<typeof fakeGitHub>;
  prefs: Prefs;
  stop: (keep?: boolean) => Promise<void>;
  revision: () => Promise<string>;
  ownerPost: (path: string, body: unknown) => Promise<Response>;
  update: (body: Record<string, unknown>) => Promise<Response>;
  login: (who: string) => Promise<string>;
  api: (cookie: string | null, path: string, init?: RequestInit) => Promise<Response>;
  ws: (cookie: string | null) => Promise<{ messages: any[]; closed: Promise<number>; socket: WebSocket }>;
}

const ENV = ['MDHOUSE_GITHUB_CLIENT_ID', 'MDHOUSE_GITHUB_CLIENT_SECRET', 'MDHOUSE_GITHUB_CALLBACK_URL', 'MDHOUSE_TEAM'] as const;

let nextPort = 61910;
async function world(opts: { oauth?: boolean; roots?: (base: string) => string[]; env?: Record<string, string>; base?: string; git?: boolean } = {}): Promise<World> {
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  if (opts.oauth !== false) {
    process.env.MDHOUSE_GITHUB_CLIENT_ID = 'client';
    process.env.MDHOUSE_GITHUB_CLIENT_SECRET = 'secret';
    process.env.MDHOUSE_GITHUB_CALLBACK_URL = 'http://127.0.0.1:9/auth/github/callback';
  }
  Object.assign(process.env, opts.env ?? {});
  const base = opts.base ?? (await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-teamrt-'))));
  for (const dir of opts.base ? [] : ['a', 'b']) {
    await mkdir(join(base, dir));
    if (dir === 'a') await mkdir(join(base, 'a', 'sub'));
    await writeFile(join(base, dir, 'note.md'), `# ${dir} note\n\n- [ ] task ${dir}\n`);
    await writeFile(join(base, dir, 'other.md'), `# ${dir} other\n`);
  }
  const prefs = await Prefs.load(join(base, 'config', 'prefs.json'));
  const registry = await Registry.create(opts.roots ? opts.roots(base) : [join(base, 'a'), join(base, 'b')], 'rw');
  const gh = fakeGitHub();
  const s = await serve({ registry, prefs, port: testPort(nextPort++), hostname: '127.0.0.1', localAdmin: true, noGit: !opts.git, teamFetch: gh.request });
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  const port = s.server.port!;
  const origin = `http://127.0.0.1:${port}`;
  const owner = await adminLogin(port);
  const [a, b] = registry.all() as [Root, Root];
  const json = (body: unknown) => ({ headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ownerPost = (path: string, body: unknown) => fetch(origin + path, { method: 'POST', ...json(body), headers: { ...json(body).headers, cookie: owner } });
  const revision = async (): Promise<string> => (await (await fetch(`${origin}/api/team`, { headers: { cookie: owner } })).json()).revision;
  const update = async (body: Record<string, unknown>) => ownerPost('/api/team', { revision: await revision(), ...body });
  const jar = new Map<string, string>();
  const api = (cookie: string | null, path: string, init: RequestInit = {}) =>
    fetch(origin + path, { redirect: 'manual', ...init, headers: { origin, ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string>) } });
  const login = async (who: string): Promise<string> => {
    const start = await fetch(`${origin}/auth/github/login`, { redirect: 'manual' });
    expect(start.status).toBe(302);
    const target = new URL(start.headers.get('location')!);
    const state = target.searchParams.get('state')!;
    const stateCookie = start.headers.get('set-cookie')!;
    expect(stateCookie).toMatch(/HttpOnly/);
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    gh.challenges.set(state, target.searchParams.get('code_challenge')!);
    const back = await fetch(`${origin}/auth/github/callback?state=${state}&code=${who}:${state}`, { redirect: 'manual', headers: { cookie: stateCookie.slice(0, stateCookie.indexOf(';')) } });
    if (back.status !== 303) return `FAILED:${back.status}`;
    const set = back.headers.getSetCookie().find((c) => c.startsWith(`mdhouse-team-${port}=`))!;
    const cookie = set.slice(0, set.indexOf(';'));
    jar.set(who, cookie);
    return cookie;
  };
  const ws = (cookie: string | null) =>
    new Promise<{ messages: any[]; closed: Promise<number>; socket: WebSocket }>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, ...(cookie ? { cookie } : {}) } } as never);
      const messages: any[] = [];
      const closed = new Promise<number>((done) => (socket.onclose = (e) => done(e.code)));
      socket.onmessage = (e) => {
        messages.push(JSON.parse(String(e.data)));
        if (messages.length === 1) resolve({ messages, closed, socket });
      };
      socket.onerror = () => reject(new Error('socket refused'));
      setTimeout(() => reject(new Error('socket timeout')), 5000);
    });
  return {
    base, origin, port, a, b, owner, gh, ownerPost, revision, update, login, api, ws, prefs,
    stop: async (keep = false) => {
      s.server.stop(true);
      s.watcher.close();
      s.control?.stop();
      if (!keep) await rm(base, { recursive: true, force: true });
    },
  };
}

const grant = (w: World, root: Root, subject: 'user' | 'group', subjectId: string, access: string | null) =>
  w.update({ action: 'grant', projectId: root.id, subject, subjectId, access });
const add = async (w: World, login: string) => {
  const preview = await (await w.ownerPost('/api/team/preview', { login })).json();
  return w.update({ action: 'add', token: preview.token });
};
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('Team in a running server', () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  }, 30_000);
  afterAll(async () => {
    await w?.stop();
  });

  test('Personal is unchanged until activation: no sign-in, no sessions, every project, loopback is the administrator', async () => {
    expect((await w.api(null, '/auth/github/login')).status).toBe(404);
    expect((await w.api(null, '/api/team/me')).status).toBe(404);
    const roots = await (await w.api(null, '/api/roots')).json();
    expect(roots.roots.map((r: { id: string }) => r.id).sort()).toEqual([w.a.id, w.b.id].sort());
    expect(roots.roots[0].path).toContain(w.base);
    expect(await (await w.api(null, '/api/admin')).json()).toEqual({ admin: true, local: true });
    expect((await w.api(null, `/api/doc?p=${w.b.id}/note.md`)).status).toBe(200);
  });

  test('activation is refused until the administrator exists, and only the owner may switch it', async () => {
    const early = await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' });
    expect(early.status).toBe(409);
    expect((await early.json()).error).toContain('Add the Team administrator');
    const before = await (await w.api(w.owner, '/api/team')).json();
    expect([before.owner, before.canActivate, before.canDeactivate, before.blockers.length > 0]).toEqual([true, false, false, true]);
    expect((await add(w, 'gh-admin')).status).toBe(200);
    const ready = await (await w.api(w.owner, '/api/team')).json();
    expect([ready.owner, ready.canActivate]).toEqual([true, true]);
    for (const who of ['alice', 'bob', 'carol']) expect((await add(w, who)).status).toBe(200);
    expect(await (await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'yes' })).json()).toMatchObject({ reason: 'confirm' });
    expect((await w.ownerPost('/api/team/activation', { revision: 'stale', active: true, confirm: 'activate team' })).status).toBe(409);
    const stranger = await fetch(`${w.origin}/api/team/activation`, { method: 'POST', headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ revision: await w.revision(), active: true, confirm: 'activate team' }) });
    expect(stranger.status).toBe(403);
    expect((await w.api(null, '/auth/github/login')).status).toBe(404);
  });

  test('grants staged before activation: alice RO on a, bob RW on a, carol in group docs RW on b, direct none overrides', async () => {
    const team = await (await w.api(w.owner, '/api/team')).json();
    const id = (login: string) => team.users.find((u: { login: string }) => u.login === login).id;
    expect((await grant(w, w.a, 'user', id('alice'), 'ro')).status).toBe(200);
    expect((await grant(w, w.a, 'user', id('bob'), 'rw')).status).toBe(200);
    expect((await w.update({ action: 'groups', userId: id('carol'), groups: 'docs' })).status).toBe(200);
    expect((await grant(w, w.b, 'group', 'docs', 'rw')).status).toBe(200);
    expect((await grant(w, w.a, 'group', 'docs', 'rw')).status).toBe(200);
    expect((await grant(w, w.a, 'user', id('carol'), 'none')).status).toBe(200);
  });

  test('activating: owner confirmation, then Personal ends — loopback is no longer the administrator, nothing is open without an account', async () => {
    const res = await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' });
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe(true);
    expect(await (await w.api(null, '/api/admin')).json()).toEqual({ admin: false });
    for (const path of ['/api/roots', '/api/tree?root=' + w.a.id, `/api/doc?p=${w.a.id}/note.md`, `/api/raw?p=${w.a.id}/note.md`, `/api/search?root=${w.a.id}&q=a`, '/api/team/me', '/api/files?p=' + w.a.id]) {
      const r = await w.api(null, path);
      expect([path, r.status]).toEqual([path, 401]);
      expect(await r.json()).toMatchObject({ reason: 'login' });
    }
    const page = await w.api(null, '/', { headers: { accept: 'text/html' } });
    expect([page.status, page.headers.get('location')]).toEqual([302, '/auth/github/login']);
    const root = await w.api(null, `/${w.a.id}/note.md`, { headers: { accept: 'text/html' } });
    expect([root.status, root.headers.get('location')]).toEqual([302, '/auth/github/login']);
    expect((await w.api(null, '/ws')).status).not.toBe(101);
    expect((await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: false, confirm: 'deactivate team' })).status).toBe(200);
    expect(await (await w.api(null, '/api/admin')).json()).toEqual({ admin: true, local: true });
    expect((await w.api(null, '/api/roots')).status).toBe(200);
    expect((await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' })).status).toBe(200);
  });

  test('sign-in: known accounts only, PKCE and state checked, an unregistered or tampered exchange gets nothing', async () => {
    expect(await w.login('mallory')).toBe('FAILED:403');
    const start = await fetch(`${w.origin}/auth/github/login`, { redirect: 'manual' });
    const target = new URL(start.headers.get('location')!);
    const state = target.searchParams.get('state')!;
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
    w.gh.challenges.set(state, target.searchParams.get('code_challenge')!);
    // no state cookie, a state of another browser, a replayed state, a wrong verifier
    expect((await fetch(`${w.origin}/auth/github/callback?state=${state}&code=alice:${state}`, { redirect: 'manual' })).status).toBe(401);
    const ok = await fetch(`${w.origin}/auth/github/callback?state=${state}&code=alice:${state}`, { redirect: 'manual', headers: { cookie } });
    expect(ok.status).toBe(303);
    const set = ok.headers.getSetCookie().join('\n');
    expect(set).toMatch(new RegExp(`mdhouse-team-${w.port}=[A-Za-z0-9_-]{43}; Path=/; HttpOnly; SameSite=Lax`));
    expect((await fetch(`${w.origin}/auth/github/callback?state=${state}&code=alice:${state}`, { redirect: 'manual', headers: { cookie } })).status).toBe(401);
    w.gh.challenges.set('other', 'not-the-challenge');
    const forged = await fetch(`${w.origin}/auth/github/callback?state=other&code=alice:other`, { redirect: 'manual', headers: { cookie: `${cookie.split('=')[0]}=other` } });
    expect(forged.status).toBe(401);
    expect(await w.login('gh-admin')).toMatch(/^mdhouse-team-/);
  });

  test('an account sees only its granted projects: reads of another project are the same refusal as a nonexistent one', async () => {
    const alice = await w.login('alice');
    const me = await (await w.api(alice, '/api/team/me')).json();
    expect(me).toMatchObject({ user: { login: 'alice' }, admin: false, grants: { [w.a.id]: 'ro' } });
    expect(Object.keys(me.grants)).toEqual([w.a.id]);
    const roots = await (await w.api(alice, '/api/roots')).json();
    expect(roots.roots.map((r: { id: string }) => r.id)).toEqual([w.a.id]);
    expect(roots.roots[0]).toMatchObject({ path: '', writable: false });
    expect(roots.home).toBe('');
    expect(JSON.stringify(roots)).not.toContain(w.base);
    for (const path of [`/api/tree?root=${w.a.id}`, `/api/doc?p=${w.a.id}/note.md`, `/api/raw?p=${w.a.id}/note.md`, `/api/files?p=${w.a.id}`, `/api/search?root=${w.a.id}&q=note`, `/api/recents?root=${w.a.id}`]) {
      const r = await w.api(alice, path);
      expect([path, r.status]).toEqual([path, 200]);
      expect(await r.text()).not.toContain(w.base);
    }
    const missing = await w.api(alice, '/api/doc?p=nonexistent/note.md');
    for (const path of [`/api/tree?root=${w.b.id}`, `/api/doc?p=${w.b.id}/note.md`, `/api/raw?p=${w.b.id}/note.md`, `/api/files?p=${w.b.id}`, `/api/search?root=${w.b.id}&q=note`, `/api/recents?root=${w.b.id}`, `/api/choose?root=${w.b.id}&target=note&from=`]) {
      const r = await w.api(alice, path);
      expect([path, r.status >= 400]).toEqual([path, true]);
      expect(await r.text()).not.toContain('b note');
    }
    expect((await w.api(alice, `/api/doc?p=${w.b.id}/note.md`)).status).toBe(missing.status);
    // a bare request falls to a project she may see, never the first one served
    const dflt = await (await w.api(alice, '/api/tree')).json();
    expect(dflt.files.every((f: { rel: string }) => !f.rel.includes('b note'))).toBe(true);
    expect((await w.api(alice, `/${w.b.id}/note.md`, { headers: { accept: 'text/html' } })).status).toBe(404);
    expect((await w.api(alice, `/${w.a.id}/note.md`, { headers: { accept: 'text/html' } })).status).toBe(200);
    expect((await w.api(alice, `/d/${w.b.id}/note.md`, { headers: { accept: 'text/html' } })).status).not.toBe(200);
  });

  test('RO refuses every write; RW writes with its own GitHub name; a write needs the same origin; a non-granted project cannot be written', async () => {
    const alice = await w.login('alice');
    const bob = await w.login('bob');
    const doc = await (await w.api(bob, `/api/doc?p=${w.a.id}/note.md`)).json();
    expect(doc.writable).toBe(true);
    expect((await (await w.api(alice, `/api/doc?p=${w.a.id}/note.md`)).json()).writable).toBe(false);
    const task = (cookie: string, rootId: string, line: number, hash: string, origin = w.origin) =>
      w.api(cookie, '/api/task', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ p: `${rootId}/note.md`, line, hash }) });
    const [, line, tick] = doc.html.match(/task-checkbox[^>]*data-line="(\d+)" data-hash="([0-9a-f]+)"/) ?? [];
    expect([typeof line, typeof tick]).toEqual(['string', 'string']);
    expect((await task(alice, w.a.id, Number(line), tick)).status).toBe(403);
    expect((await task(bob, w.b.id, Number(line), tick)).status).toBe(404);
    expect((await task(bob, w.a.id, Number(line), tick, 'http://evil.example')).status).toBe(403);
    expect((await task(bob, w.a.id, Number(line), tick)).status).toBe(200);
    expect(readFileSync(join(w.base, 'a', 'note.md'), 'utf8')).toContain('- [x] task a');
    const source = await (await w.api(bob, `/api/source?p=${w.a.id}/other.md`)).json();
    const save = (cookie: string, rootId: string) =>
      w.api(cookie, '/api/source', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.origin }, body: JSON.stringify({ p: `${rootId}/other.md`, hash: source.hash, text: '# edited\n' }) });
    expect((await save(alice, w.a.id)).status).toBe(403);
    expect((await save(bob, w.b.id)).status).toBe(404);
    expect((await save(bob, w.a.id)).status).toBe(200);
    expect(readFileSync(join(w.base, 'a', 'other.md'), 'utf8')).toBe('# edited\n');
    expect(readFileSync(join(w.base, 'b', 'other.md'), 'utf8')).toBe('# b other\n');
  });

  test('an insert is signed with the account\'s GitHub name, whatever the author cookie says; RO and ungranted are refused', async () => {
    const bob = await w.login('bob');
    const alice = await w.login('alice');
    const doc = await (await w.api(bob, `/api/doc?p=${w.a.id}/note.md`)).json();
    const [, line, hash] = doc.html.match(/<h1 data-line="(\d+)" data-hash="([0-9a-f]+)"/) ?? [];
    const insert = (cookie: string, rootId: string, extra = '') =>
      w.api(cookie + extra, '/api/insert', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.origin }, body: JSON.stringify({ p: `${rootId}/note.md`, line: Number(line), hash, where: 'below', kind: 'my-quote', text: 'said so' }) });
    expect((await insert(alice, w.a.id)).status).toBe(403);
    expect((await insert(bob, w.b.id)).status).toBe(404);
    // an author cookie naming someone else changes nothing
    expect((await insert(bob, w.a.id, '; mdhouse-author-' + w.port + '=Mallory')).status).toBe(200);
    const text = readFileSync(join(w.base, 'a', 'note.md'), 'utf8');
    expect(text).toContain('said so');
    expect(text).toContain('bob');
    expect(text).not.toContain('Mallory');
  });

  test('group grants, a direct none, and the deny-by-default surfaces', async () => {
    const carol = await w.login('carol');
    const me = await (await w.api(carol, '/api/team/me')).json();
    expect(me.grants).toEqual({ [w.b.id]: 'rw' });
    expect((await w.api(carol, `/api/doc?p=${w.a.id}/note.md`)).status).toBeGreaterThanOrEqual(400);
    const bob = await w.login('bob');
    for (const [method, path] of [
      ['GET', '/api/git'], ['POST', '/api/git/commit'], ['POST', '/api/git/push'], ['GET', '/api/git/log'], ['GET', '/api/digest'],
      ['GET', '/api/ab'], ['POST', '/api/ab/send'], ['GET', '/api/ab/config'], ['GET', '/api/rag'], ['GET', '/api/rag/search'], ['GET', '/rag'],
      ['POST', '/api/settings'], ['GET', '/api/author'], ['POST', '/api/author'], ['GET', '/api/marks'],
      ['POST', '/api/roots/add'], ['POST', '/api/roots/remove'], ['POST', '/api/roots/mode'], ['GET', '/api/flow/catalog'], ['POST', '/api/flow/start'],
      ['GET', '/api/automation'], ['POST', '/api/automation/approve'], ['GET', '/api/team'], ['POST', '/api/team'], ['POST', '/api/team/preview'], ['POST', '/api/team/activation'],
    ] as const) {
      const r = await w.api(bob, path, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
      expect([method, path, r.status]).toEqual([method, path, path.startsWith('/api/team') ? 401 : 403]);
    }
    // the shell's settings, sanitized: nothing of the instance's configuration
    const settings = await w.api(bob, '/api/settings');
    expect(settings.status).toBe(200);
    expect(await settings.json()).toEqual({ editLink: false, editScheme: 'edit', autoRw: false, me: '', mode: 'workspace', team: true });
    expect((await w.api(null, '/api/settings')).status).toBe(401);
    const denied = await (await w.api(bob, '/api/git')).json();
    expect(denied).toMatchObject({ reason: 'team' });
    expect(denied.error).toContain('larger repository');
  });

  test('the Team administrator manages users from the web, but cannot switch Team off or reach the owner\'s doors', async () => {
    const admin = await w.login('gh-admin');
    expect((await (await w.api(admin, '/api/team/me')).json()).admin).toBe(true);
    const team = await w.api(admin, '/api/team');
    expect(team.status).toBe(200);
    const data = await team.json();
    const post = (path: string, body: unknown) => w.api(admin, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect([data.owner, data.canActivate, data.canDeactivate]).toEqual([false, false, false]);
    expect((await post('/api/team/activation', { revision: data.revision, active: false, confirm: 'deactivate team' })).status).toBe(403);
    expect((await w.api(admin, '/api/roots')).status).toBe(200);
    expect((await (await w.api(admin, '/api/roots')).json()).roots).toEqual([]);
    // the Team administrator adds a user through the same preview/confirm exchange, bound to this very session
    const preview = await (await post('/api/team/preview', { login: 'mallory' })).json();
    expect((await w.api(await w.login('bob'), '/api/team/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'mallory' }) })).status).toBe(401);
    expect((await post('/api/team', { revision: data.revision, action: 'add', token: preview.token })).status).toBe(200);
    expect(await w.login('mallory')).toMatch(/^mdhouse-team-/);
    const bobId = data.users.find((u: { login: string }) => u.login === 'bob').id;
    const fresh = await (await w.api(admin, '/api/team')).json();
    data.revision = fresh.revision;
    expect((await post('/api/team', { revision: data.revision, action: 'groups', userId: bobId, groups: 'readers' })).status).toBe(200);
    expect((await w.api(await w.login('bob'), '/api/team')).status).toBe(401);
    expect((await post('/api/team', { revision: (await (await w.api(admin, '/api/team')).json()).revision, action: 'ban', userId: data.adminId, banned: true })).status).toBe(409);
  });

  test('sockets: an account hears its granted roots only, with no Agent Bus topic; a grant change re-scopes it at once; a ban closes it', async () => {
    const bob = await w.login('bob');
    const team = await (await w.api(w.owner, '/api/team')).json();
    const bobId = team.users.find((u: { login: string }) => u.login === 'bob').id;
    const live = await w.ws(bob);
    expect(live.messages[0]).toMatchObject({ t: 'hello', roots: [w.a.id] });
    expect(live.messages[0].roots).not.toContain(w.b.id);
    expect((await w.ws(null).then(() => 'open', () => 'refused'))).toBe('refused');
    await writeFile(join(w.base, 'a', 'new.md'), '# new\n');
    await writeFile(join(w.base, 'b', 'new.md'), '# new\n');
    await settle(900);
    expect(live.messages.slice(1).filter((m) => m.root).every((m) => m.paths.length === 0)).toBe(true);
    const heard = live.messages.slice(1).map((m) => m.root).filter(Boolean);
    expect(heard).toContain(w.a.id);
    expect(heard).not.toContain(w.b.id);
    expect(live.messages.some((m) => m.t === 'ab')).toBe(false);
    // the grant on a is taken away: the same turn re-scopes the open socket
    const before = live.messages.length;
    expect((await grant(w, w.a, 'user', bobId, 'none')).status).toBe(200);
    await settle(100);
    const told = live.messages.slice(before);
    expect(told).toContainEqual({ t: 'roots', roots: [] });
    expect(told.findIndex((m) => m.t === 'auth')).toBeGreaterThanOrEqual(0);
    expect(told.findIndex((m) => m.t === 'auth')).toBeLessThan(told.findIndex((m) => m.t === 'roots'));
    const n = live.messages.length;
    await writeFile(join(w.base, 'a', 'later.md'), '# later\n');
    await settle(900);
    expect(live.messages.slice(n).filter((m) => m.root === w.a.id)).toEqual([]);
    expect((await w.api(bob, `/api/doc?p=${w.a.id}/note.md`)).status).toBeGreaterThanOrEqual(400);
    expect((await grant(w, w.a, 'user', bobId, 'rw')).status).toBe(200);
    // the same root at another level is an authorization change too: the page is told, with no roots message
    const level = live.messages.length;
    expect((await grant(w, w.a, 'user', bobId, 'ro')).status).toBe(200);
    await settle(100);
    expect(live.messages.slice(level).map((m) => m.t)).toEqual(['auth']);
    expect((await grant(w, w.a, 'user', bobId, 'rw')).status).toBe(200);
    await settle(100);
    expect(live.messages.slice(level).map((m) => m.t)).toEqual(['auth', 'auth']);
    // ban: the session dies on the next request and the socket is closed with it
    const alice = await w.login('alice');
    const socket = await w.ws(alice);
    const aliceId = team.users.find((u: { login: string }) => u.login === 'alice').id;
    expect((await w.update({ action: 'ban', userId: aliceId, banned: true })).status).toBe(200);
    expect(await socket.closed).toBe(1008);
    expect(socket.messages.map((m) => m.t)).toContain('auth');
    const r = await w.api(alice, '/api/roots');
    expect([r.status, (await r.json()).reason]).toEqual([401, 'login']);
    expect(await w.login('alice')).toBe('FAILED:403');
    expect((await w.update({ action: 'ban', userId: aliceId, banned: false })).status).toBe(200);
    expect(await w.login('alice')).toMatch(/^mdhouse-team-/);
    expect((await w.api(alice, '/api/roots')).status).toBe(401);
  });

  test('Viewer mode caps an RW grant to RO at once, and back', async () => {
    const bob = await w.login('bob');
    const writable = async () => (await (await w.api(bob, `/api/doc?p=${w.a.id}/note.md`)).json()).writable;
    expect(await writable()).toBe(true);
    await w.prefs.setMode('viewer');
    try {
      expect(await writable()).toBe(false);
      expect((await (await w.api(bob, '/api/roots')).json()).roots[0].writable).toBe(false);
      const save = await w.api(bob, '/api/source', { method: 'POST', headers: { 'content-type': 'application/json', origin: w.origin }, body: JSON.stringify({ p: `${w.a.id}/other.md`, hash: '0'.repeat(64), text: 'x' }) });
      expect(save.status).toBe(403);
    } finally {
      await w.prefs.setMode('workspace');
    }
    expect(await writable()).toBe(true);
  });

  test('sign-out revokes the session; deactivation ends every session and socket and returns to Personal', async () => {
    const bob = await w.login('bob');
    const signedIn = await w.ws(bob);
    expect((await w.api(bob, '/auth/logout', { method: 'POST' })).status).toBe(204);
    expect((await w.api(bob, '/api/roots')).status).toBe(401);
    expect(await signedIn.closed).toBe(1008);
    const signedOut = await w.api(null, '/auth/signed-out');
    expect(signedOut.status).toBe(200);
    expect(await signedOut.text()).toContain('href="/auth/github/login"');
    const bob2 = await w.login('bob');
    const socket = await w.ws(bob2);
    expect((await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: false, confirm: 'deactivate team' })).status).toBe(200);
    expect(await socket.closed).toBe(1008);
    expect((await w.api(bob2, '/api/roots')).status).toBe(200);
    expect((await (await w.api(null, '/api/admin')).json())).toEqual({ admin: true, local: true });
    expect((await w.api(null, '/auth/github/login')).status).toBe(404);
  });
});

describe('Team refuses to start unsafe', () => {
  test('overlapping projects block activation with the reason', async () => {
    const w = await world({ roots: (base) => [join(base, 'a'), join(base, 'a', 'sub')] });
    try {
      await mkdir(join(w.base, 'a', 'sub'), { recursive: true });
      await add(w, 'gh-admin');
      const res = await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('Projects overlap');
      expect((await (await w.api(w.owner, '/api/team')).json()).active).toBe(false);
    } finally {
      await w.stop();
    }
  });

  test('a project that is the instance configuration directory blocks activation', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-teamcfg-')));
    await mkdir(join(base, 'config'));
    const w = await world({ base, roots: (b) => [join(b, 'config')] });
    try {
      await add(w, 'gh-admin');
      const res = await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("holds mdhouse's own configuration");
    } finally {
      await w.stop();
    }
  });

  test('without GitHub sign-in configured Team cannot be activated', async () => {
    const w = await world({ oauth: false });
    try {
      await add(w, 'gh-admin');
      const res = await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('GitHub sign-in is not configured');
    } finally {
      await w.stop();
    }
  });
});

describe('Team across a restart', () => {
  test('active Team survives a restart with no session; a corrupt policy refuses everything; MDHOUSE_TEAM=off is the way back', async () => {
    const first = await world();
    const { base } = first;
    let old = '';
    try {
      await add(first, 'gh-admin');
      expect((await grant(first, first.a, 'user', '11', 'rw')).status).toBe(200);
      expect((await first.ownerPost('/api/team/activation', { revision: await first.revision(), active: true, confirm: 'activate team' })).status).toBe(200);
      old = await first.login('gh-admin');
    } finally {
      await first.stop(true);
    }
    const second = await world({ base });
    try {
      expect([(await second.api(null, '/api/roots')).status, (await second.api(old, '/api/roots')).status]).toEqual([401, 401]);
      const fresh = await second.login('gh-admin');
      expect(fresh).toMatch(/^mdhouse-team-/);
      expect((await second.api(fresh, '/api/roots')).status).toBe(200);
    } finally {
      await second.stop(true);
    }
    const file = join(base, 'config', 'team', 'team-access.json');
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, '{ not json');
    const broken = await world({ base });
    try {
      for (const path of ['/api/roots', '/api/doc?p=a/note.md', '/', '/api/team']) expect([path, (await broken.api(null, path, { headers: { accept: 'text/html' } })).status]).toEqual([path, 503]);
      expect((await broken.ws(null).then(() => 'open', () => 'refused'))).toBe('refused');
      expect((await broken.api(broken.owner, '/api/team')).status).toBe(503);
    } finally {
      await broken.stop(true);
    }
    const off = await world({ base, env: { MDHOUSE_TEAM: 'off' } });
    try {
      expect((await off.api(null, '/api/roots')).status).toBe(200);
      expect((await off.api(null, '/auth/github/login')).status).toBe(404);
      expect(await (await off.api(null, '/api/admin')).json()).toEqual({ admin: true, local: true });
    } finally {
      await off.stop(true);
    }
    writeFileSync(file, good);
    const forced = await world({ base, env: { MDHOUSE_TEAM: 'off' } });
    try {
      expect((await forced.api(null, '/api/roots')).status).toBe(200);
      const data = await (await forced.api(forced.owner, '/api/team')).json();
      expect([data.active, data.forcedOff, data.owner, data.canActivate, data.canDeactivate]).toEqual([true, true, true, false, false]);
      expect((await forced.ownerPost('/api/team/activation', { revision: data.revision, active: true, confirm: 'activate team' })).status).toBe(409);
    } finally {
      await forced.stop();
    }
  });
});

describe('Team boundaries: a project inside a larger repository, links out of it, nested roots', () => {
  const sh = (cwd: string, ...cmd: string[]) => {
    const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: 'Owner Name', GIT_AUTHOR_EMAIL: 'owner-secret@example.com', GIT_COMMITTER_NAME: 'Owner Name', GIT_COMMITTER_EMAIL: 'owner-secret@example.com' } });
    if (r.exitCode !== 0) throw new Error(`${cmd.join(' ')}: ${r.stderr}`);
  };

  test('a project that is a subfolder of a git repository shows nothing of the repository around it', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-teamgit-')));
    await mkdir(join(base, 'repo', 'proj'), { recursive: true });
    await mkdir(join(base, 'repo', 'secret'));
    await writeFile(join(base, 'repo', 'proj', 'note.md'), '# note\n');
    await writeFile(join(base, 'repo', 'secret', 'private-plan.md'), '# private plan\n');
    await writeFile(join(base, 'repo', 'top.md'), '# top of repo\n');
    sh(join(base, 'repo'), 'git', 'init', '-q');
    sh(join(base, 'repo'), 'git', 'add', '-A');
    sh(join(base, 'repo'), 'git', 'commit', '-qm', 'secret launch plan');
    await writeFile(join(base, 'repo', 'proj', 'fresh.md'), '# fresh\n');
    await writeFile(join(base, 'repo', 'secret', 'untracked-secret.md'), '# u\n');
    await Bun.$`ln -s ../secret/private-plan.md ${join(base, 'repo', 'proj', 'link.md')}`;
    await Bun.$`ln -s ../secret ${join(base, 'repo', 'proj', 'dirlink')}`;
    const w = await world({ base, git: true, roots: (b) => [join(b, 'repo', 'proj')] });
    try {
      await add(w, 'gh-admin');
      await add(w, 'alice');
      const team = await (await w.api(w.owner, '/api/team')).json();
      expect((await grant(w, w.a, 'user', team.users.find((u: { login: string }) => u.login === 'alice').id, 'ro')).status).toBe(200);
      expect((await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' })).status).toBe(200);
      const alice = await w.login('alice');
      const id = w.a.id;
      const bodies: string[] = [];
      for (const path of [`/api/tree?root=${id}&ignored=1`, `/api/files?p=${id}`, `/api/search?root=${id}&q=plan&ignored=1`, `/api/search?root=${id}&q=private`, `/api/recents?root=${id}`, `/api/doc?p=${id}/note.md`, `/api/doc?p=${id}/fresh.md`, '/api/roots']) {
        const r = await w.api(alice, path);
        expect([path, r.status]).toEqual([path, 200]);
        bodies.push(await r.text());
      }
      const all = bodies.join('\n');
      for (const leak of ['secret', 'private', 'top of repo', 'owner-secret@example.com', 'Owner Name', 'launch plan', w.base]) expect([leak, all.includes(leak)]).toEqual([leak, false]);
      expect((await (await w.api(alice, `/api/doc?p=${id}/note.md`)).json()).gitRevision).toBeNull();
      // links out of the project are the jail's: refused, not followed
      for (const path of [`/api/doc?p=${id}/link.md`, `/api/raw?p=${id}/link.md`, `/api/files?p=${id}/dirlink`, `/api/doc?p=${id}/dirlink/private-plan.md`, `/api/raw?p=${id}/dirlink/private-plan.md`, `/api/doc?p=${id}/../secret/private-plan.md`, `/api/raw?p=${id}/..%2Fsecret/private-plan.md`]) {
        const r = await w.api(alice, path);
        expect([path, r.status >= 400, (await r.text()).includes('private plan')]).toEqual([path, true, false]);
      }
    } finally {
      await w.stop();
    }
  });

  test('the owner adding an overlapping project while Team is active is refused; a separate one is added and starts with no grants', async () => {
    const w = await world();
    try {
      await add(w, 'gh-admin');
      await add(w, 'alice');
      expect((await w.ownerPost('/api/team/activation', { revision: await w.revision(), active: true, confirm: 'activate team' })).status).toBe(200);
      const { askDaemon } = await import('../src/lib/control');
      for (const bad of ['/', join(w.base, 'config')]) expect(JSON.stringify(await askDaemon(w.port, { dirs: [bad] }))).toContain('Team does not serve');
      const nested = await askDaemon(w.port, { dirs: [join(w.base, 'a', 'sub')] });
      expect(JSON.stringify(nested)).toContain('overlaps a served project');
      await mkdir(join(w.base, 'c'));
      await writeFile(join(w.base, 'c', 'only.md'), '# c\n');
      const added = await askDaemon(w.port, { dirs: [join(w.base, 'c')] });
      expect(JSON.stringify(added)).not.toContain('overlaps');
      const alice = await w.login('alice');
      expect((await (await w.api(alice, '/api/roots')).json()).roots).toEqual([]);
    } finally {
      await w.stop();
    }
  });
});
