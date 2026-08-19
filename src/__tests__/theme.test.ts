/**
 * Theme token smoke tests.
 *
 * These are intentionally tiny — they just verify the tokens exist with the
 * right shape so that any accidental rename of `Spacing`, `Spacing.four` etc.
 * trips CI before a downstream screen breaks at runtime.
 */

import { Spacing, MaxContentWidth, BottomTabInset } from '@/constants/theme';

describe('theme tokens', () => {
  it('exposes a Spacing object with the standard scale', () => {
    expect(Spacing).toBeDefined();
    for (const key of ['one', 'two', 'three', 'four', 'five', 'six']) {
      expect(typeof Spacing[key as keyof typeof Spacing]).toBe('number');
    }
  });

  it('exposes MaxContentWidth and BottomTabInset as numbers', () => {
    expect(typeof MaxContentWidth).toBe('number');
    expect(typeof BottomTabInset).toBe('number');
  });

  it('Spacing values are monotonically non-decreasing', () => {
    const order = ['one', 'two', 'three', 'four', 'five', 'six'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(Spacing[order[i]]).toBeGreaterThanOrEqual(Spacing[order[i - 1]]);
    }
  });
});
