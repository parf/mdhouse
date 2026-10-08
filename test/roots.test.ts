import { describe, expect, test } from 'bun:test';
import { Registry, ReadOnlyError } from '../src/lib/roots';

const HERE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('read-only by default', () => {
  test('a root is read-only unless --rw was passed', async () => {
    expect((await Registry.create([HERE])).list()[0]!.writable).toBe(false);
    expect((await Registry.create([HERE], true)).list()[0]!.writable).toBe(true);
  });

  test('writeFile refuses a read-only root', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;

    await expect(registry.writeFile(`${root.id}/README.md`, 'nope')).rejects.toThrow(ReadOnlyError);
  });

  test('writeFile refuses a path outside every root, writable or not', async () => {
    const registry = await Registry.create([HERE], true);
    const id = registry.list()[0]!.id;

    await expect(registry.writeFile(`${id}/../../../tmp/nope.md`, 'nope')).rejects.toThrow();
  });
});

describe('path jail', () => {
  test('rejects traversal out of the root', async () => {
    const registry = await Registry.create([HERE]);
    const id = registry.list()[0]!.id;

    expect(await registry.resolve(`${id}/../../../etc/passwd`)).toBeNull();
    expect(await registry.resolve(`${id}/..`)).toBeNull();
    expect(await registry.resolve(`${id}/src/\0evil`)).toBeNull();
    expect(await registry.resolve('nosuchroot/README.md')).toBeNull();
  });

  test('resolves a real file inside the root', async () => {
    const registry = await Registry.create([HERE]);
    const id = registry.list()[0]!.id;

    const loc = await registry.resolve(`${id}/README.md`);
    expect(loc?.rel).toBe('README.md');
    expect(loc?.abs).toBe(`${HERE}/README.md`);
  });
});

describe('document URLs', () => {
  test('the root id always leads, also with one root', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;

    expect(registry.docUrl(root, 'Plans/TODO.md')).toBe(`/${root.id}/Plans/TODO.md`);
    expect((await registry.fromDocUrl(`/${root.id}/README.md`))?.rel).toBe('README.md');
    expect((await registry.fromDocUrl(`${root.id}/README.md`))?.rel).toBe('README.md');
    // Without a root id it is no page.
    expect(await registry.fromDocUrl('/README.md')).toBeNull();
    expect(await registry.fromDocUrl('/nosuchroot/README.md')).toBeNull();
  });

  test('the old /d/ forms still read: single-root /d/<rel>, and /d/<rootId>/<rel>', async () => {
    const registry = await Registry.create([HERE, `${HERE}/src`]);
    const [mine, nested] = registry.list();

    expect(registry.docUrl(mine!, 'README.md')).toBe(`/${mine!.id}/README.md`);
    expect(registry.docUrl(nested!, 'lib/roots.ts')).toBe('/src/lib/roots.ts');
    expect((await registry.fromDocUrl('/d/README.md'))?.root.id).toBe(mine!.id);
    const resolved = await registry.fromDocUrl('/d/src/lib/roots.ts');
    expect(resolved?.root.id).toBe('src');
    expect(resolved?.rel).toBe('lib/roots.ts');
    // A leading root id that leads nowhere is a folder of the first root.
    expect((await registry.fromDocUrl('/d/src/nope.ts'))?.root.id).toBe(mine!.id);
  });

  test('URL-encoded segments survive the round trip', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;
    const url = registry.docUrl(root, 'a b/c#d.md');

    expect(url).toBe(`/${root.id}/a%20b/c%23d.md`);
    expect((await registry.fromDocUrl(url))?.rel).toBe('a b/c#d.md');
  });

  test('a root id never takes a reserved name — suffixed as a clash is', async () => {
    const { mkdtemp, mkdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-reserved-'));
    try {
      for (const name of ['api', 'settings', 'd', 'ws', 'vendor']) await mkdir(join(base, name));
      const registry = await Registry.create(['api', 'settings', 'd', 'ws', 'vendor'].map((n) => join(base, n)));
      expect(registry.list().map((r) => r.id)).toEqual(['api-2', 'settings-2', 'd-2', 'ws-2', 'vendor-2']);
      expect(registry.list().map((r) => r.name)).toEqual(['api', 'settings', 'd', 'ws', 'vendor']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('adding a root at runtime', () => {
  test('a new directory joins the registry and keeps the old one', async () => {
    const registry = await Registry.create([`${HERE}/src`]);
    const added = await registry.add(`${HERE}/test`);

    expect(registry.list().map((r) => r.path)).toEqual([`${HERE}/src`, `${HERE}/test`]);
    expect(added.id).toBe('test');
    // The first root stays the default, so URLs handed out before the addition still resolve.
    expect(registry.defaultRoot().path).toBe(`${HERE}/src`);
  });

  test('asking for a directory already served returns the root it already has', async () => {
    const registry = await Registry.create([`${HERE}/src`]);
    const again = await registry.add(`${HERE}/src`);

    expect(registry.list()).toHaveLength(1);
    expect(again.id).toBe(registry.list()[0]!.id);
  });

  test('a second directory of the same name gets its own id', async () => {
    const registry = await Registry.create([`${HERE}/src/lib`]);
    const other = await registry.add(`${HERE}/src/ui`);
    const clash = await registry.add(`${HERE}/test`);

    expect(other.id).toBe('ui');
    expect(clash.id).toBe('test');
    expect(new Set(registry.list().map((r) => r.id)).size).toBe(3);
  });

  test('writability is per root, not per process', async () => {
    const registry = await Registry.create([`${HERE}/src`]);
    const writable = await registry.add(`${HERE}/test`, true);

    expect(registry.list()[0]!.writable).toBe(false);
    expect(writable.writable).toBe(true);
  });
});

describe('the path jail and symlinks', () => {
  const tmp = `${HERE}/.tmp-jail-test`;
  const mk = async () => {
    const { mkdir, rm, symlink, writeFile } = await import('node:fs/promises');
    await rm(tmp, { recursive: true, force: true });
    await mkdir(`${tmp}/root`, { recursive: true });
    await mkdir(`${tmp}/outside`, { recursive: true });
    await writeFile(`${tmp}/outside/secret.md`, 'not yours\n');
    await symlink(`${tmp}/outside`, `${tmp}/root/ext`);
    return async () => rm(tmp, { recursive: true, force: true });
  };

  test('a symlink out of the root is refused, for a file that exists', async () => {
    const clean = await mk();
    try {
      const registry = await Registry.create([`${tmp}/root`], true);
      expect(await registry.resolve('root/ext/secret.md')).toBeNull();
    } finally {
      await clean();
    }
  });

  test('and for one that does not exist yet — the case a write would create', async () => {
    // realpath cannot answer for a path that is not there, and trusting the spelling instead
    // let `root/ext/new.md` read as inside the root while landing in /outside. The jail has to
    // resolve the nearest ancestor that does exist.
    const clean = await mk();
    try {
      const registry = await Registry.create([`${tmp}/root`], true);
      expect(await registry.resolve('root/ext/new.md')).toBeNull();
      await expect(registry.writeFile('root/ext/new.md', 'escaped')).rejects.toThrow();
      expect(await Bun.file(`${tmp}/outside/new.md`).exists()).toBe(false);
    } finally {
      await clean();
    }
  });

  test('a new file on a real path inside the root still resolves', async () => {
    const clean = await mk();
    try {
      const registry = await Registry.create([`${tmp}/root`], true);
      // Including through directories that do not exist yet — nothing to resolve, but nothing
      // suspicious either.
      expect((await registry.resolve('root/notes/new.md'))?.rel).toBe('notes/new.md');
    } finally {
      await clean();
    }
  });
});

describe('removing a root', () => {
  test('frees its id, and paths under it stop resolving', async () => {
    const registry = await Registry.create([HERE, `${HERE}/src`]);
    const [first, second] = registry.list();

    expect(registry.remove(second!.id)).toBe(true);
    expect(registry.list().map((r) => r.id)).toEqual([first!.id]);
    expect(await registry.resolve(`${second!.id}/cli.ts`)).toBeNull();
    expect(registry.remove(second!.id)).toBe(false);
  });
});

describe('writability per folder', () => {
  test('each folder gets its own, and a served one can be made writable in place', async () => {
    const registry = await Registry.create([
      { path: HERE, writable: true },
      { path: `${HERE}/src`, writable: false },
    ]);
    const [a, b] = registry.list();
    expect([a!.writable, b!.writable]).toEqual([true, false]);

    expect(registry.setWritable(b!.id, true)).toBe(true);
    expect(registry.get(b!.id)!.writable).toBe(true);
    expect(registry.setWritable('nope', true)).toBe(false);
  });
});

describe('writeFile (A3)', () => {
  test('a write cut short leaves the document as it was, not half old and half new', async () => {
    const { mkdtemp, rm, readdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-write-'));
    const before = 'old line\n'.repeat(2500);
    await Bun.write(join(dir, 'doc.md'), before);
    try {
      // a process that may write no file over 12 kB: the 22 kB rewrite fails part way
      const script = `const { Registry } = await import(${JSON.stringify(`${import.meta.dir}/../src/lib/roots.ts`)});
        const r = await Registry.create([{ path: ${JSON.stringify(dir)}, writable: true }]);
        await r.writeFile(r.list()[0].id + '/doc.md', 'new line\\n'.repeat(2500)).catch((e) => console.log('refused', e.code));`;
      const p = Bun.spawn(['bash', '-c', 'ulimit -f 12; exec bun -e "$0"', script], { stdout: 'pipe', stderr: 'pipe' });
      await p.exited;
      expect(await Bun.file(join(dir, 'doc.md')).text()).toBe(before);
      expect((await readdir(dir)).filter((f) => f !== 'doc.md')).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('the file keeps its mode; a symlinked document is written through its link', async () => {
    const { mkdtemp, rm, chmod, stat, symlink, lstat } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-write-'));
    await Bun.write(join(dir, 'a.md'), 'a\n');
    await chmod(join(dir, 'a.md'), 0o640);
    await Bun.write(join(dir, 'real.md'), 'r\n');
    await symlink(join(dir, 'real.md'), join(dir, 'link.md'));
    try {
      const r = await Registry.create([{ path: dir, writable: true }]);
      const id = r.list()[0]!.id;
      await r.writeFile(`${id}/a.md`, 'b\n');
      expect(await Bun.file(join(dir, 'a.md')).text()).toBe('b\n');
      expect((await stat(join(dir, 'a.md'))).mode & 0o777).toBe(0o640);
      await r.writeFile(`${id}/link.md`, 'r2\n');
      expect((await lstat(join(dir, 'link.md'))).isSymbolicLink()).toBe(true);
      expect(await Bun.file(join(dir, 'real.md')).text()).toBe('r2\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
