import { describe, expect, test } from 'bun:test';
import { defaultTarget, flowFrom, flowPageUrl, flowTargets, scopeMismatch, subjectOf, type FlowCatalogEntry } from '../src/ui/flow-model';

describe('Run flow on: Page · Directory · Project', () => {
  test('from a file: the file, its folder, the project; a root file has no folder', () => {
    expect(flowTargets('Plans/R3/TODO.md')).toEqual({ page: 'Plans/R3/TODO.md', directory: 'Plans/R3', project: '' });
    expect(flowTargets('README.md')).toEqual({ page: 'README.md', directory: null, project: '' });
  });
  test('from a folder: the folder and the project, no page; from the project: the project', () => {
    expect(flowTargets('Plans/R3/')).toEqual({ page: null, directory: 'Plans/R3', project: '' });
    expect(flowTargets('')).toEqual({ page: null, directory: null, project: '' });
  });
  test('the narrowest target leads; the subject carries the path', () => {
    expect(defaultTarget(flowTargets('a/b.md'))).toBe('page');
    expect(defaultTarget(flowTargets('a/'))).toBe('directory');
    expect(defaultTarget(flowTargets(''))).toBe('project');
    expect(subjectOf('directory', flowTargets('a/b.md'))).toEqual({ kind: 'directory', path: 'a' });
    expect(subjectOf('project', flowTargets('a/b.md'))).toEqual({ kind: 'project' });
  });
  test('a package says when it runs on something else', () => {
    const e = (scope: 'selected-project' | 'selected-subsystem' | 'selected-document') => ({ id: 'x', family: 'f', title: 'X', ranges: [], lastRun: null, openRun: null, defaults: { scope } }) as FlowCatalogEntry;
    expect(scopeMismatch(e('selected-document'), 'page')).toBeNull();
    expect(scopeMismatch(e('selected-project'), 'page')).toBe('runs on the whole project');
    expect(scopeMismatch(e('selected-subsystem'), 'project')).toBe('runs on a directory');
  });
  test('the page address round-trips its origin', () => {
    const url = flowPageUrl('/proj/', 'a b/c.md');
    expect(url).toBe('/proj/?flow=a%20b%2Fc.md');
    expect(flowFrom(url.slice(url.indexOf('?')))).toBe('a b/c.md');
    expect(flowFrom('?git')).toBeNull();
  });
});
