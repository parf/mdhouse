import { describe, expect, test } from 'bun:test';
import { resolveTargets, type TargetInput } from '../src/ui/ab-targets';

const agent = (name: string, alive = true) => ({ name, descr: '', alive });
const live = [agent('#a'), agent('#b'), agent('#c'), agent('#d'), agent('#dead', false)];
const all: TargetInput = { picked: ['#a'], named: ['#b'], spaceDefault: ['#c'], instanceDefault: ['#d'], agents: live };

describe('resolveTargets: each priority on its own', () => {
  test('the panel choice beats everything', () => {
    expect(resolveTargets(all)).toEqual({ level: 'picked', targets: ['#a'], unavailable: [] });
  });
  test('then the names in the document', () => {
    expect(resolveTargets({ ...all, picked: null })).toEqual({ level: 'named', targets: ['#b'], unavailable: [] });
  });
  test('then the project defaults', () => {
    expect(resolveTargets({ ...all, picked: null, named: [] })).toEqual({ level: 'space', targets: ['#c'], unavailable: [] });
  });
  test('then the instance defaults', () => {
    expect(resolveTargets({ ...all, picked: null, named: [], spaceDefault: undefined })).toEqual({ level: 'instance', targets: ['#d'], unavailable: [] });
    expect(resolveTargets({ ...all, picked: null, named: [], spaceDefault: [] }).level).toBe('instance');
  });
  test('nobody anywhere', () => {
    expect(resolveTargets({ picked: null, named: [], instanceDefault: [], agents: live })).toEqual({ level: 'none', targets: [], unavailable: [] });
  });
  test('an empty panel choice is still the choice: no default fills it', () => {
    expect(resolveTargets({ ...all, picked: [] })).toEqual({ level: 'picked', targets: [], unavailable: [] });
  });
});

describe('resolveTargets: unavailable stays, never replaced by a lower level', () => {
  test('a chosen agent not running', () => {
    expect(resolveTargets({ ...all, picked: ['#dead', '#a'] })).toEqual({ level: 'picked', targets: ['#dead', '#a'], unavailable: ['#dead'] });
  });
  test('a named agent not on the bus', () => {
    expect(resolveTargets({ ...all, picked: null, named: ['#gone'] })).toEqual({ level: 'named', targets: ['#gone'], unavailable: ['#gone'] });
  });
  test('a project default not running does not fall to the instance default', () => {
    expect(resolveTargets({ ...all, picked: null, named: [], spaceDefault: ['#dead'] })).toEqual({ level: 'space', targets: ['#dead'], unavailable: ['#dead'] });
  });
  test('an instance default not running', () => {
    expect(resolveTargets({ ...all, picked: null, named: [], spaceDefault: undefined, instanceDefault: ['#dead'] }).unavailable).toEqual(['#dead']);
  });
  test('the bus not read yet: every target unavailable, still listed', () => {
    expect(resolveTargets({ ...all, agents: [] })).toEqual({ level: 'picked', targets: ['#a'], unavailable: ['#a'] });
  });
  test('repeats once, order kept', () => {
    expect(resolveTargets({ ...all, picked: null, named: ['#b', '#a', '#b'] }).targets).toEqual(['#b', '#a']);
  });
});

describe('Settings helpers', () => {
  test('splitNames: spaces, commas, lines; each once', async () => {
    const { splitNames } = await import('../src/ui/ab-targets');
    expect(splitNames(' #a, #b\n#a  #c ')).toEqual(['#a', '#b', '#c']);
    expect(splitNames('  ')).toEqual([]);
  });
  test('spaceSummary: only what the project sets', async () => {
    const { spaceSummary } = await import('../src/ui/ab-targets');
    expect(spaceSummary(undefined)).toBe('');
    expect(spaceSummary({})).toBe('');
    expect(spaceSummary({ endpoint: '/run/x.sock' })).toBe('/run/x.sock');
    expect(spaceSummary({ default: ['#a', '#b'] })).toBe('#a #b');
    expect(spaceSummary({ endpoint: 'http://h:1', default: ['#a'] })).toBe('http://h:1 · #a');
  });
});

describe('syncDraft', () => {
  test('an untouched draft follows the stored value', async () => {
    const { syncDraft } = await import('../src/ui/ab-targets');
    expect(syncDraft('http://a', 'http://a', 'http://b', false)).toBe('http://b');
  });
  test('a typed draft stays when another tab changes the stored value', async () => {
    const { syncDraft } = await import('../src/ui/ab-targets');
    expect(syncDraft('http://typed', 'http://a', 'http://b', false)).toBe('http://typed');
  });
  test('another project takes its own stored value', async () => {
    const { syncDraft } = await import('../src/ui/ab-targets');
    expect(syncDraft('http://typed', 'http://a', 'http://other', true)).toBe('http://other');
  });
});
