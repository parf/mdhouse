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
