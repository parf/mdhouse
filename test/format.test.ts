import { describe, expect, test } from 'bun:test';
import { preciseAgo, fileSize } from '../src/ui/format';

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
