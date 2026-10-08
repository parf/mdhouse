/**
 * Page addresses, shared by the server and the page: `/<rootId>/<rel>` is a file's page,
 * `/<rootId>/<dir>/` a folder's, `/<rootId>/` the root's own. The root id always leads.
 */

/** First path segments the server answers itself — a root id never takes one. */
export const RESERVED = new Set(['api', 'ws', 'vendor', '__app', '_bun', 'settings', 'd', 'favicon.ico']);

const decode = (seg: string): string => {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
};

/** A file's page. */
export const fileUrl = (rootId: string, rel: string): string =>
  `/${[rootId, ...rel.split('/').filter(Boolean)].map(encodeURIComponent).join('/')}`;

/** A folder's page; `''` is the root's own. */
export const dirUrl = (rootId: string, dir: string): string =>
  `/${[rootId, ...dir.split('/')]
    .filter(Boolean)
    .map((s) => `${encodeURIComponent(s)}/`)
    .join('')}`;

export type Route =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'dir'; rootId: string; dir: string }
  /** `path`: the pathname as written, for `/api/doc?d=`. */
  | { kind: 'file'; path: string };

/** What a pathname shows. `/<rootId>` alone and a trailing slash are folder pages. */
export function routeOf(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { kind: 'home' };
  if (pathname === '/settings') return { kind: 'settings' };
  const segs = pathname.slice(1).split('/');
  if (segs.length === 1 || pathname.endsWith('/')) {
    const [rootId = '', ...dir] = segs.filter(Boolean).map(decode);
    return { kind: 'dir', rootId, dir: dir.join('/') };
  }
  return { kind: 'file', path: pathname };
}

/** An in-app page href (`/<rootId>/…`): not an API, asset or other server route. */
export function isPageHref(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  const first = decode(href.slice(1).split(/[/?#]/)[0] ?? '');
  return first !== '' && !RESERVED.has(first);
}
