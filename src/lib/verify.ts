import { verifyMoves, type Move } from './board';
import type { Size } from './modes';
import type { Numbers } from './pool';

/** One puzzle of a timed run: the moves that solved it, at t ms after the start. */
export interface PuzzleResult {
  moves: Move[];
  t: number;
}

/** The server's clock may run this much longer than the player's (network). */
const LATENCY_MS = 700;
/** The player's clock may run this much longer than the server's (clock jitter). */
const SKEW_MS = 250;
/** Faster than this per puzzle is treated as a bot. */
const MIN_SOLVE_MS = 700;

/**
 * Check a timed run: every puzzle solved (in any order) by replaying its
 * moves, with human timing. Returns the run time in ms.
 */
export function verifyRun(
  results: unknown,
  puzzleAt: (i: number) => Numbers,
  size: Size,
  startedAt: number,
  now: number,
): { ms: number } | { error: string } {
  if (!Array.isArray(results) || results.length !== size) return { error: 'bad run' };
  const times: number[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i] as PuzzleResult;
    if (!r || !Number.isFinite(r.t) || r.t < 0) return { error: 'bad timing' };
    if (!verifyMoves(puzzleAt(i), r.moves)) return { error: `puzzle ${i + 1} is not solved` };
    times.push(r.t);
  }
  times.sort((a, b) => a - b);
  let prev = 0;
  for (const t of times) {
    if (t - prev < MIN_SOLVE_MS) return { error: 'too fast to be human' };
    prev = t;
  }
  const elapsed = now - startedAt;
  if (prev > elapsed + SKEW_MS) return { error: 'bad timing' };
  // Trust the player's clock (it matches what they saw) unless it is clearly
  // shorter than what the server measured.
  return { ms: Math.round(Math.max(prev, elapsed - LATENCY_MS)) };
}
