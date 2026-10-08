/**
 * Filesystem watching -> WebSocket pushes.
 *
 * Explicitly not polling: a change on disk reaches the open page because the kernel told us,
 * not because the browser asked again. It refreshes the open document, the tree, the recents
 * and the front page; the per-root topics and the reconnect handling are what later interactive
 * features will ride on.
 */

import { watch, type FSWatcher } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import type { Root } from './roots';
import { MD_EXT } from './filetypes';

export type ChangeKind = 'fs' | 'git';

export interface WatchEvent {
  kind: ChangeKind;
  rootId: string;
  paths: string[];
}

const DEBOUNCE_MS = 120;

export class Watcher {
  /** Per root, so a root removed at runtime can stop being watched without the others. */
  private readonly watchers = new Map<string, FSWatcher[]>();
  private readonly pending = new Map<string, Set<string>>();
  private readonly gitDirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onChange: (events: WatchEvent[]) => void) {}

  /**
   * Also watch the repository's git dirs (`gitDirs()`) that sit outside the root — the `.git` of a
   * checkout the root is a folder of, a linked worktree's own and common dirs. The recursive watch
   * below only sees inside the root, so a commit would otherwise never reach the page and the
   * recents would quietly go stale. A dir inside the root is left to the recursive watch.
   */
  watchRepo(root: Root, gitDirs: string[]): void {
    for (const dir of new Set(gitDirs)) {
      const inside = relative(root.path, dir);
      if (!inside.startsWith('..') && !isAbsolute(inside)) continue;
      try {
        const watcher = watch(dir, { recursive: false, persistent: false });
        watcher.on('error', () => {});
        watcher.on('change', () => {
          this.gitDirty.add(root.id);
          this.schedule();
        });
        this.keep(root.id, watcher);
      } catch {
        /* no such dir, or watching is unavailable — the viewer still works */
      }
    }
  }

  watchRoot(root: Root): void {
    let watcher: FSWatcher;
    try {
      watcher = watch(root.path, { recursive: true, persistent: false });
    } catch {
      // Recursive watching is not available everywhere; the viewer still works, it is simply
      // no longer live. Not worth failing startup over.
      return;
    }

    watcher.on('error', () => {});
    watcher.on('change', (_event, filename) => {
      if (!filename) return;
      const rel = (typeof filename === 'string' ? filename : filename.toString()).split(sep).join('/');

      // A commit, checkout or stage rewrites .git internals — that means the git-derived
      // views are stale, not that a document changed.
      if (rel === '.git' || rel.startsWith('.git/') || rel.includes('/.git/')) {
        this.gitDirty.add(root.id);
        this.schedule();
        return;
      }
      // The ignore files change what the tree lists: the root's `.mdhouseignore`, any `.gitignore`.
      if (!MD_EXT.test(rel) && rel !== '.mdhouseignore' && !/(^|\/)\.gitignore$/.test(rel)) return;

      let set = this.pending.get(root.id);
      if (!set) this.pending.set(root.id, (set = new Set()));
      set.add(rel);
      this.schedule();
    });

    this.keep(root.id, watcher);
  }

  private keep(rootId: string, watcher: FSWatcher): void {
    const list = this.watchers.get(rootId);
    if (list) list.push(watcher);
    else this.watchers.set(rootId, [watcher]);
  }

  /** Stop watching one root, and drop anything it had queued. */
  unwatch(rootId: string): void {
    for (const w of this.watchers.get(rootId) ?? []) w.close();
    this.watchers.delete(rootId);
    this.pending.delete(rootId);
    this.gitDirty.delete(rootId);
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const events: WatchEvent[] = [];

      for (const [rootId, paths] of this.pending) events.push({ kind: 'fs', rootId, paths: [...paths] });
      for (const rootId of this.gitDirty) events.push({ kind: 'git', rootId, paths: [] });

      this.pending.clear();
      this.gitDirty.clear();
      if (events.length) this.onChange(events);
    }, DEBOUNCE_MS);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const list of this.watchers.values()) for (const w of list) w.close();
    this.watchers.clear();
  }
}

/** Root-relative path of an absolute path, or null when it is outside. */
export function relTo(root: Root, abs: string): string | null {
  const rel = relative(root.path, abs).split(sep).join('/');
  return rel.startsWith('..') ? null : rel;
}
