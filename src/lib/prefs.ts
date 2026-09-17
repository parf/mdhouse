/**
 * User marks on files and directories: favorite, muted, ignored.
 *
 * Stored in `~/.config/mdhouse/prefs.json`, keyed by the root's absolute path — never as a
 * dotfile inside a browsed tree. That is what makes the marks work on a read-only root, which
 * is every root by default: the opinions are yours, the tree stays untouched.
 *
 * An entry is a root-relative path. A trailing `/` makes it a directory rule covering the
 * whole subtree; anything else matches one file exactly.
 *
 *   favorite  pinned to the top of the sidebar and starred in the tree
 *   muted     dimmed, sorted last, kept out of recents and default search  (opposite of favorite)
 *   ignored   hidden outright, like .gitignore — revealed only by the "show ignored" toggle
 */

import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

export type Mark = 'favorite' | 'muted' | 'ignored';

export const MARKS: Mark[] = ['favorite', 'muted', 'ignored'];

interface RootPrefs {
  favorite: string[];
  muted: string[];
  ignored: string[];
}

interface PrefsFile {
  version: 1;
  /** absolute root path -> marks */
  roots: Record<string, RootPrefs>;
}

export const CONFIG_DIR = `${process.env.XDG_CONFIG_HOME || `${homedir()}/.config`}/mdhouse`;
const PREFS_PATH = `${CONFIG_DIR}/prefs.json`;

const empty = (): RootPrefs => ({ favorite: [], muted: [], ignored: [] });

function normalize(entry: string): string {
  const trimmed = entry.trim().replace(/^\/+/, '');
  return trimmed;
}

/** Does `rule` cover `path`? Directory rules end in `/` and cover their whole subtree. */
function covers(rule: string, path: string): boolean {
  if (rule.endsWith('/')) return path === rule.slice(0, -1) || path.startsWith(rule);
  return path === rule;
}

export class Prefs {
  private constructor(
    private data: PrefsFile,
    readonly path = PREFS_PATH,
  ) {}

  static async load(): Promise<Prefs> {
    const file = Bun.file(PREFS_PATH);
    if (!(await file.exists())) return new Prefs({ version: 1, roots: {} });
    try {
      const parsed = (await file.json()) as Partial<PrefsFile>;
      return new Prefs({ version: 1, roots: parsed.roots ?? {} });
    } catch {
      // A corrupt prefs file must not stop the viewer from starting.
      return new Prefs({ version: 1, roots: {} });
    }
  }

  private forRoot(rootPath: string): RootPrefs {
    return (this.data.roots[rootPath] ??= empty());
  }

  /** All marks for one root, as plain arrays the client can hold. */
  get(rootPath: string): RootPrefs {
    const p = this.data.roots[rootPath];
    return p ? { favorite: [...p.favorite], muted: [...p.muted], ignored: [...p.ignored] } : empty();
  }

  /** Every mark applying to a path, walking directory rules too. */
  marksFor(rootPath: string, relPath: string): Mark[] {
    const prefs = this.data.roots[rootPath];
    if (!prefs) return [];
    return MARKS.filter((mark) => prefs[mark].some((rule) => covers(rule, relPath)));
  }

  hasMark(rootPath: string, relPath: string, mark: Mark): boolean {
    return (this.data.roots[rootPath]?.[mark] ?? []).some((rule) => covers(rule, relPath));
  }

  /**
   * Set or clear one mark on one entry. Favorite and muted are opposites — setting either
   * clears the other, because holding both is never what anyone meant.
   */
  async set(rootPath: string, entry: string, mark: Mark, on: boolean): Promise<RootPrefs> {
    const rel = normalize(entry);
    const prefs = this.forRoot(rootPath);

    prefs[mark] = prefs[mark].filter((e) => e !== rel);
    if (on) {
      prefs[mark].push(rel);
      prefs[mark].sort();
      if (mark === 'favorite') prefs.muted = prefs.muted.filter((e) => e !== rel);
      if (mark === 'muted') prefs.favorite = prefs.favorite.filter((e) => e !== rel);
    }

    await this.save();
    return this.get(rootPath);
  }

  async save(): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true });
    await Bun.write(PREFS_PATH, JSON.stringify(this.data, null, 2) + '\n');
  }
}
