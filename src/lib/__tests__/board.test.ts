import { describe, expect, it } from 'vitest';
import { combine, isSolved, newBoard, undo, type Operator } from '../board';

describe('board', () => {
  it('keeps slots fixed: merging empties slot a and fills slot b', () => {
    const s = combine(newBoard([1, 2, 3, 4]), 0, 1, '+')!;
    expect(s.cards[0]).toBeNull();
    expect(s.cards[1]!.value.toString()).toBe('3');
    expect(s.cards[2]!.value.toString()).toBe('3');
  });

  it('solves 1 5 5 5 through a fraction', () => {
    const moves: [number, number, Operator][] = [[0, 1, '/'], [2, 1, '-'], [1, 3, '*']]; // 5 × (5 − 1/5)
    let s = newBoard([1, 5, 5, 5]);
    for (const [a, b, op] of moves) s = combine(s, a, b, op)!;
    expect(isSolved(s)).toBe(true);
  });

  it('undo restores the cards', () => {
    const s0 = newBoard([1, 2, 3, 4]);
    expect(undo(combine(s0, 0, 1, '+')!).cards).toEqual(s0.cards);
  });

  it('refuses ÷0 and empty slots', () => {
    const zero = combine(newBoard([3, 3, 4, 4]), 0, 1, '-')!;
    expect(combine(zero, 2, 1, '/')).toBeNull();
    expect(combine(zero, 0, 2, '+')).toBeNull();
  });
});

describe('suits', () => {
  it('deals four different suits, and a merged card keeps the suit of its slot', () => {
    const s = newBoard([5, 5, 5, 1]);
    expect(new Set(s.cards.map((c) => c!.suit)).size).toBe(4);
    const m = combine(s, 0, 1, '+')!;
    expect(m.cards[1]!.suit).toBe(s.cards[1]!.suit);
  });
});
