import { currentSub } from '@/lib/auth';
import { isSize } from '@/lib/modes';
import { randomSeed } from '@/lib/pool';
import { allow, clientIp, json, keys, openRun, redis, RUN_TTL_SECONDS, type RunRecord } from '@/lib/store';

/**
 * Start a timed run. The server deals (picks the seed) and notes the start
 * time, so runs can't be rehearsed or have their clock faked. Signed-out runs
 * are dealt the same way so signing in afterwards can claim one.
 */
export async function POST(request: Request) {
  const db = redis();
  if (!db) return json({ error: 'offline' }, 503);
  const body = await request.json().catch(() => null);
  const size = body?.size;
  if (!isSize(size)) return json({ error: 'bad request' }, 400);

  const sub = await currentSub();
  if (sub && !(await db.get(keys.user(sub)))) return json({ error: 'pick a username first' }, 409);
  if (!(await allow(db, sub ?? clientIp(request), 'run', 30))) return json({ error: 'slow down' }, 429);

  const id = crypto.randomUUID();
  const run: RunRecord = { sub, seed: randomSeed(), start: Date.now(), size };
  await db.set(keys.run(id), run, { ex: RUN_TTL_SECONDS });
  if (sub) await openRun(db, sub, id, size);
  return json({ id, seed: run.seed });
}
