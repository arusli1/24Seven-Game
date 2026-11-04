import pool from '../../data/pool.json';

/**
 * How often each puzzle style is served (relative weights). Styles come from
 * scripts/build-pool.ts.
 */
export const STYLE_WEIGHTS: Record<string, number> = {
  'classic-hard': 16, // 4nums puzzles fewer than half of players solve
  fraction: 12,       // every solution needs a fraction along the way
  unique: 10,         // numbers up to 20 with exactly one solution
  big: 9,             // every solution needs an intermediate above 48
  handmade: 9,
  decoy: 9,           // has an obvious setup (3×8, a 24 card…) that doesn't work
  'divide-last': 7,   // every solution ends in a division, like 72 ÷ 3
  giant: 7,           // two or more numbers above 13, up to 30, one solution
  'classic-mid': 9,
  wide: 7,            // numbers up to 20, two to four solutions
  easy: 5,            // change-up so not every puzzle looks scary
};

export type Numbers = [number, number, number, number];

const { puzzles, styles } = pool as { puzzles: number[][]; styles: Record<string, number[]> };
const entries = Object.entries(STYLE_WEIGHTS);
const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

export const POOL_STYLES = Object.keys(styles);

/** mulberry32: small, fast, deterministic PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32);
}

/** A deterministic, endless stream of puzzles for a seed, without early repeats. */
export function puzzleStream(seed: number) {
  const next = rng(seed);
  const used = new Set<number>();
  const list: Numbers[] = [];

  const draw = (): Numbers => {
    for (let tries = 0; ; tries++) {
      let r = next() * totalWeight;
      let style = entries[entries.length - 1][0];
      for (const [id, w] of entries) {
        if ((r -= w) < 0) { style = id; break; }
      }
      const options = styles[style];
      const index = options[Math.floor(next() * options.length)];
      if (used.has(index) && tries < 20) continue;
      used.add(index);
      // Shuffle so a set doesn't always appear in sorted order.
      const shuffled = [...puzzles[index]] as Numbers;
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
  };

  return (index: number): Numbers => {
    while (list.length <= index) list.push(draw());
    return list[index];
  };
}
