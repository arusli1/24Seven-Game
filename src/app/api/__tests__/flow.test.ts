import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyMoves, type Move } from '@/lib/board';
import { dealRun } from '@/lib/pool';
import type { Size } from '@/lib/modes';

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
  async del(k: string) { return this.kv.delete(k) ? 1 : 0; }
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
const { POST: claimRun } = await import('../run/claim/route');
const { GET: boardGet } = await import('../leaderboard/[size]/[stat]/route');
const board = async (size: Size, stat: string) =>
  (await boardGet(new Request('http://x'), { params: { size: String(size), stat } })).json();
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

async function playRun(seconds: number[], size: Size = 3) {
  vi.setSystemTime(1_000_000);
  const { id, seed } = await (await startRun(req({ size }))).json();
  const hand = dealRun(seed, size);
  const results = hand.map((nums, i) => ({ moves: findMoves(nums), t: seconds[i] * 1000 }));
  vi.setSystemTime(1_000_000 + Math.max(...seconds) * 1000 + 200);
  return finishRun(req({ id, results }));
}

describe('ranked flow', () => {
  beforeEach(() => {
    db = new FakeRedis();
    vi.useFakeTimers();
  });

  it('signed in, a username is needed before ranked runs', async () => {
    sub = 'google-1';
    expect((await startRun(req({ size: 3 }))).status).toBe(409);
    expect(await (await claimName(req({ name: 'andrew' }))).json()).toEqual({ username: 'andrew' });
    expect((await startRun(req({ size: 3 }))).status).toBe(200);
    expect((await startRun(req({ size: 2 }))).status).toBe(400);
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
    // run times: 30, 20, 25, 60, 18 → best single 18; best mo3 = mean(30,20,25) = 25
    expect((await board(3, 'single')).entries).toEqual([{ name: 'andrew', ms: 18_000 }]);
    expect((await board(3, 'mo3')).entries[0].ms).toBe(25_000);
    expect((await board(3, 'ao5')).entries[0].ms).toBe(Math.round((20_000 + 25_000 + 30_000) / 3));
    expect(await (await me()).json()).toEqual({ enabled: true, signedIn: true, username: 'andrew' });
  });

  it('1-puzzle runs deal one hard puzzle and rank on their own board', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    expect((await playRun([7], 1)).status).toBe(200);
    expect((await board(1, 'single')).entries).toEqual([{ name: 'andrew', ms: 7000 }]);
    expect((await board(3, 'single')).entries).toEqual([]);
  });

  it('an abandoned run is a DNF in the next average', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    await playRun([10, 20, 30]);
    await startRun(req({ size: 3 })); // abandoned
    await playRun([5, 10, 20]);
    const res = await (await playRun([5, 10, 20])).json();
    expect(res.current).toEqual({ single: 20_000 }); // last 3 include the DNF, so no avg of 3
    expect(db.lists.get('recent:google-1')).toEqual([20_000, 20_000, -1, 30_000]);
  });

  it('a run counts once and only for its owner', async () => {
    sub = 'google-1';
    await claimName(req({ name: 'andrew' }));
    vi.setSystemTime(1_000_000);
    const { id, seed } = await (await startRun(req({ size: 3 }))).json();
    const hand = dealRun(seed, 3);
    const results = hand.map((nums, i) => ({ moves: findMoves(nums), t: (i + 1) * 3000 }));
    vi.setSystemTime(1_010_000);
    sub = 'google-2';
    expect((await finishRun(req({ id, results }))).status).toBe(404);
    sub = 'google-1';
    expect((await finishRun(req({ id, results }))).status).toBe(200);
    expect((await finishRun(req({ id, results }))).status).toBe(404);
  });

  it('a run finished signed out can be claimed once after signing in', async () => {
    sub = null;
    const finished = await playRun([4, 8, 12]);
    expect(await finished.json()).toEqual({ ms: 12_000 });
    const { id } = [...db.kv.keys()].filter((k) => k.startsWith('result:')).map((k) => ({ id: k.slice(7) }))[0];

    expect((await claimRun(req({ id }))).status).toBe(401);
    sub = 'google-1';
    expect((await claimRun(req({ id }))).status).toBe(409); // no username yet
    await claimName(req({ name: 'andrew' }));
    const claimed = await (await claimRun(req({ id }))).json();
    expect(claimed).toMatchObject({ ms: 12_000, size: 3, current: { single: 12_000 } });
    expect((await board(3, 'single')).entries).toEqual([{ name: 'andrew', ms: 12_000 }]);
    expect((await claimRun(req({ id }))).status).toBe(404);

    // Only one claim per player.
    sub = null;
    await playRun([4, 8, 12]);
    const second = [...db.kv.keys()].find((k) => k.startsWith('result:'))!.slice(7);
    sub = 'google-1';
    expect((await claimRun(req({ id: second }))).status).toBe(409);
  });
});
