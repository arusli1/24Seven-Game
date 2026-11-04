/**
 * Builds data/pool.json: the playable puzzles and the styles they belong to.
 *
 * Sources:
 *   data/difficulties.json  4nums.com puzzles (1–13) with real solve rates
 *   data/handmade.json      hand-picked puzzles
 *   generated               every set with numbers up to MAX_GIANT that 4nums
 *                           doesn't cover, kept only if it matches a style
 *
 * A puzzle can belong to several styles. How often each style is served is
 * STYLE_WEIGHTS in src/lib/pool.ts.
 *
 * Run: npm run build:pool
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { analyze, type Analysis } from '../src/lib/analyze';
import { distinctSolutions } from '../src/lib/solutions';

const MAX_GENERATED = 20;
const MAX_GIANT = 30;
const dataDir = path.join(process.cwd(), 'data');

interface Candidate {
  nums: number[];
  source: 'classic' | 'handmade' | 'generated';
  solveRate?: number;
  /** Genuinely different solutions (see solutions.ts). */
  distinct: number;
  a: Analysis;
}

/** Has an obvious route to 24: a 24 card, or a pair that multiplies or adds to 24. */
function looksObvious(nums: number[]) {
  if (nums.includes(24)) return true;
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      if (nums[i] * nums[j] === 24 || nums[i] + nums[j] === 24) return true;
  return false;
}

const top = (c: Candidate) => Math.max(...c.nums);

/** Every style a puzzle matches. Keep in sync with STYLE_WEIGHTS (a test checks). */
const STYLES: Record<string, (c: Candidate) => boolean> = {
  'classic-hard': (c) => c.source === 'classic' && c.solveRate! < 0.5,
  'classic-mid': (c) => c.source === 'classic' && c.solveRate! >= 0.5 && c.solveRate! < 0.8,
  easy: (c) => c.source === 'classic' && c.solveRate! >= 0.8,
  handmade: (c) => c.source === 'handmade',
  fraction: (c) => c.a.needsFraction,
  big: (c) => c.a.needsBig,
  'divide-last': (c) => c.a.endsInDivision,
  decoy: (c) => looksObvious(c.nums) && c.distinct === 1 && top(c) <= MAX_GENERATED,
  unique: (c) => c.source === 'generated' && top(c) <= MAX_GENERATED && c.distinct === 1,
  wide: (c) => c.source === 'generated' && top(c) <= MAX_GENERATED && c.distinct >= 2 && c.distinct <= 4,
  giant: (c) =>
    c.source === 'generated' && top(c) > MAX_GENERATED && c.distinct === 1 && c.nums.filter((n) => n > 13).length >= 2,
};

/** Styles too big to ship whole are thinned to an evenly spread sample. */
const CAPS: Record<string, number> = { giant: 800 };

const key = (nums: number[]) => [...nums].sort((x, y) => x - y).join(',');

function main() {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const add = (nums: number[], source: Candidate['source'], solveRate?: number) => {
    const k = key(nums);
    if (seen.has(k)) return;
    seen.add(k);
    const a = analyze(nums);
    if (a.solutions === 0) {
      if (source !== 'generated') console.warn(`skipping unsolvable ${source} puzzle ${nums.join(' ')}`);
      return;
    }
    const distinct = distinctSolutions(nums).length;
    candidates.push({ nums: [...nums].sort((x, y) => x - y), source, solveRate, distinct, a });
  };

  // Handmade first so it keeps its label when 4nums has the same set.
  for (const p of JSON.parse(readFileSync(path.join(dataDir, 'handmade.json'), 'utf-8')).puzzles) {
    add(p.nums, 'handmade');
  }
  for (const p of JSON.parse(readFileSync(path.join(dataDir, 'difficulties.json'), 'utf-8')).puzzles) {
    add(p.nums, 'classic', p.solveRate);
  }
  for (let a = 1; a <= MAX_GIANT; a++)
    for (let b = a; b <= MAX_GIANT; b++)
      for (let c = b; c <= MAX_GIANT; c++)
        for (let d = Math.max(c, 14); d <= MAX_GIANT; d++) add([a, b, c, d], 'generated');

  const counts: Record<string, number> = {};
  for (const c of candidates) for (const id of Object.keys(STYLES)) if (STYLES[id](c)) counts[id] = (counts[id] ?? 0) + 1;
  const seenInStyle: Record<string, number> = {};
  const keep = (id: string) => {
    const i = (seenInStyle[id] = (seenInStyle[id] ?? 0) + 1) - 1;
    const cap = CAPS[id];
    if (!cap || counts[id] <= cap) return true;
    // Keep item i if it crosses the next stride boundary.
    return Math.floor(((i + 1) * cap) / counts[id]) > Math.floor((i * cap) / counts[id]);
  };

  const puzzles: number[][] = [];
  const styles: Record<string, number[]> = Object.fromEntries(Object.keys(STYLES).map((id) => [id, []]));
  for (const c of candidates) {
    const matched = Object.keys(STYLES).filter((id) => STYLES[id](c) && keep(id));
    if (matched.length === 0) continue;
    const index = puzzles.push(c.nums) - 1;
    for (const id of matched) styles[id].push(index);
  }

  const empty = Object.keys(styles).filter((id) => styles[id].length === 0);
  if (empty.length) throw new Error(`styles with no puzzles: ${empty.join(', ')}`);

  writeFileSync(path.join(dataDir, 'pool.json'), JSON.stringify({ puzzles, styles }) + '\n');
  console.log(`${puzzles.length} puzzles`);
  for (const [id, list] of Object.entries(styles)) console.log(`  ${id.padEnd(12)} ${list.length}`);
}

main();
