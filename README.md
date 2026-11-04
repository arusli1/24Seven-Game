# twentyfour

The hardest 24 game. Make 24 from four numbers with + − × ÷.

Website: https://hard24.vercel.app

## Modes

- **zen** (default): endless practice with real back/forward history and every distinct solution.
- **count**: a run deals 3 puzzles, fixed for that run; solve them in any order, as fast as you can.

Keys:

| key | does |
|---|---|
| `a s d f` (or `1`–`4`) | pick card 1–4 |
| `j k l ;` (or `+ - * /`) | + − × ÷ |
| `space` / `backspace` / `delete` | undo |
| `esc` | clear selection |
| `→` | zen: next puzzle · count: next puzzle in the run, or start |
| `←` | zen: previous puzzle · count: previous puzzle in the run |
| `↑` | count: new run |
| `?` | zen: show solutions |

Only arrows change the puzzle or run, so no other key can throw away work.

Merging: pick card A, an operator, then card B. A op B lands in B's slot and stays selected; A's slot
empties. Slots never shift, so `a l s` is always slot 1 × slot 2.

## Puzzles

`npm run build:pool` writes `data/pool.json` from:

- `data/difficulties.json`: 4nums.com puzzles with real solve rates (refresh with `npm run import:difficulties`)
- `data/handmade.json`: hand-picked puzzles
- generated sets with numbers up to 30

Each puzzle is tagged with every style it fits (fraction, decoy, giant, …; see `scripts/build-pool.ts`).
`STYLE_WEIGHTS` in `src/lib/pool.ts` sets how often each style is served.

## Ranked play and leaderboard

Count runs are ranked when you're signed in with Google and have picked a username; zen is always
casual. One global board with three tabs, speedcubing style: **single** (best run), **avg of 3**
(mean of 3 runs in a row) and **avg of 5** (5 in a row, drop best and worst, mean of the rest).

The server deals each ranked run (`POST /api/run`), then replays every move and checks the timing
before accepting it (`POST /api/run/finish`, `src/lib/verify.ts`). Data lives in Upstash Redis
(free tier); sign-in is Google via next-auth with cookie sessions. Without the env vars in
`.env.example`, sign-in and the leaderboard are hidden and everything else works.

## Development

```bash
npm install
npm run dev   # http://localhost:3000
npm test
```
