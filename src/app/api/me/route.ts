import { authEnabled, currentSub } from '@/lib/auth';
import { json, keys, redis } from '@/lib/store';
import { STATS } from '@/lib/stats';

export const dynamic = 'force-dynamic';

/** Who am I? Also tells the client whether ranked play is available at all. */
export async function GET() {
  const db = redis();
  if (!authEnabled || !db) return json({ enabled: false });
  const sub = await currentSub();
  if (!sub) return json({ enabled: true, signedIn: false });
  const username = await db.get<string>(keys.user(sub));
  const pbs = Object.fromEntries(
    await Promise.all(STATS.map(async (s) => [s, await db.zscore(keys.board(s), sub)] as const)),
  );
  return json({ enabled: true, signedIn: true, username, pbs });
}
