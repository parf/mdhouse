/**
 * Mutation families and the request actor.
 *
 * `serve()` registers every route through `read()`, `bundle()` or a method map whose writes are
 * `mutation()`, and refuses to start on anything else, so no route can be added without a
 * classification. `instance-config` and `root-admin` writes require an administrator actor; the
 * other families are classified only.
 */

/** What a write changes. `flow` and `control` have no HTTP route yet; the control socket is OS-owner only. */
export const FAMILIES = [
  'doc-write', // document content: task ticks, answers, inserts
  'git-write', // local repository history: commit, reset
  'git-sync', // the network side of a repository: pull, push
  'instance-config', // settings shared by every browser of this instance
  'attribution', // this browser's own author name — never identity, never authority
  'external-send', // a message leaves mdhouse
  'root-admin', // which folders are served, and how
  'shared-prefs', // per-root marks shared by every browser
  'flow', // flow runs
  'control', // process lifecycle and root changes over the control socket
  'admin-session', // browser-administrator session exchange and logout
] as const;
export type Family = (typeof FAMILIES)[number];

/** Families whose every HTTP write requires an administrator actor. */
export const ADMIN_FAMILIES: ReadonlySet<Family> = new Set<Family>(['instance-config', 'root-admin']);

/**
 * Families a Viewer refuses (403 `reason: viewer`). The rest stay as in a workspace — administrator
 * only — so the administrator can still switch the mode and manage roots on the web.
 */
export const VIEWER_REFUSED: ReadonlySet<Family> = new Set<Family>([
  'doc-write',
  'git-write',
  'git-sync',
  'external-send',
  'shared-prefs',
  'attribution',
  'flow',
]);

/**
 * Who makes a request. `admin` comes only from a verified administrator session cookie — never
 * Basic admission, an address, the author cookie, a body field or a display name. `user` is an
 * immutable provider ID from an authenticated session; nothing sets it yet.
 */
export interface Actor {
  readonly admin: boolean;
  readonly via: 'control' | 'session' | 'local' | 'none';
  readonly user?: string;
}

/**
 * Methods declared non-mutating: a route's GET/HEAD/OPTIONS handler is classified as a read, not
 * proven free of effects — `GET /api/git/remote?fresh` fetches from the network. Every other method
 * in a method map is a write.
 */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Tag = Family | 'read' | 'bundle';
const tags = new WeakMap<object, Tag>();
const known = new Set<string>(FAMILIES);

function tag<T extends object>(target: T, as: Tag, reusable: boolean): T {
  const prev = tags.get(target);
  if (prev !== undefined && !(reusable && prev === as)) throw new Error(`route already classified as ${prev}, not ${as}`);
  tags.set(target, as);
  return target;
}

/** Tags a write handler with its family and returns the same handler. Throws on an unknown family or a handler already classified. */
export function mutation<H extends (...args: never[]) => unknown>(family: Family, handler: H): H {
  if (!known.has(family)) throw new Error(`unknown mutation family: ${String(family)}`);
  return tag(handler, family, false);
}

/** Tags a bare handler — one that answers every method — as a read and returns it. One read handler may serve several paths. */
export function read<H extends (...args: never[]) => unknown>(handler: H): H {
  if (typeof handler !== 'function') throw new Error('read() takes a handler');
  return tag(handler, 'read', true);
}

/** Tags Bun's HTML bundle — static code, no data — and returns it. */
export function bundle<B extends object>(html: B): B {
  if (typeof html !== 'object' || html === null) throw new Error('bundle() takes an HTML import');
  return tag(html, 'bundle', true);
}

/** One registered route method. `method` is `*` for a bare handler or a bundle, which answer every method. */
export interface RouteEntry {
  readonly path: string;
  readonly method: string;
  readonly family: Family | null;
}

/**
 * Returns every route method with its family (`null` for a read or the bundle). Throws on an
 * untagged bare handler or object, a malformed method map, a write method without a family, a
 * read method with one, a `read()`/`bundle()` value inside a method map, and a mutation at two places.
 */
export function inventory(routes: Record<string, unknown>): RouteEntry[] {
  const out: RouteEntry[] = [];
  const seen = new Map<object, string>();
  for (const [path, route] of Object.entries(routes)) {
    const t = typeof route === 'object' || typeof route === 'function' ? tags.get(route as object) : undefined;
    if (typeof route === 'function') {
      if (t !== 'read') throw new Error(`${path}: ${t ? `a ${t} mutation must be a method, not a bare handler` : 'unclassified route — read() or a method map'}`);
      out.push({ path, method: '*', family: null });
    } else if (t === 'bundle') {
      out.push({ path, method: '*', family: null });
    } else if (t === undefined && isMethodMap(route)) {
      for (const [method, h] of Object.entries(route)) {
        const where = `${method} ${path}`;
        const ht = tags.get(h);
        if (ht === 'read' || ht === 'bundle') throw new Error(`${where}: ${ht}() belongs on a bare route`);
        const family = ht ?? null;
        if (READ_METHODS.has(method) && family) throw new Error(`${where}: a read method cannot be a mutation`);
        if (!READ_METHODS.has(method) && !family) throw new Error(`${where}: unclassified write method`);
        if (family) {
          const prev = seen.get(h);
          if (prev) throw new Error(`mutation registered twice: ${prev} and ${where}`);
          seen.set(h, where);
        }
        out.push({ path, method, family });
      }
    } else throw new Error(`${path}: unclassified route — read(), bundle() or a method map`);
  }
  return out;
}

/** A `{ GET, POST }` map — not the HTML bundle, which is an object too. */
export function isMethodMap(route: unknown): route is Record<string, (...args: never[]) => unknown> {
  return (
    !!route &&
    typeof route === 'object' &&
    Object.keys(route).length > 0 &&
    Object.entries(route).every(([m, v]) => /^[A-Z]+$/.test(m) && typeof v === 'function')
  );
}
