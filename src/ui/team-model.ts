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

/** The user's direct grant or the strongest group grant. */
export function configuredAccess(project: TeamProject, user: TeamUser): TeamAccess | 'none' | null {
  const direct = project.grants.users[user.id];
  if (direct) return direct;
  let best: TeamAccess | null = null;
  for (const group of user.groups) {
    const access = project.grants.groups[group];
    if (access === 'rw') return access;
    if (access === 'ro') best = access;
  }
  return best;
}

/** The built-in Public row's name: visitors without a Team session. Not a group. */
export const PUBLIC_NAME = 'Public';
/** A project's Public grant: Read-only only when the server says exactly `ro`; anything else is No grant. */
export const publicAccess = (project: TeamProject): 'ro' | null => (project.public === 'ro' ? 'ro' : null);

/** Where access comes from, by level: who or which group gives RW, and RO. Labels carry their glyph. */
export interface Sources {
  rw: string[];
  ro: string[];
}

/** A user's configured sources on a project: their own grant (👤 direct) and every group of theirs with a grant. */
export function userSources(project: TeamProject, user: TeamUser, groups: TeamGroup[]): Sources {
  const out: Sources = { rw: [], ro: [] };
  const own = project.grants.users[user.id];
  if (own === 'rw' || own === 'ro') out[own].push('👤 direct');
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const gid of user.groups) {
    const a = project.grants.groups[gid];
    const g = byId.get(gid);
    if (a && g) out[a].push(`👥 ${groupName(g)}`);
  }
  return out;
}

/** A project's sources once: Public, every user with a direct grant and every group with one. */
export function projectSources(project: TeamProject, snap: TeamSnapshot): Sources {
  const out: Sources = { rw: [], ro: [] };
  if (publicAccess(project)) out.ro.push(`🌐 ${PUBLIC_NAME}`);
  for (const u of snap.users) {
    const a = project.grants.users[u.id];
    if (a === 'rw' || a === 'ro') out[a].push(`👤 ${u.login}`);
  }
  for (const g of snap.groups) {
    const a = project.grants.groups[g.id];
    if (a) out[a].push(`👥 ${groupName(g)}`);
  }
  return out;
}

/** `RW: 👤 direct · RO: 👥 All Users, 👥 dev` — empty levels left out; '' when there is none. */
export function sourcesText(s: Sources): string {
  return [s.rw.length ? `RW: ${s.rw.join(', ')}` : '', s.ro.length ? `RO: ${s.ro.join(', ')}` : ''].filter(Boolean).join(' · ');
}
