import { verifyMoves, type Move } from './board';
import { COUNT_PUZZLES } from './modes';
import type { Numbers } from './pool';

/** One puzzle of a ranked run: the moves that solved it, at t ms after the start. */
export interface PuzzleResult {
  moves: Move[];
  t: number;
}

/** Server-measured time may run this much longer than the client's (network). */
const LATENCY_MS = 1500;
/** Faster than this between solves is treated as a bot. */
const MIN_SOLVE_MS = 400;
const MAX_RUN_MS = 60 * 60 * 1000;

/**
 * Check a ranked count run: every puzzle solved (in any order) by replaying
 * its moves, with human timing. Returns the run time in ms.
 */
export function verifyRun(
  results: unknown,
  puzzleAt: (i: number) => Numbers,
  startedAt: number,
  now: number,
): { ms: number } | { error: string } {
  if (!Array.isArray(results) || results.length !== COUNT_PUZZLES) return { error: 'bad run' };
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
  if (prev > elapsed + LATENCY_MS) return { error: 'bad timing' };
  if (elapsed > MAX_RUN_MS) return { error: 'run expired' };
  // Trust the client's clock (it matches what the player saw) unless it is
  // clearly shorter than what the server measured.
  return { ms: Math.round(Math.max(prev, elapsed - LATENCY_MS)) };
}
