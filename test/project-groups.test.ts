import { describe, expect, test } from 'bun:test';
import type { RootInfo } from '../src/ui/api';
import { groupProjects, removable, selectedProject, accessMode, accessSource, modeTarget, rootWritable, storedTitle, viewerAccessTag } from '../src/ui/project-groups';

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

  test('modeTarget: the opposite of the effective access, only with a known mode and a full accessRev', () => {
    const rev = 'a'.repeat(64);
    expect(modeTarget(root('a', { mode: 'inherit', accessRev: rev, writable: true }))).toBe('ro');
    expect(modeTarget(root('a', { mode: 'inherit', accessRev: rev }))).toBe('rw');
    expect(modeTarget(root('a', { mode: 'ro', accessRev: rev }))).toBe('rw');
    expect(modeTarget(root('a', { mode: 'rw', accessRev: rev, writable: true }))).toBe('ro');
    // Set read and write yet capped: setting it again would change nothing.
    expect(modeTarget(root('a', { mode: 'rw', accessRev: rev }))).toBeNull();
    expect(modeTarget(root('a', { mode: 'inherit' }))).toBeNull();
    expect(modeTarget(root('a', { mode: 'inherit', accessRev: 'abc' }))).toBeNull();
    expect(modeTarget(root('a', { accessRev: rev }))).toBeNull();
    expect(modeTarget({ ...root('a', { accessRev: rev }), mode: 'x' } as unknown as RootInfo)).toBeNull();
    expect(modeTarget(root('ref', { kind: 'reference', mode: 'inherit', accessRev: rev }))).toBeNull();
  });

  test('accessSource: an explicit choice apart from inherited auto-RW and the default', () => {
    expect(accessMode(root('ref', { kind: 'reference', mode: 'ro' }))).toBeNull();
    expect(accessSource(root('a', { mode: 'ro' }))).toBe('set read-only for this project');
    expect(accessSource(root('a', { mode: 'rw', writable: true }))).toBe('set read and write for this project');
    expect(accessSource(root('a', { mode: 'rw' }))).toBe('set read and write, but mdhouse cannot write here');
    expect(accessSource(root('a', { mode: 'inherit', writable: true }))).toBe('an auto-RW path covers it');
    expect(accessSource(root('a', { mode: 'inherit' }))).toBe('the default');
  });

  test('rootWritable: by the live list; reference and unlisted projects never', () => {
    const live = [root('a', { writable: true }), root('b'), root('ref', { kind: 'reference', writable: true })];
    expect(['a', 'b', 'ref', 'gone'].map((id) => rootWritable(live, id))).toEqual([true, false, false, false]);
  });
});

describe('Viewer access presentation', () => {
  const rev = 'a'.repeat(64);
  test('only a project stored as RW is tagged; RO, inherit, the reference and an unlisted project say nothing', () => {
    expect(viewerAccessTag(root('a', { mode: 'rw', writable: false } as Partial<RootInfo>))).toBe('RW (stored)');
    expect(viewerAccessTag(root('a', { mode: 'ro' } as Partial<RootInfo>))).toBeNull();
    expect(viewerAccessTag(root('a', { mode: 'inherit' } as Partial<RootInfo>))).toBeNull();
    expect(viewerAccessTag(root('r', { kind: 'reference', mode: 'rw' } as Partial<RootInfo>))).toBeNull();
    expect(viewerAccessTag(undefined)).toBeNull();
  });

  test('the tooltip names the stored mode and that it takes effect in Workspace', () => {
    expect(storedTitle(root('a', { mode: 'rw' } as Partial<RootInfo>))).toStartWith('Stored as read and write — takes effect in Workspace');
    expect(storedTitle(root('a', { mode: 'inherit' } as Partial<RootInfo>))).toStartWith('Stored as read-only — takes effect in Workspace');
  });

  test('in a Viewer the switch flips the stored mode, not the effective read-only', () => {
    const rw = root('a', { mode: 'rw', writable: false, accessRev: rev } as Partial<RootInfo>);
    expect(modeTarget(rw)).toBeNull();
    expect(modeTarget(rw, true)).toBe('ro');
    expect(modeTarget(root('a', { mode: 'ro', accessRev: rev } as Partial<RootInfo>), true)).toBe('rw');
    expect(modeTarget(root('a', { mode: 'inherit', accessRev: rev } as Partial<RootInfo>), true)).toBe('rw');
    expect(modeTarget(root('a', { mode: 'rw' } as Partial<RootInfo>), true)).toBeNull();
    expect(modeTarget(root('r', { kind: 'reference', mode: 'rw', accessRev: rev } as Partial<RootInfo>), true)).toBeNull();
  });
});
