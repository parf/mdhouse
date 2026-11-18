import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { GitHubOAuth, readGitHubOAuthConfig } from '../src/lib/team-github';
import { TeamSessions } from '../src/lib/team-sessions';
import type { TeamState } from '../src/lib/team-access';
import { serve } from '../src/server';

const profile = (id: number, login: string) => ({ id, login, name: login.toUpperCase(), type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/1' });

test('the administrator edits the staged team, while stale or unconfirmed updates are refused', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-team-')));
  const project = join(dir, 'notes');
  await mkdir(project);
  const prefs = await Prefs.load(join(dir, 'config', 'prefs.json'));
  const registry = await Registry.create([project], 'rw');
  let lookupId = 42;
  let providerCalls = 0;
  const teamFetch = Object.assign(async (url: URL | RequestInfo) => {
    providerCalls++;
    const login = new URL(String(url)).pathname.split('/').at(-1)!;
    if (login === 'missing') return Response.json({}, { status: 404 });
    return Response.json(profile(login === 'owner' ? 41 : lookupId, login));
  }, { preconnect: fetch.preconnect }) as typeof fetch;
  const s = await serve({ registry, prefs, port: 0, hostname: '127.0.0.1', localAdmin: true, noGit: true, teamFetch });
  const base = `http://127.0.0.1:${s.server.port}`;
  const post = (path: string, body: unknown, origin = base) => fetch(base + path, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const get = async () => (await fetch(`${base}/api/team`)).json();
  try {
    expect((await fetch(`${base}/settings/users`)).status).toBe(200);
    const empty = await get();
    expect(empty).toMatchObject({ users: [], groups: [{ id: 'all-users', name: 'All Users', builtin: true }], active: false });
    expect((await post('/api/team/preview', { login: 'owner' }, 'https://other.example')).status).toBe(403);
    expect(providerCalls).toBe(0);
    expect((await post('/api/team/preview', { login: 'missing' })).status).toBe(404);

    const preview = await (await post('/api/team/preview', { login: 'owner' })).json();
    expect(preview.user).toMatchObject({ id: '41', login: 'owner' });
    expect((await get()).users).toEqual([]);
    const owner = await (await post('/api/team', { action: 'add', token: preview.token, revision: empty.revision })).json();
    expect(owner).toMatchObject({ adminId: '41', users: [{ id: '41', groups: ['all-users'] }] });
    expect((await post('/api/team', { action: 'add', token: preview.token, revision: owner.revision })).status).toBe(409);

    const oldPreview = await (await post('/api/team/preview', { login: 'reader' })).json();
    lookupId = 43;
    expect((await post('/api/team', { action: 'add', token: oldPreview.token, revision: owner.revision })).status).toBe(409);
    expect((await get()).users).toHaveLength(1);
    const currentPreview = await (await post('/api/team/preview', { login: 'reader' })).json();
    const added = await (await post('/api/team', { action: 'add', token: currentPreview.token, revision: owner.revision })).json();
    expect((await post('/api/team', { action: 'groups', userId: '43', groups: 'Editors, docs', revision: owner.revision })).status).toBe(409);
    const grouped = await (await post('/api/team', { action: 'groups', userId: '43', groups: 'Editors, docs', revision: added.revision })).json();
    expect(grouped.users.find((u: { id: string }) => u.id === '43').groups).toEqual(['all-users', 'editors', 'docs']);

    const grant = { action: 'grant', projectId: 'notes', subject: 'group', subjectId: 'editors', access: 'rw' };
    const granted = await (await post('/api/team', { ...grant, revision: grouped.revision })).json();
    expect(granted.projects[0]).toMatchObject({ grants: { groups: { editors: 'rw' } }, effective: { '43': null } });
    const banned = await (await post('/api/team', { action: 'ban', userId: '43', banned: true, revision: granted.revision })).json();
    expect(banned.users.find((u: { id: string }) => u.id === '43').banned).toBe(true);
    expect((await post('/api/team', { action: 'ban', userId: '41', banned: true, revision: banned.revision })).status).toBe(409);
    expect((await get()).revision).toBe(banned.revision);

    await prefs.setMode('viewer');
    expect((await fetch(`${base}/api/team`)).status).toBe(401);
    expect((await post('/api/team/preview', { login: 'owner' })).status).toBe(401);
  } finally {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('OAuth binds state, browser and PKCE, consumes the proof and verifies with /user', async () => {
  const config = readGitHubOAuthConfig({
    MDHOUSE_GITHUB_CLIENT_ID: 'app', MDHOUSE_GITHUB_CLIENT_SECRET: 'secret',
    MDHOUSE_GITHUB_CALLBACK_URL: 'https://md.example/auth/github/callback',
  })!;
  const calls: string[] = [];
  const transport = Object.assign(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url) === 'https://github.com/login/oauth/access_token') {
      expect((init?.body as URLSearchParams).get('code_verifier')).toMatch(/^[\w-]{43}$/);
      return Response.json({ access_token: 'mock-token' });
    }
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer mock-token');
    return Response.json(profile(41, 'owner'));
  }, { preconnect: fetch.preconnect }) as typeof fetch;
  const oauth = new GitHubOAuth(config, transport);
  const { state, url } = oauth.begin();
  expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.href).not.toContain(config.clientSecret);
  await expect(oauth.finish(state, 'other-browser', 'code')).rejects.toThrow('expired');
  expect(calls).toEqual([]);
  expect(await oauth.finish(state, state, 'code')).toMatchObject({ id: '41', login: 'owner' });
  expect(calls).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user']);
  await expect(oauth.finish(state, state, 'code')).rejects.toThrow('expired');
});

test('syncAuth bans admission and revokes a current session without reviving it on unban', () => {
  const user = { id: '43', login: 'reader', name: null, groups: ['all-users'], banned: false };
  const state: TeamState = { revision: '1', active: true, adminId: '41', users: [user], groups: [], projects: [] };
  const sessions = new TeamSessions();
  sessions.syncAuth(state);
  const cookie = sessions.issue(user.id);
  expect(sessions.lookup(cookie)).toEqual(user);
  sessions.syncAuth({ ...state, users: [{ ...user, banned: true }] });
  expect(sessions.issue(user.id)).toBeNull();
  expect(sessions.lookup(cookie)).toBeNull();
  sessions.syncAuth(state);
  expect(sessions.lookup(cookie)).toBeNull();
  expect(sessions.issue(user.id)).not.toBeNull();
});
