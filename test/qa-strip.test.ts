import { describe, expect, test } from 'bun:test';
import { toggleLabel } from '../src/ui/QaStrip';

describe('the phone strip\'s toggle', () => {
  test('shows the whole count while nothing is filtered', () => {
    expect(toggleLabel(null, 0, 22)).toBe('Filter · 22');
    expect(toggleLabel('all', 22, 22)).toBe('Filter · 22');
  });
  test('shows the active level and how many of the whole it keeps', () => {
    expect(toggleLabel('🟠', 13, 22)).toBe('🟠 13 of 22');
    expect(toggleLabel('✅', 4, 22)).toBe('✅ 4 of 22');
  });
});
