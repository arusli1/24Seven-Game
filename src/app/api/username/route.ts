import { currentSub } from '@/lib/auth';
import { allow, json, keys, NAME_PATTERN, redis } from '@/lib/store';

/** Claim or change your username. First come, first served. */
export async function POST(request: Request) {
  const db = redis();
  const sub = await currentSub();
  if (!db || !sub) return json({ error: 'sign in first' }, 401);
  if (!(await allow(db, sub, 'name', 10))) return json({ error: 'slow down' }, 429);

  const { name } = await request.json().catch(() => ({}));
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return json({ error: '2–16 of a–z 0–9 _ . -' }, 400);
  }
  const old = await db.get<string>(keys.user(sub));
  if (old === name) return json({ username: name });
  if (!(await db.set(keys.uname(name), sub, { nx: true }))) return json({ error: 'name taken' }, 409);
  await db.set(keys.user(sub), name);
  if (old) await db.del(keys.uname(old));
  return json({ username: name });
}
