/**
 * Speedcubing-style stats over a player's recent count times (ms, newest first).
 *   single: one run
 *   mo3:    mean of the last 3
 *   ao5:    last 5, drop the best and worst, mean of the middle 3
 */
export type Stat = 'single' | 'mo3' | 'ao5';

export const STATS: Stat[] = ['single', 'mo3', 'ao5'];
export const STAT_LABEL: Record<Stat, string> = { single: 'single', mo3: 'avg of 3', ao5: 'avg of 5' };
export const HISTORY = 5;

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/** The current value of each stat, given recent times (newest first). */
export function currentStats(recent: number[]): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {};
  if (recent.length >= 1) out.single = recent[0];
  if (recent.length >= 3) out.mo3 = mean(recent.slice(0, 3));
  if (recent.length >= 5) out.ao5 = mean([...recent.slice(0, 5)].sort((a, b) => a - b).slice(1, 4));
  return out;
}
