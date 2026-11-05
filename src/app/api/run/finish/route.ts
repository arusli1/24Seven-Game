import { currentSub } from '@/lib/auth';
import { dealCount } from '@/lib/pool';
import { currentStats, HISTORY, STATS } from '@/lib/stats';
import { json, keys, redis, RUN_TTL_SECONDS, type RunRecord } from '@/lib/store';
import { verifyRun } from '@/lib/verify';

/** Verify a finished ranked run by replaying its moves, then update the boards. */
export async function POST(request: Request) {
  const now = Date.now();
  const db = redis();
  const sub = await currentSub();
  if (!db || !sub) return json({ error: 'sign in to rank' }, 401);

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== 'string') return json({ error: 'bad request' }, 400);
  const run = await db.get<RunRecord>(keys.run(id));
  if (!run || run.sub !== sub) return json({ error: 'run not found' }, 404);
  if (!(await db.set(keys.runDone(id), 1, { nx: true, ex: RUN_TTL_SECONDS }))) {
    return json({ error: 'already finished' }, 409);
  }

  const size = run.size ?? 3;
  const hand = dealCount(run.seed, size);
  const outcome = verifyRun(body.results, (i) => hand[i], run.start, now, size);
  if ('error' in outcome) return json(outcome, 400);

  const recentKey = keys.recent(sub, size);
  await db.lpush(recentKey, outcome.ms);
  await db.ltrim(recentKey, 0, HISTORY - 1);
  const recent = (await db.lrange<number>(recentKey, 0, HISTORY - 1)).map(Number);
  const current = currentStats(recent);

  // Each board keeps every player's best (lowest) value for that stat.
  const pbs: Record<string, number | null> = {};
  for (const stat of STATS) {
    const value = current[stat];
    if (value !== undefined) await db.zadd(keys.board(stat, size), { lt: true }, { score: value, member: sub });
    pbs[stat] = await db.zscore(keys.board(stat, size), sub);
  }
  return json({ ms: outcome.ms, current, pbs });
}
