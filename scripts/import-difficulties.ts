import { writeFileSync } from 'fs';
import path from 'path';
import { parse } from 'node-html-parser';

const SOURCE_URL = 'https://www.4nums.com/game/difficulties/';

async function fetchHtml() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status}`);
  }
  return response.text();
}

/** Parse markdown-style table: | 1 | 1 1 4 6 | 4.35 | 99.3% | */
function extractFromMarkdownTable(text: string) {
  const puzzles: { nums: number[]; difficulty: number; solveRate?: number }[] = [];
  const rowRe = /^\|\s*\d+\s*\|\s*(\d+\s+\d+\s+\d+\s+\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)%?/gm;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    const nums = m[1].split(/\s+/).map((n) => Number(n));
    const difficulty = Number(m[2]);
    const solveRate = Number(m[3]) / 100;
    if (nums.length === 4 && Number.isFinite(difficulty)) {
      puzzles.push({ nums, difficulty, solveRate });
    }
  }
  return puzzles;
}

function extractFromHtml(html: string) {
  const root = parse(html);
  const rows = root.querySelectorAll('tr');
  const puzzles: { nums: number[]; difficulty: number; solveRate?: number }[] = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;
    const numsMatch = cells[1]?.text.match(/\d+/g) ?? cells[0].text.match(/\d+/g);
    if (!numsMatch || numsMatch.length < 4) continue;
    const nums = numsMatch.slice(0, 4).map((n) => Number(n));
    const difficultyValue = Number((cells[2] ?? cells[1]).text.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(difficultyValue)) continue;
    const solveRateMatch = cells.length > 3 ? Number(cells[3].text.replace(/[^0-9.]/g, '')) / 100 : undefined;
    puzzles.push({ nums, difficulty: difficultyValue, solveRate: Number.isFinite(solveRateMatch) ? solveRateMatch : undefined });
  }
  if (puzzles.length > 0) return puzzles;

  const markdown = extractFromMarkdownTable(html);
  if (markdown.length > 0) return markdown;

  const scripts = root.querySelectorAll('script');
  for (const script of scripts) {
    const jsonMatches = script.innerHTML.match(/\{\"nums\":\[[^}]+\}\}/g);
    if (jsonMatches) {
      const parsed = jsonMatches.map((fragment) => JSON.parse(fragment.replace(/\\"/g, '"')));
      return parsed.map((entry: any) => ({
        nums: entry.nums,
        difficulty: Number(entry.difficulty ?? entry.score ?? 0),
        solveRate: entry.solveRate ?? entry.rate
      }));
    }
  }
  return [];
}

async function main() {
  let dataset: { nums: number[]; difficulty: number; solveRate?: number }[] = [];
  try {
    const html = await fetchHtml();
    dataset = extractFromHtml(html);
    if (dataset.length === 0) {
      dataset = extractFromMarkdownTable(html);
    }
  } catch (error) {
    console.warn('Failed to fetch or parse live data:', error);
  }

  if (dataset.length === 0) {
    console.warn('No puzzles fetched; keeping existing data/difficulties.json.');
    return;
  }

  const targetPath = path.join(process.cwd(), 'data', 'difficulties.json');
  writeFileSync(targetPath, JSON.stringify({ puzzles: dataset }, null, 2));
  console.log(`Saved ${dataset.length} puzzles to ${targetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
