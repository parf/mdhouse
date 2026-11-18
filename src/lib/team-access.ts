import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, openSync, readSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const ALL_USERS_ID = 'all-users';
export const TEAM_ACCESS_FILE = 'team-access.json';
const ALL_USERS: TeamGroup = { id: ALL_USERS_ID, name: 'All Users', builtin: true };
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_USERS = 500;
const MAX_GROUPS = 500;
const MAX_PROJECTS = 1000;
const MAX_MEMBERSHIPS = 50;

export type AccessGrant = 'ro' | 'rw';
export type DirectGrant = AccessGrant | 'none';

export interface TeamIdentity {
  id: string;
  login: string;
  name: string | null;
}

export interface TeamUser extends TeamIdentity {
  groups: string[];
  banned: boolean;
}

export interface TeamGroup {
  id: string;
  name: string;
  builtin: boolean;
}

export interface TeamProject {
  path: string;
  users: Record<string, DirectGrant>;
  groups: Record<string, AccessGrant>;
}

interface Policy {
  active: boolean;
  adminId: string | null;
  users: TeamUser[];
  groups: TeamGroup[];
  projects: TeamProject[];
}

export interface TeamState extends Policy {
  revision: string;
}

export type TeamChange =
  | { action: 'add'; user: TeamIdentity }
  | { action: 'groups'; userId: string; groups: string }
  | { action: 'ban'; userId: string; banned: boolean }
  | { action: 'activation'; active: boolean }
  | { action: 'grant'; projectPath: string; subject: 'user' | 'group'; subjectId: string; access: DirectGrant | null };

export class TeamAccessError extends Error {
  constructor(readonly code: 'invalid' | 'missing' | 'conflict' | 'stale' | 'unsafe' | 'corrupt' | 'io' | 'blocked', message: string) {
    super(message);
    this.name = 'TeamAccessError';
  }
}

const EMPTY_REVISION = 'empty';
const empty = (): Policy => ({ active: false, adminId: null, users: [], groups: [{ ...ALL_USERS }], projects: [] });
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id);
const validLogin = (login: unknown): login is string => typeof login === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(login) && login.length <= 39;
const validName = (name: unknown): name is string | null => name === null || (typeof name === 'string' && name.length <= 160 && !/\p{Cc}/u.test(name));
const pathKey = (path: unknown): path is string => typeof path === 'string' && path.length <= 4096 && !path.includes('\0') && isAbsolute(path) && resolve(path) === path;
const validGroupName = (text: unknown): text is string => typeof text === 'string' && text.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(text);
const groupId = (name: string): string => name.normalize('NFKC').toLowerCase();
const reserved = (id: string): boolean => id === '__proto__' || id === 'prototype' || id === 'constructor';
const validGrant = (access: unknown): access is AccessGrant => access === 'ro' || access === 'rw';
const validDirect = (access: unknown): access is DirectGrant => access === 'none' || validGrant(access);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function shape(value: unknown, fields: string[]): Record<string, unknown> | null {
  const obj = record(value);
  return obj && Object.keys(obj).length === fields.length && fields.every((key) => Object.hasOwn(obj, key)) ? obj : null;
}

/** Checks a public GitHub profile before it becomes a registered identity. */
function identity(value: unknown): value is TeamIdentity {
  const candidate = record(value);
  return !!candidate && validId(candidate.id) && validLogin(candidate.login) && validName(candidate.name);
}

function readPolicy(text: string): Policy {
  const bad = () => new TeamAccessError('corrupt', 'Team access data is invalid or uses an unsupported format');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw bad(); }
  const obj = shape(data, ['version', 'stamp', 'active', 'adminId', 'users', 'groups', 'projects']);
  if (!obj || obj.version !== 1 || typeof obj.stamp !== 'string' || !/^[0-9a-f]{32}$/.test(obj.stamp) || typeof obj.active !== 'boolean' || (obj.adminId !== null && !validId(obj.adminId))) throw bad();
  if (!Array.isArray(obj.users) || obj.users.length > MAX_USERS || !Array.isArray(obj.groups) || obj.groups.length > MAX_GROUPS || !Array.isArray(obj.projects) || obj.projects.length > MAX_PROJECTS) throw bad();

  const groups: TeamGroup[] = [];
  const knownGroups = new Set<string>();
  for (const entry of obj.groups) {
    const group = shape(entry, ['id', 'name', 'builtin']);
    if (!group || typeof group.id !== 'string' || knownGroups.has(group.id) || reserved(group.id)) throw bad();
    if (group.id === ALL_USERS_ID) {
      if (group.name !== ALL_USERS.name || group.builtin !== true) throw bad();
    } else if (!validGroupName(group.name) || !validGroupName(group.id) || groupId(group.name) !== group.id || group.builtin !== false) throw bad();
    knownGroups.add(group.id);
    groups.push({ id: group.id, name: group.name as string, builtin: group.builtin === true });
  }
  if (!knownGroups.has(ALL_USERS_ID)) throw bad();

  const users: TeamUser[] = [];
  const knownUsers = new Set<string>();
  const knownLogins = new Set<string>();
  for (const entry of obj.users) {
    const user = shape(entry, ['id', 'login', 'name', 'groups', 'banned']);
    if (!identity(user) || knownUsers.has(user.id) || knownLogins.has(user.login.toLowerCase()) || !Array.isArray(user.groups) || user.groups.length > MAX_MEMBERSHIPS + 1 || typeof user.banned !== 'boolean') throw bad();
    const memberships: string[] = [];
    for (const id of user.groups) {
      if (typeof id !== 'string' || !knownGroups.has(id) || memberships.includes(id)) throw bad();
      memberships.push(id);
    }
    if (!memberships.includes(ALL_USERS_ID)) throw bad();
    knownUsers.add(user.id);
    knownLogins.add(user.login.toLowerCase());
    users.push({ id: user.id, login: user.login, name: user.name, groups: memberships, banned: user.banned });
  }
  if (obj.adminId === null ? (users.length > 0 || obj.active) : !users.some((user) => user.id === obj.adminId && !user.banned)) throw bad();

  const projects: TeamProject[] = [];
  const knownPaths = new Set<string>();
  for (const entry of obj.projects) {
    const project = shape(entry, ['path', 'users', 'groups']);
    if (!project || !pathKey(project.path) || knownPaths.has(project.path)) throw bad();
    const ug = record(project.users);
    const gg = record(project.groups);
    if (!ug || !gg) throw bad();
    if (Object.entries(ug).some(([id, access]) => !knownUsers.has(id) || !validDirect(access))) throw bad();
    if (Object.entries(gg).some(([id, access]) => !knownGroups.has(id) || !validGrant(access))) throw bad();
    knownPaths.add(project.path);
    projects.push({ path: project.path, users: { ...ug } as TeamProject['users'], groups: { ...gg } as TeamProject['groups'] });
  }
  return { active: obj.active, adminId: obj.adminId, users, groups, projects };
}

/** Resolves configured grants. Callers using them for admission must separately check `state.active`. */
export function effectiveTeamAccess(state: TeamState, userId: string, projectPath: string, rootWritable: boolean, viewer: boolean): AccessGrant | null {
  const user = state.users.find((candidate) => candidate.id === userId);
  const project = state.projects.find((candidate) => candidate.path === projectPath);
  if (!user || user.banned || !project) return null;
  const direct = own(project.users, user.id);
  if (direct === 'none') return null;
  const grants = user.groups.map((id) => own(project.groups, id));
  const requested = direct ?? (grants.includes('rw') ? 'rw' : grants.includes('ro') ? 'ro' : null);
  return requested === 'rw' && (!rootWritable || viewer) ? 'ro' : requested;
}

function membership(state: Policy, field: string): string[] {
  if (typeof field !== 'string' || field.length > 4096) throw new TeamAccessError('invalid', 'Group names are too long');
  const selected = new Set([ALL_USERS_ID]);
  for (const name of field.split(/[\s,]+/u).filter(Boolean)) {
    const id = groupId(name);
    if (!validGroupName(name) || !validGroupName(id) || reserved(id)) throw new TeamAccessError('invalid', 'Group names must contain letters, digits, dots, underscores or hyphens');
    selected.add(id);
    if (!state.groups.some((group) => group.id === id)) {
      if (state.groups.length >= MAX_GROUPS) throw new TeamAccessError('invalid', 'The group limit has been reached');
      state.groups.push({ id, name, builtin: false });
    }
  }
  if (selected.size > MAX_MEMBERSHIPS + 1) throw new TeamAccessError('invalid', 'Too many groups for this user');
  return [...selected];
}

function applyChange(state: Policy, change: TeamChange): void {
  if (change.action === 'add') {
    if (!identity(change.user)) throw new TeamAccessError('invalid', 'Invalid GitHub identity');
    const { id, login, name } = change.user;
    if (state.users.some((user) => user.id === id || user.login.toLowerCase() === login.toLowerCase())) throw new TeamAccessError('conflict', 'This GitHub user is already registered');
    if (state.users.length >= MAX_USERS) throw new TeamAccessError('invalid', 'The user limit has been reached');
    state.users.push({ id, login, name, banned: false, groups: [ALL_USERS_ID] });
    state.adminId ??= id;
    return;
  }

  if (change.action === 'activation') {
    if (typeof change.active !== 'boolean') throw new TeamAccessError('invalid', 'Activation must be true or false');
    if (change.active) {
      const admin = state.users.find((user) => user.id === state.adminId);
      if (!admin || admin.banned) throw new TeamAccessError('conflict', 'Team needs a registered, unbanned administrator before it can be activated');
    }
    state.active = change.active;
    return;
  }

  if (change.action === 'groups' || change.action === 'ban') {
    const user = state.users.find((candidate) => candidate.id === change.userId);
    if (!user) throw new TeamAccessError('missing', 'User not found');
    if (change.action === 'groups') user.groups = membership(state, change.groups);
    else {
      if (typeof change.banned !== 'boolean') throw new TeamAccessError('invalid', 'A ban must be true or false');
      if (change.banned && user.id === state.adminId) throw new TeamAccessError('conflict', 'The designated Team administrator cannot be banned');
      user.banned = change.banned;
    }
    return;
  }

  if (change.action !== 'grant' || !pathKey(change.projectPath) || (change.subject !== 'user' && change.subject !== 'group')) throw new TeamAccessError('invalid', 'Invalid access change');
  try {
    if (realpathSync(change.projectPath) !== change.projectPath || !statSync(change.projectPath).isDirectory()) throw new Error('not a project path');
  } catch { throw new TeamAccessError('invalid', 'The project path must name an existing canonical directory'); }
  const subjects = change.subject === 'user' ? state.users : state.groups;
  if (!subjects.some(({ id }) => id === change.subjectId)) throw new TeamAccessError('missing', 'Grant subject not found');
  if (change.access !== null && !(change.subject === 'user' ? validDirect(change.access) : validGrant(change.access))) throw new TeamAccessError('invalid', 'Invalid access grant');

  const existing = state.projects.find((project) => project.path === change.projectPath);
  if (!existing && change.access === null) return;
  if (!existing && state.projects.length >= MAX_PROJECTS) throw new TeamAccessError('invalid', 'The project limit has been reached');
  const project: TeamProject = existing ?? { path: change.projectPath, users: {}, groups: {} };
  if (change.subject === 'user') {
    if (change.access === null) delete project.users[change.subjectId];
    else project.users[change.subjectId] = change.access;
  } else if (change.access === null) delete project.groups[change.subjectId];
  else if (validGrant(change.access)) project.groups[change.subjectId] = change.access;

  if (!existing) state.projects.push(project);
  else if (Object.keys(project.users).length === 0 && Object.keys(project.groups).length === 0) state.projects = state.projects.filter((entry) => entry !== project);
}

interface OpenOptions {
  dir: string;
  syncAuth?: (next: TeamState, previous: TeamState) => void;
}

type Loaded = { policy: Policy; revision: string };
const revisionOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const knownError = (err: unknown): TeamAccessError => err instanceof TeamAccessError ? err : new TeamAccessError('io', 'Team access storage could not be read or written');
const noFollow = constants.O_NOFOLLOW ?? 0;
const notFound = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === 'ENOENT';
const sameNode = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino;
const protectedEntry = (stat: Stats): boolean => stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0;

/** One process owns this configuration. Commits and synchronous auth notification run in one turn. */
export class TeamAccess {
  readonly path: string;
  #data: Loaded;
  #dirIdentity: Stats;
  #busy = false;
  #blocked = false;

  private constructor(readonly dir: string, readonly syncAuth?: OpenOptions['syncAuth']) {
    this.path = join(dir, TEAM_ACCESS_FILE);
    const parent = this.#openDir();
    try {
      this.#dirIdentity = fstatSync(parent);
      this.#data = this.#read();
    } finally { closeSync(parent); }
  }

  static open({ dir, syncAuth }: OpenOptions): TeamAccess {
    if (!pathKey(dir) || dir === '/') throw new TeamAccessError('unsafe', 'Team access needs a private configuration directory');
    return new TeamAccess(dir, syncAuth);
  }

  snapshot(): TeamState {
    if (this.#blocked) throw new TeamAccessError('blocked', 'Team access storage is unavailable');
    return { revision: this.#data.revision, ...structuredClone(this.#data.policy) };
  }

  update(revision: string, change: TeamChange): TeamState {
    if (this.#busy) throw new TeamAccessError('conflict', 'An authorization change is already in progress');
    const previous = this.snapshot();
    if (revision !== previous.revision) throw new TeamAccessError('stale', 'Team access changed; reload and try again');
    this.#busy = true;
    try {
      const policy = structuredClone(this.#data.policy);
      applyChange(policy, change);
      const original = JSON.stringify(this.#data.policy);
      if (JSON.stringify(policy) === original) return previous;
      // A reverted policy still invalidates forms that predate the intervening changes.
      const bytes = Buffer.from(JSON.stringify({ version: 1, stamp: randomBytes(16).toString('hex'), ...policy }) + '\n');
      if (bytes.length > MAX_BYTES) throw new TeamAccessError('invalid', 'Team access data exceeds the storage limit');
      this.#write(bytes, previous.revision);
      this.#data = { policy, revision: revisionOf(bytes) };
      try { this.syncAuth?.(this.snapshot(), previous); }
      catch {
        // Team is never left half switched on: a failed activation is written back; any other change stays saved and the store fails closed.
        if (change.action === 'activation' && change.active && this.#rollback(previous)) {
          throw new TeamAccessError('conflict', 'Team was not activated: the authorization refresh failed and the previous state was restored');
        }
        this.#blocked = true;
        throw new TeamAccessError('blocked', 'Team access was saved, but the authorization refresh failed');
      }
      return this.snapshot();
    } finally { this.#busy = false; }
  }

  /** Writes the previous policy back over a failed activation and re-announces it. False when either step fails. */
  #rollback(previous: TeamState): boolean {
    try {
      const { revision: _, ...policy } = previous;
      const bytes = Buffer.from(JSON.stringify({ version: 1, stamp: randomBytes(16).toString('hex'), ...policy }) + '\n');
      this.#write(bytes, this.#data.revision);
      this.#data = { policy, revision: revisionOf(bytes) };
      this.syncAuth?.(this.snapshot(), this.snapshot());
      return true;
    } catch { return false; }
  }

  #openDir(): number {
    let fd: number | undefined;
    try {
      fd = openSync(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | noFollow);
      const node = fstatSync(fd);
      if (!node.isDirectory() || !protectedEntry(node) || realpathSync(this.dir) !== this.dir || (this.#dirIdentity && !sameNode(node, this.#dirIdentity))) {
        throw new TeamAccessError('unsafe', 'The Team access configuration directory is unsafe');
      }
      return fd;
    } catch (err) {
      if (fd !== undefined) closeSync(fd);
      if (['ELOOP', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) throw new TeamAccessError('unsafe', 'The Team access configuration directory is unsafe');
      throw knownError(err);
    }
  }

  #read(): Loaded {
    let fd: number;
    try { fd = openSync(this.path, constants.O_RDONLY | constants.O_NONBLOCK | noFollow); }
    catch (err) {
      if (notFound(err)) return { policy: empty(), revision: EMPTY_REVISION };
      if ((err as NodeJS.ErrnoException).code === 'ELOOP') throw new TeamAccessError('unsafe', 'The Team access file is a symlink');
      throw knownError(err);
    }
    try {
      const node = fstatSync(fd);
      if (!node.isFile() || node.nlink !== 1 || !protectedEntry(node)) throw new TeamAccessError('unsafe', 'The Team access file is unsafe');
      if (node.size > MAX_BYTES) throw new TeamAccessError('corrupt', 'Team access data exceeds the storage limit');
      const bytes = Buffer.alloc(node.size + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (count === 0) break;
        offset += count;
      }
      if (offset !== node.size) throw new TeamAccessError('stale', 'The Team access file changed during reading');
      const raw = bytes.subarray(0, offset);
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
      catch { throw new TeamAccessError('corrupt', 'Team access data is not valid UTF-8'); }
      return { policy: readPolicy(text), revision: revisionOf(raw) };
    } catch (err) { throw knownError(err); }
    finally { closeSync(fd); }
  }

  #write(bytes: Buffer, expected: string): void {
    const dir = this.#openDir();
    const tmp = `${this.path}-${randomBytes(12).toString('hex')}.tmp`;
    let created = false;
    let renamed = false;
    try {
      const fd = openSync(tmp, 'wx', 0o600);
      created = true;
      try { writeFileSync(fd, bytes); fsyncSync(fd); }
      finally { closeSync(fd); }
      const fresh = this.#openDir();
      try {
        if (this.#read().revision !== expected) throw new TeamAccessError('stale', 'Team access changed on disk');
        renameSync(tmp, this.path);
        renamed = true;
        fsyncSync(fresh);
      } finally { closeSync(fresh); }
    } catch (err) {
      if (renamed) {
        this.#blocked = true;
        throw new TeamAccessError('blocked', 'Team access was replaced, but durability could not be verified');
      }
      throw knownError(err);
    } finally {
      if (created && !renamed) {
        try { unlinkSync(tmp); } catch { /* Leave an inaccessible temporary file if cleanup fails. */ }
      }
      closeSync(dir);
    }
  }
}
