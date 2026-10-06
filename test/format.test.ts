import { describe, expect, test } from 'bun:test';
import { preciseAgo, fileSize, rootLabel, shortAgo } from '../src/ui/format';

describe('fileSize', () => {
  test('bytes stay bare under 1000', () => {
    expect(fileSize(1)).toBe('1');
    expect(fileSize(87)).toBe('87');
    expect(fileSize(999)).toBe('999');
  });

  test('never more than three digits', () => {
    expect(fileSize(1000)).toBe('1K');
    expect(fileSize(1126)).toBe('1.1K');
    expect(fileSize(10239)).toBe('10K');
    expect(fileSize(102400)).toBe('100K');
    expect(fileSize(1048575)).toBe('1M');
    expect(fileSize(1.2 * 1024 * 1024)).toBe('1.2M');
    expect(fileSize(1.5 * 1024 ** 3)).toBe('1.5G');
  });
});

describe('preciseAgo', () => {
  const ago = (minutes: number) => preciseAgo(Date.now() - minutes * 60_000);

  test('two units for the first week', () => {
    expect(ago(0)).toBe('0m ago');
    expect(ago(29)).toBe('29m ago');
    expect(ago(7 * 60 + 12)).toBe('7h 12m ago');
    expect(ago(31 * 60 + 34)).toBe('1d 7h ago');
    expect(ago(7 * 24 * 60 - 1)).toBe('6d 23h ago');
  });

  test('words after that', () => {
    expect(ago(10 * 24 * 60)).toBe('10d ago');
  });
});

describe('rootLabel', () => {
  test('the folder and its parent, by default', () => {
    expect(rootLabel('/rd/vhosts/rdc/Plans/Removal')).toBe('Plans/Removal');
    expect(rootLabel('/home/parf/doc/RealmoMove')).toBe('doc/RealmoMove');
  });

  test('two folders above, for the wide sidebar', () => {
    expect(rootLabel('/rd/vhosts/rdc/Plans/Removal', { above: 2 })).toBe('rdc/Plans/Removal');
  });

  test('a short path is shown whole, with its slash', () => {
    expect(rootLabel('/rd')).toBe('/rd');
    expect(rootLabel('/rd/tmp')).toBe('/rd/tmp');
    expect(rootLabel('/rd/tmp', { above: 2 })).toBe('/rd/tmp');
  });

  test('the whole path, home written as ~', () => {
    const home = '/home/parf';
    expect(rootLabel('/home/parf/doc/RealmoMove', { above: 'all', home, max: 99 })).toBe('~/doc/RealmoMove');
    expect(rootLabel('/home/parf', { above: 'all', home })).toBe('~');
    expect(rootLabel('/home/parfx/doc', { above: 'all', home })).toBe('/home/parfx/doc');
    expect(rootLabel('/rd/tmp', { above: 'all', home })).toBe('/rd/tmp');
  });

  test('too long: the left end goes, the folder name stays', () => {
    const label = rootLabel('/x/some-rather-long-parent-name/RLM-1842-final-folder', { max: 28 });
    expect(label).toHaveLength(28);
    expect(label.startsWith('…')).toBe(true);
    expect(label.endsWith('RLM-1842-final-folder')).toBe(true);
  });
});

describe('shortAgo', () => {
  const ago = (minutes: number) => shortAgo(Date.now() - minutes * 60_000);

  test('the age alone, no "ago"', () => {
    expect(ago(0)).toBe('now');
    expect(ago(5)).toBe('5m');
    expect(ago(22 * 60)).toBe('22h');
    expect(ago(24 * 60 + 5)).toBe('1d');
    expect(ago(3 * 24 * 60)).toBe('3d');
    expect(ago(70 * 24 * 60)).toBe('2mo');
  });
});
