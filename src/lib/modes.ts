/**
 * Modes: zen (untimed practice) or a timed run of 1 or 3 puzzles.
 * A 3 run deals one easy, one medium and one hard; a 1 run deals one hard.
 * Each size has its own leaderboard.
 */
export type Size = 1 | 3;
export type Mode = 'zen' | Size;

export const SIZES: Size[] = [1, 3];
export const MODES: Mode[] = ['zen', ...SIZES];
export const isSize = (n: unknown): n is Size => n === 1 || n === 3;
export const modeLabel = (m: Mode) => (m === 'zen' ? 'zen' : `${m} timed`);

export function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
