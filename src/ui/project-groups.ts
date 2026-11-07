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

/** The project's own name, when the server sent a usable one. */
export function customName(root: RootInfo): string | null {
  const n = (root as { customName?: unknown }).customName;
  return typeof n === 'string' && n.trim() ? n : null;
}

/**
 * The project chooser's label for each root, by id: its own name when one is set, else `pathLabel`
 * of its folder. A label two roots share is followed by the folder's label, so each stays told apart.
 */
export function chooserLabels(roots: readonly RootInfo[], pathLabel: (path: string) => string): Map<string, string> {
  const base = new Map(roots.map((r) => [r.id, customName(r) ?? pathLabel(r.path)] as const));
  const count = new Map<string, number>();
  for (const l of base.values()) count.set(l, (count.get(l) ?? 0) + 1);
  return new Map(
    roots.map((r) => {
      const l = base.get(r.id)!;
      return [r.id, count.get(l)! > 1 && customName(r) ? `${l} — ${pathLabel(r.path)}` : l] as const;
    }),
  );
}

/** Projects that can be removed: everything but the reference. */
export const removable = (roots: readonly RootInfo[]): RootInfo[] => roots.filter((r) => r.kind !== 'reference');

/** Why a project is writable, when the server says: asked with `--rw`, or covered by the auto-RW paths. */
export function writableVia(root: RootInfo): 'rw' | 'auto' | null {
  const by = (root as { writableBy?: unknown }).writableBy;
  return root.writable && (by === 'rw' || by === 'auto') ? by : null;
}
