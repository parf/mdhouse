/**
 * Machine state for scheduled runs (MW.11): this instance's approvals of registration files and its run index.
 * Machine data ([№DATA-W1](../../Plans/R3/workspaces/DECISIONS.md#DATA-W1)): `$XDG_STATE_HOME/mdhouse/` (default
 * `~/.local/state/mdhouse/`), never the project and never `prefs.json`. Each file is one JSON object, written whole
 * (a temp file renamed over it), 0600 in a 0700 folder, one write at a time.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Approval, AutoStore } from './automation';

/** Where this login's mdhouse keeps machine state. */
export const stateDir = (env: Record<string, string | undefined> = process.env): string => join(env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'mdhouse');

/** One JSON object on disk, read once, written whole after each change. */
class JsonFile<T extends object> {
  private data: Promise<T> | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    readonly path: string,
    private readonly empty: () => T,
  ) {}

  read(): Promise<T> {
    this.data ??= readFile(this.path, 'utf8').then(
      (text) => {
        const v = JSON.parse(text) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : this.empty();
      },
      (err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? this.empty() : Promise.reject(err)),
    );
    return this.data;
  }

  /** Applies `change` and writes the result; changes run one after another. */
  update<R>(change: (data: T) => R): Promise<R> {
    const next = this.tail.then(async () => {
      const data = await this.read();
      const out = change(data);
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data) + '\n', { mode: 0o600 });
      await chmod(tmp, 0o600);
      await rename(tmp, this.path);
      return out;
    });
    this.tail = next.catch(() => {});
    return next;
  }
}

/** The run index's store (`RunIndex`) in one file. */
export function fileStore(path: string): AutoStore {
  const file = new JsonFile<Record<string, unknown>>(path, () => ({}));
  return {
    get: async (k) => {
      const d = await file.read();
      return Object.hasOwn(d, k) ? structuredClone(d[k]) : null;
    },
    put: (k, v) => file.update((d) => void (d[k] = structuredClone(v))),
    keys: async (p) => Object.keys(await file.read()).filter((k) => k.startsWith(p)).sort(),
    del: (k) => file.update((d) => void delete d[k]),
  };
}

/** This machine's approval of one registration file: its exact content, and the bus schedule made for it. */
export interface Approved {
  hash: string;
  scheduleId: string;
  at: string;
  by: string;
}

/**
 * Approvals by project folder (real path) and registration id
 * ([№Q-R3-AUTO2](../../Plans/R3/workspaces/DECISIONS.md#Q-R3-AUTO2)): a firing runs only for the schedule made at
 * approval and while the file's content hash is still the approved one.
 */
export class Approvals {
  private readonly file: JsonFile<Record<string, Approved>>;

  constructor(path: string) {
    this.file = new JsonFile(path, () => ({}));
  }

  private key = (rootPath: string, id: string): string => `${rootPath}\0${id}`;

  async get(rootPath: string, id: string): Promise<Approved | null> {
    const d = await this.file.read();
    const k = this.key(rootPath, id);
    return Object.hasOwn(d, k) ? { ...d[k]! } : null;
  }

  set(rootPath: string, id: string, a: Approved): Promise<void> {
    return this.file.update((d) => void (d[this.key(rootPath, id)] = a));
  }

  /** Withdraws it; returns what it was. */
  drop(rootPath: string, id: string): Promise<Approved | null> {
    return this.file.update((d) => {
      const k = this.key(rootPath, id);
      const was = Object.hasOwn(d, k) ? d[k]! : null;
      delete d[k];
      return was;
    });
  }

  /** `AutoDeps.approval`: the project's folder by root id; an unknown root is never approved. */
  check(rootPath: (rootId: string) => string | null): Approval {
    return async (ask) => {
      const path = rootPath(ask.rootId);
      const a = path === null ? null : await this.get(path, ask.registration);
      return !!a && a.hash === ask.hash && a.scheduleId === ask.scheduleId;
    };
  }
}
