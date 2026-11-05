import { Redis } from '@upstash/redis';
import type { Size } from './modes';
import { currentStats, DNF, HISTORY, STATS, type Stat } from './stats';

/**
 * Leaderboard storage (Upstash Redis, free tier). null when not configured,
 * in which case ranked play and the leaderboard are simply hidden.
 *
 * Keys:
 *   run:<id>             a timed run in progress { sub, seed, start, size }; sub is null when signed out
 *   open:<sub>           the player's unfinished run { id, size }; still there at the next start = DNF
 *   result:<id>          a verified signed-out run { size, ms }, kept an hour so signing in can claim it
 *   claimed:<sub>        set once: a player may claim one signed-out run
 *   user:<sub>           username for a Google account
 *   uname:<name>         owner (sub) of a username
 *   recent:<sub>         last few 3-run times, newest first (recent1: for 1-runs)
 *   board:<stat>         sorted set of each player's best, by sub (board1: for 1-runs)
 *   rl:<bucket>:<who>:<minute>   rate limit counters
 */
let client: Redis | null | undefined;

export function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export interface RunRecord {
  sub: string | null;
  seed: number;
  start: number;
  size: Size;
}

export const RUN_TTL_SECONDS = 60 * 60;
const OPEN_TTL_SECONDS = 24 * 60 * 60;

const sized = (base: string, size: Size) => (size === 1 ? `${base}1` : base);

export const keys = {
  run: (id: string) => `run:${id}`,
  open: (sub: string) => `open:${sub}`,
  result: (id: string) => `result:${id}`,
  claimed: (sub: string) => `claimed:${sub}`,
  user: (sub: string) => `user:${sub}`,
  uname: (name: string) => `uname:${name}`,
  recent: (sub: string, size: Size) => `${sized('recent', size)}:${sub}`,
  board: (stat: Stat, size: Size) => `${sized('board', size)}:${stat}`,
};

/** Lowercase so "Andrew" and "andrew" can't be two people. */
export const NAME_PATTERN = /^[a-z0-9_.-]{2,16}$/;

export async function allow(db: Redis, who: string, bucket: string, limit: number) {
  const key = `rl:${bucket}:${who}:${Math.floor(Date.now() / 60000)}`;
  const n = await db.incr(key);
  if (n === 1) await db.expire(key, 60);
  return n <= limit;
}

/** Note a started run; an earlier run left unfinished becomes a DNF. */
export async function openRun(db: Redis, sub: string, id: string, size: Size) {
  const prev = await db.get<{ id: string; size: Size }>(keys.open(sub));
  if (prev) await pushTime(db, sub, prev.size, DNF);
  await db.set(keys.open(sub), { id, size }, { ex: OPEN_TTL_SECONDS });
}

async function pushTime(db: Redis, sub: string, size: Size, ms: number) {
  const k = keys.recent(sub, size);
  await db.lpush(k, ms);
  await db.ltrim(k, 0, HISTORY - 1);
  return (await db.lrange<number>(k, 0, HISTORY - 1)).map(Number);
}

/** Add a finished run to a player's history and boards. Returns their stats now and their bests. */
export async function recordRun(db: Redis, sub: string, size: Size, ms: number) {
  const current = currentStats(await pushTime(db, sub, size, ms));
  // Each board keeps every player's best (lowest) value for that stat.
  await Promise.all(
    STATS.filter((s) => current[s] !== undefined).map((s) =>
      db.zadd(keys.board(s, size), { lt: true }, { score: current[s]!, member: sub }),
    ),
  );
  const scores = await Promise.all(STATS.map((s) => db.zscore(keys.board(s, size), sub)));
  const pbs = Object.fromEntries(STATS.map((s, i) => [s, scores[i]])) as Record<Stat, number | null>;
  return { current, pbs };
}

/** Who is asking, for rate limits when signed out. */
export const clientIp = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers });
