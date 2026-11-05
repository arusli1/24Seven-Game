import { isSize, SIZES } from '@/lib/modes';
import { STATS, type Stat } from '@/lib/stats';
import { json, keys, redis } from '@/lib/store';

/*
 * GET /api/leaderboard/<1|3>/<single|mo3|ao5> → top players, fastest first.
 * One cached page per board, refreshed at most every 10 seconds; the URL has
 * no query string, so nothing can bypass the cache.
 */
export const revalidate = 10;
export const dynamicParams = false;
export const generateStaticParams = () =>
  SIZES.flatMap((size) => STATS.map((stat) => ({ size: String(size), stat })));

const TOP = 50;

export async function GET(_request: Request, { params }: { params: { size: string; stat: string } }) {
  const db = redis();
  if (!db) return json({ error: 'leaderboard not set up' }, 503);
  const size = Number(params.size);
  const stat = params.stat as Stat;
  if (!isSize(size) || !STATS.includes(stat)) return json({ error: 'bad request' }, 400);

  const raw = await db.zrange<(string | number)[]>(keys.board(stat, size), 0, TOP - 1, { withScores: true });
  const subs: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    subs.push(String(raw[i]));
    scores.push(Number(raw[i + 1]));
  }
  const names = subs.length ? await db.mget<(string | null)[]>(...subs.map(keys.user)) : [];
  return json({ entries: subs.map((_, i) => ({ name: names[i] ?? '?', ms: scores[i] })) });
}
