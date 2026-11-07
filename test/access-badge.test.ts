import { expect, test } from 'bun:test';
import type { RootInfo } from '../src/ui/api';
import { accessBadge } from '../src/ui/project-groups';

const root = (o: Partial<RootInfo>): RootInfo => ({ id: 'a', name: 'a', path: '/a', writable: true, kind: 'project', ...o });

test('Workspace: read and write is the default and shows nothing, whether set or from auto-RW', () => {
  expect(accessBadge(root({ writable: true, mode: 'rw', writableBy: 'rw' }))).toBeNull();
  expect(accessBadge(root({ writable: true, mode: 'inherit', writableBy: 'auto' }))).toBeNull();
});

test('Workspace: effective read-only shows RO — set, inherited without auto-RW, or capped while set RW', () => {
  expect(accessBadge(root({ writable: false, mode: 'ro' }))).toBe('RO');
  expect(accessBadge(root({ writable: false, mode: 'inherit' }))).toBe('RO');
  expect(accessBadge(root({ writable: false, mode: 'rw' }))).toBe('RO');
  expect(accessBadge(root({ writable: false }))).toBe('RO');
});

test('the reference, a missing project and unstated access make no claim', () => {
  expect(accessBadge(root({ writable: false, kind: 'reference' }))).toBeNull();
  expect(accessBadge(undefined)).toBeNull();
  expect(accessBadge({ id: 'a', name: 'a', path: '/a' } as RootInfo)).toBeNull();
});
