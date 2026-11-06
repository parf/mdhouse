import { createHash, randomBytes } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { decodeSnapshot, encodeSnapshot, SnapshotError } from './user-session-codec';
import { EMPTY, type Model } from './user-session-model';

/**
 * Session-history snapshots on disk: one file, `sessions.json`, in a directory the caller names.
 *
 * Holds the history model only — no cookie secrets, no authority. Nothing here picks a path,
 * reads a request or is wired to a route. The directory and file must be this process's user's,
 * closed to group and others, and reached without a symlink; anything else is refused, never
 * repaired. A file that is corrupt, unsupported or from a newer mdhouse is refused, never reset or
 * rewritten. Every write replaces the whole file atomically, under a lock and a compare-and-swap on
 * the bytes that were read, so no update is lost.
 */

export const FILE = 'sessions.json';
/** The codec's own budget; a bigger file is refused before it is read. */
export const MAX_BYTES = 16 * 1024 * 1024;
/** How long a write waits for another writer's lock before giving up. */
export const LOCK_WAIT_MS = 2000;

export type StoreErrorCode =
  | 'bad-path'
  | 'missing-dir'
  | 'unsafe-dir'
  | 'unsafe-file'
  | 'unsafe-lock'
  | 'too-large'
  | 'corrupt'
  | 'unsupported'
  | 'newer'
  | 'stale'
  | 'locked'
  | 'revision-overflow'
  | 'io';

/**
 * `unchanged` — nothing was written: the file is as it was. `unknown` — the new file may already
 * be in place: `load()` and inspect before any retry.
 */
export type WriteOutcome = 'unchanged' | 'unknown';

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
    readonly outcome: WriteOutcome = 'unchanged',
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export interface Snapshot {
  /** SHA-256 of the file's bytes; null when there is no file yet. */
  readonly etag: string | null;
  readonly revision: number;
  readonly model: Model;
}

export interface StoreOptions {
  /** An absolute path with no symlink anywhere in it. */
  readonly dir: string;
  /** Create the directory itself (mode 0700) when it is missing; its parent must exist. */
  readonly create?: boolean;
  /** Test seam: runs just after the rename, before the directory is synced. */
  readonly afterRename?: () => void | Promise<void>;
}

const uid = () => process.getuid?.() ?? -1;
const sameNode = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** A protected entry: ours, closed to group and others, one link for a file. */
function protectedStat(st: Stats, kind: 'dir' | 'file'): string | null {
  if (kind === 'dir' ? !st.isDirectory() : !st.isFile()) return `not a ${kind === 'dir' ? 'directory' : 'regular file'}`;
  if (st.uid !== uid()) return 'owned by another user';
  if ((st.mode & 0o077) !== 0) return `mode ${(st.mode & 0o777).toString(8)} is open to group or others`;
  if (kind === 'file' && st.nlink !== 1) return 'has other hard links';
  return null;
}

export class UserSessionStore {
  readonly dir: string;
  readonly path: string;
  readonly #lock: string;
  readonly #afterRename: StoreOptions['afterRename'];
  /** The directory's identity when opened; every operation checks it is still the same one. */
  #id: Stats;
  /** This process's operations, one at a time; a failed one never blocks the next. */
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(dir: string, id: Stats, opts: StoreOptions) {
    this.dir = dir;
    this.path = join(dir, FILE);
    this.#lock = `${this.path}.lock`;
    this.#id = id;
    this.#afterRename = opts.afterRename;
  }

  /** Checks the directory (creating only it, when asked) and returns a store for it. Reads no file. */
  static async open(opts: StoreOptions): Promise<UserSessionStore> {
    const dir = opts.dir;
    if (typeof dir !== 'string' || !isAbsolute(dir) || resolve(dir) !== dir || dir === '/') {
      throw new StoreError('bad-path', `not an absolute, normalized directory path: ${String(dir)}`);
    }
    let st = await lstat(dir).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null;
      throw new StoreError('io', `${dir}: ${err.message}`);
    });
    if (!st) {
      if (!opts.create) throw new StoreError('missing-dir', `${dir} does not exist`);
      const parent = dirname(dir);
      const real = await realpath(parent).catch(() => null);
      if (real !== parent) throw new StoreError('unsafe-dir', `${parent} is missing or reached through a symlink`);
      await mkdir(dir, { mode: 0o700 }).catch((err: NodeJS.ErrnoException) => {
        throw new StoreError('io', `${dir}: ${err.message}`);
      });
      st = await lstat(dir);
    }
    const store = new UserSessionStore(dir, st, opts);
    store.#id = await store.#checkDir();
    return store;
  }

  /** The directory as it is now: the same node, protected, and its own real path. */
  async #checkDir(): Promise<Stats> {
    let fh: FileHandle | undefined;
    try {
      fh = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | NOFOLLOW);
      const st = await fh.stat();
      const bad = protectedStat(st, 'dir');
      if (bad) throw new StoreError('unsafe-dir', `${this.dir}: ${bad}`);
      if (!sameNode(st, this.#id)) throw new StoreError('unsafe-dir', `${this.dir} was replaced`);
      if ((await realpath(this.dir)) !== this.dir) throw new StoreError('unsafe-dir', `${this.dir} is reached through a symlink`);
      return st;
    } catch (err) {
      if (err instanceof StoreError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ELOOP' || code === 'ENOTDIR') throw new StoreError('unsafe-dir', `${this.dir} is a symlink or not a directory`);
      if (code === 'ENOENT') throw new StoreError('missing-dir', `${this.dir} does not exist`);
      throw new StoreError('io', `${this.dir}: ${(err as Error).message}`);
    } finally {
      await fh?.close().catch(() => {});
    }
  }

  /** The current snapshot. A missing file is the empty model at revision 0. */
  load(): Promise<Snapshot> {
    return this.#serial(async () => {
      await this.#checkDir();
      return this.#read();
    });
  }

  /**
   * Writes `next` if the file is still the one `etag` names (null: still no file) — else `stale`
   * and nothing is written. The new revision is the current one + 1.
   */
  save(etag: string | null, next: Model): Promise<Snapshot> {
    return this.#serial(() =>
      this.#locked(async () => {
        const cur = await this.#read();
        if (cur.etag !== etag) throw new StoreError('stale', `${this.path} changed since it was read`);
        return this.#write(cur, next);
      }),
    );
  }

  /** Reads, applies `fn` and writes, all under the lock. `fn` returning its input writes nothing. */
  update(fn: (model: Model) => Model): Promise<Snapshot> {
    return this.#serial(() =>
      this.#locked(async () => {
        const cur = await this.#read();
        const next = fn(cur.model);
        return next === cur.model ? cur : this.#write(cur, next);
      }),
    );
  }

  #serial<T>(op: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(op);
    this.#queue = run.catch(() => {});
    return run;
  }

  /** The file read through one no-follow handle: checked, bounded, hashed and decoded. */
  async #read(): Promise<Snapshot> {
    let fh: FileHandle;
    try {
      fh = await open(this.path, constants.O_RDONLY | NOFOLLOW);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return { etag: null, revision: 0, model: EMPTY };
      if (code === 'ELOOP') throw new StoreError('unsafe-file', `${this.path} is a symlink`);
      throw new StoreError('io', `${this.path}: ${(err as Error).message}`);
    }
    let bytes: Buffer;
    try {
      const st = await fh.stat();
      const bad = protectedStat(st, 'file');
      if (bad) throw new StoreError('unsafe-file', `${this.path}: ${bad}`);
      if (st.size > MAX_BYTES) throw new StoreError('too-large', `${this.path} is larger than ${MAX_BYTES} bytes`);
      bytes = await readBounded(fh, MAX_BYTES);
    } catch (err) {
      if (err instanceof StoreError) throw err;
      throw new StoreError('io', `${this.path}: ${(err as Error).message}`);
    } finally {
      await fh.close().catch(() => {});
    }
    const etag = createHash('sha256').update(bytes).digest('hex');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new StoreError('corrupt', `${this.path} is not UTF-8`);
    }
    try {
      const snap = decodeSnapshot(text);
      return { etag, revision: snap.revision, model: snap.model };
    } catch (err) {
      if (err instanceof SnapshotError) throw new StoreError(err.reason, `${this.path}: ${err.reason} snapshot — not changed`);
      throw new StoreError('io', `${this.path}: ${(err as Error).message}`);
    }
  }

  /**
   * Replaces the file with `next` at `cur.revision + 1`: a new 0600 file in the same directory,
   * synced, renamed over the old one, then the directory synced. A failure before the rename
   * removes the temporary file and leaves the old one as it was (`unchanged`); one after it is
   * `unknown`.
   */
  async #write(cur: Snapshot, next: Model): Promise<Snapshot> {
    if (cur.revision >= Number.MAX_SAFE_INTEGER) throw new StoreError('revision-overflow', `${this.path} is at the last revision`);
    const revision = cur.revision + 1;
    let text: string;
    try {
      text = encodeSnapshot(next, revision);
    } catch (err) {
      if (err instanceof SnapshotError) throw new StoreError(err.reason, `the model cannot be saved: ${err.message}`);
      throw err;
    }
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > MAX_BYTES) throw new StoreError('too-large', `the snapshot is larger than ${MAX_BYTES} bytes`);

    const tmp = join(this.dir, `${FILE}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    let fh: FileHandle | undefined;
    try {
      fh = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      await fh.writeFile(bytes);
      await fh.sync();
      await fh.close();
      fh = undefined;
      await this.#checkDir();
      await rename(tmp, this.path);
    } catch (err) {
      await fh?.close().catch(() => {});
      await unlink(tmp).catch(() => {});
      if (err instanceof StoreError) throw err;
      throw new StoreError('io', `${this.path} not written: ${(err as Error).message}`);
    }
    try {
      await this.#afterRename?.();
      const dh = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | NOFOLLOW);
      try {
        await dh.sync();
      } finally {
        await dh.close();
      }
    } catch (err) {
      throw new StoreError('io', `${this.path} was replaced, but the write may not be durable (${(err as Error).message}) — load() before any retry`, 'unknown');
    }
    return { etag: createHash('sha256').update(bytes).digest('hex'), revision, model: next };
  }

  /**
   * Runs `fn` holding `sessions.json.lock`, created exclusively. Waits up to `LOCK_WAIT_MS` for
   * another holder, then `locked`; a lock that is not a plain protected file of ours is
   * `unsafe-lock`. Never takes over or removes another holder's lock — a crashed holder's lock
   * stays until its owner removes it. Releases only the lock file it created.
   */
  async #locked<T>(fn: () => Promise<T>): Promise<T> {
    await this.#checkDir();
    const deadline = Date.now() + LOCK_WAIT_MS;
    let mine: Stats | undefined;
    for (;;) {
      try {
        const fh = await open(this.#lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
        try {
          await fh.writeFile(`${process.pid}\n`);
          mine = await fh.stat();
        } finally {
          await fh.close();
        }
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw new StoreError('io', `${this.#lock}: ${(err as Error).message}`);
      }
      const st = await lstat(this.#lock).catch(() => null);
      if (st) {
        const bad = st.isSymbolicLink() ? 'is a symlink' : protectedStat(st, 'file');
        if (bad) throw new StoreError('unsafe-lock', `${this.#lock}: ${bad}`);
      }
      if (Date.now() >= deadline) throw new StoreError('locked', `${this.#lock} is held by another writer — remove it only if no mdhouse is writing`);
      await Bun.sleep(5 + Math.random() * 10);
    }
    try {
      return await fn();
    } finally {
      const st = await lstat(this.#lock).catch(() => null);
      if (st && mine && sameNode(st, mine)) await unlink(this.#lock).catch(() => {});
    }
  }
}

/** Up to `max` bytes from the handle; more is `too-large` (the file grew after its stat). */
async function readBounded(fh: FileHandle, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  for (;;) {
    const { bytesRead } = await fh.read(buf, 0, buf.length, null);
    if (bytesRead === 0) break;
    size += bytesRead;
    if (size > max) throw new StoreError('too-large', `the file grew past ${max} bytes while being read`);
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks);
}
