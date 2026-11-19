import { describe, expect, test } from 'bun:test';
import type { TeamSnapshot } from '../src/ui/api';
import { configuredAccess, groupCounts, groupField, groupFilters, parseGroupField, projectSources, sourcesText, userSources, usersIn } from '../src/ui/team-model';

const snap: TeamSnapshot = {
  revision: 'r1', active: false, oauthReady: true, adminId: '1',
  users: [
    { id: '1', login: 'ann', name: 'Ann', groups: ['all-users', 'g-dev'], banned: false },
    { id: '2', login: 'bob', name: null, groups: ['all-users', 'g-dev', 'g-ops'], banned: true },
    { id: '3', login: 'cy', name: null, groups: ['all-users'], banned: false },
  ],
  groups: [
    { id: 'all-users', name: 'everyone', builtin: true },
    { id: 'g-ops', name: 'ops', builtin: false },
    { id: 'g-dev', name: 'dev', builtin: false },
  ],
  projects: [
    { id: 'p', name: 'P', path: '/p', writable: true, grants: { users: { '3': 'none' }, groups: { 'g-dev': 'ro', 'g-ops': 'rw' } }, effective: { '1': 'ro', '2': 'rw', '3': null } },
  ],
};

describe('Users page rules', () => {
  test('filters: All Users (exactly that name) first, groups by name; counts include banned members and stay fixed', () => {
    expect(groupFilters(snap)).toEqual([
      { id: 'all-users', label: 'All Users', count: 3 },
      { id: 'g-dev', label: 'dev', count: 2 },
      { id: 'g-ops', label: 'ops', count: 1 },
    ]);
    expect(groupCounts(snap).get('g-ops')).toBe(1);
    expect(usersIn(snap, 'g-dev').map((u) => u.login)).toEqual(['ann', 'bob']);
    expect(usersIn(snap, 'all-users')).toHaveLength(3);
  });
  test('group field: names without All Users; spaces and commas split, repeats dropped', () => {
    expect(groupField(snap, snap.users[1]!)).toBe('dev ops');
    expect(parseGroupField(' dev, ops  Dev,,qa ')).toEqual(['dev', 'ops', 'qa']);
  });
  test('configured access uses the strongest group grant, with direct access taking precedence', () => {
    const p = snap.projects[0]!;
    expect(configuredAccess(p, snap.users[0]!)).toBe('ro');
    expect(configuredAccess(p, snap.users[1]!)).toBe('rw');
    expect(configuredAccess(p, snap.users[2]!)).toBe('none');
  });
  test('sources: own grant and every group of the user, by level; project-wide once; empty left out', () => {
    const p = snap.projects[0]!;
    expect(userSources(p, snap.users[1]!, snap.groups)).toEqual({ rw: ['👥 ops'], ro: ['👥 dev'] });
    expect(sourcesText(userSources(p, snap.users[1]!, snap.groups))).toBe('RW: 👥 ops · RO: 👥 dev');
    expect(sourcesText(userSources(p, snap.users[2]!, snap.groups))).toBe(''); // explicit none and no groups: nothing to list
    expect(sourcesText(projectSources(p, snap))).toBe('RW: 👥 ops · RO: 👥 dev');
    const withDirect = { ...p, grants: { users: { '1': 'rw' as const }, groups: { 'all-users': 'ro' as const } } };
    expect(sourcesText(projectSources(withDirect, snap))).toBe('RW: 👤 ann · RO: 👥 All Users');
  });
});
