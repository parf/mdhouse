import { describe, expect, test } from 'bun:test';
import type { RootInfo } from '../src/ui/api';
import { groupProjects, removable, selectedProject, writableVia } from '../src/ui/project-groups';

const root = (id: string, extra: Partial<RootInfo> = {}): RootInfo => ({ id, name: id, path: `/p/${id}`, writable: false, ...extra });
const roots = [root('ref', { kind: 'reference' }), root('s1', { saved: true }), root('t1'), root('s2', { saved: true, writable: true })];

describe('project groups', () => {
  test('saved, this session, reference — in that order, each in served order, empty ones left out', () => {
    expect(groupProjects(roots).map((g) => [g.key, g.roots.map((r) => r.id)])).toEqual([
      ['saved', ['s1', 's2']],
      ['session', ['t1']],
      ['reference', ['ref']],
    ]);
    expect(groupProjects([root('only', { saved: true })]).map((g) => g.key)).toEqual(['saved']);
    expect(groupProjects([])).toEqual([]);
  });

  test('selectedProject: the picked one while it is served, else the first listed', () => {
    expect(selectedProject(roots, 't1')?.id).toBe('t1');
    expect(selectedProject(roots, 'gone')?.id).toBe('s1');
    expect(selectedProject(roots, null)?.id).toBe('s1');
    expect(selectedProject([root('ref', { kind: 'reference' })], null)?.id).toBe('ref');
    expect(selectedProject([], 'x')).toBeNull();
  });

  test('the reference is never removable, so the last-project rule counts the others', () => {
    expect(removable(roots).map((r) => r.id)).toEqual(['s1', 't1', 's2']);
    expect(removable([root('ref', { kind: 'reference' }), root('a')]).length).toBe(1);
  });

  test('writableVia: only what the server states, only for a writable project', () => {
    expect(writableVia({ ...root('a', { writable: true }), writableBy: 'rw' } as RootInfo)).toBe('rw');
    expect(writableVia({ ...root('a', { writable: true }), writableBy: 'auto' } as RootInfo)).toBe('auto');
    expect(writableVia(root('a', { writable: true }))).toBeNull();
    expect(writableVia({ ...root('a'), writableBy: 'rw' } as RootInfo)).toBeNull();
    expect(writableVia({ ...root('a', { writable: true }), writableBy: 'x' } as RootInfo)).toBeNull();
  });
});
