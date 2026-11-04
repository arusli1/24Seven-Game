import { describe, expect, it } from 'vitest';
import { POOL_STYLES, puzzleStream, STYLE_WEIGHTS } from '../pool';
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
