/** The projects Settings lists, in groups, and which one is selected. A pure view of the served roots. */
import type { RootInfo } from './api';

export interface ProjectGroup {
  key: 'saved' | 'session' | 'reference';
  title: string;
  roots: RootInfo[];
}

/** Saved projects, this session's, then the immutable reference; empty groups left out, order within a group kept. */
export function groupProjects(roots: readonly RootInfo[]): ProjectGroup[] {
  const groups: ProjectGroup[] = [
    { key: 'saved', title: 'Saved', roots: roots.filter((r) => r.kind !== 'reference' && r.saved) },
    { key: 'session', title: 'This session', roots: roots.filter((r) => r.kind !== 'reference' && !r.saved) },
    { key: 'reference', title: 'Reference', roots: roots.filter((r) => r.kind === 'reference') },
  ];
  return groups.filter((g) => g.roots.length > 0);
}

/** The selected project: `id` if it is still served, else the first listed (saved, session, reference), else null. */
export function selectedProject(roots: readonly RootInfo[], id: string | null): RootInfo | null {
  return roots.find((r) => r.id === id) ?? groupProjects(roots)[0]?.roots[0] ?? null;
}

/** Projects that can be removed: everything but the reference. */
export const removable = (roots: readonly RootInfo[]): RootInfo[] => roots.filter((r) => r.kind !== 'reference');

/** Why a project is writable, when the server says: asked with `--rw`, or covered by the auto-RW paths. */
export function writableVia(root: RootInfo): 'rw' | 'auto' | null {
  const by = (root as { writableBy?: unknown }).writableBy;
  return root.writable && (by === 'rw' || by === 'auto') ? by : null;
}
