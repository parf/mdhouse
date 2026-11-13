import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { TARGETS, indexUrl, loadTarget, placeholder, saveTarget } from '../src/ui/search-scope';

const store = new Map<string, string>();
const real = (globalThis as { localStorage?: unknown }).localStorage;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
afterEach(() => store.clear());
afterAll(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: real }));

describe('one search, two scopes', () => {
  test('Files and Index, Files first', () => expect(TARGETS.map((t) => t.id)).toEqual(['files', 'index']));
  test('Files until the user picks Index, then remembered', () => {
    expect(loadTarget()).toBe('files');
    saveTarget('index');
    expect(loadTarget()).toBe('index');
    saveTarget('files');
    expect(loadTarget()).toBe('files');
    store.set('mdhouse.search.scope', 'garbage');
    expect(loadTarget()).toBe('files');
  });
  test('an Index search is the existing /rag page, for this project', () => {
    expect(indexUrl('  deploy plan ', 'repo')).toBe('/rag?q=deploy+plan&root=repo');
    expect(indexUrl('', 'repo')).toBe('/rag?root=repo');
  });
  test('each scope says what Enter does', () => {
    expect(placeholder('files')).toBe('Search files and contents');
    expect(placeholder('index')).toMatch(/index — Enter/);
  });
  test('a blocked storage is Files, and saving does not throw', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
    expect(loadTarget()).toBe('files');
    expect(() => saveTarget('index')).not.toThrow();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: real });
  });
});
