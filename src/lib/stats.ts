/**
 * Speedcubing-style stats over a player's recent timed runs (ms, newest first).
 *   single: the latest run
 *   mo3:    mean of the last 3 (any DNF makes it DNF)
 *   ao5:    last 5, drop the best and worst, mean of the middle 3 (one DNF counts as worst)
 * A DNF is a run that was started and then abandoned.
 */
export type Stat = 'single' | 'mo3' | 'ao5';

export const STATS: Stat[] = ['single', 'mo3', 'ao5'];
export const STAT_LABEL: Record<Stat, string> = { single: 'single', mo3: 'avg of 3', ao5: 'avg of 5' };
export const HISTORY = 5;
export const DNF = -1;

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/** The current value of each stat, given recent times (newest first). DNF stats are left out. */
export function currentStats(recent: number[]): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {};
  const done = (xs: number[]) => xs.filter((x) => x !== DNF);
  if (recent.length >= 1 && recent[0] !== DNF) out.single = recent[0];
  const last3 = recent.slice(0, 3);
  if (last3.length === 3 && done(last3).length === 3) out.mo3 = mean(last3);
  const last5 = recent.slice(0, 5);
  if (last5.length === 5 && done(last5).length >= 4) {
    const sorted = last5.map((x) => (x === DNF ? Infinity : x)).sort((a, b) => a - b);
    out.ao5 = mean(sorted.slice(1, 4));
  }
  return out;
}
