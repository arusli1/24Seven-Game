import { currentSub } from '@/lib/auth';
import { dealRun } from '@/lib/pool';
import { json, keys, recordRun, redis, RUN_TTL_SECONDS, type RunRecord } from '@/lib/store';
import { verifyRun } from '@/lib/verify';

/** Verify a finished run by replaying its moves, then rank it (or hold it for a sign-in claim). */
export async function POST(request: Request) {
  const now = Date.now();
  const db = redis();
  if (!db) return json({ error: 'offline' }, 503);
  const sub = await currentSub();

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== 'string') return json({ error: 'bad request' }, 400);
  const run = await db.get<RunRecord>(keys.run(id));
  if (!run || run.sub !== sub) return json({ error: 'run not found' }, 404);
  // Taking the run out makes it count once.
  if (!(await db.del(keys.run(id)))) return json({ error: 'already finished' }, 409);

  const hand = dealRun(run.seed, run.size);
  const outcome = verifyRun(body.results, (i) => hand[i], run.size, run.start, now);
  if ('error' in outcome) return json(outcome, 400);

  if (!sub) {
    await db.set(keys.result(id), { size: run.size, ms: outcome.ms }, { ex: RUN_TTL_SECONDS });
    return json({ ms: outcome.ms });
  }
  await db.del(keys.open(sub));
  return json({ ms: outcome.ms, ...(await recordRun(db, sub, run.size, outcome.ms)) });
}
