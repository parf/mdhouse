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
 * of its folder. An own name two roots share is followed by the folder's `pathLabel`; labels that
 * still collide use `fullLabel` instead — a canonical path is unique, so every option reads apart.
 */
export function chooserLabels(
  roots: readonly RootInfo[],
  pathLabel: (path: string) => string,
  fullLabel: (path: string) => string = (path) => path,
): Map<string, string> {
  const shared = (labels: Map<string, string>) => {
    const count = new Map<string, number>();
    for (const l of labels.values()) count.set(l, (count.get(l) ?? 0) + 1);
    return (id: string) => count.get(labels.get(id)!)! > 1;
  };
  const withPath = (r: RootInfo, path: (p: string) => string) => {
    const own = customName(r);
    return own === null ? path(r.path) : `${own} — ${path(r.path)}`;
  };
  const base = new Map(roots.map((r) => [r.id, customName(r) ?? pathLabel(r.path)] as const));
  const baseShared = shared(base);
  const first = new Map(roots.map((r) => [r.id, baseShared(r.id) && customName(r) !== null ? withPath(r, pathLabel) : base.get(r.id)!] as const));
  const firstShared = shared(first);
  return new Map(roots.map((r) => [r.id, firstShared(r.id) ? withPath(r, fullLabel) : first.get(r.id)!] as const));
}

/** Projects that can be removed: everything but the reference. */
export const removable = (roots: readonly RootInfo[]): RootInfo[] => roots.filter((r) => r.kind !== 'reference');

/** A project's access as set, as the server states it; null for the reference or a value this page does not know. */
export function accessMode(root: RootInfo): 'inherit' | 'rw' | 'ro' | null {
  const mode = (root as { mode?: unknown }).mode;
  return root.kind !== 'reference' && (mode === 'inherit' || mode === 'rw' || mode === 'ro') ? mode : null;
}

/**
 * The mode a change sets: the opposite of the access the project has now. In a Viewer, where every
 * project is read-only, the opposite of the stored mode (`inherit` counts as not RW). Null when there is nothing to set.
 */
export function modeTarget(root: RootInfo, viewer = false): 'rw' | 'ro' | null {
  const mode = accessMode(root);
  const rev = (root as { accessRev?: unknown }).accessRev;
  if (!mode || typeof rev !== 'string' || !/^[0-9a-f]{64}$/.test(rev)) return null;
  if (viewer) return mode === 'rw' ? 'ro' : 'rw';
  const to = root.writable ? 'ro' : 'rw';
  return to === mode ? null : to;
}

/** Where a project's access comes from, in words. */
export function accessSource(root: RootInfo): string {
  const mode = accessMode(root);
  if (mode === 'ro') return 'set read-only for this project';
  if (mode === 'rw') return root.writable ? 'set read and write for this project' : 'set read and write, but mdhouse cannot write here';
  return root.writable ? 'an auto-RW path covers it' : 'the default';
}

/** May mdhouse write to this project now, by the live root list. A project no longer listed: no. */
export const rootWritable = (roots: readonly RootInfo[], id: string): boolean => {
  const root = roots.find((r) => r.id === id);
  return !!root && root.writable && root.kind !== 'reference';
};

/**
 * The Workspace access badge: read and write is the default and shows nothing; effective read-only
 * (set, inherited without auto-RW, or capped) is the exception and shows `RO`. The reference and a
 * project not listed (or without its access stated) make no claim.
 */
export function accessBadge(root: RootInfo | undefined): 'RO' | null {
  if (!root || root.kind === 'reference' || typeof (root as { writable?: unknown }).writable !== 'boolean') return null;
  return root.writable ? null : 'RO';
}

/** The Viewer access tag. */
export const STORED_RW = 'RW (stored)';

/** A Viewer's words for a project's stored mode, for the tag's and the Settings switch's tooltip. */
export function storedTitle(root: RootInfo): string {
  return `Stored as ${accessMode(root) === 'rw' ? 'read and write' : 'read-only'} — takes effect in Workspace; a Viewer writes nothing`;
}

/**
 * The Viewer access tag: a Viewer makes every project read-only, so read-only says nothing (the Viewer
 * badge covers it) and a project stored as RW is the exception. The reference and a project not listed make no claim.
 */
export function viewerAccessTag(root: RootInfo | undefined): typeof STORED_RW | null {
  return root && accessMode(root) === 'rw' ? STORED_RW : null;
}

/** The longest folder path the add form sends. */
export const ADD_PATH_MAX = 4096;

/** Why a typed folder path cannot be sent as it is; null when it can. The server checks the folder itself. */
export function addPathProblem(path: string): string | null {
  if (!path) return 'Type the folder\'s full path.';
  if (path.includes('\0')) return 'The path has a NUL character.';
  if (path.length > ADD_PATH_MAX) return `The path is longer than ${ADD_PATH_MAX} characters.`;
  if (!path.startsWith('/')) return 'A full path starts with /.';
  return null;
}
