'use client';

import { signIn, signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { Board } from './board';
import { HelpDialog } from './help-dialog';
import { Leaderboard } from './leaderboard';
import { Results, type RankedOutcome } from './results';
import { post, useAccount } from './use-account';
import { UsernameDialog } from './username-dialog';
import { isSolved, newBoard, type BoardState } from '@/lib/board';
import { formatMs, MODES, modeLabel, type Mode, type Size } from '@/lib/modes';
import { dealRun, puzzleStream, randomSeed, type Numbers } from '@/lib/pool';
import { distinctSolutions, firstStep } from '@/lib/solutions';

/** How long a solved zen puzzle stays up before the next one deals (return skips it). */
const ZEN_ADVANCE_MS = 900;
/** How long the final 24 of a timed run stays up before the results. */
const FINISH_HOLD_MS = 600;
/** Return and ↑ are ignored this long after the results appear, so a habitual press can't skip them. */
const RESULTS_GRACE_MS = 500;
/** Zen opens with an easy one, then 1 4 5 6. */
const ZEN_OPENERS: Numbers[] = [[1, 2, 3, 4], [1, 4, 5, 6]];
/** A run finished while signed out, kept so signing in can rank it. */
const CLAIM_KEY = 'unranked-run';
const CLAIM_TTL_MS = 55 * 60 * 1000;

type Phase = 'ready' | 'dealing' | 'play' | 'results';

/** A timed run: its own dealt puzzles, fixed for the run, playable in any order. */
interface Run {
  /** Server run id; null when the server couldn't be reached (casual). */
  id: string | null;
  /** Why a signed-in run ended up casual, if it did. */
  offline: string | null;
  size: Size;
  puzzles: Numbers[];
  boards: BoardState[];
  /** ms after the start when each puzzle was solved. */
  solvedAt: (number | null)[];
  /** Which puzzle is on the table. */
  idx: number;
  /** performance.now() when the cards were first on screen. */
  startedAt: number;
  /** All solved; holding the last 24 before the results. */
  finishing: boolean;
}

interface Result {
  ms: number;
  size: Size;
  /** Time for each puzzle, in the order solved. */
  splits: number[];
}

/** 0 hidden, 1 a first-step hint, 2 every solution. */
type Reveal = 0 | 1 | 2;
interface ZenEntry { nums: Numbers; board: BoardState; solved: boolean; reveal: Reveal }
interface Zen { entries: ZenEntry[]; idx: number }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

export function App() {
  const [mode, setMode] = useState<Mode>('zen');
  const [phase, setPhase] = useState<Phase>('ready');
  const [run, setRunState] = useState<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [ranked, setRanked] = useState<RankedOutcome | null>(null);
  const [rankNote, setRankNote] = useState<string | null>(null);
  /** A signed-out finish that signing in would rank. */
  const [claimable, setClaimable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leaderboard' | 'name' | 'help' | null>(null);
  const { account, setAccount, refresh } = useAccount();
  const [mouseActive, setMouseActive] = useState(true);
  const [zen, setZenState] = useState<Zen | null>(null);

  // Refs mirror state that timers and key handlers read.
  const runRef = useRef<Run | null>(null);
  const zenRef = useRef<Zen | null>(null);
  const runToken = useRef(0);
  const resultsAt = useRef(0);
  const [zenStream] = useState(() => puzzleStream(randomSeed()));
  const zenCount = useRef(0);

  const setRun = (r: Run | null) => {
    runRef.current = r;
    setRunState(r);
  };
  const setZen = (z: Zen) => {
    zenRef.current = z;
    setZenState(z);
  };

  // Show how to play once, on a first visit.
  useEffect(() => {
    if (!store.get('seen-help')) {
      store.set('seen-help', '1');
      setDialog('help');
    }
  }, []);

  /* ----- timed runs ----- */

  const toReady = (m: Mode) => {
    runToken.current++;
    setRun(null);
    setResult(null);
    setPhase('ready');
    if (m === 'zen' && !zenRef.current) setZen({ entries: [makeZenEntry()], idx: 0 });
  };

  /** Start a run. The server deals when it can (so the run can be ranked); otherwise the browser does. */
  const begin = async (size: Size) => {
    if (phase === 'dealing') return;
    const token = ++runToken.current;
    setPhase('dealing');
    let id: string | null = null;
    let seed = randomSeed();
    let offline: string | null = null;
    if (account.enabled) {
      try {
        ({ id, seed } = await post<{ id: string; seed: number }>('/api/run', { size }, 2500));
      } catch (e) {
        if (account.signedIn) offline = (e as Error).message;
      }
      if (token !== runToken.current) return;
    }
    const puzzles = dealRun(seed, size);
    setRun({
      id,
      offline,
      size,
      puzzles,
      boards: puzzles.map((p) => newBoard(p)),
      solvedAt: puzzles.map(() => null),
      idx: 0,
      startedAt: performance.now(),
      finishing: false,
    });
    setResult(null);
    setRanked(null);
    setRankNote(null);
    setClaimable(false);
    setPhase('play');
    // Start the clock once the cards are actually on screen.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = runRef.current;
      if (r && token === runToken.current && r.solvedAt.every((t) => t === null)) {
        setRun({ ...r, startedAt: performance.now() });
      }
    }));
  };

  const finish = async (r: Run, token: number) => {
    const times = r.solvedAt.map((t) => t ?? 0).sort((a, b) => a - b);
    const ms = times[times.length - 1];
    setRun(null);
    setResult({ ms, size: r.size, splits: times.map((t, i) => t - (times[i - 1] ?? 0)) });
    setPhase('results');
    resultsAt.current = performance.now();
    if (!r.id) {
      setRankNote(r.offline ? `casual: ${r.offline}` : null);
      return;
    }
    setRankNote('…');
    try {
      const results = r.puzzles.map((_, i) => ({ moves: r.boards[i].moves, t: Math.round(r.solvedAt[i]!) }));
      const out = await post<Partial<RankedOutcome> & { ms: number }>('/api/run/finish', { id: r.id, results });
      if (token !== runToken.current) return;
      setResult((x) => x && { ...x, ms: out.ms });
      setRankNote(null);
      if (out.current && out.pbs) setRanked({ current: out.current, pbs: out.pbs });
      else {
        // Signed out: keep the run so signing in can rank it.
        store.set(CLAIM_KEY, JSON.stringify({ id: r.id, at: Date.now() }));
        setClaimable(true);
      }
    } catch (e) {
      if (token === runToken.current) setRankNote((e as Error).message);
    }
  };

  // Signed in (and named) with a signed-out run waiting: rank it.
  useEffect(() => {
    if (!account.signedIn || !account.username) return;
    const raw = store.get(CLAIM_KEY);
    if (!raw) return;
    store.del(CLAIM_KEY);
    try {
      const { id, at } = JSON.parse(raw) as { id: string; at: number };
      if (Date.now() - at > CLAIM_TTL_MS) return;
      post<{ ms: number }>('/api/run/claim', { id })
        .then((out) => setToast(`your ${formatMs(out.ms)} run is ranked`))
        .catch(() => {});
    } catch {}
  }, [account.signedIn, account.username]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pickRunPuzzle = (idx: number) => {
    const r = runRef.current;
    if (r && !r.finishing && idx >= 0 && idx < r.puzzles.length) setRun({ ...r, idx });
  };

  const onRunBoard = (next: BoardState) => {
    const r = runRef.current;
    // A solved puzzle is locked: undoing it would break the run.
    if (!r || r.finishing || r.solvedAt[r.idx] !== null) return;
    const boards = r.boards.map((b, i) => (i === r.idx ? next : b));
    if (!isSolved(next)) {
      setRun({ ...r, boards });
      return;
    }
    const solvedAt = r.solvedAt.map((t, i) => (i === r.idx ? performance.now() - r.startedAt : t));
    const n = r.puzzles.length;
    const nextIdx = Array.from({ length: n - 1 }, (_, k) => (r.idx + k + 1) % n).find((i) => solvedAt[i] === null);
    if (nextIdx === undefined) {
      const done = { ...r, boards, solvedAt, finishing: true };
      setRun(done);
      const token = runToken.current;
      setTimeout(() => {
        if (token === runToken.current) void finish(done, token);
      }, FINISH_HOLD_MS);
      return;
    }
    // Move straight to the next unsolved puzzle.
    setRun({ ...r, boards, solvedAt, idx: nextIdx });
  };

  /* ----- zen ----- */

  function makeZenEntry(): ZenEntry {
    const n = zenCount.current++;
    const nums = ZEN_OPENERS[n] ?? zenStream(n);
    return { nums, board: newBoard(nums), solved: false, reveal: 0 };
  }

  const zenGo = (delta: 1 | -1) => {
    const z = zenRef.current;
    if (!z) return;
    if (delta === -1) {
      if (z.idx > 0) setZen({ ...z, idx: z.idx - 1 });
    } else if (z.idx < z.entries.length - 1) {
      setZen({ ...z, idx: z.idx + 1 });
    } else {
      setZen({ entries: [...z.entries, makeZenEntry()], idx: z.idx + 1 });
    }
  };

  const updateZenEntry = (fn: (e: ZenEntry) => ZenEntry) => {
    const z = zenRef.current;
    if (z) setZen({ ...z, entries: z.entries.map((e, i) => (i === z.idx ? fn(e) : e)) });
  };

  const onZenBoard = (next: BoardState) => {
    const z = zenRef.current;
    if (!z) return;
    const idx = z.idx;
    const justSolved = isSolved(next) && !z.entries[idx].solved;
    updateZenEntry((e) => ({ ...e, board: next, solved: e.solved || justSolved }));
    if (justSolved) {
      setTimeout(() => {
        if (zenRef.current?.idx === idx) zenGo(1);
      }, ZEN_ADVANCE_MS);
    }
  };

  /** Hint, then every solution, then hide. */
  const stepReveal = () => updateZenEntry((e) => ({ ...e, reveal: ((e.reveal + 1) % 3) as Reveal }));

  /* ----- modes ----- */

  // Always open in zen.
  useEffect(() => toReady('zen'), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    toReady(m);
  };

  /* ----- keys ----- */

  /** Signed in for the first time: a username is needed before anything else. */
  const mustPickName = account.signedIn && !account.username;

  /**
   * App-level keys. Card, operator and undo keys live in Board.
   *   return / →         zen: next · timed: next puzzle, or start
   *   shift+return / ←   zen: previous · timed: previous puzzle
   *   ↑                  timed: new run
   *   ?                  zen: hint, then solutions
   *   tab                switch mode (not during a run)
   *   h                  how to play
   */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    setMouseActive(false);
    const k = e.key === 'Enter' ? (e.shiftKey ? 'ArrowLeft' : 'ArrowRight') : e.key;
    if (k === ' ' || k === 'Tab' || k.startsWith('Arrow')) e.preventDefault(); // no scrolling or focus jumps
    if (dialog || mustPickName) {
      if ((k === 'Escape' || (dialog === 'help' && k === 'ArrowRight')) && !mustPickName) setDialog(null);
      return;
    }
    if (e.repeat) return; // holding a key must not skip puzzles or burn runs
    if (k === 'h') return setDialog('help');
    const busy = phase === 'play' || phase === 'dealing';
    if (k === 'Tab' && !(busy && mode !== 'zen')) {
      const i = MODES.indexOf(mode);
      return chooseMode(MODES[(i + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length]);
    }
    if (mode === 'zen') {
      if (k === 'ArrowRight') zenGo(1);
      else if (k === 'ArrowLeft') zenGo(-1);
      else if (k === '?') stepReveal();
    } else if (phase === 'play' && (k === 'ArrowRight' || k === 'ArrowLeft')) {
      const r = runRef.current;
      if (r) pickRunPuzzle((r.idx + (k === 'ArrowRight' ? 1 : r.puzzles.length - 1)) % r.puzzles.length);
    } else if ((k === 'ArrowRight' && !busy) || k === 'ArrowUp') {
      if (phase === 'results' && performance.now() - resultsAt.current < RESULTS_GRACE_MS) return;
      void begin(mode);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    // Clicking a button must not focus it, or a later key press could click it again.
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('button')) e.preventDefault();
    };
    const onMove = () => setMouseActive(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  /* ----- render ----- */

  const zenEntry = zen?.entries[zen.idx];
  const playing = phase === 'play' && mode !== 'zen';
  const onBoard = mode === 'zen' || playing;
  const overlay = dialog !== null || mustPickName;

  return (
    <div className={`shell ${playing && !mouseActive ? 'is-focused' : ''} ${mode !== 'zen' ? 'is-timed' : ''}`}>
      <header className="top fade">
        <button className="logo" onClick={() => mode !== 'zen' && toReady(mode)} aria-label="twentyfour">
          <span className="suit" aria-hidden>♦</span>twentyfour
        </button>
        <div className="account">
          {account.enabled && (
            <>
              <button className="link" onClick={() => setDialog('leaderboard')}>leaderboard</button>
              {account.signedIn ? (
                <button className="link" onClick={() => setDialog('name')}>{account.username ?? '…'}</button>
              ) : (
                <button className="link" onClick={() => void signIn('google')}>sign in</button>
              )}
            </>
          )}
          <button className="link help-link" onClick={() => setDialog('help')} aria-label="how to play">?</button>
        </div>
      </header>

      <nav className="modes fade" aria-label="mode">
        {MODES.map((m) => (
          <button key={m} className={`link ${mode === m ? 'is-active' : ''}`} onClick={() => chooseMode(m)}>
            {modeLabel(m)}
          </button>
        ))}
      </nav>

      {toast && <p className="toast muted">{toast}</p>}

      <main className="stage">
        {mode === 'zen' ? (
          zen && zenEntry && (
            <>
              <div className="status">
                <button className="link nav" onClick={() => zenGo(-1)} disabled={zen.idx === 0} aria-label="previous puzzle">‹</button>
                <button className="link nav" onClick={() => zenGo(1)} aria-label="next puzzle">›</button>
              </div>
              <Board key={`zen-${zen.idx}`} state={zenEntry.board} onChange={onZenBoard} disabled={overlay} />
              <div className="under">
                {zenEntry.reveal === 0 && <button className="link" onClick={stepReveal}>hint</button>}
                {zenEntry.reveal === 1 && (
                  <>
                    <p className="muted">try <span className="hint">{firstStep(zenEntry.nums) ?? '—'}</span></p>
                    <button className="link" onClick={stepReveal}>all solutions</button>
                  </>
                )}
                {zenEntry.reveal === 2 && <SolutionList nums={zenEntry.nums} />}
              </div>
            </>
          )
        ) : phase === 'results' && result ? (
          <Results
            ms={result.ms}
            size={result.size}
            splits={result.splits}
            ranked={ranked}
            onRestart={() => void begin(mode)}
            note={
              rankNote ??
              (account.enabled && !account.signedIn ? (
                <button className="link inline" onClick={() => void signIn('google')}>
                  {claimable ? 'sign in to rank this run' : 'sign in to rank'}
                </button>
              ) : null)
            }
          />
        ) : phase === 'play' && run ? (
          <>
            <div className="status">
              {run.puzzles.length > 1 ? (
                <div className="hand-tabs" role="tablist" aria-label="this run's puzzles">
                  {run.puzzles.map((_, i) => {
                    const done = run.solvedAt[i] !== null;
                    return (
                      <button
                        key={i}
                        role="tab"
                        aria-selected={i === run.idx}
                        aria-label={`puzzle ${i + 1}${done ? ', solved' : ''}`}
                        className={`hand-tab ${i === run.idx ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                        onClick={() => pickRunPuzzle(i)}
                      >
                        {i + 1}{done && ' ✓'}
                      </button>
                    );
                  })}
                </div>
              ) : <span />}
              <span className="clock-row">
                <Clock startedAt={run.startedAt} stopped={run.finishing} />
                <button className="link restart" onClick={() => void begin(run.size)} aria-label="new run">↻</button>
              </span>
            </div>
            <Board
              key={`run-${run.idx}`}
              state={run.boards[run.idx]}
              onChange={onRunBoard}
              disabled={overlay || run.solvedAt[run.idx] !== null}
            />
            <div className="under muted">{run.offline ? `casual: ${run.offline}` : ''}</div>
          </>
        ) : (
          <div className="ready-screen">
            <div className="backs" aria-hidden>
              {Array.from({ length: mode }, (_, i) => <span key={i} className="back" />)}
            </div>
            <button className="ready" onClick={() => void begin(mode)} disabled={phase === 'dealing'}>
              {phase === 'dealing' ? '…' : 'start'} <kbd>return</kbd>
            </button>
          </div>
        )}
      </main>

      <footer className="keys muted fade">
        {onBoard ? (
          <>
            <span><kbd>a</kbd><kbd>s</kbd><kbd>d</kbd><kbd>f</kbd> card</span>
            <span><kbd>j</kbd><kbd>k</kbd><kbd>l</kbd><kbd>;</kbd> + − × ÷</span>
            <span><kbd>space</kbd> undo</span>
            <span><kbd>return</kbd> next</span>
            {mode === 'zen' ? <span><kbd>?</kbd> hint</span> : <span><kbd>↑</kbd> restart</span>}
          </>
        ) : (
          <>
            <span><kbd>return</kbd> start</span>
            <span><kbd>tab</kbd> mode</span>
          </>
        )}
      </footer>

      {dialog === 'help' && !mustPickName && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'leaderboard' && (
        <Leaderboard me={account.username} initialSize={mode === 'zen' ? 3 : mode} onClose={() => setDialog(null)} />
      )}
      {(mustPickName || dialog === 'name') && (
        <UsernameDialog
          current={account.username}
          onDone={(username) => {
            setAccount((a) => ({ ...a, username }));
            setDialog(null);
            void refresh();
          }}
          onClose={mustPickName ? undefined : () => setDialog(null)}
          onSignOut={() => void signOut({ redirect: false }).then(refresh)}
        />
      )}
    </div>
  );
}

function SolutionList({ nums }: { nums: Numbers }) {
  const list = distinctSolutions(nums);
  return (
    <>
      <p className="muted solutions-count">
        {list.length} {list.length === 1 ? 'solution' : 'solutions'}
      </p>
      <ul className="solutions">
        {list.map((s) => <li key={s}>{s}</li>)}
      </ul>
    </>
  );
}

/** Ticks on its own so the rest of the page doesn't re-render. */
function Clock({ startedAt, stopped }: { startedAt: number; stopped: boolean }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (stopped) return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [stopped]);
  return <span className="muted clock">{(Math.max(0, now - startedAt) / 1000).toFixed(1)}s</span>;
}
