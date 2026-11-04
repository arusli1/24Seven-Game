import { STATS, type Stat } from '@/lib/stats';
import { json, keys, redis } from '@/lib/store';

export const dynamic = 'force-dynamic';

const TOP = 50;

/** GET /api/leaderboard?stat=single|mo3|ao5 → top players (fastest first). */
export async function GET(request: Request) {
  const db = redis();
  if (!db) return json({ error: 'leaderboard not set up' }, 503);
  const stat = new URL(request.url).searchParams.get('stat') as Stat;
  if (!STATS.includes(stat)) return json({ error: 'bad stat' }, 400);

  const raw = await db.zrange<(string | number)[]>(keys.board(stat), 0, TOP - 1, { withScores: true });
  const subs: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    subs.push(String(raw[i]));
    scores.push(Number(raw[i + 1]));
  }
  const names = subs.length ? await db.mget<(string | null)[]>(...subs.map(keys.user)) : [];
  const entries = subs.map((_, i) => ({ name: names[i] ?? '?', ms: scores[i] }));
  return json({ entries }, 200, { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' });
}
