/** The phone's four destinations — Files · Changes · Search · Ask — and the rules that decide which show and which is current. */

export type NavId = 'files' | 'changes' | 'search' | 'ask';

export const NAV: ReadonlyArray<{ id: NavId; label: string; title: string }> = [
  { id: 'files', label: 'Files', title: "The project's files" },
  { id: 'changes', label: 'Changes', title: 'What changed in this project' },
  { id: 'search', label: 'Search', title: 'Search the files, or the index' },
  { id: 'ask', label: 'Ask', title: 'Ask an agent about this page' },
];

/** The Changes destination of a project; `file` scopes it to one file. (`?git=changes` is the project's Changes view in the git family of addresses.) */
export const changesUrl = (rootId: string, file?: string): string => `/${rootId}/?git=changes${file ? `&file=${encodeURIComponent(file)}` : ''}`;
/** Whether an address's query is the Changes view. */
export const onChanges = (search: string): boolean => new URLSearchParams(search).get('git') === 'changes';

/** Doc → bar: ask the page to open or close its Agent Bus panel. Bar ← Doc: the panel's state, so Ask can show it is the current place. */
export const ASK_EVENT = 'mdhouse:ask-agent';
export const ASK_STATE = 'mdhouse:ask-state';

export interface NavState {
  /** How many files are changed in the project (0 or unknown: no badge). */
  changeCount?: number;
  /** The Agent Bus is on for the page on screen: a Markdown document of a project, not for a Viewer. */
  askAvailable: boolean;
  askOpen: boolean;
  changes: boolean;
  rag: boolean;
  drawerOpen: boolean;
}

/** Ask is there only when it can do something; the other three always are. */
export const navItems = (s: Pick<NavState, 'askAvailable'>): NavId[] => NAV.filter((n) => n.id !== 'ask' || s.askAvailable).map((n) => n.id);

/** The badge's text on Changes: the count, `99+` past two digits, nothing for none. */
export const badgeText = (n: number | undefined): string => (!n || n < 1 ? '' : n > 99 ? '99+' : String(n));

/** The one destination the user is at: the open Agent Bus panel, the Changes view, the index search, the open drawer — else none. */
export function currentNav(s: NavState): NavId | null {
  if (s.askAvailable && s.askOpen) return 'ask';
  if (s.changes) return 'changes';
  if (s.rag) return 'search';
  if (s.drawerOpen) return 'files';
  return null;
}
