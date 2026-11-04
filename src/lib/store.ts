import { Redis } from '@upstash/redis';
import type { Stat } from './stats';

/**
 * Leaderboard storage (Upstash Redis, free tier). null when not configured,
 * in which case ranked play and the leaderboard are simply hidden.
 *
 * Keys:
 *   run:<id>          a ranked run in progress { sub, seed, start }
 *   run:<id>:done     set once (NX) so a run is scored only once
 *   user:<sub>        username for a Google account
 *   uname:<name>      owner (sub) of a username
 *   recent:<sub>      last few run times, newest first
 *   board:<stat>      sorted set of each player's best, by sub
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
  sub: string;
  seed: number;
  start: number;
}

export const RUN_TTL_SECONDS = 60 * 60;

export const keys = {
  run: (id: string) => `run:${id}`,
  runDone: (id: string) => `run:${id}:done`,
  user: (sub: string) => `user:${sub}`,
  uname: (name: string) => `uname:${name}`,
  recent: (sub: string) => `recent:${sub}`,
  board: (stat: Stat) => `board:${stat}`,
};

/** Lowercase so "Andrew" and "andrew" can't be two people. */
export const NAME_PATTERN = /^[a-z0-9_.-]{2,16}$/;

export async function allow(db: Redis, who: string, bucket: string, limit: number) {
  const key = `rl:${bucket}:${who}:${Math.floor(Date.now() / 60000)}`;
  const n = await db.incr(key);
  if (n === 1) await db.expire(key, 60);
  return n <= limit;
}

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers });
