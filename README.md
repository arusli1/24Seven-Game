# twentyfour

The hardest 24 game. Make 24 from four numbers with + − × ÷.

Website: https://hard24.vercel.app

## Modes

- **zen** (default): endless practice with back/forward history, a one-step hint, then every distinct solution.
- **1 timed / 3 timed**: a timed run of 1 or 3 puzzles, fixed for that run; solve them in any order, as fast
  as you can. 3 deals one easy, one medium, one hard; 1 deals one hard. Each has its own leaderboard.

Keys (matched by physical key, so the home row works on any layout):

| key | does |
|---|---|
| `a s d f` (or `1`–`4`) | pick card 1–4 |
| `j k l ;` (or `+ - * /`) | + − × ÷ |
| `space` / `backspace` / `delete` | undo |
| `esc` | clear selection |
| `return` / `→` | zen: next puzzle · timed: next puzzle in the run, or start |
| `shift` `return` / `←` | zen: previous puzzle · timed: previous puzzle in the run |
| `↑` | timed: new run |
| `?` | zen: hint, then all solutions |
| `tab` | switch mode (not mid-run) |
| `h` | how to play |

Held keys don't repeat (except undo). A solved puzzle in a run is locked.

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

Timed runs are ranked when you're signed in with Google and have picked a username; zen is always
casual. Finish a run signed out, then sign in within the hour, and that run is ranked (once per player).
Each mode (1 timed, 3 timed) has one board: every player's best run. A run you start and abandon
never counts.

The server deals every run (`POST /api/run`), then replays every move and checks the timing before
accepting it (`POST /api/run/finish`, `src/lib/verify.ts`). Data lives in Upstash Redis (free tier);
sign-in is Google via next-auth with cookie sessions. Without the env vars in `.env.example`, sign-in and
the leaderboard are hidden and everything else works.

To take a cheated time down: `npm run remove-player <username>` (needs the Upstash vars in `.env.local`).

## Development

```bash
npm install
npm run dev   # http://localhost:3000
npm test
```
