export type Kind = 'zen' | 'count';

/**
 * count: a run deals this many puzzles, solved in any order, as fast as you can.
 * 3 is one easy, one medium, one hard; 1 is a single hard one. Each size has
 * its own leaderboard.
 */
export type Size = 3 | 1;
export const SIZES: Size[] = [3, 1];
export const isSize = (n: unknown): n is Size => n === 3 || n === 1;

export function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
