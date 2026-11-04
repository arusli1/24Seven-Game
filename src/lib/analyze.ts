/**
 * Enumerates every way to make 24 from four numbers and describes what the
 * solutions demand. Used offline by scripts/build-pool.ts to sort puzzles
 * into styles, so speed matters more than elegance: fractions are plain
 * [numerator, denominator] pairs.
 */

type Frac = [number, number];

export interface Analysis {
  /** Number of solution paths (commutative duplicates of + and × removed). */
  solutions: number;
  /** Every solution passes through a non-integer value. */
  needsFraction: boolean;
  /** Every solution passes through a value larger than BIG. */
  needsBig: boolean;
  /** Every solution passes through a negative value. */
  needsNegative: boolean;
  /** Every solution's last step is a division (e.g. 72 ÷ 3). */
  endsInDivision: boolean;
}

const BIG = 48;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function frac(n: number, d: number): Frac {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return [n / g, d / g];
}

interface Node { v: Frac; frac: boolean; max: number; neg: boolean; div: boolean }

export function analyze(nums: number[]): Analysis {
  let solutions = 0;
  let anyIntegerOnly = false;
  let anySmall = false;
  let anyNonNegative = false;
  let anyOtherLast = false;

  const rec = (items: Node[]) => {
    if (items.length === 1) {
      const { v, frac: f, max, neg, div } = items[0];
      if (v[0] === 24 && v[1] === 1) {
        solutions += 1;
        if (!f) anyIntegerOnly = true;
        if (max <= BIG) anySmall = true;
        if (!neg) anyNonNegative = true;
        if (!div) anyOtherLast = true;
      }
      return;
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i];
        const b = items[j];
        const rest = items.filter((_, k) => k !== i && k !== j);
        const [an, ad] = a.v;
        const [bn, bd] = b.v;
        const results: [Frac, boolean][] = [];
        if (i < j) {
          results.push([frac(an * bd + bn * ad, ad * bd), false]);
          results.push([frac(an * bn, ad * bd), false]);
        }
        results.push([frac(an * bd - bn * ad, ad * bd), false]);
        if (bn !== 0) results.push([frac(an * bd, ad * bn), true]);
        for (const [v, div] of results) {
          rec([
            ...rest,
            {
              v,
              frac: a.frac || b.frac || v[1] !== 1,
              max: Math.max(a.max, b.max, Math.abs(v[0] / v[1])),
              neg: a.neg || b.neg || v[0] < 0,
              div,
            },
          ]);
        }
      }
    }
  };

  rec(nums.map((n) => ({ v: [n, 1] as Frac, frac: false, max: n, neg: false, div: false })));
  return {
    solutions,
    needsFraction: solutions > 0 && !anyIntegerOnly,
    needsBig: solutions > 0 && !anySmall,
    needsNegative: solutions > 0 && !anyNonNegative,
    endsInDivision: solutions > 0 && !anyOtherLast,
  };
}
