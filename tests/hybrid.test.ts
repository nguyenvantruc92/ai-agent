import { describe, expect, it } from 'vitest';
import { mergeRanked } from '@/features/catalog/hybrid';

describe('mergeRanked', () => {
  it('keeps the order of a single list', () => {
    expect(mergeRanked([['A', 'B', 'C']], 5)).toEqual(['A', 'B', 'C']);
  });

  it('puts codes found by both searches first', () => {
    expect(mergeRanked([['A', 'B', 'C'], ['C', 'D']], 5)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('interleaves two lists by rank and respects the limit', () => {
    expect(mergeRanked([['A', 'B'], ['X', 'Y']], 3)).toEqual(['A', 'X', 'B']);
  });

  it('handles empty input', () => {
    expect(mergeRanked([[], []], 5)).toEqual([]);
  });
});
