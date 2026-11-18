/**
 * Page addresses, shared by the server and the page: `/<rootId>/<rel>` is a file's page,
 * `/<rootId>/<dir>/` a folder's, `/<rootId>/` the root's own. The root id always leads.
 */

/** First path segments the server answers itself — a root id never takes one. */
export const RESERVED = new Set(['api', 'ws', 'vendor', '__app', '_bun', 'settings', 'rag', 'd', 'favicon.ico']);

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
  /** `/settings/users`: Team users, groups, bans and project grants. */
  | { kind: 'users' }
  | { kind: 'rag' }
  | { kind: 'dir'; rootId: string; dir: string }
  /** `path`: the pathname as written, for `/api/doc?d=`. */
  | { kind: 'file'; path: string };

/** What a pathname shows. `/<rootId>` alone and a trailing slash are folder pages. */
export function routeOf(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { kind: 'home' };
  if (pathname === '/settings') return { kind: 'settings' };
  if (pathname === '/settings/users') return { kind: 'users' };
  if (pathname === '/rag') return { kind: 'rag' };
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

/**
 * Schemes the ✎ link never uses: they run script, render a page or navigate the browser instead of
 * handing the file to an editor app. `javascript:` runs its percent-decoded body, so a file name
 * would become code; `http:/home/x` names a host.
 */
export const RESERVED_EDIT_SCHEMES = new Set([
  'javascript', 'data', 'vbscript', 'http', 'https', 'file', 'ftp', 'ws', 'wss', 'blob', 'about',
  'view-source', 'chrome', 'chrome-extension', 'mailto', 'tel', 'sms',
]);

export const DEFAULT_EDIT_SCHEME = 'edit';

/** The scheme for the ✎ link: trailing `:` dropped, lower-cased; null unless a URL scheme (`[a-z][a-z0-9+.-]*`) that is not reserved. */
export function normalizeEditScheme(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const scheme = input.trim().replace(/:+$/, '').toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme) || RESERVED_EDIT_SCHEMES.has(scheme)) return null;
  return scheme;
}

/** `<scheme>:<absolute path>` with each segment encoded; an unusable scheme falls back to `edit`. */
export const editUrl = (scheme: unknown, absPath: string): string =>
  `${normalizeEditScheme(scheme) ?? DEFAULT_EDIT_SCHEME}:${absPath.split('/').map(encodeURIComponent).join('/')}`;

/** The path part of an edit link, for a tooltip: everything after the scheme's `:`. */
export const editTarget = (href: string): string => href.slice(href.indexOf(':') + 1);
