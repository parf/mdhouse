import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { TeamAccess, TeamAccessError, effectiveTeamAccess, type TeamChange, type TeamState } from './team-access';
import { TeamGitHubError, TeamGitHubPreviews } from './team-github';

interface Project {
  id: string;
  name: string;
  path: string;
  writable: boolean;
}

export interface TeamAdminOptions {
  dir: string;
  projects: () => Project[];
  viewer: () => boolean;
  oauthReady: () => boolean;
  /** Why Team cannot be switched on now (empty: it can). */
  blockers?: () => string[];
  /** The environment forces Team off: the stored policy stays editable but nothing enforces it. */
  forcedOff?: () => boolean;
  syncAuth: (next: TeamState, previous: TeamState) => void;
  request?: typeof fetch;
}

/** Management projection and mutations. Browser identity/same-origin checks stay in the server. */
export class TeamAdmin {
  #access: TeamAccess | undefined;
  readonly #previews: TeamGitHubPreviews;

  constructor(private readonly options: TeamAdminOptions) {
    this.#previews = new TeamGitHubPreviews(options.request);
  }

  #store(): TeamAccess {
    if (!this.#access) {
      try {
        mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
      } catch {
        throw new TeamAccessError('io', 'Team access storage is unavailable');
      }
      this.#access = TeamAccess.open({ dir: this.options.dir, syncAuth: this.options.syncAuth });
    }
    return this.#access;
  }

  policy(): TeamState {
    return this.#store().snapshot();
  }

  /** Include root identity in the revision so a recycled URL slug cannot receive an old grant. */
  #current() {
    const state = this.policy();
    const projects = this.options.projects();
    const revision = createHash('sha256').update(JSON.stringify([state.revision, projects])).digest('hex');
    return { state, projects, revision };
  }

  data() {
    const { state, projects, revision } = this.#current();
    const grantsByPath = new Map(state.projects.map((item) => [item.path, item]));
    const viewer = this.options.viewer();
    return {
      revision, active: state.active, oauthReady: this.options.oauthReady(), adminId: state.adminId,
      blockers: this.options.blockers?.() ?? [], forcedOff: this.options.forcedOff?.() ?? false,
      users: state.users, groups: state.groups,
      projects: projects.map((project) => {
        const grants = grantsByPath.get(project.path);
        return {
          ...project, grants: { users: grants?.users ?? {}, groups: grants?.groups ?? {} }, public: grants?.public ?? null,
          effective: Object.fromEntries(state.users.map(({ id }) => [id, state.active ? effectiveTeamAccess(state, id, project.path, project.writable, viewer) : null])),
        };
      }),
    };
  }

  /** Switches Team on or off. The caller has verified the owner and the typed confirmation; blockers are checked here, at the write. */
  activate(revision: unknown, active: boolean): ReturnType<TeamAdmin['data']> {
    const current = this.#current();
    if (revision !== current.revision) throw new TeamAccessError('stale', 'Team access changed; reload and try again');
    const blockers = active ? this.options.blockers?.() ?? [] : [];
    if (blockers.length) throw new TeamAccessError('conflict', `Team cannot be activated: ${blockers.join(' ')}`);
    this.#store().update(current.state.revision, { action: 'activation', active, paths: current.projects.map((project) => project.path) });
    return this.data();
  }

  retainProjects(paths: readonly string[]): TeamState {
    const state = this.policy();
    return this.#store().update(state.revision, { action: 'retain-projects', paths });
  }

  async preview(login: string, adminBinding: string, stillAdmin: () => boolean) {
    return this.#previews.preview(login.trim(), adminBinding, this.#current().revision, stillAdmin);
  }

  async update(input: Record<string, unknown>, adminBinding: string, stillAdmin: () => boolean) {
    const current = this.#current();
    if (input.revision !== current.revision) throw new TeamAccessError('stale', 'Team access changed; reload and try again');
    const bad = (): never => { throw new TeamAccessError('invalid', 'Invalid team access change'); };
    const fields = (...keys: string[]) => {
      if (Object.keys(input).length !== keys.length + 2 || keys.some((key) => !Object.hasOwn(input, key))) bad();
    };
    let change: TeamChange;
    switch (input.action) {
      case 'add': {
        fields('token');
        if (typeof input.token !== 'string' || !/^[\w-]{43}$/.test(input.token)) throw new TeamAccessError('invalid', 'Invalid GitHub preview token');
        change = { action: 'add', user: await this.#previews.confirm(input.token, adminBinding, current.revision) };
        break;
      }
      case 'groups': {
        fields('userId', 'groups');
        const { userId, groups } = input;
        if (typeof userId !== 'string' || typeof groups !== 'string') return bad();
        change = { action: 'groups', userId, groups };
        break;
      }
      case 'ban': {
        fields('userId', 'banned');
        const { userId, banned } = input;
        if (typeof userId !== 'string' || typeof banned !== 'boolean') return bad();
        change = { action: 'ban', userId, banned };
        break;
      }
      case 'grant': {
        fields('projectId', 'subject', 'subjectId', 'access');
        const { projectId, subject, subjectId, access } = input;
        if (typeof projectId !== 'string' || typeof subjectId !== 'string' || (subject !== 'user' && subject !== 'group')) return bad();
        if (access !== null && access !== 'ro' && access !== 'rw' && access !== 'none') return bad();
        const project = current.projects.find(({ id }) => id === projectId);
        if (!project) throw new TeamAccessError('missing', 'Project not found');
        change = { action: 'grant', projectPath: project.path, subject, subjectId, access };
        break;
      }
      case 'public': {
        fields('projectId', 'access');
        const { projectId, access } = input;
        if (typeof projectId !== 'string' || (access !== null && access !== 'ro')) return bad();
        const project = current.projects.find(({ id }) => id === projectId);
        if (!project) throw new TeamAccessError('missing', 'Project not found');
        change = { action: 'public', projectPath: project.path, access };
        break;
      }
      default:
        return bad();
    }
    if (!stillAdmin()) throw new TeamGitHubError(401, 'Administrator session required');
    if (this.#current().revision !== current.revision) throw new TeamAccessError('stale', 'Team access changed; reload and try again');
    this.#store().update(current.state.revision, change);
    return this.data();
  }
}
