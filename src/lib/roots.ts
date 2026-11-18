/**
 * Root registry, path addressing and the path jail.
 *
 * Every path that crosses the HTTP boundary is the opaque string `p = "<rootId>/<relpath>"`.
 * Nothing else in the codebase is allowed to turn a request value into an absolute path —
 * `resolve()` is the only door, and `writeFile()` is the only write.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { chmod, mkdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { sep, resolve as resolvePath, relative, dirname, basename } from 'node:path';
import { fileUrl, RESERVED } from './urls';

/**
 * `project`: a directory the user added. `reference`: mdhouse's own reference material — never
 * writable, never removed, and never counted as the user's project (`defaultRoot`, `single`).
 */
export type RootKind = 'project' | 'reference';

/**
 * A project's chosen access: `rw` and `ro` are explicit choices, `inherit` follows auto-rw. Explicit
 * `ro` beats auto-rw; explicit `rw` stays capped by reference protection.
 */
export type AccessMode = 'inherit' | 'rw' | 'ro';

export interface Root {
  /** Short slug used in URLs. Never contains a slash. */
  id: string;
  /** Absent means `project`. */
  readonly kind?: RootKind;
  /** Display name — the directory's basename, deduplicated if needed. */
  name: string;
  /** Absolute, symlink-resolved path. */
  path: string;
  /**
   * false => every write through writeFile() throws. True when its mode is `rw`, or `inherit` and
   * it sits under an auto-rw path with that setting on — worked out each time it is read. Always
   * false for a reference root, a root inside one, while the stored access policy is blocked and
   * while the instance is a Viewer.
   */
  readonly writable: boolean;
  /** The access chosen for a project root; absent on a reference root. */
  mode?: AccessMode;
}

export interface Resolved {
  root: Root;
  /** Path relative to the root, with forward slashes, never leading `/`. */
  rel: string;
  /** Absolute path on disk, proven to be inside the root. */
  abs: string;
}

export class ReadOnlyError extends Error {
  constructor(path: string) {
    super(`refusing to write to a read-only root: ${path}`);
    this.name = 'ReadOnlyError';
  }
}

/** Why a directory cannot be added as a project: gone, not a directory, or a reference root. */
export class ProjectDirError extends Error {
  constructor(
    readonly code: 'missing' | 'not-a-directory' | 'reference' | 'overlap',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectDirError';
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

function isUnder(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * The real location of `candidate`, or null if it is not inside `rootPath`.
 *
 * realpath only answers for a path that exists, and a path that does not exist yet is exactly
 * the case a write has to get right. Resolving just the lexical path would trust the spelling:
 * if `root/ext` is a symlink out of the tree, `root/ext/new.md` *reads* as if it were inside
 * the root while landing wherever the link points. So walk up to the nearest ancestor that
 * does exist, resolve that, and rebuild the tail onto it — then the jail check sees where the
 * file would really be created.
 */
async function jailedPath(rootPath: string, candidate: string): Promise<string | null> {
  const abs = await realLocation(candidate);
  return abs !== null && isUnder(rootPath, abs) ? abs : null;
}

/** Where `candidate` really is or would be created: its nearest existing ancestor resolved, the tail rebuilt onto it. */
async function realLocation(candidate: string): Promise<string | null> {
  const tail: string[] = [];
  let at = candidate;

  for (;;) {
    const real = await realpath(at).catch(() => null);
    if (real !== null) return tail.length ? resolvePath(real, ...tail.reverse()) : real;
    const parent = dirname(at);
    // Ran out of filesystem before finding anything that exists.
    if (parent === at) return null;
    tail.push(at.slice(parent.length + 1));
    at = parent;
  }
}

/** What one request may see of the served roots: Team scopes it to the actor's grants; absent, every root is visible. */
export interface RootScope {
  /** May the actor read this root at all. */
  allows(root: Root): boolean;
  /** May the actor write to it: a read-write grant, on top of the root's own writability. */
  canWrite(root: Root): boolean;
}

/** A scoped request asked for a root it may not see and no fallback exists. */
export class RootScopeError extends Error {
  constructor() {
    super('no project is available to this account');
    this.name = 'RootScopeError';
  }
}

const scopes = new AsyncLocalStorage<RootScope>();

/** Runs `fn` (and everything it awaits) with the registry's lookups confined to `scope`. */
export const withRootScope = <T>(scope: RootScope, fn: () => T): T => scopes.run(scope, fn);
/** The scope of the request being served, if it has one. */
export const currentRootScope = (): RootScope | undefined => scopes.getStore();
const visible = (root: Root): boolean => scopes.getStore()?.allows(root) ?? true;

export class Registry {
  private readonly byId = new Map<string, Root>();

  private constructor(roots: Root[]) {
    for (const root of roots) this.byId.set(root.id, root);
  }

  /**
   * @param specs directories, each a path or `{ path, mode }` / `{ path, writable }` — access
   *        belongs to the folder it was asked for, not to the process.
   * @param mode the mode for plain paths. `inherit` is the default: without auto-rw a viewer that
   *        cannot write cannot damage anything it is pointed at.
   */
  static async create(
    specs: Array<string | { path: string; mode: AccessMode } | { path: string; writable: boolean }>,
    mode: AccessMode | boolean = 'inherit',
  ): Promise<Registry> {
    const registry = new Registry([]);
    for (const spec of specs) {
      if (typeof spec === 'string') await registry.add(spec, mode);
      else await registry.add(spec.path, 'mode' in spec ? spec.mode : spec.writable);
    }
    return registry;
  }

  /**
   * Sets a project root's mode in place: `mdhouse <dir> --rw` against a running daemon, or the
   * settings page. False for an unknown id or a reference root.
   */
  setMode(id: string, mode: AccessMode): boolean {
    const root = this.byId.get(id);
    if (!root || root.kind === 'reference') return false;
    root.mode = mode;
    return true;
  }

  /** Is a folder writable without `--rw`? Set by the server to its auto-rw check. */
  autoRw: (dir: string) => boolean = () => false;

  /**
   * Is the stored access policy unreadable by this mdhouse (newer or malformed)? Then no root is
   * writable, whatever its mode — `--rw` included. Set by the server to the prefs check.
   */
  accessBlocked: () => boolean = () => false;

  /** Is the instance a Viewer? Then no root is writable, whatever its mode. Set by the server to the prefs mode. */
  viewer: () => boolean = () => false;

  /** Is it served on a network address with no access policy? Then no root is writable. Set by the server (`exposureOk`). */
  exposed: () => boolean = () => false;

  /** The instance's own directories (config, state, runtime), real locations: never served through a root that holds them. */
  private readonly hiddenDirs: string[] = [];

  /** Hides `dirs` from every path a request names (`resolve`), so from every route; each by its real location. */
  async hide(dirs: string[]): Promise<void> {
    for (const d of dirs) {
      const abs = resolvePath(d);
      for (const at of [abs, await realLocation(abs)]) if (at && !this.hiddenDirs.includes(at)) this.hiddenDirs.push(at);
    }
  }

  /** Is `path` an instance directory (config, state, runtime) or inside one? Served as a root, it would hand out prefs, tokens and the Team policy. */
  inInstanceDir(path: string): boolean {
    return this.hiddenDirs.some((d) => isUnder(d, path));
  }

  /**
   * Whether the real path `abs`, served from `rootPath`, is in a hidden instance directory that lies
   * strictly inside that root (`mdhouse ~`). A root that is, or is inside, an instance directory was
   * asked for by name and is served as asked.
   */
  hidden(rootPath: string, abs: string): boolean {
    return this.hiddenDirs.some((d) => d !== rootPath && isUnder(rootPath, d) && isUnder(d, abs));
  }

  /**
   * Serve one more directory, for the lifetime of the process.
   *
   * A second `mdhouse <dir>` against a port already in use hands its directory here rather
   * than failing, so the registry has to grow after construction. A directory already served
   * returns the root it already has: asking twice is how you get its URL, not a duplicate.
   */
  async add(spec: string, access: AccessMode | boolean = 'inherit'): Promise<Root> {
    // `true` is `--rw`; `false` asks for nothing.
    return this.install(await this.prepare(spec), access === true ? 'rw' : access === false ? 'inherit' : access);
  }

  /**
   * The canonical (symlink-resolved) directory `spec` names, ready for `install` — nothing is served
   * yet. Throws a `ProjectDirError` when it is gone, not a directory, or a reference root itself.
   */
  async prepare(spec: string): Promise<string> {
    const abs = await realpath(resolvePath(spec)).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') throw new ProjectDirError('missing', `${spec}: no such directory`);
      throw err;
    });
    if (!(await stat(abs)).isDirectory()) throw new ProjectDirError('not-a-directory', `${abs} is not a directory`);
    this.refuseReference(abs);
    return abs;
  }

  private refuseReference(abs: string): void {
    if (this.all().some((r) => r.kind === 'reference' && r.path === abs)) {
      throw new ProjectDirError('reference', `${abs} is mdhouse's reference material — it cannot be added as a project`);
    }
  }

  /**
   * Serves a directory `prepare` returned, in `mode` from the moment it is visible — synchronous, so
   * nothing sees it half set up. A directory already served returns its root unchanged.
   */
  install(abs: string, mode: AccessMode): Root {
    this.refuseReference(abs);
    const existing = this.all().find((r) => r.path === abs);
    if (existing) return existing;

    const name = abs.split(sep).filter(Boolean).pop() ?? abs;
    // A root id leads the page address, so it never takes a server route's name (urls.ts).
    let id = slugify(name);
    for (let n = 2; this.byId.has(id) || RESERVED.has(id); n++) id = `${slugify(name)}-${n}`;

    const registry = this;
    const root: Root = {
      id,
      name,
      path: abs,
      kind: 'project',
      mode,
      get writable() {
        const on = this.mode === 'rw' || (this.mode === 'inherit' && registry.autoRw(this.path));
        return on && !registry.inReference(this.path) && !registry.accessBlocked() && !registry.viewer() && !registry.exposed();
      },
    };
    this.byId.set(id, root);
    return root;
  }

  /**
   * Serve mdhouse's reference material: read-only for good, irremovable. Its id starts with `_`,
   * which no project slug does, so project ids never shift. Throws for a directory already
   * served, or an id that is taken, reserved or not `_[a-z0-9-]+`. `name` defaults to the
   * directory's basename.
   */
  async addReference(spec: string, id = '_mdhouse', name?: string): Promise<Root> {
    const abs = await realpath(resolvePath(spec));
    if (!/^_[a-z0-9][a-z0-9-]*$/.test(id) || RESERVED.has(id)) throw new Error(`not a reference root id: ${id}`);
    if (this.byId.has(id)) throw new Error(`root id already in use: ${id}`);
    if (this.all().some((r) => r.path === abs)) throw new Error(`${abs} is already served`);
    const root: Root = { id, name: name ?? abs.split(sep).filter(Boolean).pop() ?? abs, path: abs, kind: 'reference', writable: false };
    this.byId.set(id, root);
    return root;
  }

  /** Is `abs` (symlink-resolved) a reference root or inside one? */
  inReference(abs: string): boolean {
    return this.all().some((r) => r.kind === 'reference' && isUnder(r.path, abs));
  }

  /** May this location be written: its root is writable and it is not reference material. */
  writableAt(loc: Resolved): boolean {
    return loc.root.writable && !this.inReference(loc.abs) && (scopes.getStore()?.canWrite(loc.root) ?? true);
  }

  /** Stop serving a project root. Its id becomes free; paths under it no longer resolve. */
  remove(id: string): boolean {
    if (this.byId.get(id)?.kind === 'reference') return false;
    return this.byId.delete(id);
  }

  /** Every served root, whoever asks: for the instance's own safety checks, never for an answer to a scoped request. */
  all(): Root[] {
    return [...this.byId.values()];
  }

  list(): Root[] {
    return this.all().filter(visible);
  }

  get(id: string): Root | undefined {
    const root = this.byId.get(id);
    return root && visible(root) ? root : undefined;
  }

  /** The roots the user added — every root but reference ones. */
  projects(): Root[] {
    return this.list().filter((r) => r.kind !== 'reference');
  }

  /** One project root served. */
  get single(): boolean {
    return this.projects().length === 1;
  }

  /** The root a bare, unprefixed path belongs to: the first project root. Throws when there is none. */
  defaultRoot(): Root {
    const root = this.projects()[0];
    if (!root) throw scopes.getStore() ? new RootScopeError() : new Error('no project root is served');
    return root;
  }

  /** Build the wire path for a file inside a root. */
  encode(root: Root, rel: string): string {
    return `${root.id}/${rel.split(sep).join('/')}`;
  }

  /** A file's page: `/<rootId>/<rel>` (urls.ts). */
  docUrl(root: Root, rel: string): string {
    return fileUrl(root.id, rel.split(sep).join('/'));
  }

  /**
   * Inverse of docUrl: a page path back to a location. Reads `/<rootId>/<rel>`, and the old
   * `/d/<rootId>/<rel>` and single-root `/d/<rel>`: there a leading segment naming a root wins
   * only when it leads somewhere, else the path is under the first root.
   */
  async fromDocUrl(urlPath: string): Promise<Resolved | null> {
    const legacy = /^\/?d\//.test(urlPath);
    const path = urlPath.replace(/^\/?d\//, '').replace(/^\/+/, '');
    if (!path) return null;

    const decoded = path
      .split('/')
      .map((seg) => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      })
      .join('/');

    const first = decoded.split('/')[0]!;
    if (this.get(first)) {
      const asRoot = await this.resolve(decoded);
      if (asRoot && (!legacy || (await stat(asRoot.abs).catch(() => null)))) return asRoot;
    }
    return legacy ? this.resolve(`${this.defaultRoot().id}/${decoded}`) : null;
  }

  /**
   * Turn a wire path into a real location, or null if it is malformed, escapes its root or lands in a hidden instance directory.
   *
   * Two gates: a textual one (no `..` segments, no NUL) and a filesystem one (the resolved
   * path, symlinks followed, must still be inside the root). The second is what actually
   * matters — the first just fails fast and cheaply.
   */
  async resolve(p: string): Promise<Resolved | null> {
    if (!p || p.includes('\0')) return null;

    const slash = p.indexOf('/');
    const id = slash === -1 ? p : p.slice(0, slash);
    const rel = slash === -1 ? '' : p.slice(slash + 1);

    const root = this.get(id);
    if (!root) return null;
    if (rel.split('/').some((seg) => seg === '..')) return null;

    const candidate = resolvePath(root.path, rel);
    const abs = await jailedPath(root.path, candidate);
    if (abs === null || this.hidden(root.path, abs)) return null;

    return { root, rel: relative(root.path, abs).split(sep).join('/'), abs };
  }

  /**
   * The only write to a served tree — every document write route goes through it, so none can
   * reach a read-only tree by forgetting a check. `parents` creates missing folders on the way.
   */
  async writeFile(p: string, data: string | Uint8Array, opts: { parents?: boolean } = {}): Promise<Resolved> {
    const loc = await this.resolve(p);
    if (!loc) throw new Error(`path outside any root: ${p}`);
    if (!this.writableAt(loc)) throw new ReadOnlyError(loc.abs);
    if (opts.parents) await mkdir(dirname(loc.abs), { recursive: true });
    // Whole or not at all: a temp file beside the document, renamed over it — a write cut short
    // (disk full, a crash) leaves the document as it was. Through a symlink to its target; the
    // file keeps its mode.
    const target = await realpath(loc.abs).catch(() => loc.abs);
    const tmp = `${dirname(target)}/.${basename(target)}.${process.pid}.${Date.now().toString(36)}.mdhouse-tmp`;
    const mode = (await stat(target).catch(() => null))?.mode;
    try {
      await writeFile(tmp, data, mode === undefined ? undefined : { mode: mode & 0o7777 });
      if (mode !== undefined) await chmod(tmp, mode & 0o7777);
      await rename(tmp, target);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
    return loc;
  }
}
