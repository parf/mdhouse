/**
 * Mutation families and the request actor — the classification a future authority check reads.
 *
 * Dormant: nothing here grants, denies or changes a response. `serve()` tags each write handler
 * with its family and refuses to start with a write method that has none, so no route can be added
 * without a classification.
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
] as const;
export type Family = (typeof FAMILIES)[number];

/**
 * Who makes a request. Nothing builds one yet. `user` is an immutable provider ID from an
 * authenticated session — never the author cookie, a body field or a display name.
 */
export interface Actor {
  readonly admin: boolean;
  readonly via: 'control' | 'session' | 'none';
  readonly user?: string;
}

/** Methods that never change state; every other method in a route's method map is a write. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const families = new WeakMap<object, Family>();
const known = new Set<string>(FAMILIES);

/** Tags a write handler with its family and returns the same handler. Throws on an unknown family or a handler tagged twice. */
export function mutation<H extends (...args: never[]) => unknown>(family: Family, handler: H): H {
  if (!known.has(family)) throw new Error(`unknown mutation family: ${String(family)}`);
  if (families.has(handler)) throw new Error(`mutation handler classified twice: ${families.get(handler)}, ${family}`);
  families.set(handler, family);
  return handler;
}

/** One registered route method. `method` is `*` for a bare handler or a bundle, which answer every method. */
export interface RouteEntry {
  readonly path: string;
  readonly method: string;
  readonly family: Family | null;
}

/**
 * Returns every route method with its family (`null` for a read). Throws on a write method with no
 * family, a family on a read method or a bare handler, and a mutation registered at two places.
 */
export function inventory(routes: Record<string, unknown>): RouteEntry[] {
  const out: RouteEntry[] = [];
  const seen = new Map<object, string>();
  const place = (h: object, where: string) => {
    const prev = seen.get(h);
    if (prev) throw new Error(`mutation registered twice: ${prev} and ${where}`);
    seen.set(h, where);
  };
  for (const [path, route] of Object.entries(routes)) {
    if (typeof route === 'function') {
      if (families.has(route)) throw new Error(`${path}: a mutation must be a method, not a bare handler`);
      out.push({ path, method: '*', family: null });
    } else if (isMethodMap(route)) {
      for (const [method, h] of Object.entries(route)) {
        const where = `${method} ${path}`;
        const family = families.get(h) ?? null;
        if (READ_METHODS.has(method) && family) throw new Error(`${where}: a read method cannot be a mutation`);
        if (!READ_METHODS.has(method) && !family) throw new Error(`${where}: unclassified write method`);
        if (family) place(h, where);
        out.push({ path, method, family });
      }
    } else out.push({ path, method: '*', family: null });
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
