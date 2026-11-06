import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeSnapshot, SNAPSHOT_VERSION } from '../src/lib/user-session-codec';
import { addUser, applyGeo, EMPTY, revokeSession, setStatus, startSession, touch, userKey, type Model } from '../src/lib/user-session-model';
import { FILE, MAX_BYTES, StoreError, UserSessionStore, type StoreErrorCode } from '../src/lib/user-session-store';

const ROOT = mkdtempSync(join(tmpdir(), 'mdhouse-store-'));
afterAll(() => {
  // A test may leave a directory read-only; open it up so the whole root can go.
  for (const e of readdirSync(ROOT, { recursive: true, withFileTypes: true })) {
    if (e.isDirectory()) chmodSync(join(e.parentPath, e.name), 0o700);
  }
  rmSync(ROOT, { recursive: true, force: true });
});

let n = 0;
let dir: string;
beforeEach(() => {
  dir = join(ROOT, `d${++n}`);
  mkdirSync(dir, { mode: 0o700 });
});

const file = () => join(dir, FILE);
const bytes = () => readFileSync(file());
const leftovers = () => readdirSync(dir).filter((f) => f !== FILE);
const A = userKey('github', 1);
const B = userKey('github', 2);
const T = 1_700_000_000_000;

async function refused(p: Promise<unknown>): Promise<StoreError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StoreError);
  return err as StoreError;
}

/** A model with every kind of record: removed user, revoked sessions, IP lookups pending/none/found, history and UA. */
function richModel(): Model {
  let m = addUser(addUser(EMPTY, A), B);
  m = startSession(m, A, 'session-a-0000000001', T, 'US');
  m = startSession(m, A, 'session-a-0000000002', T, null);
  m = revokeSession(m, A, 'session-a-0000000002', 'self', T + 1);
  const r1 = touch(m, { user: A, session: 'session-a-0000000001', route: 'allowed', ip: '8.8.8.8', ua: 'UA/1', now: T + 2 });
  if (!r1.ok || !r1.lookup) throw new Error('setup');
  m = applyGeo(r1.model, r1.lookup, { ip: '8.8.8.8', city: 'Mountain View', state: 'California', country: 'US', countryName: 'United States', isp: 'Google LLC', org: 'Google LLC', asn: 15169, asnLabel: null, source: 'ipwho.is' }, T + 3).model;
  const r2 = touch(m, { user: A, session: 'session-a-0000000001', route: 'allowed', ip: '1.1.1.1', ua: 'UA/2', now: T + 4 });
  if (!r2.ok) throw new Error('setup');
  m = r2.model; // 1.1.1.1 stays pending
  const r3 = touch(m, { user: A, session: 'session-a-0000000001', route: 'allowed', ip: '9.9.9.9', ua: 'UA/3', now: T + 5 });
  if (!r3.ok || !r3.lookup) throw new Error('setup');
  m = applyGeo(r3.model, r3.lookup, null, T + 6).model; // 9.9.9.9 → none
  m = startSession(m, B, 'session-b-0000000001', T, 'DE');
  m = setStatus(m, B, 'removed', T + 7);
  return m;
}

describe('open — the directory', () => {
  test('a relative, unnormalized or root path is refused', async () => {
    for (const d of ['rel/dir', `${ROOT}/x/../y`, `${ROOT}/x/`, '/']) expect((await refused(UserSessionStore.open({ dir: d }))).code).toBe('bad-path');
  });

  test('missing: refused unless asked to create it; created 0700, only the leaf', async () => {
    const d = join(dir, 'new');
    expect((await refused(UserSessionStore.open({ dir: d }))).code).toBe('missing-dir');
    expect(existsSync(d)).toBe(false);
    await UserSessionStore.open({ dir: d, create: true });
    expect(statSync(d).mode & 0o777).toBe(0o700);
    expect((await refused(UserSessionStore.open({ dir: join(dir, 'no', 'leaf'), create: true }))).code).toBe('unsafe-dir');
    expect(existsSync(join(dir, 'no'))).toBe(false);
  });

  test('a directory open to group/others is refused and never chmod-ed', async () => {
    chmodSync(dir, 0o750);
    expect((await refused(UserSessionStore.open({ dir }))).code).toBe('unsafe-dir');
    expect(statSync(dir).mode & 0o777).toBe(0o750);
  });

  test('a symlink as the directory, or anywhere in its path, is refused', async () => {
    const real = join(dir, 'real');
    mkdirSync(real, { mode: 0o700 });
    symlinkSync(real, join(dir, 'link'));
    expect((await refused(UserSessionStore.open({ dir: join(dir, 'link') }))).code).toBe('unsafe-dir');
    mkdirSync(join(real, 'inner'), { mode: 0o700 });
    expect((await refused(UserSessionStore.open({ dir: join(dir, 'link', 'inner') }))).code).toBe('unsafe-dir');
    expect((await refused(UserSessionStore.open({ dir: join(dir, 'link', 'made'), create: true }))).code).toBe('unsafe-dir');
  });

  test('a regular file as the directory is refused', async () => {
    writeFileSync(join(dir, 'f'), '');
    expect((await refused(UserSessionStore.open({ dir: join(dir, 'f') }))).code).toBe('unsafe-dir');
  });

  test('a directory replaced after open is refused', async () => {
    const s = await UserSessionStore.open({ dir });
    renameSync(dir, `${dir}-old`);
    mkdirSync(dir, { mode: 0o700 });
    expect((await refused(s.load())).code).toBe('unsafe-dir');
    expect((await refused(s.update(() => addUser(EMPTY, A)))).code).toBe('unsafe-dir');
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('load and round trip', () => {
  test('no file: the empty model at revision 0, nothing created', async () => {
    const s = await UserSessionStore.open({ dir });
    expect(await s.load()).toEqual({ etag: null, revision: 0, model: EMPTY });
    expect(readdirSync(dir)).toEqual([]);
  });

  test('every record survives: removed user, revoked sessions, pending/none/found lookups, history, UA', async () => {
    const m = richModel();
    const s = await UserSessionStore.open({ dir });
    const saved = await s.update(() => m);
    expect(saved.revision).toBe(1);
    const st = lstatSync(file());
    expect(st.mode & 0o777).toBe(0o600);
    expect(saved.etag).toBe(createHash('sha256').update(bytes()).digest('hex'));
    const again = await (await UserSessionStore.open({ dir })).load();
    expect(again).toEqual({ etag: saved.etag, revision: 1, model: m });
    expect(again.model[B]!.status).toBe('removed');
    expect(again.model[A]!.sessions.map((x) => x.revokedBy)).toEqual([null, 'self']);
    expect(again.model[A]!.ips.map((x) => x.geo?.state)).toEqual(['none', 'pending', 'found']);
    expect(leftovers()).toEqual([]);
  });

  test('update returning its input writes nothing', async () => {
    const s = await UserSessionStore.open({ dir });
    expect(await s.update((x) => x)).toEqual({ etag: null, revision: 0, model: EMPTY });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('unsafe or unreadable files are refused, never rewritten', () => {
  async function seeded() {
    const s = await UserSessionStore.open({ dir });
    await s.update(() => addUser(EMPTY, A));
    return s;
  }

  test('a symlink, hard link, open mode or directory in place of the file', async () => {
    const s = await seeded();
    const before = bytes();
    chmodSync(file(), 0o644);
    expect((await refused(s.load())).code).toBe('unsafe-file');
    expect((await refused(s.update(() => EMPTY))).code).toBe('unsafe-file');
    chmodSync(file(), 0o600);

    linkSync(file(), join(dir, 'alias'));
    expect((await refused(s.load())).code).toBe('unsafe-file');
    rmSync(join(dir, 'alias'));

    renameSync(file(), join(dir, 'target'));
    symlinkSync(join(dir, 'target'), file());
    expect((await refused(s.load())).code).toBe('unsafe-file');
    expect((await refused(s.update(() => EMPTY))).code).toBe('unsafe-file');
    expect(lstatSync(file()).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(dir, 'target'))).toEqual(before);

    rmSync(file());
    mkdirSync(file(), { mode: 0o700 });
    expect((await refused(s.load())).code).toBe('unsafe-file');
  });

  const cases: [string, () => Buffer | string, StoreErrorCode][] = [
    ['newer version', () => JSON.stringify({ version: SNAPSHOT_VERSION + 1, revision: 3, model: {} }), 'newer'],
    ['unsupported version', () => JSON.stringify({ version: 0, revision: 3, model: {} }), 'unsupported'],
    ['corrupt JSON', () => '{"version":1,', 'corrupt'],
    ['not UTF-8', () => Buffer.from([0xff, 0xfe, 0x00]), 'corrupt'],
    ['empty', () => '', 'corrupt'],
  ];
  for (const [name, content, code] of cases) {
    test(`${name}: load, update and save refuse; the bytes stay`, async () => {
      writeFileSync(file(), content(), { mode: 0o600 });
      const before = bytes();
      const s = await UserSessionStore.open({ dir });
      expect((await refused(s.load())).code).toBe(code);
      const u = await refused(s.update(() => addUser(EMPTY, A)));
      expect([u.code, u.outcome]).toEqual([code, 'unchanged']);
      expect((await refused(s.save(null, addUser(EMPTY, A)))).code).toBe(code);
      expect(bytes()).toEqual(before);
      expect(leftovers()).toEqual([]);
    });
  }

  test('a file over the size budget is refused before reading', async () => {
    writeFileSync(file(), '', { mode: 0o600 });
    truncateSync(file(), MAX_BYTES + 1);
    const s = await UserSessionStore.open({ dir });
    expect((await refused(s.load())).code).toBe('too-large');
    expect(statSync(file()).size).toBe(MAX_BYTES + 1);
  });
});

describe('writes', () => {
  test('stale: a save against bytes that changed is refused; the newer data stays', async () => {
    const s1 = await UserSessionStore.open({ dir });
    const s2 = await UserSessionStore.open({ dir });
    const seen = await s1.load();
    await s2.update((m) => addUser(m, B));
    const theirs = bytes();
    const err = await refused(s1.save(seen.etag, addUser(seen.model, A)));
    expect([err.code, err.outcome]).toEqual(['stale', 'unchanged']);
    expect(bytes()).toEqual(theirs);
    const now = await s1.load();
    const ok = await s1.save(now.etag, addUser(now.model, A));
    expect(ok.revision).toBe(2);
    expect(Object.keys(ok.model).sort()).toEqual([A, B]);
  });

  test('concurrent writers through two stores and one store: every update lands', async () => {
    const s1 = await UserSessionStore.open({ dir });
    const s2 = await UserSessionStore.open({ dir });
    const keys = Array.from({ length: 30 }, (_, i) => userKey('github', 100 + i));
    await Promise.all(keys.map((k, i) => (i % 2 ? s1 : s2).update((m) => addUser(m, k))));
    const end = await s1.load();
    expect(end.revision).toBe(30);
    expect(Object.keys(end.model).sort()).toEqual([...keys].sort());
    expect(leftovers()).toEqual([]);
  });

  test('a failure before the rename leaves the old bytes and no temporary file', async () => {
    const s = await UserSessionStore.open({ dir });
    await s.update(() => addUser(EMPTY, A));
    const before = bytes();
    chmodSync(dir, 0o500);
    try {
      const err = await refused(s.update((m) => addUser(m, B)));
      expect(err.outcome).toBe('unchanged');
    } finally {
      chmodSync(dir, 0o700);
    }
    expect(bytes()).toEqual(before);
    expect(leftovers()).toEqual([]);
  });

  test('a model the codec rejects writes nothing', async () => {
    const s = await UserSessionStore.open({ dir });
    const err = await refused(s.update(() => null as unknown as Model));
    expect(err.outcome).toBe('unchanged');
    expect(readdirSync(dir)).toEqual([]);
  });

  test('a failure after the rename is reported as unknown; load shows what landed', async () => {
    const s = await UserSessionStore.open({
      dir,
      afterRename: () => {
        throw new Error('sync failed');
      },
    });
    const err = await refused(s.update(() => addUser(EMPTY, A)));
    expect([err.code, err.outcome]).toEqual(['io', 'unknown']);
    expect(err.message).toContain('load() before any retry');
    expect((await s.load()).revision).toBe(1);
  });

  test('the last revision is refused, not wrapped', async () => {
    writeFileSync(file(), encodeSnapshot(EMPTY, Number.MAX_SAFE_INTEGER), { mode: 0o600 });
    const before = bytes();
    const s = await UserSessionStore.open({ dir });
    expect((await refused(s.update(() => addUser(EMPTY, A)))).code).toBe('revision-overflow');
    expect(bytes()).toEqual(before);
  });

  test('a throwing update does not block the next one, and releases the lock', async () => {
    const s = await UserSessionStore.open({ dir });
    await expect(
      s.update(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(`${file()}.lock`)).toBe(false);
    expect((await s.update(() => addUser(EMPTY, A))).revision).toBe(1);
  });
});

describe('the lock', () => {
  test('a lock held by someone else: wait, then locked — never taken over or removed', async () => {
    const lock = `${file()}.lock`;
    writeFileSync(lock, '999999\n', { mode: 0o600 });
    const ino = lstatSync(lock).ino;
    const s = await UserSessionStore.open({ dir });
    const t = Date.now();
    const err = await refused(s.update(() => addUser(EMPTY, A)));
    expect(err.code).toBe('locked');
    expect(Date.now() - t).toBeGreaterThanOrEqual(1900);
    expect(lstatSync(lock).ino).toBe(ino);
    expect(existsSync(file())).toBe(false);
  });

  test('a lock that is a symlink, hard link, directory or open to others is refused at once and left alone', async () => {
    const lock = `${file()}.lock`;
    const s = await UserSessionStore.open({ dir });
    const setups: [string, () => void][] = [
      ['symlink', () => symlinkSync(join(dir, 'elsewhere'), lock)],
      ['hard link', () => (writeFileSync(join(dir, 'other'), '', { mode: 0o600 }), linkSync(join(dir, 'other'), lock))],
      ['directory', () => mkdirSync(lock, { mode: 0o700 })],
      ['mode 0644', () => writeFileSync(lock, '', { mode: 0o644 })],
    ];
    for (const [name, make] of setups) {
      make();
      const t = Date.now();
      const err = await refused(s.update(() => addUser(EMPTY, A)));
      expect([name, err.code]).toEqual([name, 'unsafe-lock']);
      expect(Date.now() - t).toBeLessThan(1000);
      expect(existsSync(lock) || lstatSync(lock).isSymbolicLink()).toBe(true);
      rmSync(lock, { recursive: true, force: true });
      rmSync(join(dir, 'other'), { force: true });
    }
    expect(existsSync(file())).toBe(false);
  });
});

describe('returned snapshots are what is on disk', () => {
  type Mutable = Record<string, { status: string }>;

  test('save copies its input at the call: later changes to it reach neither the file nor the result', async () => {
    const s = await UserSessionStore.open({ dir });
    const next = addUser(EMPTY, A) as unknown as Mutable;
    const pending = s.save(null, next as unknown as Model);
    next[A]!.status = 'disabled';
    const saved = await pending;
    next[A]!.status = 'removed';
    expect(saved.model[A]!.status).toBe('enabled');
    expect((await s.load()).model[A]!.status).toBe('enabled');
  });

  test('a returned model is a copy: changing it changes neither the file nor the next load', async () => {
    const s = await UserSessionStore.open({ dir });
    const saved = await s.update(() => addUser(EMPTY, A));
    (saved.model as unknown as Mutable)[A]!.status = 'disabled';
    const loaded = await s.load();
    expect(loaded.model[A]!.status).toBe('enabled');
    (loaded.model as unknown as Mutable)[A]!.status = 'disabled';
    expect((await s.load()).model[A]!.status).toBe('enabled');
  });

  test('update changing its argument in place: written, or refused — never reported as saved when it is not', async () => {
    const s = await UserSessionStore.open({ dir });
    await s.update(() => addUser(EMPTY, A));
    const r = await s
      .update((m) => {
        (m as unknown as Mutable)[A]!.status = 'disabled';
        return m;
      })
      .then(
        (snap) => ({ snap }),
        (err: unknown) => ({ err }),
      );
    const disk = await s.load();
    if ('snap' in r) {
      expect(r.snap.revision).toBe(2);
      expect(r.snap.model[A]!.status).toBe('disabled');
      expect(disk).toEqual(r.snap);
    } else {
      expect(disk.revision).toBe(1);
      expect(disk.model[A]!.status).toBe('enabled');
    }
    expect((await s.update((m) => addUser(m, B))).revision).toBe(disk.revision + 1);
  });

  test('update returning an equal new object writes nothing and returns the file', async () => {
    const s = await UserSessionStore.open({ dir });
    const first = await s.update(() => addUser(EMPTY, A));
    const same = await s.update((m) => JSON.parse(JSON.stringify(m)) as Model);
    expect(same).toEqual(first);
    expect((await s.load()).revision).toBe(1);
  });

  test('save of a model the codec rejects is refused at the call and leaves the queue working', async () => {
    const s = await UserSessionStore.open({ dir });
    const err = await refused(s.save(null, { bad: 1 } as unknown as Model));
    expect(err.outcome).toBe('unchanged');
    expect(readdirSync(dir)).toEqual([]);
    expect((await s.save(null, addUser(EMPTY, A))).revision).toBe(1);
  });
});
