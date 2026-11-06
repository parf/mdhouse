/**
 * Views V1 / V2: per root, a hand-picked set of folders and files — a sidebar tab each. An
 * entry is a file's `rel` or a folder's `dir/`. Kept in this browser only.
 */
export type ViewId = 'V1' | 'V2';
export const VIEW_IDS: ViewId[] = ['V1', 'V2'];
export type RootViews = Record<ViewId, string[]>;

const LS_VIEWS = 'mdhouse.views';

export const noViews = (): RootViews => ({ V1: [], V2: [] });

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window, blocked storage — views last for the tab */
  }
}

/** Every root's views. */
export const loadViews = (): Record<string, RootViews> => load<Record<string, RootViews>>(LS_VIEWS) ?? {};
export const saveViews = (v: Record<string, RootViews>): void => save(LS_VIEWS, v);

/** Is `rel` in the view: the file itself, or under one of its folders. */
export const inView = (rel: string, entries: string[]): boolean =>
  entries.some((e) => (e.endsWith('/') ? rel.startsWith(e) : rel === e));

/** `item` added to the entries, or taken out when it is there. */
export const toggle = (entries: string[], item: string): string[] =>
  entries.includes(item) ? entries.filter((e) => e !== item) : [...entries, item];

/** Limits of one request's reveal list; the server rejects more. */
export const MAX_REVEAL = 32;
export const MAX_REVEAL_BYTES = 1024;
export const MAX_REVEAL_TOTAL = 16 * 1024;

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** A folder entry (`dir/`) as a root-relative scope without its slash; null for the root, an absolute path or a `..` path. */
export function scopeOf(entry: string): string | null {
  if (!entry.endsWith('/')) return null;
  const dir = entry.replace(/\/+$/, '');
  if (!dir || dir.startsWith('/') || dir.split('/').some((seg) => seg === '..' || seg === '')) return null;
  return dir;
}

/**
 * The folders to reveal: `open` (the folder page shown) first, then the folders of V1 and V2.
 * Files are not revealed. `omitted` counts selections left out by the request limits, so
 * the caller can say the list is incomplete.
 */
export function revealScopes(views: RootViews, open?: string | null): { scopes: string[]; omitted: number } {
  const wanted = [...(open ? [`${open}/`] : []), ...VIEW_IDS.flatMap((id) => views[id])].map(scopeOf).filter((d): d is string => d !== null);
  const scopes: string[] = [];
  let total = 0;
  let omitted = 0;
  for (const dir of new Set(wanted)) {
    const n = bytes(dir);
    if (scopes.length >= MAX_REVEAL || n > MAX_REVEAL_BYTES || total + n > MAX_REVEAL_TOTAL) omitted++;
    else {
      scopes.push(dir);
      total += n;
    }
  }
  return { scopes, omitted };
}

/**
 * Is a file listed in a view's tab. Only the view's own entries count; a gitignored file
 * (`ignored`) is listed when the global switch is on or one of the view's own folders holds it —
 * never because the other view, or the folder page, revealed it.
 */
export function inViewTab(f: { rel: string; ignored?: boolean }, entries: string[], showIgnored: boolean): boolean {
  if (!inView(f.rel, entries)) return false;
  if (!f.ignored || showIgnored) return true;
  return entries.some((e) => e.endsWith('/') && f.rel.startsWith(e));
}

/** A short warning when the reveal is incomplete — selections over the request limits, folders cut by the server — else null. */
export function revealNote(omitted: number, capped: string[] = []): string | null {
  const parts = [
    omitted ? `${omitted} selected folder${omitted === 1 ? '' : 's'} not revealed (limit ${MAX_REVEAL})` : '',
    capped.length ? `${capped.length} folder${capped.length === 1 ? '' : 's'} list${capped.length === 1 ? 's' : ''} only part of the files: ${capped.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}
