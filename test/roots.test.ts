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
