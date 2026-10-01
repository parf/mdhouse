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
  test('a single root needs no prefix', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;

    expect(registry.docUrl(root, 'Plans/PRF-55-md-viewer-web/TODO.md')).toBe('/d/Plans/PRF-55-md-viewer-web/TODO.md');
    expect((await registry.fromDocUrl('/d/README.md'))?.rel).toBe('README.md');
  });

  test('several roots are told apart by a leading segment', async () => {
    const registry = await Registry.create([HERE, `${HERE}/src`]);
    const [mine, nested] = registry.list();

    expect(registry.docUrl(mine!, 'README.md')).toBe('/d/mdhouse/README.md');
    expect(registry.docUrl(nested!, 'lib/roots.ts')).toBe('/d/src/lib/roots.ts');

    const resolved = await registry.fromDocUrl('/d/src/lib/roots.ts');
    expect(resolved?.root.id).toBe('src');
    expect(resolved?.rel).toBe('lib/roots.ts');
  });

  test('URL-encoded segments survive the round trip', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;
    const url = registry.docUrl(root, 'a b/c#d.md');

    expect(url).toBe('/d/a%20b/c%23d.md');
    expect((await registry.fromDocUrl(url))?.rel).toBe('a b/c#d.md');
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
