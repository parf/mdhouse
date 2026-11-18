/**
 * Team runtime: what an active Team lets a request do.
 *
 * Team is off until the owner activates it. Once active, every route is classified here and anything
 * not listed is refused; a signed-in account sees only the projects it was granted, through the
 * registry's scope (`roots.ts`), so no handler can answer with another project.
 */

import { realpathSync } from 'node:fs';
import { effectiveTeamAccess, type AccessGrant, type TeamState, type TeamUser } from './team-access';
import type { Root, RootScope } from './roots';

export type TeamPolicy =
  | 'public' // code and the sign-in exchange: no account needed
  | 'shell' // the app's page: an account, else the sign-in redirect
  | 'read' // project data: an account, scoped to its grants
  | 'write' // project writes: an account, same origin, scoped to its read-write grants
  | 'session' // account-only, no project data (who am I, sign out)
  | 'team-admin' // the Team administrator or the owner's administrator session
  | 'owner' // the owner's administrator session exchange; the handler verifies the proof
  | 'denied'; // not reviewed for Team yet

const DENY_GIT = 'Git is not available in Team yet: a project may sit inside a larger repository, whose history is not scoped to it.';
const DENY_BUS = 'The Agent Bus and its indexes are not available in Team yet: they are not scoped to the signed-in account.';
const DENY_ADMIN = 'Instance settings are changed by the owner, not through a Team account.';
const DENY_FLOW = 'Flows and automation run commands for the instance, not for a Team account.';

/** Every route `serve()` registers, with the reason when Team refuses it. A route missing here is refused, and a test holds this list to the route inventory. */
export const TEAM_ROUTES: Record<string, TeamPolicy | { denied: string }> = {
  '* /__app/': 'public',
  '* /vendor/mermaid/*': 'public',
  '* /auth/github/login': 'public',
  '* /auth/github/callback': 'public',
  'POST /auth/logout': 'session',
  '* /auth/signed-out': 'public',
  '* /api/team/me': 'session',
  '* /': 'shell',
  '* /d': 'shell',
  '* /d/*': 'shell',
  '* /settings': 'shell',
  '* /settings/users': 'shell',
  'GET /api/team': 'team-admin',
  'POST /api/team': 'team-admin',
  'POST /api/team/preview': 'team-admin',
  'POST /api/team/activation': 'team-admin',
  '* /api/admin': 'owner',
  'POST /api/admin/session': 'owner',
  'POST /api/admin/logout': 'owner',
  '* /api/roots': 'read',
  '* /api/tree': 'read',
  '* /api/doc': 'read',
  '* /api/raw': 'read',
  '* /api/asset': 'read',
  '* /api/choose': 'read',
  '* /api/files': 'read',
  '* /api/search': 'read',
  '* /api/recents': 'read',
  'POST /api/task': 'write',
  'GET /api/source': 'read',
  'POST /api/source': 'write',
  'GET /api/qa': 'read',
  'POST /api/qa': 'write',
  'POST /api/insert': 'write',
  '* /rag': { denied: DENY_BUS },
  '* /api/rag': { denied: DENY_BUS },
  '* /api/rag/search': { denied: DENY_BUS },
  '* /api/ab': { denied: DENY_BUS },
  '* /api/ab/config': { denied: DENY_BUS },
  '* /api/ab/default': { denied: DENY_BUS },
  '* /api/ab/filter': { denied: DENY_BUS },
  '* /api/ab/send': { denied: DENY_BUS },
  '* /api/ab/job': { denied: DENY_BUS },
  '* /api/digest': { denied: 'The digest reads git status, which is not available in Team yet.' },
  '* /api/git': { denied: DENY_GIT },
  '* /api/git/commits': { denied: DENY_GIT },
  '* /api/git/files': { denied: DENY_GIT },
  '* /api/git/remote': { denied: DENY_GIT },
  '* /api/git/commit': { denied: DENY_GIT },
  '* /api/git/commit-file': { denied: DENY_GIT },
  '* /api/git/commit-files': { denied: DENY_GIT },
  '* /api/git/reset': { denied: DENY_GIT },
  '* /api/git/pull': { denied: DENY_GIT },
  '* /api/git/push': { denied: DENY_GIT },
  '* /api/git/log': { denied: DENY_GIT },
  '* /api/git/diff': { denied: DENY_GIT },
  '* /api/flow/catalog': { denied: DENY_FLOW },
  '* /api/flow/preview': { denied: DENY_FLOW },
  '* /api/flow/start': { denied: DENY_FLOW },
  '* /api/flow/event': { denied: DENY_FLOW },
  '* /api/automation': { denied: DENY_FLOW },
  '* /api/automation/approve': { denied: DENY_FLOW },
  '* /api/automation/revoke': { denied: DENY_FLOW },
  'GET /api/settings': 'read',
  'POST /api/settings': { denied: DENY_ADMIN },
  '* /api/author': { denied: 'Authorship in Team is the signed-in GitHub account; it is not chosen in the browser.' },
  '* /api/marks': { denied: DENY_ADMIN },
  '* /api/roots/name': { denied: DENY_ADMIN },
  '* /api/roots/add': { denied: DENY_ADMIN },
  '* /api/roots/mode': { denied: DENY_ADMIN },
  '* /api/roots/save': { denied: DENY_ADMIN },
  '* /api/roots/ab': { denied: DENY_ADMIN },
  '* /api/roots/remove': { denied: DENY_ADMIN },
};

export interface TeamRoute {
  policy: TeamPolicy;
  why: string;
}

/** Whether a registered route has an explicit Team classification (the inventory test needs every one). */
export const hasTeamRoute = (method: string, pattern: string): boolean => `${method} ${pattern}` in TEAM_ROUTES || `* ${pattern}` in TEAM_ROUTES;

/** The Team classification of one registered route; unlisted is refused. */
export function teamRoute(method: string, pattern: string): TeamRoute {
  const entry = TEAM_ROUTES[`${method} ${pattern}`] ?? TEAM_ROUTES[`* ${pattern}`];
  if (!entry) return { policy: 'denied', why: 'This route has not been reviewed for Team.' };
  return typeof entry === 'string' ? { policy: entry, why: '' } : { policy: 'denied', why: entry.denied };
}

/** What an account may do with one root: its effective grant, never more than the root itself allows. Reference roots are no project. */
export function grantFor(state: TeamState, userId: string, root: Root, viewer: boolean): AccessGrant | null {
  if (!state.active || root.kind === 'reference') return null;
  return effectiveTeamAccess(state, userId, root.path, root.writable, viewer);
}

/** The registry scope of one account's request. Grants are read from `state` when asked, so a change applies to the next lookup. */
export function teamScope(state: () => TeamState, user: TeamUser, viewer: () => boolean): RootScope {
  return {
    allows: (root) => grantFor(state(), user.id, root, viewer()) !== null,
    canWrite: (root) => grantFor(state(), user.id, root, viewer()) === 'rw',
  };
}

/** Pairs of project paths where one holds or is the other: a grant on one would reach the other's files. */
export function overlappingPaths(paths: string[]): Array<[string, string]> {
  const real = paths.map((path) => {
    try { return realpathSync(path); } catch { return path; }
  });
  const out: Array<[string, string]> = [];
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const a = real[i]!;
      const b = real[j]!;
      const holds = (outer: string, inner: string) => outer === '/' || inner.startsWith(`${outer}/`);
      if (a === b || holds(a, b) || holds(b, a)) out.push([paths[i]!, paths[j]!]);
    }
  }
  return out;
}

export interface ActivationFacts {
  state: TeamState;
  oauthReady: boolean;
  projects: Array<{ name: string; path: string; instance?: boolean }>;
}

/** Why Team cannot be switched on now; empty when it can. Each line is shown to the owner as written. */
export function activationBlockers({ state, oauthReady, projects }: ActivationFacts): string[] {
  const out: string[] = [];
  if (!oauthReady) out.push('GitHub sign-in is not configured (MDHOUSE_GITHUB_CLIENT_ID, MDHOUSE_GITHUB_CLIENT_SECRET, MDHOUSE_GITHUB_CALLBACK_URL).');
  const admin = state.users.find((user) => user.id === state.adminId);
  if (!admin) out.push('Add the Team administrator first: the first registered GitHub account becomes the administrator.');
  else if (admin.banned) out.push('The Team administrator is banned.');
  for (const project of projects) {
    if (project.path === '/') out.push(`${project.name} is the whole filesystem: a Team grant on it would reach every file of the machine. Serve a narrower folder.`);
    else if (project.instance) out.push(`${project.name} holds mdhouse's own configuration (prefs, tokens, the Team policy): it cannot be a Team project.`);
  }
  const name = (path: string) => projects.find((project) => project.path === path)?.name ?? path;
  for (const [a, b] of overlappingPaths(projects.map((project) => project.path))) {
    out.push(`Projects overlap: ${name(a)} and ${name(b)} share files, so a grant on one would reach the other. Remove one of them.`);
  }
  return out;
}

/** Browsers share cookies across ports: the name carries the port, and HTTPS binds it to the host (`__Host-`). */
export const teamCookieName = (port: number, secure: boolean, kind: 'session' | 'oauth' = 'session'): string =>
  `${secure ? '__Host-' : ''}mdhouse-team-${kind === 'oauth' ? 'oauth-' : ''}${port}`;

/** An HttpOnly, host-only cookie; the session is `Strict` for nothing but a sign-in return, so Lax carries the provider's redirect back. */
export function teamCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value) && value !== '') throw new Error('not a cookie value');
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? '; Secure' : ''}`;
}

/** One cookie's value by exact name, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
