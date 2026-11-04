import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyMoves, type Move } from '@/lib/board';
import { dealCount } from '@/lib/pool';

/** Minimal in-memory stand-in for the Upstash commands the routes use. */
class FakeRedis {
  kv = new Map<string, unknown>();
  lists = new Map<string, unknown[]>();
  z = new Map<string, Map<string, number>>();
  async get(k: string) { return this.kv.get(k) ?? null; }
  async mget(...ks: string[]) { return ks.map((k) => this.kv.get(k) ?? null); }
  async set(k: string, v: unknown, o?: { nx?: boolean }) {
    if (o?.nx && this.kv.has(k)) return null;
    this.kv.set(k, v);
    return 'OK';
  }
  async del(k: string) { this.kv.delete(k); return 1; }
  async incr(k: string) { const n = ((this.kv.get(k) as number) ?? 0) + 1; this.kv.set(k, n); return n; }
  async expire() { return 1; }
  async lpush(k: string, v: unknown) { const l = this.lists.get(k) ?? []; l.unshift(v); this.lists.set(k, l); return l.length; }
  async ltrim(k: string, a: number, b: number) { this.lists.set(k, (this.lists.get(k) ?? []).slice(a, b + 1)); return 'OK'; }
  async lrange(k: string, a: number, b: number) { return (this.lists.get(k) ?? []).slice(a, b + 1); }
  private zs(k: string) { if (!this.z.has(k)) this.z.set(k, new Map()); return this.z.get(k)!; }
  async zadd(k: string, o: { lt?: boolean }, m: { score: number; member: string }) {
    const s = this.zs(k);
    const cur = s.get(m.member);
    if (cur === undefined || (o.lt && m.score < cur)) s.set(m.member, m.score);
    return 1;
  }
  async zscore(k: string, m: string) { return this.zs(k).get(m) ?? null; }
  async zrange(k: string, a: number, b: number) {
    return [...this.zs(k)].sort((x, y) => x[1] - y[1]).slice(a, b + 1).flatMap(([m, s]) => [m, s]);
  }
}

let db: FakeRedis;
let sub: string | null = null;
vi.mock('@/lib/store', async (orig) => ({ ...(await orig<object>()), redis: () => db }));
vi.mock('@/lib/auth', () => ({ authEnabled: true, currentSub: async () => sub, authOptions: {} }));

const { POST: claimName } = await import('../username/route');
const { POST: startRun } = await import('../run/route');
const { POST: finishRun } = await import('../run/finish/route');
const { GET: board } = await import('../leaderboard/route');
const { GET: me } = await import('../me/route');

const req = (body?: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body ?? {}) });

/** Brute-force slot moves that solve a puzzle (stand-in for a player). */
function findMoves(nums: number[]): Move[] {
  const ops = ['+', '-', '*', '/'] as const;
  const s = [0, 1, 2, 3];
  for (const a1 of s) for (const b1 of s) for (const o1 of ops)
    for (const a2 of s) for (const b2 of s) for (const o2 of ops)
      for (const a3 of s) for (const b3 of s) for (const o3 of ops) {
        const m: Move[] = [[a1, b1, o1], [a2, b2, o2], [a3, b3, o3]];
        if (verifyMoves(nums, m)) return m;
      }
  throw new Error('unsolvable');
}

async function playRun(seconds: number[]) {
  vi.setSystemTime(1_000_000);
  const { id, seed } = await (await startRun()).json();
  const hand = dealCount(seed);
  const results = [0, 1, 2].map((i) => ({ moves: findMoves(hand[i]), t: seconds[i] * 1000 }));
  vi.setSystemTime(1_000_000 + Math.max(...seconds) * 1000 + 200);
  return finishRun(req({ id, results }));
}

describe('ranked flow', () => {
  beforeEach(() => {
    db = new FakeRedis();
    vi.useFakeTimers();
  });

  it('needs sign-in and a username before ranked runs', async () => {
    sub = null;
    expect((await startRun()).status).toBe(401);
    sub = 'google-1';
    expect((await startRun()).status).toBe(409);
    expect(await (await claimName(req({ name: 'andrew' }))).json()).toEqual({ username: 'andrew' });
    expect((await startRun()).status).toBe(200);
  });

  it('usernames are unique', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    sub = 'google-2';
    expect((await claimName(req({ name: 'andrew' }))).status).toBe(409);
  });

  it('builds single, mean of 3 and average of 5 on the global board', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    for (const secs of [[10, 20, 30], [5, 10, 20], [8, 16, 25], [4, 9, 60], [6, 12, 18]]) {
      expect((await playRun(secs)).status).toBe(200);
    }
    // run times: 30, 20, 25, 60, 18 → best single 18; mo3 of (25,60,18)… best mo3 = mean(30,20,25)=25
    const single = await (await board(new Request('http://x/api/leaderboard?stat=single'))).json();
    expect(single.entries).toEqual([{ name: 'andrew', ms: 18_000 }]);
    const mo3 = await (await board(new Request('http://x/api/leaderboard?stat=mo3'))).json();
    expect(mo3.entries[0].ms).toBe(25_000);
    const ao5 = await (await board(new Request('http://x/api/leaderboard?stat=ao5'))).json();
    expect(ao5.entries[0].ms).toBe(Math.round((20_000 + 25_000 + 30_000) / 3));
    const mine = await (await me()).json();
    expect(mine).toMatchObject({ signedIn: true, username: 'andrew', pbs: { single: 18_000 } });
  });

  it('a run counts once and only for its owner', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    vi.setSystemTime(1_000_000);
    const { id, seed } = await (await startRun()).json();
    const hand = dealCount(seed);
    const results = [0, 1, 2].map((i) => ({ moves: findMoves(hand[i]), t: (i + 1) * 3000 }));
    vi.setSystemTime(1_010_000);
    sub = 'google-2';
    expect((await finishRun(req({ id, results }))).status).toBe(404);
    sub = 'google-1';
    expect((await finishRun(req({ id, results }))).status).toBe(200);
    expect((await finishRun(req({ id, results }))).status).toBe(409);
  });
});
