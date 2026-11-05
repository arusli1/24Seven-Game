import { currentSub } from '@/lib/auth';
import { isSize } from '@/lib/modes';
import { randomSeed } from '@/lib/pool';
import { allow, json, keys, redis, RUN_TTL_SECONDS, type RunRecord } from '@/lib/store';

/**
 * Start a ranked run. The server deals (picks the seed) and notes the start
 * time, so runs can't be rehearsed or have their clock faked.
 */
export async function POST(request: Request) {
  const db = redis();
  const sub = await currentSub();
  if (!db || !sub) return json({ error: 'sign in to rank' }, 401);
  if (!(await db.get(keys.user(sub)))) return json({ error: 'pick a username first' }, 409);
  if (!(await allow(db, sub, 'run', 120))) return json({ error: 'slow down' }, 429);

  const body = await request.json().catch(() => null);
  const size = body?.size ?? 3;
  if (!isSize(size)) return json({ error: 'bad request' }, 400);

  const id = crypto.randomUUID();
  const run: RunRecord = { sub, seed: randomSeed(), start: Date.now(), size };
  await db.set(keys.run(id), run, { ex: RUN_TTL_SECONDS });
  return json({ id, seed: run.seed });
}
