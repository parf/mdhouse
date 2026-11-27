import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_USERS_ID, effectiveTeamAccess, isPublicProject, TEAM_ACCESS_FILE, TeamAccess, TeamAccessError, type TeamChange } from '../src/lib/team-access';

let dir: string;
let project: string;
let otherProject: string;
const alice = { id: '101', login: 'alice', name: 'Alice' };
const bob = { id: '202', login: 'bob', name: null };
const file = () => join(dir, TEAM_ACCESS_FILE);

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'mdhouse-team-access-')));
  project = join(dir, 'project');
  otherProject = join(dir, 'other');
  mkdirSync(project);
  mkdirSync(otherProject);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function change(store: TeamAccess, next: TeamChange) {
  return store.update(store.snapshot().revision, next);
}

function addUsers(store: TeamAccess) {
  change(store, { action: 'add', user: alice });
  change(store, { action: 'add', user: bob });
}

function grant(store: TeamAccess, subject: 'user' | 'group', subjectId: string, access: 'rw' | 'ro' | 'none' | null, projectPath = project) {
  return change(store, { action: 'grant', projectPath, subject, subjectId, access });
}

function errorCode(run: () => unknown): TeamAccessError['code'] {
  try { run(); } catch (err) {
    if (err instanceof TeamAccessError) return err.code;
    throw err;
  }
  throw new Error('Expected TeamAccessError');
}

describe('Team access', () => {
  test('starts empty without writing; enrollment sets the first designated administrator and automatic membership', () => {
    const store = TeamAccess.open({ dir });
    const first = store.snapshot();
    expect(first).toEqual({ revision: 'empty', active: false, adminId: null, users: [], projects: [], groups: [{ id: ALL_USERS_ID, name: 'All Users', builtin: true }] });
    expect(existsSync(file())).toBe(false);

    addUsers(store);
    const got = store.snapshot();
    expect(got.active).toBe(false);
    expect(got.adminId).toBe(alice.id);
    expect(got.users).toEqual([alice, bob].map((user) => ({ ...user, groups: [ALL_USERS_ID], banned: false })));
    expect(effectiveTeamAccess(got, alice.id, project, true, false)).toBeNull();
    expect(effectiveTeamAccess(got, bob.id, project, true, false)).toBeNull();
    expect(statSync(file()).mode & 0o777).toBe(0o600);
    expect(TeamAccess.open({ dir }).snapshot()).toEqual(got);
  });

  test('normalizes and de-duplicates group input while preserving the display labels', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    const first = change(store, { action: 'groups', userId: alice.id, groups: ' Editors, editors\tДизайн   qa.team,all-users' });
    expect(first.users[0]?.groups).toEqual([ALL_USERS_ID, 'editors', 'дизайн', 'qa.team']);
    expect(first.groups).toEqual([
      { id: ALL_USERS_ID, name: 'All Users', builtin: true },
      { id: 'editors', name: 'Editors', builtin: false },
      { id: 'дизайн', name: 'Дизайн', builtin: false },
      { id: 'qa.team', name: 'qa.team', builtin: false },
    ]);
    const second = change(store, { action: 'groups', userId: alice.id, groups: '  ,\t' });
    expect(second.users[0]?.groups).toEqual([ALL_USERS_ID]);
    expect(second.groups).toEqual(first.groups);
  });

  test('user overrides win against inherited grants; root and Viewer cap write access', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    change(store, { action: 'groups', userId: bob.id, groups: 'Editors' });
    grant(store, 'group', ALL_USERS_ID, 'ro');
    let snap = grant(store, 'group', 'editors', 'rw');
    expect(effectiveTeamAccess(snap, alice.id, project, true, false)).toBe('ro');
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('rw');
    expect(effectiveTeamAccess(snap, bob.id, otherProject, true, false)).toBeNull();
    expect(effectiveTeamAccess(snap, bob.id, project, false, false)).toBe('ro');
    expect(effectiveTeamAccess(snap, bob.id, project, true, true)).toBe('ro');

    snap = grant(store, 'user', bob.id, 'ro');
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('ro');
    snap = grant(store, 'user', bob.id, 'none');
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBeNull();
    snap = grant(store, 'user', bob.id, null);
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('rw');
  });

  test('a direct RW grant overrides an RO-only group; root and Viewer still cap it; clearing inherits RO again', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    let snap = grant(store, 'group', ALL_USERS_ID, 'ro');
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('ro');
    snap = grant(store, 'user', bob.id, 'rw');
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('rw');
    expect(effectiveTeamAccess(snap, bob.id, project, false, false)).toBe('ro');
    expect(effectiveTeamAccess(snap, bob.id, project, true, true)).toBe('ro');
    expect(effectiveTeamAccess(snap, alice.id, project, true, false)).toBe('ro');
    snap = grant(store, 'user', bob.id, null);
    expect(effectiveTeamAccess(snap, bob.id, project, true, false)).toBe('ro');
  });

  test('Public never feeds a signed-in grant: a public project gives a user without a grant nothing', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    const snap = change(store, { action: 'public', projectPath: project, access: 'ro' });
    expect(isPublicProject(snap, project)).toBe(true);
    for (const user of [alice, bob]) expect(effectiveTeamAccess(snap, user.id, project, true, false)).toBeNull();
  });

  test('banning a non-admin keeps memberships and blocks all grants; the designated admin is protected', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    grant(store, 'group', ALL_USERS_ID, 'rw');
    const banned = change(store, { action: 'ban', userId: bob.id, banned: true });
    expect(banned.users[1]).toEqual({ ...bob, groups: [ALL_USERS_ID], banned: true });
    expect(effectiveTeamAccess(banned, bob.id, project, true, false)).toBeNull();
    expect(errorCode(() => change(store, { action: 'ban', userId: alice.id, banned: true }))).toBe('conflict');
    expect(TeamAccess.open({ dir }).snapshot()).toEqual(banned);
    const restored = change(store, { action: 'ban', userId: bob.id, banned: false });
    expect(effectiveTeamAccess(restored, bob.id, project, true, false)).toBe('rw');
  });

  test('invalid actions and stale retries leave the persisted revision unmodified', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    const alias = join(dir, 'alias');
    symlinkSync(project, alias);
    const cases: Array<['invalid' | 'missing' | 'conflict', TeamChange]> = [
      ['invalid', { action: 'add', user: { ...bob, id: '__proto__' } }],
      ['invalid', { action: 'add', user: { ...bob, id: '01' } }],
      ['conflict', { action: 'add', user: { ...bob, id: '333', login: 'BOB' } }],
      ['invalid', { action: 'groups', userId: bob.id, groups: 'normal, constructor' }],
      ['invalid', { action: 'grant', projectPath: alias, subject: 'user', subjectId: bob.id, access: 'rw' }],
      ['invalid', { action: 'grant', projectPath: '../project', subject: 'user', subjectId: bob.id, access: 'rw' }],
      ['invalid', { action: 'grant', projectPath: project, subject: 'group', subjectId: ALL_USERS_ID, access: 'none' }],
      ['missing', { action: 'grant', projectPath: project, subject: 'user', subjectId: '__proto__', access: 'rw' }],
    ];
    const before = store.snapshot();
    const bytes = readFileSync(file());
    for (const [code, next] of cases) expect(errorCode(() => change(store, next))).toBe(code);
    expect(errorCode(() => store.update('empty', { action: 'ban', userId: bob.id, banned: true }))).toBe('stale');
    expect(store.snapshot()).toEqual(before);
    expect(readFileSync(file())).toEqual(bytes);
  });
});

describe('Team access persistence', () => {
  test('synchronously notifies after atomic persistence and ignores no-ops and stale updates', () => {
    let seen = 0;
    const store = TeamAccess.open({ dir, syncAuth(next, previous) {
      seen++;
      expect(previous.revision).not.toBe(next.revision);
      expect(store.snapshot()).toEqual(next);
      expect(TeamAccess.open({ dir }).snapshot()).toEqual(next);
      next.users[0]!.banned = true;
    } });
    const added = change(store, { action: 'add', user: alice });
    expect(seen).toBe(1);
    expect(added.users[0]?.banned).toBe(false);
    expect(change(store, { action: 'groups', userId: alice.id, groups: '' })).toEqual(added);
    expect(errorCode(() => store.update('empty', { action: 'groups', userId: alice.id, groups: 'unwanted' }))).toBe('stale');
    expect(seen).toBe(1);
  });

  test('an on-disk replacement wins over a stale local writer; there is no stray temp file', () => {
    const store = TeamAccess.open({ dir });
    const other = TeamAccess.open({ dir });
    const updated = change(other, { action: 'add', user: alice });
    expect(errorCode(() => change(store, { action: 'add', user: bob }))).toBe('stale');
    expect(TeamAccess.open({ dir }).snapshot()).toEqual(updated);
    expect(readdirSync(dir).sort()).toEqual(['other', 'project', TEAM_ACCESS_FILE].sort());
  });

  test('reverting a grant leaves an older form stale', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    const before = grant(store, 'user', bob.id, 'ro');
    grant(store, 'user', bob.id, 'rw');
    const reverted = grant(store, 'user', bob.id, 'ro');
    expect(reverted.projects).toEqual(before.projects);
    expect(errorCode(() => store.update(before.revision, { action: 'ban', userId: bob.id, banned: true }))).toBe('stale');
  });

  test('an unsafe or unreadable policy is denied and never repaired', () => {
    const store = TeamAccess.open({ dir });
    change(store, { action: 'add', user: alice });
    const bytes = readFileSync(file());
    chmodSync(file(), 0o644);
    expect(errorCode(() => TeamAccess.open({ dir }))).toBe('unsafe');
    chmodSync(file(), 0o600);
    const copy = join(dir, 'copy');
    linkSync(file(), copy);
    expect(errorCode(() => TeamAccess.open({ dir }))).toBe('unsafe');
    rmSync(copy);
    renameSync(file(), copy);
    symlinkSync(copy, file());
    expect(errorCode(() => TeamAccess.open({ dir }))).toBe('unsafe');
    rmSync(file());
    renameSync(copy, file());
    expect(readFileSync(file())).toEqual(bytes);
    for (const corrupt of ['{', JSON.stringify({ ...JSON.parse(bytes.toString()), version: 999 }), JSON.stringify({ ...JSON.parse(bytes.toString()), active: true, adminId: null })]) {
      writeFileSync(file(), corrupt);
      expect(errorCode(() => TeamAccess.open({ dir }))).toBe('corrupt');
      expect(readFileSync(file(), 'utf8')).toBe(corrupt);
    }
  });

  test('an auth refresh failure leaves the durable new state and blocks the stale runtime', () => {
    const store = TeamAccess.open({ dir, syncAuth() { throw new Error('auth refresh failed'); } });
    expect(errorCode(() => change(store, { action: 'add', user: alice }))).toBe('blocked');
    expect(errorCode(() => store.snapshot())).toBe('blocked');
    expect(TeamAccess.open({ dir }).snapshot().adminId).toBe(alice.id);
  });
});

describe('Public: a project field, never a group', () => {
  test('absent is no grant; ro is set and cleared under the revision; anything else is refused', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    expect(isPublicProject(store.snapshot(), project)).toBe(false);
    const stale = store.snapshot().revision;
    change(store, { action: 'public', projectPath: project, access: 'ro' });
    const on = store.snapshot();
    expect([isPublicProject(on, project), isPublicProject(on, otherProject)]).toEqual([true, false]);
    expect(on.projects).toEqual([{ path: project, users: {}, groups: {}, public: 'ro' }]);
    expect(on.groups.map((g) => g.id)).toEqual([ALL_USERS_ID]);
    expect(TeamAccess.open({ dir }).snapshot()).toEqual(on);
    expect(errorCode(() => store.update(stale, { action: 'public', projectPath: otherProject, access: 'ro' }))).toBe('stale');
    for (const access of ['rw', 'none', 'yes', true]) {
      expect(errorCode(() => change(store, { action: 'public', projectPath: project, access } as unknown as TeamChange))).toBe('invalid');
    }
    expect(errorCode(() => change(store, { action: 'public', projectPath: join(dir, 'missing'), access: 'ro' }))).toBe('invalid');
    change(store, { action: 'public', projectPath: project, access: null });
    // the project stays known (retained), only the field goes
    expect(store.snapshot().projects).toEqual([{ path: project, users: {}, groups: {} }]);
    expect(JSON.parse(readFileSync(file(), 'utf8')).projects[0]).not.toHaveProperty('public');
  });

  test('an older file without the field loads as no grant and is not rewritten; a bad stored value is corrupt', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    grant(store, 'user', bob.id, 'ro');
    const before = readFileSync(file());
    const loaded = TeamAccess.open({ dir }).snapshot();
    expect(isPublicProject(loaded, project)).toBe(false);
    expect(readFileSync(file())).toEqual(before);
    for (const bad of ['rw', 'none', null, true, 'RO']) {
      const data = JSON.parse(before.toString());
      data.projects[0].public = bad;
      writeFileSync(file(), JSON.stringify(data));
      expect([bad, errorCode(() => TeamAccess.open({ dir }).snapshot())]).toEqual([bad, 'corrupt']);
    }
  });

  test('a custom group named Public, with grants, stays an ordinary group: it never makes a project public', () => {
    const store = TeamAccess.open({ dir });
    addUsers(store);
    change(store, { action: 'groups', userId: bob.id, groups: 'Public' });
    grant(store, 'group', 'public', 'rw');
    const state = store.snapshot();
    expect(state.groups).toContainEqual({ id: 'public', name: 'Public', builtin: false });
    expect(isPublicProject(state, project)).toBe(false);
    expect(effectiveTeamAccess(state, bob.id, project, true, false)).toBe('rw');
    change(store, { action: 'public', projectPath: project, access: 'ro' });
    expect(store.snapshot().projects[0]).toEqual({ path: project, users: {}, groups: { public: 'rw' }, public: 'ro' });
  });
});
