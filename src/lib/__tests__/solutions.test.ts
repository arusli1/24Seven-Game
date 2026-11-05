import { describe, expect, it } from 'vitest';
import { distinctSolutions } from '../solutions';

describe('distinctSolutions', () => {
  it('collapses reorderings and regroupings', () => {
    expect(distinctSolutions([3, 3, 8, 8])).toEqual(['8 ÷ (3 − 8 ÷ 3)']);
    expect(distinctSolutions([1, 2, 3, 4])).toHaveLength(3);
  });

  it('ignores padding that cancels out', () => {
    expect(distinctSolutions([4, 6, 1, 1])).toHaveLength(1);
    expect(distinctSolutions([12, 12, 12, 12])).toHaveLength(1);
  });

  it('shows no negatives', () => {
    for (const s of distinctSolutions([2, 4, 6, 8])) expect(s).not.toMatch(/(^|[(×÷] )−/);
  });

  it('returns nothing for impossible sets', () => {
    expect(distinctSolutions([1, 1, 1, 1])).toEqual([]);
  });
});

describe('firstStep', () => {
  it('gives a first move that still reaches 24', async () => {
    const { firstStep } = await import('../solutions');
    expect(firstStep([1, 4, 5, 6])).toMatch(/^\d+ [+−×÷] \d+$/);
    expect(firstStep([1, 1, 1, 1])).toBeNull();
  });
});
