import { describe, expect, it } from 'vitest';
import pool from '../../../data/pool.json';
import { dealCount, POOL_STYLES, puzzleStream, STYLE_WEIGHTS } from '../pool';
import { distinctSolutions } from '../solutions';
import { analyze } from '../analyze';

describe('pool', () => {
  it('every built style has a weight and every weight has puzzles', () => {
    expect([...POOL_STYLES].sort()).toEqual(Object.keys(STYLE_WEIGHTS).sort());
  });

  it('stream is deterministic, solvable, and does not repeat early', () => {
    const a = puzzleStream(7);
    const b = puzzleStream(7);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      expect(a(i)).toEqual(b(i));
      expect(distinctSolutions(a(i)).length).toBeGreaterThan(0);
      seen.add([...a(i)].sort((x, y) => x - y).join());
    }
    expect(seen.size).toBe(100);
  });
});

describe('dealCount', () => {
  const { puzzles, styles } = pool as { puzzles: number[][]; styles: Record<string, number[]> };
  const inStyle = (style: string, nums: number[]) => {
    const key = [...nums].sort((a, b) => a - b).join();
    return styles[style].some((i) => [...puzzles[i]].sort((a, b) => a - b).join() === key);
  };

  it('deals one easy, one medium and one hard, deterministically', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const hand = dealCount(seed);
      expect(dealCount(seed)).toEqual(hand);
      expect(hand).toHaveLength(3);
      expect(hand.filter((n) => inStyle('easy', n))).toHaveLength(1);
      expect(hand.filter((n) => inStyle('classic-mid', n))).toHaveLength(1);
    }
  });

  it('size 1 deals a single hard puzzle', () => {
    const hard = Object.keys(styles).filter((s) => !['easy', 'classic-mid', 'wide'].includes(s));
    for (const seed of [1, 2, 3, 42, 999]) {
      const hand = dealCount(seed, 1);
      expect(dealCount(seed, 1)).toEqual(hand);
      expect(hand).toHaveLength(1);
      expect(hard.some((s) => inStyle(s, hand[0]))).toBe(true);
    }
  });
});

describe('analyze', () => {
  it('detects fraction-only puzzles', () => {
    expect(analyze([1, 5, 5, 5]).needsFraction).toBe(true);
    expect(analyze([3, 3, 8, 8]).needsFraction).toBe(true);
    expect(analyze([1, 2, 3, 4]).needsFraction).toBe(false);
  });

  it('finds no solutions for impossible sets', () => {
    expect(analyze([1, 1, 1, 1]).solutions).toBe(0);
  });
});
