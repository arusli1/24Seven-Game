import { authEnabled, currentSub } from '@/lib/auth';
import { json, keys, redis } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Who am I? Also tells the client whether ranked play is available at all. */
export async function GET() {
  const db = redis();
  if (!authEnabled || !db) return json({ enabled: false });
  const sub = await currentSub();
  if (!sub) return json({ enabled: true, signedIn: false });
  return json({ enabled: true, signedIn: true, username: await db.get<string>(keys.user(sub)) });
}
