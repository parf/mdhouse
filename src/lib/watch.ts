/**
 * Filesystem watching -> WebSocket pushes.
 *
 * Explicitly not polling: a change on disk reaches the open page because the kernel told us,
 * not because the browser asked again. Phase 1 uses this only to refresh the open document and
 * the tree, but the channel, the per-root topics and the reconnect handling all exist now so
 * later interactive features have nothing left to build.
 */

import { watch, type FSWatcher } from 'node:fs';
import { relative, sep } from 'node:path';
import type { Root } from './roots';

export type ChangeKind = 'fs' | 'git';

export interface WatchEvent {
  kind: ChangeKind;
  rootId: string;
  paths: string[];
}

const DEBOUNCE_MS = 120;
const MD = /\.mdx?$/i;

export class Watcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly pending = new Map<string, Set<string>>();
  private readonly gitDirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onChange: (events: WatchEvent[]) => void) {}

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
      if (!MD.test(rel)) return;

      let set = this.pending.get(root.id);
      if (!set) this.pending.set(root.id, (set = new Set()));
      set.add(rel);
      this.schedule();
    });

    this.watchers.push(watcher);
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
    for (const w of this.watchers) w.close();
    this.watchers.length = 0;
  }
}

/** Root-relative path of an absolute path, or null when it is outside. */
export function relTo(root: Root, abs: string): string | null {
  const rel = relative(root.path, abs).split(sep).join('/');
  return rel.startsWith('..') ? null : rel;
}
