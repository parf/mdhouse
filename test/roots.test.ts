import { describe, expect, test } from 'bun:test';
import { Registry, ReadOnlyError, isReadOnlyPath } from '../src/lib/roots';

const HERE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

describe('read-only roots', () => {
  test('/rd and everything under it is read-only', () => {
    expect(isReadOnlyPath('/rd')).toBe(true);
    expect(isReadOnlyPath('/rd/vhosts/realty')).toBe(true);
    expect(isReadOnlyPath('/rdx')).toBe(false); // prefix match must respect the boundary
    expect(isReadOnlyPath('/home/parf/src/mdhouse')).toBe(false);
  });

  test('writeFile refuses a read-only root', async () => {
    const registry = await Registry.create(['/rd/vhosts/realty']);
    const root = registry.list()[0]!;
    expect(root.writable).toBe(false);

    await expect(registry.writeFile(`${root.id}/Plans/README.md`, 'nope')).rejects.toThrow(ReadOnlyError);
  });

  test('--writable opts one tree back in', async () => {
    const registry = await Registry.create(['/rd/vhosts/realty'], ['/rd/vhosts/realty']);
    expect(registry.list()[0]!.writable).toBe(true);
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
    const registry = await Registry.create([HERE, '/rd/vhosts/realty']);
    const [mine, realty] = registry.list();

    expect(registry.docUrl(mine!, 'README.md')).toBe('/d/mdhouse/README.md');
    expect(registry.docUrl(realty!, 'Plans/README.md')).toBe('/d/realty/Plans/README.md');

    const resolved = await registry.fromDocUrl('/d/realty/Plans/README.md');
    expect(resolved?.root.id).toBe('realty');
    expect(resolved?.rel).toBe('Plans/README.md');
  });

  test('URL-encoded segments survive the round trip', async () => {
    const registry = await Registry.create([HERE]);
    const root = registry.list()[0]!;
    const url = registry.docUrl(root, 'a b/c#d.md');

    expect(url).toBe('/d/a%20b/c%23d.md');
    expect((await registry.fromDocUrl(url))?.rel).toBe('a b/c#d.md');
  });
});
