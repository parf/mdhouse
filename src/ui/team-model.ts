/** The Users page's pure rules: group filters, the group field, where a user's access to a project comes from. */
import type { TeamAccess, TeamGroup, TeamProject, TeamSnapshot, TeamUser } from './api';

export const ALL_USERS = 'all-users';
/** The built-in group's name, always. */
export const ALL_USERS_NAME = 'All Users';
/** A group's display name: the built-in one is exactly All Users. */
export const groupName = (g: TeamGroup): string => (g.id === ALL_USERS ? ALL_USERS_NAME : g.name);

/** Members per group, banned users included (they stay members); `all-users` is every user. */
export function groupCounts(snap: TeamSnapshot): Map<string, number> {
  const counts = new Map<string, number>(snap.groups.map((g) => [g.id, 0]));
  counts.set(ALL_USERS, snap.users.length);
  for (const u of snap.users) for (const g of u.groups) if (g !== ALL_USERS) counts.set(g, (counts.get(g) ?? 0) + 1);
  return counts;
}

/** The filter chips: All Users first, then the other groups by name. */
export function groupFilters(snap: TeamSnapshot): Array<{ id: string; label: string; count: number }> {
  const counts = groupCounts(snap);
  const rest = snap.groups.filter((g) => g.id !== ALL_USERS).sort((a, b) => a.name.localeCompare(b.name));
  return [{ id: ALL_USERS, label: ALL_USERS_NAME, count: counts.get(ALL_USERS) ?? 0 }, ...rest.map((g) => ({ id: g.id, label: g.name, count: counts.get(g.id) ?? 0 }))];
}

/** The users a filter shows: every user for All Users. */
export const usersIn = (snap: TeamSnapshot, group: string): TeamUser[] =>
  group === ALL_USERS ? snap.users : snap.users.filter((u) => u.groups.includes(group));

/** A user's editable group field: their group names, All Users left out (automatic), space-separated. */
export function groupField(snap: TeamSnapshot, user: TeamUser): string {
  const name = new Map(snap.groups.map((g) => [g.id, g.name]));
  return user.groups.filter((g) => g !== ALL_USERS).map((g) => name.get(g) ?? g).join(' ');
}

/** The names a group field holds: split on spaces and commas, empty and repeated (any case) dropped. */
export function parseGroupField(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of text.split(/[\s,]+/)) {
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

const rank = (a: TeamAccess | null | undefined): number => (a === 'rw' ? 2 : a === 'ro' ? 1 : 0);

/** What the user's groups give on a project, and which groups give it. */
export function inherited(project: TeamProject, user: TeamUser, groups: TeamGroup[]): { access: TeamAccess | null; from: string[] } {
  let best: TeamAccess | null = null;
  for (const g of user.groups) {
    const a = project.grants.groups[g];
    if (rank(a) > rank(best)) best = a!;
  }
  const name = new Map(groups.map((g) => [g.id, groupName(g)]));
  const from = best ? user.groups.filter((g) => project.grants.groups[g] === best).map((g) => name.get(g) ?? g) : [];
  return { access: best, from };
}

/** How a user's access to a project is set: their own grant, their groups', or nothing. */
export type GrantState = { kind: 'direct'; access: TeamAccess | 'none' } | { kind: 'inherited'; access: TeamAccess; from: string[] } | { kind: 'none' };
export function grantState(project: TeamProject, user: TeamUser, groups: TeamGroup[]): GrantState {
  const own = project.grants.users[user.id];
  if (own) return { kind: 'direct', access: own };
  const inh = inherited(project, user, groups);
  return inh.access ? { kind: 'inherited', access: inh.access, from: inh.from } : { kind: 'none' };
}

/**
 * The grant after a click on RO or RW: ticking one sets it (RW and RO are one choice), unticking the ticked one leaves
 * both empty — inherit (`null`). `none` is the separate No access choice.
 */
export function nextGrant(current: TeamAccess | 'none' | null | undefined, clicked: TeamAccess | 'none', checked: boolean): TeamAccess | 'none' | null {
  if (checked) return clicked;
  return current === clicked ? null : (current ?? null);
}
