import { Rational } from './rational';

/**
 * All genuinely different ways to make 24.
 *
 * Every solution tree is rewritten into a standard form: sums and products are
 * flattened and sorted, and signs are pulled outward. So 1+2+3+4 and 4+(3+2)+1
 * are one solution, a−(b−c) equals a−b+c, a÷(b÷c) equals a×c÷b, and anything
 * that went through a negative is shown in its all-positive form. Padding
 * that does nothing (×1, ÷1, +1−1, ×3÷3) doesn't make a solution different.
 */

type Tree = { n: number } | { op: '+' | '-' | '*' | '/'; a: Tree; b: Tree };

type Canon =
  | { kind: 'num'; value: Rational; n: number }
  | { kind: 'sum'; value: Rational; terms: { neg: boolean; c: Canon }[] }
  | { kind: 'prod'; value: Rational; factors: { inv: boolean; c: Canon }[] };

/** A canonical node plus a sign pulled out of it. */
type Signed = { neg: boolean; c: Canon };

const ZERO = new Rational(0);
const ONE = new Rational(1);
const TARGET = new Rational(24);

function key(c: Canon): string {
  if (c.kind === 'num') return String(c.n);
  if (c.kind === 'sum') return `S(${c.terms.map((t) => (t.neg ? '-' : '+') + key(t.c)).join(',')})`;
  return `P(${c.factors.map((f) => (f.inv ? '/' : '*') + key(f.c)).join(',')})`;
}

/** Like key(), but ignores padding that cancels out (×1, +x−x, ×x÷x). */
function coreKey(c: Canon): string {
  if (c.kind === 'num') return String(c.n);
  const parts =
    c.kind === 'sum'
      ? c.terms.map((t) => ({ flip: t.neg, k: coreKey(t.c) }))
      : c.factors.map((f) => ({ flip: f.inv, k: coreKey(f.c) })).filter((f) => f.k !== '1');
  // Cancel matching opposite pairs.
  const kept: { flip: boolean; k: string }[] = [];
  for (const p of parts) {
    const i = kept.findIndex((q) => q.k === p.k && q.flip !== p.flip);
    if (i >= 0) kept.splice(i, 1);
    else kept.push(p);
  }
  if (kept.length === 0) return c.kind === 'sum' ? '0' : '1';
  if (kept.length === 1 && !kept[0].flip) return kept[0].k;
  const body = kept.map((p) => (p.flip ? '~' : '') + p.k).sort().join(',');
  return c.kind === 'sum' ? `S(${body})` : `P(${body})`;
}

const byKey = <T extends { c: Canon }>(x: T, y: T, flag: (t: T) => boolean) => {
  const kx = (flag(x) ? '1' : '0') + key(x.c);
  const ky = (flag(y) ? '1' : '0') + key(y.c);
  return kx < ky ? -1 : kx > ky ? 1 : 0;
};

function canon(t: Tree): Signed {
  if ('n' in t) return { neg: false, c: { kind: 'num', value: new Rational(t.n), n: t.n } };
  const a = canon(t.a);
  const b = canon(t.b);

  if (t.op === '+' || t.op === '-') {
    const flat = (s: Signed, flip: boolean) =>
      s.c.kind === 'sum'
        ? s.c.terms.map((x) => ({ neg: x.neg !== s.neg !== flip, c: x.c }))
        : [{ neg: s.neg !== flip, c: s.c }];
    let terms = [...flat(a, false), ...flat(b, t.op === '-')];
    let value = terms.reduce((sum, x) => (x.neg ? sum.sub(x.c.value) : sum.add(x.c.value)), ZERO);
    terms.sort((x, y) => byKey(x, y, (z) => z.neg));
    // Keep sums positive; carry the sign to the parent instead.
    const neg = value.numerator < 0 || (value.numerator === 0 && terms[0].neg);
    if (neg) {
      terms = terms.map((x) => ({ neg: !x.neg, c: x.c })).sort((x, y) => byKey(x, y, (z) => z.neg));
      value = ZERO.sub(value);
    }
    return { neg, c: { kind: 'sum', value, terms } };
  }

  const flat = (s: Signed, flip: boolean) =>
    s.c.kind === 'prod'
      ? s.c.factors.map((f) => ({ inv: f.inv !== flip, c: f.c }))
      : [{ inv: flip, c: s.c }];
  const factors = [...flat(a, false), ...flat(b, t.op === '/')]
    // ×1 and ÷1 are the same move.
    .map((f) => (f.c.kind === 'num' && f.c.n === 1 ? { inv: false, c: f.c } : f))
    .sort((x, y) => byKey(x, y, (z) => z.inv));
  const value = factors.reduce((p, f) => (f.inv ? p.div(f.c.value) : p.mul(f.c.value)), ONE);
  return { neg: a.neg !== b.neg, c: { kind: 'prod', value, factors } };
}

/** Readable form: bigger parts first, additions before subtractions. */
function show(c: Canon, inProduct = false): string {
  const desc = (x: { c: Canon }, y: { c: Canon }) => y.c.value.toNumber() - x.c.value.toNumber();
  if (c.kind === 'num') return String(c.n);
  if (c.kind === 'sum') {
    const pos = c.terms.filter((t) => !t.neg).sort(desc);
    const neg = c.terms.filter((t) => t.neg).sort(desc);
    const s = pos.map((t) => show(t.c)).join(' + ') + neg.map((t) => ` − ${show(t.c)}`).join('');
    return inProduct ? `(${s})` : s;
  }
  const num = c.factors.filter((f) => !f.inv).sort(desc);
  const den = c.factors.filter((f) => f.inv).sort(desc);
  const head = num.length ? num.map((f) => show(f.c, true)).join(' × ') : '1';
  const s = head + den.map((f) => ` ÷ ${show(f.c, true)}`).join('');
  // A product with a division inside another product needs grouping, e.g. 3 × (8 ÷ 1).
  return inProduct && den.length ? `(${s})` : s;
}

export function distinctSolutions(nums: number[]): string[] {
  const found = new Map<string, string>();
  const rec = (items: { v: Rational; t: Tree }[]) => {
    if (items.length === 1) {
      if (items[0].v.equals(TARGET)) {
        const { neg, c } = canon(items[0].t);
        if (!neg) {
          const k = coreKey(c);
          const text = show(c);
          const prev = found.get(k);
          if (!prev || text.length < prev.length) found.set(k, text);
        }
      }
      return;
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const { v: a, t: ta } = items[i];
        const { v: b, t: tb } = items[j];
        const rest = items.filter((_, k) => k !== i && k !== j);
        const next: { v: Rational; t: Tree }[] = [];
        if (i < j) {
          next.push({ v: a.add(b), t: { op: '+', a: ta, b: tb } });
          next.push({ v: a.mul(b), t: { op: '*', a: ta, b: tb } });
        }
        next.push({ v: a.sub(b), t: { op: '-', a: ta, b: tb } });
        if (b.numerator !== 0) next.push({ v: a.div(b), t: { op: '/', a: ta, b: tb } });
        for (const n of next) rec([...rest, n]);
      }
    }
  };
  rec(nums.map((n) => ({ v: new Rational(n), t: { n } })));
  // Simplest-looking first.
  return [...found.values()].sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
}

/** A first move that still leads to 24 without going negative, e.g. "5 ÷ 4". For hints. */
export function firstStep(nums: number[]): string | null {
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' } as const;
  const steps = (a: Rational, b: Rational) => {
    const out: [keyof typeof SYM, Rational][] = [['+', a.add(b)], ['*', a.mul(b)]];
    if (a.sub(b).numerator >= 0) out.push(['-', a.sub(b)]);
    if (b.numerator !== 0) out.push(['/', a.div(b)]);
    return out;
  };
  const solvable = (xs: Rational[]): boolean => {
    if (xs.length === 1) return xs[0].equals(TARGET);
    for (let i = 0; i < xs.length; i++)
      for (let j = 0; j < xs.length; j++) {
        if (i === j) continue;
        const rest = xs.filter((_, k) => k !== i && k !== j);
        if (steps(xs[i], xs[j]).some(([, v]) => solvable([...rest, v]))) return true;
      }
    return false;
  };
  const xs = nums.map((n) => new Rational(n));
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j < xs.length; j++) {
      if (i === j) continue;
      const rest = xs.filter((_, k) => k !== i && k !== j);
      for (const [op, v] of steps(xs[i], xs[j])) {
        if (solvable([...rest, v])) return `${nums[i]} ${SYM[op]} ${nums[j]}`;
      }
    }
  return null;
}
