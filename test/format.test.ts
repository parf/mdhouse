import { describe, expect, test } from 'bun:test';
import { fileSize } from '../src/ui/format';

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
