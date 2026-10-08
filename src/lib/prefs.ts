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
 *
 * The same file holds `saved`: the directories mdhouse serves every time it starts, added with
 * `mdhouse <dir> -p` and removed with `mdhouse --rm <dir>` or from the settings page. One config
 * file, not two — there is nothing about a directory list that wants a file of its own.
 */

import { homedir } from 'node:os';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Mark = 'favorite' | 'muted' | 'ignored';

export const MARKS: Mark[] = ['favorite', 'muted', 'ignored'];

interface RootPrefs {
  favorite: string[];
  muted: string[];
  ignored: string[];
}

interface PrefsFile {
  /** Above 1: written by a newer mdhouse — read, never written. */
  version: number;
  /** absolute root path -> marks */
  roots: Record<string, RootPrefs>;
  /** Absolute, symlink-resolved directories served on every start. */
  saved: string[];
  /**
   * The saved directories mdhouse may write to — saved with `-p --rw`. Writability belongs to
   * the folder it was asked for, never to the process: starting with `--rw` for one folder does
   * not make the saved ones writable.
   */
  writable: string[];
  /** The settings page's options. */
  settings: Settings;
  /**
   * Where to listen, saved with `-p --port … --host …` so every start — by hand or as the
   * systemd service — comes up the same way. Missing means the built-in defaults.
   */
  server: ServerConfig;
  /** Who may open mdhouse — see `lib/access.ts`. Set from the CLI only. */
  access: AccessConfig;
  /**
   * auto-rw paths, `mdhouse --auto-rw <path,…>`: every folder served from under one is writable
   * without `--rw` — while `settings.autoRw` is on; the settings page turns it off and on.
   */
  autoRw: string[];
}

export interface AccessConfig {
  /** Networks allowed in besides this machine, `192.168.1.0/24`; empty allows every address. */
  allow: string[];
  /** login -> password hash; none means no login is asked. */
  users: Record<string, string>;
}

export interface ServerConfig {
  port?: number;
  host?: string;
}

/** The options on the settings page. Each has a default, so an older file needs none of them. */
export interface Settings {
  /** An `edit:` link on every document, for a URL handler that opens the file in an editor. */
  editLink: boolean;
  /** Folders under the auto-rw paths are writable. */
  autoRw: boolean;
  /** The name a signed Q&A reply carries (`💬 👤me …`); empty: from git, else the login. */
  me: string;
}

const DEFAULT_SETTINGS: Settings = { editLink: true, autoRw: true, me: '' };

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

const fresh = (): PrefsFile => ({
  version: 1,
  roots: {},
  saved: [],
  writable: [],
  settings: { ...DEFAULT_SETTINGS },
  server: {},
  access: { allow: [], users: {} },
  autoRw: [],
});

const validPort = (p: unknown): p is number => Number.isInteger(p) && (p as number) > 0 && (p as number) < 65536;

/**
 * A parsed file, filled out and type-checked, so an older or hand-edited one loads cleanly.
 * Unknown top-level keys are kept, so a save never drops what a newer mdhouse wrote.
 */
function normalizeFile(parsed: Partial<PrefsFile>): PrefsFile {
  const saved = Array.isArray(parsed.saved) ? parsed.saved.filter((d) => typeof d === 'string') : [];
  // Only a saved directory can be saved writable.
  const writable = Array.isArray(parsed.writable)
    ? parsed.writable.filter((d) => typeof d === 'string' && saved.includes(d))
    : [];
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = parsed.settings?.[key];
    if (typeof value === typeof DEFAULT_SETTINGS[key]) settings[key] = value as never;
  }
  const server: ServerConfig = {};
  if (validPort(parsed.server?.port)) server.port = parsed.server.port;
  if (typeof parsed.server?.host === 'string' && parsed.server.host) server.host = parsed.server.host;
  const access: AccessConfig = { allow: [], users: {} };
  if (Array.isArray(parsed.access?.allow)) access.allow = parsed.access.allow.filter((c) => typeof c === 'string');
  const users = parsed.access?.users;
  if (users && typeof users === 'object') {
    for (const [login, hash] of Object.entries(users)) if (typeof hash === 'string') access.users[login] = hash;
  }
  const roots: Record<string, RootPrefs> = {};
  if (parsed.roots && typeof parsed.roots === 'object') {
    for (const [path, entry] of Object.entries(parsed.roots)) {
      const marks = empty();
      for (const m of MARKS) {
        const list: unknown = (entry as Partial<RootPrefs> | null)?.[m];
        if (Array.isArray(list)) marks[m] = list.filter((e) => typeof e === 'string');
      }
      roots[path] = marks;
    }
  }
  return {
    ...parsed,
    version: typeof parsed.version === 'number' && parsed.version > 1 ? parsed.version : 1,
    roots,
    saved,
    writable,
    settings,
    server,
    access,
    autoRw: Array.isArray(parsed.autoRw) ? parsed.autoRw.filter((d) => typeof d === 'string') : [],
  };
}

/**
 * The file as it is on disk now: `missing`, `broken` (it exists and does not parse), or its data.
 * Writes are atomic (see `write`), so a parse failure is a real problem — a typo from a hand
 * edit — never a half-written file caught mid-save.
 */
export async function readFile(path: string): Promise<PrefsFile | 'missing' | 'broken'> {
  // One read of whatever the path names now: a file renamed over it by another process's save is
  // read whole, never at the size an earlier look at the path saw.
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw err;
  }
  try {
    // Comments are read (doc/prefs.json.dist has them), though a save writes plain JSON.
    return normalizeFile(Bun.JSONC.parse(text) as Partial<PrefsFile>);
  } catch {
    return 'broken';
  }
}

/**
 * Move an unreadable prefs file aside rather than ever writing over it: it holds every mark and
 * saved directory, and an empty file saved on top of a typo would destroy them all.
 */
async function setAside(path: string): Promise<void> {
  const backup = `${path}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await rename(path, backup).catch(() => {});
  console.error(`mdhouse: ${path} could not be read; moved it to ${backup} and started a new one.`);
}

/** Distinguishes this process's temporary files from one another. */
let tmpSeq = 0;

export class Prefs {
  /**
   * This process's changes, one after another. Each one reads the file, applies itself and
   * writes; two of them interleaved would both start from the same file, and the later write
   * would drop the earlier change — two quick clicks on ★ lost one of them.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private data: PrefsFile,
    readonly path = PREFS_PATH,
  ) {}

  /** @param path the prefs file; tests pass their own, everything else takes the default. */
  static async load(path = PREFS_PATH): Promise<Prefs> {
    const found = await readFile(path);
    if (found === 'broken') await setAside(path);
    return new Prefs(typeof found === 'object' ? found : fresh(), path);
  }

  /**
   * Every change is read, apply, write — against the file as it is *now*, not the copy this
   * process loaded. More than one process writes it (the CLI, a daemon per port, the systemd
   * service), and each holding its own copy meant each save undid the others' changes.
   */
  private mutate<T>(change: (data: PrefsFile) => T): Promise<T> {
    const run = this.queue.then(() => this.mutateNow(change));
    this.queue = run.catch(() => {});
    return run;
  }

  private async mutateNow<T>(change: (data: PrefsFile) => T): Promise<T> {
    const found = await readFile(this.path);
    if (found === 'broken') await setAside(this.path);
    const data = typeof found === 'object' ? found : found === 'missing' ? fresh() : this.data;
    if (data.version > 1) throw new Error(`${this.path} is version ${data.version}, from a newer mdhouse — not changed`);
    const result = change(data);
    this.data = data;
    await this.write();
    return result;
  }

  /**
   * Written to a temporary file and renamed over the old one, so no reader sees half of it.
   * Mode 0600 in a directory created 0700: the file holds password hashes.
   */
  private async write(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmp = `${this.path}.${process.pid}.${++tmpSeq}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2) + '\n', { mode: 0o600 });
    await rename(tmp, this.path);
  }

  get settings(): Settings {
    return { ...this.data.settings };
  }

  /** Change some settings; unknown keys and values of the wrong type are ignored. */
  async updateSettings(patch: Record<string, unknown>): Promise<Settings> {
    await this.mutate((data) => {
      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
        const value = patch[key];
        if (typeof value === typeof DEFAULT_SETTINGS[key]) data.settings[key] = value as never;
      }
    });
    return this.settings;
  }

  get server(): ServerConfig {
    return { ...this.data.server };
  }

  /** Remember where to listen; an invalid port is refused rather than saved. */
  async setServer(patch: ServerConfig): Promise<ServerConfig> {
    if (patch.port !== undefined && !validPort(patch.port)) throw new Error(`not a port: ${patch.port}`);
    await this.mutate((data) => {
      if (patch.port !== undefined) data.server.port = patch.port;
      if (patch.host) data.server.host = patch.host;
    });
    return this.server;
  }

  get access(): AccessConfig {
    return { allow: [...this.data.access.allow], users: { ...this.data.access.users } };
  }

  /**
   * Take in what other processes wrote. The CLI changes access and auto-rw while the server runs,
   * and they must apply at once, so the server calls this for every request that needs them;
   * the file is read again only when it changed.
   */
  refresh(): void {
    const file = Bun.file(this.path);
    // Time and size: two saves within one millisecond still differ in what they hold, mostly.
    const stamp = `${file.lastModified}:${file.size}`;
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    try {
      this.data = normalizeFile(Bun.JSONC.parse(readFileSync(this.path, 'utf8')) as Partial<PrefsFile>);
    } catch {
      /* missing, or mid-edit by hand: keep what we have */
    }
  }
  private stamp = '';

  /** The access settings as the file holds them now. */
  async currentAccess(): Promise<AccessConfig> {
    this.refresh();
    return this.access;
  }

  /** The auto-rw paths. */
  get autoRw(): string[] {
    return [...this.data.autoRw];
  }

  /** Is a folder writable by an auto-rw path — one of them or under one, with the setting on? */
  autoRwCovers(dir: string): boolean {
    this.refresh();
    return this.data.settings.autoRw && this.data.autoRw.some((p) => dir === p || dir.startsWith(p.endsWith('/') ? p : `${p}/`));
  }

  /** Replace the auto-rw paths. */
  async setAutoRw(paths: string[]): Promise<string[]> {
    await this.mutate((data) => {
      data.autoRw = [...paths];
    });
    return this.autoRw;
  }

  /** Replace the allow list. */
  async setAllow(allow: string[]): Promise<AccessConfig> {
    await this.mutate((data) => {
      data.access.allow = [...allow];
    });
    return this.access;
  }

  /** Add or replace a user; true when the login is new. */
  setUser(login: string, hash: string): Promise<boolean> {
    return this.mutate((data) => {
      const isNew = !Object.hasOwn(data.access.users, login);
      data.access.users = { ...data.access.users, [login]: hash };
      return isNew;
    });
  }

  /** Remove a user; true when there was one. */
  removeUser(login: string): Promise<boolean> {
    return this.mutate((data) => {
      if (!Object.hasOwn(data.access.users, login)) return false;
      const { [login]: _gone, ...rest } = data.access.users;
      data.access.users = rest;
      return true;
    });
  }

  /** The directories to serve on every start. */
  savedDirs(): string[] {
    return [...this.data.saved];
  }

  isSaved(dir: string): boolean {
    return this.data.saved.includes(dir);
  }

  /** Saved with `-p --rw`: mdhouse may write to it on every start. */
  isWritableSaved(dir: string): boolean {
    return this.data.writable.includes(dir);
  }

  /**
   * Save a directory, recording it exactly as asked: writable with `rw`, read-only without —
   * so saving again without `--rw` is how write access is taken away. True when it was not
   * saved before.
   */
  addSaved(dir: string, rw = false): Promise<boolean> {
    return this.mutate((data) => {
      const isNew = !data.saved.includes(dir);
      if (isNew) data.saved = [...data.saved, dir].sort();
      data.writable = data.writable.filter((d) => d !== dir);
      if (rw) data.writable = [...data.writable, dir].sort();
      return isNew;
    });
  }

  /** Forget a saved directory; true when it was saved. */
  removeSaved(dir: string): Promise<boolean> {
    return this.mutate((data) => {
      if (!data.saved.includes(dir)) return false;
      data.saved = data.saved.filter((d) => d !== dir);
      data.writable = data.writable.filter((d) => d !== dir);
      return true;
    });
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
    await this.mutate((data) => {
      const prefs = (data.roots[rootPath] ??= empty());
      prefs[mark] = prefs[mark].filter((e) => e !== rel);
      if (on) {
        prefs[mark].push(rel);
        prefs[mark].sort();
        if (mark === 'favorite') prefs.muted = prefs.muted.filter((e) => e !== rel);
        if (mark === 'muted') prefs.favorite = prefs.favorite.filter((e) => e !== rel);
      }
    });
    return this.get(rootPath);
  }
}
