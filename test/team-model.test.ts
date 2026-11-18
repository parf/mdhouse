import { describe, expect, test } from 'bun:test';
import type { TeamSnapshot } from '../src/ui/api';
import { grantState, groupCounts, groupField, groupFilters, inherited, nextGrant, parseGroupField, usersIn } from '../src/ui/team-model';

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
  test('where access comes from: the strongest group grant, and which groups; a direct grant wins', () => {
    const p = snap.projects[0]!;
    expect(inherited(p, snap.users[1]!, snap.groups)).toEqual({ access: 'rw', from: ['ops'] });
    expect(grantState(p, snap.users[0]!, snap.groups)).toEqual({ kind: 'inherited', access: 'ro', from: ['dev'] });
    expect(grantState(p, snap.users[2]!, snap.groups)).toEqual({ kind: 'direct', access: 'none' });
  });
  test('RO / RW ticks are one choice; unticking the ticked one inherits; No access is its own', () => {
    expect(nextGrant(null, 'ro', true)).toBe('ro');
    expect(nextGrant('ro', 'rw', true)).toBe('rw');
    expect(nextGrant('rw', 'rw', false)).toBeNull();
    expect(nextGrant('rw', 'ro', false)).toBe('rw');
    expect(nextGrant('ro', 'none', true)).toBe('none');
    expect(nextGrant('none', 'none', false)).toBeNull();
  });
});
