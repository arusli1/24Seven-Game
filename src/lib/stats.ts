/**
 * Leaderboard stat: each player's best single run per mode.
 * A DNF is a run that was started and then abandoned; it never counts.
 */
export type Stat = 'single';

export const STATS: Stat[] = ['single'];
export const HISTORY = 1;
export const DNF = -1;

/** The current value of each stat, given recent times (newest first). DNF stats are left out. */
export function currentStats(recent: number[]): Partial<Record<Stat, number>> {
  return recent.length >= 1 && recent[0] !== DNF ? { single: recent[0] } : {};
}
