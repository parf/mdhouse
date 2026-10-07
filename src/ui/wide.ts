/** Wide mode: one setting for documents, folder pages and git views, kept in localStorage. */
const LS_WIDE = 'mdhouse.wide';

export const loadWide = (): boolean => {
  try {
    return localStorage.getItem(LS_WIDE) === '1';
  } catch {
    return false;
  }
};

export const saveWide = (wide: boolean) => {
  try {
    localStorage.setItem(LS_WIDE, wide ? '1' : '0');
  } catch {
    /* a per-viewer convenience; fine without it */
  }
};
