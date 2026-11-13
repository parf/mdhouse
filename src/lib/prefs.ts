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
import { mkdir, open, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_EDIT_SCHEME, normalizeEditScheme } from './urls';
import { normalizeProjectName } from './project-name';
import type { AccessMode } from './roots';
import { accountSocket, isUrl, validEndpoint, validTarget } from './agent-bus';
import { parseControl, type ControlSetting } from './ab-control';

export type Mark = 'favorite' | 'muted' | 'ignored';

export const MARKS: Mark[] = ['favorite', 'muted', 'ignored'];

interface RootPrefs {
  favorite: string[];
  muted: string[];
  ignored: string[];
}

/** The format this mdhouse writes for a workspace. A version-1 file is read as is and written as version 2. */
export const PREFS_VERSION = 2;
/**
 * Version 2 plus `mode: "viewer"`, written while the instance is a Viewer. An mdhouse that knows
 * only version 2 reads it as newer: grants no writes, never rewrites it.
 */
export const VIEWER_VERSION = 3;

/** The instance mode: `workspace` writes by root mode; `viewer` caps every root read-only. */
export type InstanceMode = 'workspace' | 'viewer';

interface PrefsFile {
  /** 1, 2 or 3 (Viewer). Any other value: written by a newer mdhouse — read, never written, grants no writes. */
  version: number;
  /** `viewer` while the instance is a Viewer; absent means workspace. */
  mode?: 'viewer';
  /**
   * On disk in a Viewer (version 3) file only: the RW grants, moved out of `writable` so an older
   * mdhouse, which grants `writable` whatever the version, finds none. Read back into `writable`.
   */
  viewerWritable?: string[];
  /** absolute root path -> marks */
  roots: Record<string, RootPrefs>;
  /** Absolute, symlink-resolved directories served on every start. */
  saved: string[];
  /**
   * Canonical (symlink-resolved) path of a saved directory -> its human name. Only a saved directory
   * keeps one; an unsaved root's name lives in memory. A saved entry that is a symlink names the
   * directory it resolves to now, so retargeting the link never carries a name to another directory.
   */
  names: Record<string, string>;
  /**
   * The saved directories mdhouse may write to — saved with `-p --rw`, or set RW on the settings
   * page. Writability belongs to the folder it was asked for, never to the process: starting with
   * `--rw` for one folder does not make the saved ones writable.
   */
  writable: string[];
  /**
   * Version 2: the saved directories set read-only on the settings page; auto-rw never makes one
   * writable. Never shares a directory with `writable`.
   */
  readonly: string[];
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
   * Version 2: the auto-rw paths, `mdhouse --auto-rw <path,…>`: every folder served from under one
   * is writable without `--rw` unless set read-only — while `settings.autoRw` is on; the settings
   * page turns it off and on.
   */
  autoRwRules: string[];
  /**
   * Version 1's auto-rw paths, read into `autoRwRules`. Version 2 keeps it empty, so an older
   * mdhouse reading the file grants nothing by auto-rw.
   */
  autoRw: string[];
  /** The Agent Bus integration — `mdhouse --agent-bus`; the settings page picks the default agents. */
  agentBus: AgentBusFile;
  /**
   * Canonical path of a saved directory -> its own Agent Bus settings (`SpaceAb`). Kept as read: a
   * malformed entry, or a malformed map, makes that project's Agent Bus unavailable — never the
   * instance's in its place.
   */
  agentBusSpaces?: unknown;
}

/**
 * A project's own Agent Bus settings, each optional: its endpoint, the credential for that endpoint
 * (provisioned in this file only, never through a page), and its default agents.
 */
export interface SpaceAb {
  endpoint?: string;
  credential?: string;
  default?: string[];
}

/** Most default agents a project names. */
export const SPACE_DEFAULT_MAX = 20;

/** What a page may know of a project's Agent Bus settings: no credential, only whether there is one. */
export interface SpaceAbPublic {
  endpoint: string | null;
  default: string[] | null;
  hasCredential: boolean;
  /** The stored entry cannot be read: the project's Agent Bus is unavailable. */
  malformed: boolean;
}

const SPACE_KEYS = new Set(['endpoint', 'credential', 'default']);

/** A stored entry, checked: its settings, or null when it is malformed. */
function spaceEntry(raw: unknown): SpaceAb | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (Object.keys(e).some((k) => !SPACE_KEYS.has(k))) return null;
  if (e.endpoint !== undefined && !validEndpoint(e.endpoint)) return null;
  if (e.credential !== undefined) {
    // a credential belongs to the endpoint beside it
    if (e.endpoint === undefined || typeof e.credential !== 'string' || !e.credential || e.credential.length > 4096) return null;
    if (/[\u0000-\u001f\u007f]/.test(e.credential)) return null;
  }
  if (e.default !== undefined && (!Array.isArray(e.default) || e.default.length > SPACE_DEFAULT_MAX || !e.default.every(validTarget))) return null;
  return {
    ...(e.endpoint !== undefined ? { endpoint: e.endpoint as string } : {}),
    ...(e.credential !== undefined ? { credential: e.credential as string } : {}),
    ...(e.default !== undefined ? { default: [...(e.default as string[])] } : {}),
  };
}

/** The map of project settings when it is one; null when it is malformed; undefined when absent. */
function spaceMap(data: PrefsFile): Record<string, unknown> | null | undefined {
  const map = data.agentBusSpaces;
  if (map === undefined) return undefined;
  return map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, unknown>) : null;
}

/** The key a directory's settings are stored under: the canonical path of its saved entry. */
const spaceKey = (data: PrefsFile, dir: string): string => real(savedEntry(data.saved, dir) ?? dir);

/** A directory's stored settings: `{}` when none, null when malformed. */
function spaceAbOf(data: PrefsFile, dir: string): SpaceAb | null {
  const map = spaceMap(data);
  if (map === undefined) return {};
  if (map === null) return null;
  const key = spaceKey(data, dir);
  return Object.hasOwn(map, key) ? spaceEntry(map[key]) : {};
}

/** The public form of stored settings. */
export const publicSpaceAb = (ab: SpaceAb | null): SpaceAbPublic =>
  ab === null
    ? { endpoint: null, default: null, hasCredential: false, malformed: true }
    : { endpoint: ab.endpoint ?? null, default: ab.default?.length ? [...ab.default] : null, hasCredential: !!ab.credential, malformed: false };

/**
 * Stores `next` as `dir`'s settings. The credential stays only beside the same endpoint; a changed or
 * cleared endpoint drops it. All empty removes the entry. Throws when the map is malformed.
 */
function putSpaceAb(data: PrefsFile, dir: string, next: { endpoint: string | null; default: string[] | null }): void {
  const map = spaceMap(data);
  if (map === null) throw new Error('agentBusSpaces is malformed — not changed');
  const old = spaceAbOf(data, dir) ?? {};
  const entry: SpaceAb = {};
  if (next.endpoint) {
    entry.endpoint = next.endpoint;
    if (old.endpoint === next.endpoint && old.credential) entry.credential = old.credential;
  }
  if (next.default?.length) entry.default = [...next.default];
  const key = spaceKey(data, dir);
  const out = { ...(map ?? {}) };
  if (Object.keys(entry).length) out[key] = entry;
  else delete out[key];
  if (Object.keys(out).length) data.agentBusSpaces = out;
  else delete data.agentBusSpaces;
}

/** The Agent Bus settings as the file holds them: `enabled` may be `'auto'` (on while the account socket exists). */
export type AgentBusFile = Omit<AgentBusConfig, 'enabled' | 'stored'> & { enabled: boolean | 'auto' };

export interface AgentBusConfig {
  /** On now: switched on, or `auto` with the daemon's socket present — read again on every call. Turned on and off from the CLI only. */
  enabled: boolean;
  /** The setting as saved: `true`, `false`, or `'auto'` — the default of a new prefs file (an older mdhouse reads it as off). */
  stored: boolean | 'auto';
  /** The daemon: a socket path or `http(s)://host:port`; empty: `/run/agent-bus/user-<login>.sock`. */
  socket: string;
  /** The credential for an `http(s)://` daemon — never sent to the page. */
  token: string;
  /** The agents a page asks when it names none (`<!-- AB: … -->`). */
  default: string[];
  /** Which agents the lists show: a regex per line, against the name without its `#`; none — every one. */
  filter: string[];
  /** Agent Bus control senders (MW.7): `off`, or whole-name regexes narrowing what the daemon admits; empty — no narrowing. */
  control: ControlSetting;
}

/** Coding agents: Claude, Codex, OpenCode sessions. */
export const DEFAULT_AB_FILTER = ['^claude', '^codex', '^opencode'];

export interface AccessConfig {
  /** Networks allowed in besides this machine, `192.168.1.0/24`; empty allows every address. */
  allow: string[];
  /** login -> password hash; none means no login is asked. */
  users: Record<string, string>;
  /** `--host-name`: the only `Host` names let in (a reverse proxy's); empty = localhost and IPs. */
  hostNames: string[];
}

export interface ServerConfig {
  port?: number;
  host?: string;
}

/** The options on the settings page. Each has a default, so an older file needs none of them. */
export interface Settings {
  /** An `<editScheme>:` link on every document, for a URL handler that opens the file in an editor. */
  editLink: boolean;
  /** The link's URL scheme, no `:`; `edit` unless set — `normalizeEditScheme` says what is valid. */
  editScheme: string;
  /** Folders under the auto-rw paths are writable. */
  autoRw: boolean;
  /** The name a signed Q&A reply carries (`💬 👤me …`); empty: from git, else the login. */
  me: string;
}

const DEFAULT_SETTINGS: Settings = { editLink: true, editScheme: DEFAULT_EDIT_SCHEME, autoRw: true, me: '' };

/** A setting's value if it is valid for its key, else undefined. */
function validSetting<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  if (key === 'editScheme') return (normalizeEditScheme(value) ?? undefined) as Settings[K] | undefined;
  return typeof value === typeof DEFAULT_SETTINGS[key] ? (value as Settings[K]) : undefined;
}

/** A path as the filesystem resolves it — a served root is always held so; as written when it is gone. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The saved entry for `dir` — itself, or a saved symlink that resolves to it — or undefined. */
const savedEntry = (saved: string[], dir: string): string | undefined => saved.find((d) => d === dir || real(d) === dir);

/** Does a list entry name `dir` — as written or through a symlink? */
const sameDir = (entry: string, dir: string): boolean => entry === dir || real(entry) === dir || real(entry) === real(dir);

/**
 * Why this mdhouse must not change the file or take writes from it — a newer or malformed format —
 * or undefined. Kept beside the data, never in it, so it is never written.
 */
const blockedBy = new WeakMap<PrefsFile, string>();

/** Is `dir` writable by auto-rw under `data`: the switch on and one of its paths covering it. Never while blocked. */
function autoCovers(data: PrefsFile, dir: string): boolean {
  if (blockedBy.has(data)) return false;
  return data.settings.autoRw && data.autoRwRules.some((p) => [p, real(p)].some((q) => dir === q || dir.startsWith(q.endsWith('/') ? q : `${q}/`)));
}

/** The stored mode of a saved directory, undefined when unsaved. A blocked file keeps read-only and grants no `rw`. */
function storedMode(data: PrefsFile, dir: string): AccessMode | undefined {
  if (savedEntry(data.saved, dir) === undefined) return undefined;
  if (data.readonly.some((d) => sameDir(d, dir))) return 'ro';
  if (!blockedBy.has(data) && data.writable.some((d) => sameDir(d, dir))) return 'rw';
  return 'inherit';
}

/** What a guard sees: the file as it is under the lock, for one directory. */
export interface PolicyView {
  saved: boolean;
  /** auto-rw makes it writable: the switch on and a path covering it. */
  auto: boolean;
  /** Its stored mode; null when unsaved. */
  stored: AccessMode | null;
}

const viewOf = (data: PrefsFile, dir: string): PolicyView => ({
  saved: savedEntry(data.saved, dir) !== undefined,
  auto: autoCovers(data, dir),
  stored: storedMode(data, dir) ?? null,
});

/** A guard's refusal: `saveRoot` writes nothing and returns it. */
class Refused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Drops every name whose key is not the canonical path of a saved directory now. */
function pruneNames(data: { saved: string[]; names: Record<string, string> }): void {
  const canonical = new Set(data.saved.map(real));
  for (const key of Object.keys(data.names)) if (!canonical.has(key)) delete data.names[key];
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

const fresh = (): PrefsFile => ({
  version: PREFS_VERSION,
  roots: {},
  saved: [],
  names: {},
  writable: [],
  readonly: [],
  settings: { ...DEFAULT_SETTINGS },
  server: {},
  access: { allow: [], users: {}, hostNames: [] },
  autoRwRules: [],
  autoRw: [],
  agentBus: { enabled: 'auto', socket: '', token: '', default: [], filter: [...DEFAULT_AB_FILTER], control: [] },
});

const validPort = (p: unknown): p is number => Number.isInteger(p) && (p as number) > 0 && (p as number) < 65536;

const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((e) => typeof e === 'string');

/** The RW grants a parsed file holds: `viewerWritable` in a version-3 file, else `writable`. */
function grants(parsed: Partial<PrefsFile>): string[] {
  const list: unknown = parsed.version === VIEWER_VERSION ? parsed.viewerWritable : parsed.writable;
  return Array.isArray(list) ? list.filter((d): d is string => typeof d === 'string') : [];
}

/** The file as written: a Viewer's RW grants move to `viewerWritable`, in the same atomic write. */
function onDisk(data: PrefsFile): PrefsFile {
  if (data.mode !== 'viewer') return { ...data, viewerWritable: undefined };
  return { ...data, writable: [], viewerWritable: [...data.writable] };
}

/**
 * Why the file's access data cannot be trusted, or null. Version 2 needs `readonly` and
 * `autoRwRules` as string lists and an empty legacy `autoRw`; version 1 has no `autoRwRules`;
 * no directory is both writable and read-only. Anything else is ambiguous, so it fails closed.
 */
function accessProblem(parsed: Partial<PrefsFile>): string | null {
  const v: unknown = parsed.version;
  if (v !== undefined && v !== 1 && v !== PREFS_VERSION && v !== VIEWER_VERSION) {
    return typeof v === 'number' && v > VIEWER_VERSION ? `version ${v}, from a newer mdhouse` : 'an unknown version';
  }
  const mode: unknown = (parsed as { mode?: unknown }).mode;
  if (mode !== undefined && mode !== 'workspace' && mode !== 'viewer') return 'an unknown mode';
  if (v === VIEWER_VERSION) {
    if (mode !== 'viewer') return 'version 3 without viewer mode';
    if (!strings(parsed.viewerWritable) || (parsed.writable !== undefined && !(Array.isArray(parsed.writable) && parsed.writable.length === 0))) {
      return 'version 3 without a valid viewerWritable list, or with writable entries';
    }
  } else if ('viewerWritable' in parsed) return `version ${String(v ?? 1)} with viewerWritable`;
  if (v === PREFS_VERSION || v === VIEWER_VERSION) {
    if (!strings(parsed.readonly) || !strings(parsed.autoRwRules)) return `version ${v} without valid readonly and autoRwRules lists`;
    if (parsed.autoRw !== undefined && !(Array.isArray(parsed.autoRw) && parsed.autoRw.length === 0)) return `version ${v} with a legacy autoRw list`;
    if ((parsed.saved !== undefined && !strings(parsed.saved)) || (parsed.writable !== undefined && !strings(parsed.writable))) {
      return `version ${v} with malformed saved or writable lists`;
    }
  } else {
    if ('autoRwRules' in parsed) return 'version 1 with autoRwRules';
    if (parsed.readonly !== undefined && !strings(parsed.readonly)) return 'a malformed readonly list';
  }
  const ro = strings(parsed.readonly) ? parsed.readonly : [];
  const rw = grants(parsed);
  if (rw.some((w) => ro.some((r) => sameDir(r, w)))) return 'a directory both writable and read-only';
  return null;
}

/**
 * A parsed file, filled out and type-checked, so an older or hand-edited one loads cleanly.
 * Unknown top-level keys are kept, so a save never drops what a newer mdhouse wrote. A file with
 * an access problem keeps its version and is marked blocked: never written, no write granted.
 */
function normalizeFile(parsed: Partial<PrefsFile>): PrefsFile {
  const problem = accessProblem(parsed);
  const saved = Array.isArray(parsed.saved) ? parsed.saved.filter((d) => typeof d === 'string') : [];
  // Only a saved directory can be saved writable.
  const writable = grants(parsed).filter((d) => saved.includes(d));
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = parsed.settings?.[key];
    const ok = validSetting(key, value);
    if (ok !== undefined) settings[key] = ok as never;
  }
  const server: ServerConfig = {};
  if (validPort(parsed.server?.port)) server.port = parsed.server.port;
  if (typeof parsed.server?.host === 'string' && parsed.server.host) server.host = parsed.server.host;
  const access: AccessConfig = { allow: [], users: {}, hostNames: [] };
  if (Array.isArray(parsed.access?.allow)) access.allow = parsed.access.allow.filter((c) => typeof c === 'string');
  if (Array.isArray(parsed.access?.hostNames)) access.hostNames = parsed.access.hostNames.filter((n) => typeof n === 'string');
  const users = parsed.access?.users;
  if (users && typeof users === 'object') {
    for (const [login, hash] of Object.entries(users)) if (typeof hash === 'string') access.users[login] = hash;
  }
  const names: Record<string, string> = {};
  if (parsed.names && typeof parsed.names === 'object') {
    for (const [dir, name] of Object.entries(parsed.names)) {
      const n = normalizeProjectName(name);
      if (n.ok && n.name !== null && n.name === name) names[dir] = n.name;
    }
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
  pruneNames({ saved, names });
  const legacyAuto = Array.isArray(parsed.autoRw) ? parsed.autoRw.filter((d) => typeof d === 'string') : [];
  const v2 = parsed.version === PREFS_VERSION || parsed.version === VIEWER_VERSION;
  const data: PrefsFile = {
    ...parsed,
    version: problem ? (parsed.version as number) : v2 ? (parsed.version as number) : 1,
    mode: (parsed as { mode?: unknown }).mode === 'viewer' ? 'viewer' : undefined,
    viewerWritable: undefined,
    roots,
    saved,
    names,
    writable,
    readonly: strings(parsed.readonly) ? [...parsed.readonly] : [],
    settings,
    server,
    access,
    autoRwRules: v2 ? (strings(parsed.autoRwRules) ? [...parsed.autoRwRules] : []) : legacyAuto,
    autoRw: v2 ? [] : legacyAuto,
    agentBus: {
      // A file that exists keeps what it says; only a file that does not exist yet starts as `auto`.
      enabled: (parsed.agentBus?.enabled as unknown) === 'auto' ? 'auto' : parsed.agentBus?.enabled === true,
      socket: typeof parsed.agentBus?.socket === 'string' ? parsed.agentBus.socket : '',
      token: typeof parsed.agentBus?.token === 'string' ? parsed.agentBus.token : '',
      default: Array.isArray(parsed.agentBus?.default) ? parsed.agentBus.default.filter((n) => typeof n === 'string') : [],
      filter: Array.isArray(parsed.agentBus?.filter) ? parsed.agentBus.filter.filter((n) => typeof n === 'string') : [...DEFAULT_AB_FILTER],
      control: parseControl((parsed.agentBus as { control?: unknown } | undefined)?.control),
    },
  };
  if (problem) blockedBy.set(data, problem);
  return data;
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

/** A save holds the lock for milliseconds; a lock that stays the same file this long is a killed process's. */
const LOCK_STALE_MS = 2000;

/**
 * Runs `fn` holding `<path>.lock`, created exclusively, so one process at a time changes the file.
 * Waits while the lock is held; one unchanged for `LOCK_STALE_MS` is removed and taken. Throws when
 * a stale lock cannot be removed.
 */
async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${path}.lock`;
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  let seen = '';
  let since = Date.now();
  for (;;) {
    const fh = await open(lock, 'wx', 0o600).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'EEXIST') return null;
      throw err;
    });
    if (fh) {
      let ino: number;
      try {
        await fh.writeFile(`${process.pid}\n`);
        ino = (await fh.stat()).ino;
      } finally {
        await fh.close();
      }
      try {
        return await fn();
      } finally {
        // Not a lock another process took over after this one went stale.
        if ((await stat(lock).catch(() => null))?.ino === ino) await unlink(lock).catch(() => {});
      }
    }
    const st = await stat(lock).catch(() => null);
    const id = st ? `${st.ino}:${st.mtimeMs}` : '';
    if (id !== seen) {
      seen = id;
      since = Date.now();
    } else if (st && Date.now() - since >= LOCK_STALE_MS) {
      await unlink(lock).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    await Bun.sleep(5 + Math.random() * 10);
  }
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
   * service), and each holding its own copy meant each save undid the others' changes. Each
   * change runs under `withLock`, so two processes never interleave.
   */
  /**
   * `change` may call `unchanged()` to leave the file as it is: nothing is written, and a version-1
   * file stays version 1. Every write is version 2 — a version-1 file's auto-rw paths move to
   * `autoRwRules` and its legacy `autoRw` empties, in the same atomic write.
   */
  private mutate<T>(change: (data: PrefsFile, unchanged: () => void) => T): Promise<T> {
    const run = this.queue.then(() => withLock(this.path, () => this.mutateNow(change)));
    this.queue = run.catch(() => {});
    return run;
  }

  private async mutateNow<T>(change: (data: PrefsFile, unchanged: () => void) => T): Promise<T> {
    const found = await readFile(this.path);
    if (found === 'broken') await setAside(this.path);
    // A broken file falls back to a copy of what this process holds: a failed save must not have changed it.
    const data = typeof found === 'object' ? found : found === 'missing' ? fresh() : structuredClone(this.data);
    if (found === 'broken' && blockedBy.has(this.data)) blockedBy.set(data, blockedBy.get(this.data)!);
    const blocked = blockedBy.get(data);
    if (blocked) throw new Error(`${this.path} is ${blocked} — not changed`);
    let write = true;
    const result = change(data, () => (write = false));
    if (!write) return result;
    data.version = data.mode === 'viewer' ? VIEWER_VERSION : PREFS_VERSION;
    data.autoRw = [];
    // Durable first: readers in this process see the change only once it is on disk.
    await this.write(data);
    this.data = data;
    return result;
  }

  /**
   * Written to a temporary file and renamed over the old one, so no reader sees half of it.
   * Mode 0600 in a directory created 0700: the file holds password hashes. A symlinked file is
   * written at its target, so the link stays.
   */
  private async write(data: PrefsFile): Promise<void> {
    const target = await realpath(this.path).catch(() => this.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const tmp = `${target}.${process.pid}.${++tmpSeq}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(onDisk(data), null, 2) + '\n', { mode: 0o600 });
      await rename(tmp, target);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  get settings(): Settings {
    return { ...this.data.settings };
  }

  /**
   * Change some settings, and the instance mode when `patch.mode` is `workspace` or `viewer`, in one
   * write; unknown keys and values of the wrong type are ignored.
   */
  async updateSettings(patch: Record<string, unknown>): Promise<Settings> {
    await this.mutate((data) => {
      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
        const ok = validSetting(key, patch[key]);
        if (ok !== undefined) data.settings[key] = ok as never;
      }
      if (patch.mode === 'viewer') data.mode = 'viewer';
      if (patch.mode === 'workspace') data.mode = undefined;
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
    return { allow: [...this.data.access.allow], users: { ...this.data.access.users }, hostNames: [...this.data.access.hostNames] };
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

  /** The instance mode as the file holds it now; a blocked file (newer or malformed) is a Viewer. */
  mode(): InstanceMode {
    this.refresh();
    return this.data.mode === 'viewer' || blockedBy.has(this.data) ? 'viewer' : 'workspace';
  }

  /** Set the instance mode: Viewer writes the file as version 3, workspace as version 2. */
  async setMode(mode: InstanceMode): Promise<InstanceMode> {
    await this.mutate((data) => {
      data.mode = mode === 'viewer' ? 'viewer' : undefined;
    });
    return this.mode();
  }

  /** The auto-rw paths. */
  get autoRw(): string[] {
    return [...this.data.autoRwRules];
  }

  /**
   * Why the file as it is now grants no writes and takes no changes — newer or malformed — or null.
   * While it is set, no root is writable.
   */
  accessBlocked(): string | null {
    this.refresh();
    return blockedBy.get(this.data) ?? null;
  }

  /**
   * Is a folder writable by an auto-rw path — one of them or under one, with the setting on? A
   * path written through a symlink (`/tmp` → `/private/tmp` on macOS) counts as its target too.
   */
  autoRwCovers(dir: string): boolean {
    this.refresh();
    return autoCovers(this.data, dir);
  }

  /** Replace the auto-rw paths. */
  async setAutoRw(paths: string[]): Promise<string[]> {
    await this.mutate((data) => {
      data.autoRwRules = [...paths];
    });
    return this.autoRw;
  }

  /** The Agent Bus settings as the file holds them now. */
  get agentBus(): AgentBusConfig {
    this.refresh();
    const { control, enabled: stored, ...rest } = this.data.agentBus;
    // `auto` is looked at every time: the daemon may be installed, or stopped, while mdhouse runs.
    const enabled = stored === 'auto' ? (isUrl(rest.socket) ? true : rest.socket ? existsSync(rest.socket) : accountSocket().found) : stored;
    return { ...rest, enabled, stored, default: [...rest.default], filter: [...rest.filter], control: control === 'off' ? 'off' : [...control] };
  }

  /** Change the Agent Bus settings. */
  async setAgentBus(patch: Partial<Omit<AgentBusConfig, 'enabled' | 'stored'>> & { enabled?: boolean | 'auto' }): Promise<AgentBusConfig> {
    await this.mutate((data) => {
      data.agentBus = { ...data.agentBus, ...patch };
    });
    return this.agentBus;
  }

  /** Replace the allow list. */
  async setAllow(allow: string[]): Promise<AccessConfig> {
    await this.mutate((data) => {
      data.access.allow = [...allow];
    });
    return this.access;
  }

  /** Replace the host names. */
  async setHostNames(names: string[]): Promise<AccessConfig> {
    await this.mutate((data) => {
      data.access.hostNames = [...names];
    });
    return this.access;
  }

  /** The host names as the file holds them now. */
  currentHostNames(): string[] {
    this.refresh();
    return [...this.data.access.hostNames];
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
    return this.data.saved.some((d) => d === dir || real(d) === dir);
  }

  /** Saved writable: mdhouse may write to it on every start — also when written through a symlink. */
  isWritableSaved(dir: string): boolean {
    return storedMode(this.data, dir) === 'rw';
  }

  /** The stored mode of a saved directory — also when asked through a saved symlink — or undefined when unsaved. */
  savedMode(dir: string): AccessMode | undefined {
    return storedMode(this.data, dir);
  }

  /**
   * Save a directory. `rw` saves it writable and `ro` read-only; `null` — `-p` without `--rw` —
   * takes saved write access away and keeps a read-only choice. True when it was not saved before.
   */
  addSaved(dir: string, mode: 'rw' | 'ro' | null = null): Promise<boolean> {
    return this.mutate((data) => {
      const isNew = !data.saved.includes(dir);
      if (isNew) data.saved = [...data.saved, dir].sort();
      data.writable = data.writable.filter((d) => !sameDir(d, dir));
      if (mode !== null) data.readonly = data.readonly.filter((d) => !sameDir(d, dir));
      if (mode === 'rw') data.writable = [...data.writable, dir].sort();
      if (mode === 'ro') data.readonly = [...data.readonly, dir].sort();
      return isNew;
    });
  }

  /** Forget a saved directory, its access choice and its name; true when it was saved. */
  removeSaved(dir: string): Promise<boolean> {
    return this.mutate((data) => {
      if (!data.saved.includes(dir)) return false;
      data.saved = data.saved.filter((d) => d !== dir);
      data.writable = data.writable.filter((d) => d !== dir);
      data.readonly = data.readonly.filter((d) => d !== dir);
      pruneNames(data);
      // its Agent Bus settings go with it; a malformed map stays as it is
      const map = spaceMap(data);
      if (map && Object.hasOwn(map, real(dir))) putSpaceAb(data, dir, { endpoint: null, default: null });
      return true;
    });
  }

  /** A saved directory's own Agent Bus settings, credential included — for the server only. `{}` when none; null when malformed. */
  spaceAb(dir: string): SpaceAb | null {
    this.refresh();
    return spaceAbOf(this.data, dir);
  }

  /**
   * Commits `next` as a saved directory's Agent Bus settings (see `putSpaceAb`). `guard` sees the file
   * and the directory's settings under the lock first; a reason it returns refuses, writing nothing.
   * Returns the reason, or null. Throws, changing nothing, when the file or its map is unreadable.
   */
  async commitSpaceAb(
    dir: string,
    next: { endpoint: string | null; default: string[] | null },
    guard: (fresh: PolicyView, ab: SpaceAbPublic) => string | null,
  ): Promise<string | null> {
    try {
      await this.mutate((data) => {
        const why = guard(viewOf(data, dir), publicSpaceAb(spaceAbOf(data, dir)));
        if (why !== null) throw new Refused(why);
        putSpaceAb(data, dir, next);
      });
      return null;
    } catch (err) {
      if (err instanceof Refused) return err.reason;
      throw err;
    }
  }

  /**
   * Saves `dir` (canonical) in one write: saved, its mode (`inherit`: neither list), its name
   * (`null`: none) and, when given, its Agent Bus settings (see `putSpaceAb`). `guard` sees the file as it is under the lock, before anything changes; a reason
   * it returns refuses the save, writing nothing. Returns that reason, or null once saved.
   */
  async saveRoot(
    dir: string,
    values: { mode: AccessMode; name: string | null; ab?: { endpoint: string | null; default: string[] | null } },
    guard: (fresh: PolicyView, ab: SpaceAbPublic) => string | null,
  ): Promise<string | null> {
    try {
      await this.mutate((data) => {
        const why = guard(viewOf(data, dir), publicSpaceAb(spaceAbOf(data, dir)));
        if (why !== null) throw new Refused(why);
        data.saved = [...data.saved, dir].sort();
        data.writable = data.writable.filter((d) => !sameDir(d, dir));
        data.readonly = data.readonly.filter((d) => !sameDir(d, dir));
        if (values.mode === 'rw') data.writable = [...data.writable, dir].sort();
        if (values.mode === 'ro') data.readonly = [...data.readonly, dir].sort();
        if (values.name === null) delete data.names[real(dir)];
        else data.names[real(dir)] = values.name;
        pruneNames(data);
        if (values.ab) putSpaceAb(data, dir, values.ab);
      });
      return null;
    } catch (err) {
      if (err instanceof Refused) return err.reason;
      throw err;
    }
  }

  /**
   * Runs `guard` on the file as it is now, under the lock, for `dir` (canonical), and returns what it
   * says. Reads only: never sets a broken file aside, migrates or writes, and leaves this process's
   * copy as it was. Throws for a broken or blocked file.
   */
  check(dir: string, guard: (fresh: PolicyView, ab: SpaceAbPublic) => string | null): Promise<string | null> {
    const run = this.queue.then(() =>
      withLock(this.path, async () => {
        const found = await readFile(this.path);
        if (found === 'broken') throw new Error(`${this.path} could not be read — not changed`);
        const data = found === 'missing' ? fresh() : found;
        const blocked = blockedBy.get(data);
        if (blocked) throw new Error(`${this.path} is ${blocked} — not changed`);
        return guard(viewOf(data, dir), publicSpaceAb(spaceAbOf(data, dir)));
      }),
    );
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * Commits an explicit mode for `dir` (canonical). `guard` sees the file under the lock first; a
   * reason it returns refuses, writing nothing. A saved directory's mode is written to the file; an
   * unsaved one's file is left as it is — its mode lives in memory. Returns the reason, or null.
   * Throws, changing nothing, when the file is blocked or cannot be written.
   */
  async commitMode(dir: string, mode: 'rw' | 'ro', guard: (fresh: PolicyView) => string | null): Promise<string | null> {
    try {
      await this.mutate((data, unchanged) => {
        const why = guard(viewOf(data, dir));
        if (why !== null) throw new Refused(why);
        const entry = savedEntry(data.saved, dir);
        if (entry === undefined) return unchanged();
        data.writable = data.writable.filter((d) => !sameDir(d, dir));
        data.readonly = data.readonly.filter((d) => !sameDir(d, dir));
        if (mode === 'rw') data.writable = [...data.writable, entry].sort();
        else data.readonly = [...data.readonly, entry].sort();
      });
      return null;
    } catch (err) {
      if (err instanceof Refused) return err.reason;
      throw err;
    }
  }

  /** The human name of a saved directory, by its canonical path — also when asked through a saved symlink. */
  savedName(dir: string): string | undefined {
    const entry = savedEntry(this.data.saved, dir);
    return entry === undefined ? undefined : this.data.names[real(entry)];
  }

  /**
   * Set (a normalized name) or clear (`null`) the human name of a saved directory. False, changing
   * nothing, when the directory is not saved: an unsaved root's name is not kept here.
   */
  setSavedName(dir: string, name: string | null): Promise<boolean> {
    return this.mutate((data) => {
      const entry = savedEntry(data.saved, dir);
      if (entry === undefined) return false;
      if (name === null) delete data.names[real(entry)];
      else data.names[real(entry)] = name;
      pruneNames(data);
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
