/**
 * Root registry, path addressing and the path jail.
 *
 * Every path that crosses the HTTP boundary is the opaque string `p = "<rootId>/<relpath>"`.
 * Nothing else in the codebase is allowed to turn a request value into an absolute path —
 * `resolve()` is the only door, and `writeFile()` is the only write.
 */

import { realpath } from 'node:fs/promises';
import { sep, resolve as resolvePath, relative, dirname } from 'node:path';

export interface Root {
  /** Short slug used in URLs. Never contains a slash. */
  id: string;
  /** Display name — the directory's basename, deduplicated if needed. */
  name: string;
  /** Absolute, symlink-resolved path. */
  path: string;
  /**
   * false => every write through writeFile() throws. True when `--rw` was passed for it, or it
   * sits under an auto-rw path with that setting on — worked out each time it is read.
   */
  readonly writable: boolean;
  /** `--rw` was passed for it. */
  rwAsked?: boolean;
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
  const tail: string[] = [];
  let at = candidate;

  for (;;) {
    const real = await realpath(at).catch(() => null);
    if (real !== null) {
      const abs = tail.length ? resolvePath(real, ...tail.reverse()) : real;
      return isUnder(rootPath, abs) ? abs : null;
    }
    const parent = dirname(at);
    // Ran out of filesystem before finding anything that exists.
    if (parent === at) return null;
    tail.push(at.slice(parent.length + 1));
    at = parent;
  }
}

export class Registry {
  private readonly byId = new Map<string, Root>();

  private constructor(roots: Root[]) {
    for (const root of roots) this.byId.set(root.id, root);
  }

  /**
   * @param specs directories, each a path or `{ path, writable }` — writability belongs to the
   *        folder it was asked for, not to the process.
   * @param writable the default for plain paths. Read-only is the default: a viewer that
   *        cannot write cannot damage anything it is pointed at.
   */
  static async create(
    specs: Array<string | { path: string; writable: boolean }>,
    writable = false,
  ): Promise<Registry> {
    const registry = new Registry([]);
    for (const spec of specs) {
      if (typeof spec === 'string') await registry.add(spec, writable);
      else await registry.add(spec.path, spec.writable);
    }
    return registry;
  }

  /**
   * Make a served root writable, or read-only again. `mdhouse <dir> --rw` against a running
   * daemon upgrades the folder in place rather than asking for a restart.
   */
  setWritable(id: string, on: boolean): boolean {
    const root = this.byId.get(id);
    if (!root) return false;
    root.rwAsked = on;
    return true;
  }

  /** Is a folder writable without `--rw`? Set by the server to its auto-rw check. */
  autoRw: (dir: string) => boolean = () => false;

  /**
   * Serve one more directory, for the lifetime of the process.
   *
   * A second `mdhouse <dir>` against a port already in use hands its directory here rather
   * than failing, so the registry has to grow after construction. A directory already served
   * returns the root it already has: asking twice is how you get its URL, not a duplicate.
   */
  async add(spec: string, writable = false): Promise<Root> {
    const abs = await realpath(resolvePath(spec));
    const existing = this.list().find((r) => r.path === abs);
    if (existing) return existing;

    const name = abs.split(sep).filter(Boolean).pop() ?? abs;
    let id = slugify(name);
    for (let n = 2; this.byId.has(id); n++) id = `${slugify(name)}-${n}`;

    const registry = this;
    const root: Root = {
      id,
      name,
      path: abs,
      rwAsked: writable,
      get writable() {
        return !!this.rwAsked || registry.autoRw(this.path);
      },
    };
    this.byId.set(id, root);
    return root;
  }

  /** Stop serving a root. Its id becomes free; paths under it no longer resolve. */
  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  list(): Root[] {
    return [...this.byId.values()];
  }

  get(id: string): Root | undefined {
    return this.byId.get(id);
  }

  get single(): boolean {
    return this.byId.size === 1;
  }

  /** The root a bare, unprefixed path belongs to. */
  defaultRoot(): Root {
    return this.list()[0]!;
  }

  /** Build the wire path for a file inside a root. */
  encode(root: Root, rel: string): string {
    return `${root.id}/${rel.split(sep).join('/')}`;
  }

  /**
   * The browser URL for a document: `/d/<path>/<file>.md`.
   *
   * With one root the path is simply root-relative, which is what anyone typing a URL by hand
   * expects. Extra roots earn a leading `/<rootId>/` segment to tell them apart.
   */
  docUrl(root: Root, rel: string): string {
    const path = rel.split(sep).join('/');
    const withRoot = this.single ? path : `${root.id}/${path}`;
    return '/d/' + withRoot.split('/').map(encodeURIComponent).join('/');
  }

  /**
   * Inverse of docUrl: the part after `/d/` back to a wire path.
   *
   * A leading segment naming a root wins, but only when it actually leads somewhere — so a
   * single root that happens to contain a directory sharing its own name still resolves.
   */
  async fromDocUrl(urlPath: string): Promise<Resolved | null> {
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
    if (this.byId.has(first)) {
      const asRoot = await this.resolve(decoded);
      if (asRoot && (await Bun.file(asRoot.abs).exists())) return asRoot;
    }
    return this.resolve(`${this.defaultRoot().id}/${decoded}`);
  }

  /**
   * Turn a wire path into a real location, or null if it is malformed or escapes its root.
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

    const root = this.byId.get(id);
    if (!root) return null;
    if (rel.split('/').some((seg) => seg === '..')) return null;

    const candidate = resolvePath(root.path, rel);
    const abs = await jailedPath(root.path, candidate);
    if (abs === null) return null;

    return { root, rel: relative(root.path, abs).split(sep).join('/'), abs };
  }

  /**
   * The only write in the codebase. Nothing calls it yet; it exists so that when checkbox
   * write-back arrives it cannot reach a read-only tree by forgetting a check.
   */
  async writeFile(p: string, data: string | Uint8Array): Promise<Resolved> {
    const loc = await this.resolve(p);
    if (!loc) throw new Error(`path outside any root: ${p}`);
    if (!loc.root.writable) throw new ReadOnlyError(loc.abs);
    await Bun.write(loc.abs, data);
    return loc;
  }
}
