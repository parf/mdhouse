import { ragUrl } from './rag-model';

/** One search, two places to look: the project's files (names and contents, in the sidebar) or its RAG index (the `/rag` page). */
export type SearchTarget = 'files' | 'index';

export const TARGETS: ReadonlyArray<{ id: SearchTarget; label: string; title: string }> = [
  { id: 'files', label: 'Files', title: 'Search the file names and contents of this project' },
  { id: 'index', label: 'RAG Search', title: "Search the project's RAG index — what an agent has indexed" },
];

const KEY = 'mdhouse.search.scope';

/** The remembered scope; anything else is Files, which is what a search was before there were two. */
export function loadTarget(): SearchTarget {
  try {
    return localStorage.getItem(KEY) === 'index' ? 'index' : 'files';
  } catch {
    return 'files';
  }
}

export function saveTarget(target: SearchTarget): void {
  try {
    localStorage.setItem(KEY, target);
  } catch {
    /* private window: the scope lasts for this page */
  }
}

/** Where an Index search goes: the existing `/rag` page, for this project. */
export const indexUrl = (query: string, rootId: string): string => ragUrl({ q: query.trim() || undefined, root: rootId });

/** The sidebar's placeholder for each scope. */
export const placeholder = (target: SearchTarget): string => (target === 'files' ? 'Search files and contents' : "Search the project's index — Enter");
