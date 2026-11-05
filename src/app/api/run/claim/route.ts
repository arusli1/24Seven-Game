import { currentSub } from '@/lib/auth';
import { json, keys, recordRun, redis } from '@/lib/store';
import type { Size } from '@/lib/modes';

/**
 * Rank a run finished while signed out, after signing in. Once per player,
 * for the latest run only (the client keeps its id), within the hour.
 */
export async function POST(request: Request) {
  const db = redis();
  const sub = await currentSub();
  if (!db || !sub) return json({ error: 'sign in first' }, 401);
  if (!(await db.get(keys.user(sub)))) return json({ error: 'pick a username first' }, 409);
  const id = (await request.json().catch(() => null))?.id;
  if (typeof id !== 'string') return json({ error: 'bad request' }, 400);

  const result = await db.get<{ size: Size; ms: number }>(keys.result(id));
  if (!result) return json({ error: 'run expired' }, 404);
  if (!(await db.set(keys.claimed(sub), id, { nx: true }))) return json({ error: 'already claimed one' }, 409);
  await db.del(keys.result(id));
  return json({ ms: result.ms, size: result.size, ...(await recordRun(db, sub, result.size, result.ms)) });
}
