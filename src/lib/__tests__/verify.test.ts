import { describe, expect, it } from 'vitest';
import type { Move } from '../board';
import type { Numbers } from '../pool';
import { verifyRun } from '../verify';

const puzzleAt = (): Numbers => [1, 2, 3, 4];
const solve: Move[] = [[0, 1, '+'], [1, 2, '+'], [2, 3, '*']]; // ((1+2)+3)×4
const start = 1_000_000;

describe('verifyRun', () => {
  it('accepts three solved puzzles in any order and times by the last solve', () => {
    const results = [
      { moves: solve, t: 9000 },
      { moves: solve, t: 3000 },
      { moves: solve, t: 6000 },
    ];
    expect(verifyRun(results, puzzleAt, 3, start, start + 9200)).toEqual({ ms: 9000 });
    // Server saw far longer than the client claims: server time wins.
    expect(verifyRun(results, puzzleAt, 3, start, start + 30_000)).toEqual({ ms: 29_300 });
  });

  it('rejects unsolved, incomplete and inhumanly fast runs', () => {
    const bad: Move[] = [[0, 1, '+'], [1, 2, '+'], [2, 3, '+']];
    expect(verifyRun([{ moves: bad, t: 1000 }, { moves: solve, t: 2000 }, { moves: solve, t: 3000 }], puzzleAt, 3, start, start + 4000)).toHaveProperty('error');
    expect(verifyRun([{ moves: solve, t: 1000 }], puzzleAt, 3, start, start + 4000)).toHaveProperty('error');
    expect(verifyRun([{ moves: solve, t: 1000 }, { moves: solve, t: 1100 }, { moves: solve, t: 3000 }], puzzleAt, 3, start, start + 4000)).toHaveProperty('error');
  });

  it('size 1: one puzzle, still needs human timing, and no claiming more time than passed', () => {
    expect(verifyRun([{ moves: solve, t: 4000 }], puzzleAt, 1, start, start + 4100)).toEqual({ ms: 4000 });
    expect(verifyRun([{ moves: solve, t: 300 }], puzzleAt, 1, start, start + 400)).toHaveProperty('error');
    expect(verifyRun([{ moves: solve, t: 4000 }], puzzleAt, 1, start, start + 2000)).toHaveProperty('error');
    expect(verifyRun([{ moves: solve, t: 1000 }, { moves: solve, t: 2000 }, { moves: solve, t: 3000 }], puzzleAt, 1, start, start + 4000)).toHaveProperty('error');
  });
});
