/**
 * Root registry, path addressing and the path jail.
 *
 * Every path that crosses the HTTP boundary is the opaque string `p = "<rootId>/<relpath>"`.
 * Nothing else in the codebase is allowed to turn a request value into an absolute path —
 * `resolve()` is the only door, and `writeFile()` is the only write.
 */

import { realpath } from 'node:fs/promises';
import { sep, resolve as resolvePath, relative } from 'node:path';

export interface Root {
  /** Short slug used in URLs. Never contains a slash. */
  id: string;
  /** Display name — the directory's basename, deduplicated if needed. */
  name: string;
  /** Absolute, symlink-resolved path. */
  path: string;
  /** false => every write through writeFile() throws. False unless `--rw` was passed. */
  writable: boolean;
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

export class Registry {
  private readonly byId = new Map<string, Root>();

  private constructor(roots: Root[]) {
    for (const root of roots) this.byId.set(root.id, root);
  }

  /**
   * @param specs directories as given on the command line
   * @param writable whether the user passed `--rw`. Read-only is the default: mdhouse is a
   *        viewer, and a viewer that cannot write cannot damage anything it is pointed at.
   */
  static async create(specs: string[], writable = false): Promise<Registry> {
    const roots: Root[] = [];
    const usedIds = new Set<string>();

    for (const spec of specs) {
      const abs = await realpath(resolvePath(spec));
      if (roots.some((r) => r.path === abs)) continue;

      const name = abs.split(sep).filter(Boolean).pop() ?? abs;
      let id = slugify(name);
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(name)}-${n}`;
      usedIds.add(id);

      roots.push({ id, name, path: abs, writable });
    }

    return new Registry(roots);
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
    // realpath fails for a path that does not exist; fall back to the lexical resolution so
    // callers still get a jailed path they can stat or create.
    const abs = await realpath(candidate).catch(() => candidate);
    if (!isUnder(root.path, abs)) return null;

    return { root, rel: relative(root.path, abs).split(sep).join('/'), abs };
  }

  /**
   * The only write in the codebase. Phase 1 calls it nowhere; it exists so that when checkbox
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
