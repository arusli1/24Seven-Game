export type Kind = 'zen' | 'count';

/** count: a run deals this many puzzles, solved in any order, as fast as you can. */
export const COUNT_PUZZLES = 3;

export function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}
