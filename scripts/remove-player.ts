/**
 * Take a player off every leaderboard (e.g. a cheated time):
 *   npm run remove-player <username>
 * Reads the Upstash credentials from the environment (`vercel env pull` writes them to .env.local).
 */
import { SIZES } from '../src/lib/modes';
import { STATS } from '../src/lib/stats';
import { keys, redis } from '../src/lib/store';

async function main() {
  const name = process.argv[2];
  const db = redis();
  if (!name || !db) {
    console.error('usage: npx tsx --env-file=.env.local scripts/remove-player.ts <username>');
    return process.exit(1);
  }
  const sub = await db.get<string>(keys.uname(name));
  if (!sub) {
    console.error(`no player named ${name}`);
    return process.exit(1);
  }
  for (const size of SIZES) {
    for (const stat of STATS) await db.zrem(keys.board(stat, size), sub);
    await db.del(keys.recent(sub, size));
  }
  console.log(`removed ${name} from all leaderboards`);
}

void main();
