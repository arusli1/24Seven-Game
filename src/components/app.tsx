'use client';

import { signIn, signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { Board } from './board';
import { Leaderboard } from './leaderboard';
import { Results, type RankedOutcome } from './results';
import { post, useAccount } from './use-account';
import { UsernameDialog } from './username-dialog';
import { HelpDialog } from './help-dialog';
import { isSolved, newBoard, type BoardState } from '@/lib/board';
import { COUNT_PUZZLES, type Kind } from '@/lib/modes';
import { dealCount, puzzleStream, randomSeed, type Numbers } from '@/lib/pool';
import { distinctSolutions } from '@/lib/solutions';

const ZEN_ADVANCE_MS = 350;
/** Every zen session opens with this one. */
const ZEN_FIRST: Numbers = [1, 4, 5, 6];

type Phase = 'ready' | 'play' | 'results';

/** A count run: its own dealt puzzles, fixed for the run, playable in any order. */
interface Run {
  /** Server run id when ranked; null when casual. */
  id: string | null;
  /** Why a signed-in run ended up casual, if it did. */
  offline: string | null;
  puzzles: Numbers[];
  boards: BoardState[];
  /** ms after the start when each puzzle was solved. */
  solvedAt: (number | null)[];
  done: boolean[];
  /** Which puzzle is on the table. */
  idx: number;
  /** performance.now() at the start. */
  startedAt: number;
}

interface ZenEntry { nums: Numbers; board: BoardState; solved: boolean; revealed: boolean }
interface Zen { entries: ZenEntry[]; idx: number }

export function App() {
  const [kind, setKind] = useState<Kind>('zen');
  const [phase, setPhase] = useState<Phase>('ready');
  const [run, setRunState] = useState<Run | null>(null);
  /** Final time of the last count run, plus its ranked stats once verified. */
  const [resultMs, setResultMs] = useState<number | null>(null);
  const [ranked, setRanked] = useState<RankedOutcome | null>(null);
  const [rankNote, setRankNote] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leaderboard' | 'name' | 'help' | null>(null);

  // Show how to play once, on a first visit.
  useEffect(() => {
    try {
      if (!localStorage.getItem('seen-help')) {
        localStorage.setItem('seen-help', '1');
        setDialog('help');
      }
    } catch {}
  }, []);
  const { account, setAccount, refresh } = useAccount();
  const runToken = useRef(0);
  const [mouseActive, setMouseActive] = useState(true);
  const [zen, setZenState] = useState<Zen | null>(null);

  // Refs mirror state that timers and key handlers read.
  const runRef = useRef<Run | null>(null);
  const zenRef = useRef<Zen | null>(null);
  const zenStream = useRef(puzzleStream(randomSeed()));
  const zenCount = useRef(0);

  const setRun = (r: Run | null) => {
    runRef.current = r;
    setRunState(r);
  };
  const setZen = (z: Zen) => {
    zenRef.current = z;
    setZenState(z);
  };

  /* ----- count runs ----- */

  const toReady = (k: Kind) => {
    runToken.current++;
    setRun(null);
    setResultMs(null);
    setPhase('ready');
    if (k === 'zen' && !zenRef.current) setZen({ entries: [makeZenEntry()], idx: 0 });
  };

  /**
   * Start a run: deal a fresh set of puzzles. Signed in with a username, the
   * server deals (ranked); otherwise the browser does (casual).
   */
  const begin = async () => {
    if (kind !== 'count') return;
    const token = ++runToken.current;
    let id: string | null = null;
    let seed = randomSeed();
    let offline: string | null = null;
    if (account.signedIn && account.username) {
      try {
        ({ id, seed } = await post<{ id: string; seed: number }>('/api/run', undefined, 2500));
      } catch (e) {
        offline = (e as Error).message;
      }
      if (token !== runToken.current) return;
    }
    const puzzles = dealCount(seed);
    setRun({
      id,
      offline,
      puzzles,
      boards: puzzles.map((p) => newBoard(p)),
      solvedAt: puzzles.map(() => null),
      done: puzzles.map(() => false),
      idx: 0,
      startedAt: performance.now(),
    });
    setResultMs(null);
    setRanked(null);
    setRankNote(null);
    setPhase('play');
  };

  const finish = async (r: Run) => {
    const ms = Math.max(...r.solvedAt.map((t) => t ?? 0));
    setRun(null);
    setResultMs(ms);
    setPhase('results');
    if (!r.id) {
      setRankNote(r.offline ? `casual: ${r.offline}` : null);
      return;
    }
    setRankNote('…');
    try {
      const results = r.puzzles.map((_, i) => ({ moves: r.boards[i].moves, t: Math.round(r.solvedAt[i]!) }));
      const out = await post<RankedOutcome & { ms: number }>('/api/run/finish', { id: r.id, results });
      setRanked(out);
      setResultMs(out.ms);
      setRankNote(null);
      setAccount((a) => ({ ...a, pbs: { ...a.pbs, ...out.pbs } }));
    } catch (e) {
      setRankNote((e as Error).message);
    }
  };

  const pickRunPuzzle = (idx: number) => {
    const r = runRef.current;
    if (r && idx >= 0 && idx < r.puzzles.length) setRun({ ...r, idx });
  };

  const onRunBoard = (next: BoardState) => {
    const r = runRef.current;
    if (!r) return;
    const boards = r.boards.map((b, i) => (i === r.idx ? next : b));
    if (!isSolved(next)) {
      setRun({ ...r, boards });
      return;
    }
    const done = r.done.map((d, i) => d || i === r.idx);
    const solvedAt = r.solvedAt.map((t, i) => (i === r.idx ? performance.now() - r.startedAt : t));
    if (done.every(Boolean)) {
      void finish({ ...r, boards, done, solvedAt });
      return;
    }
    // Move straight to the next unsolved puzzle.
    const nextIdx = [1, 2].map((k) => (r.idx + k) % r.puzzles.length).find((i) => !done[i]) ?? r.idx;
    setRun({ ...r, boards, done, solvedAt, idx: nextIdx });
  };

  /* ----- zen ----- */

  function makeZenEntry(): ZenEntry {
    const n = zenCount.current++;
    const nums = n === 0 ? ZEN_FIRST : zenStream.current(n);
    return { nums, board: newBoard(nums), solved: false, revealed: false };
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

  const toggleReveal = () => updateZenEntry((e) => ({ ...e, revealed: !e.revealed }));

  /* ----- modes ----- */

  // Always open in zen.
  useEffect(() => toReady('zen'), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseMode = (k: Kind) => {
    setKind(k);
    toReady(k);
  };

  /* ----- keys ----- */

  /** Signed in for the first time: a username is needed before anything else. */
  const mustPickName = account.signedIn && !account.username;

  /**
   * App-level keys. Only arrows change the puzzle or run, so nothing else can
   * throw away work. Card, operator and undo keys live in Board.
   *   → / return  zen: next · count: next puzzle in the run, or start
   *   ← / shift+return  zen: previous · count: previous puzzle in the run
   *   ↑  count: restart the run
   *   ?  zen: show solutions
   */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    setMouseActive(false);
    // Return is "next" (→) and shift+return is "back" (←), so play never leaves the home row.
    const k = e.key === 'Enter' ? (e.shiftKey ? 'ArrowLeft' : 'ArrowRight') : e.key;
    if (dialog || mustPickName) {
      if ((k === 'Escape' || (dialog === 'help' && k === 'ArrowRight')) && !mustPickName) setDialog(null);
      return;
    }
    if (k === ' ' || k === 'Tab' || k.startsWith('Arrow')) e.preventDefault(); // no scrolling or focus jumps
    if (kind === 'zen') {
      if (k === 'ArrowRight') zenGo(1);
      else if (k === 'ArrowLeft') zenGo(-1);
      else if (k === '?') toggleReveal();
    } else if (phase === 'play' && (k === 'ArrowRight' || k === 'ArrowLeft')) {
      const r = runRef.current;
      if (r) pickRunPuzzle((r.idx + (k === 'ArrowRight' ? 1 : r.puzzles.length - 1)) % r.puzzles.length);
    } else if ((k === 'ArrowRight' && phase !== 'play') || k === 'ArrowUp') {
      void begin();
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
  const playing = phase === 'play' && kind === 'count';
  const overlay = dialog !== null || mustPickName;

  return (
    <div className={`shell ${playing && !mouseActive ? 'is-focused' : ''}`}>
      <header className="top fade">
        <button className="logo" onClick={() => toReady(kind)} aria-label="twentyfour">
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
          <button className="link" onClick={() => setDialog('help')} aria-label="how to play">?</button>
        </div>
      </header>

      <nav className="modes fade" aria-label="mode">
        {(['zen', 'count'] as Kind[]).map((k) => (
          <button key={k} className={`link ${kind === k ? 'is-active' : ''}`} onClick={() => chooseMode(k)}>
            {k}
          </button>
        ))}
      </nav>

      <main className="stage">
        {kind === 'zen' ? (
          zen && zenEntry && (
            <>
              <div className="status">
                <button className="link nav" onClick={() => zenGo(-1)} disabled={zen.idx === 0} aria-label="previous puzzle">‹</button>
                <button className="link nav" onClick={() => zenGo(1)} aria-label="next puzzle">›</button>
              </div>
              <Board key={`zen-${zen.idx}`} state={zenEntry.board} onChange={onZenBoard} disabled={overlay} />
              <div className="under">
                {zenEntry.revealed ? (
                  <SolutionList nums={zenEntry.nums} />
                ) : (
                  <button className="link" onClick={toggleReveal}>solutions</button>
                )}
              </div>
            </>
          )
        ) : phase === 'results' && resultMs !== null ? (
          <Results
            ms={resultMs}
            ranked={ranked}
            onRestart={() => void begin()}
            note={
              rankNote ??
              (account.enabled && !account.signedIn ? (
                <button className="link inline" onClick={() => void signIn('google')}>sign in to rank</button>
              ) : null)
            }
          />
        ) : phase === 'play' && run ? (
          <>
            <div className="status">
              <div className="hand-tabs" role="tablist" aria-label="this run's puzzles">
                {run.puzzles.map((_, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === run.idx}
                    aria-label={`puzzle ${i + 1}${run.done[i] ? ', solved' : ''}`}
                    className={`hand-tab ${i === run.idx ? 'is-active' : ''} ${run.done[i] ? 'is-done' : ''}`}
                    onClick={() => pickRunPuzzle(i)}
                  >
                    {i + 1}{run.done[i] && ' ✓'}
                  </button>
                ))}
              </div>
              <Clock startedAt={run.startedAt} />
            </div>
            <Board key={`run-${run.idx}`} state={run.boards[run.idx]} onChange={onRunBoard} disabled={overlay} />
            <div className="under muted">{run.id ? 'ranked' : run.offline ? `casual: ${run.offline}` : ''}</div>
          </>
        ) : (
          <button className="ready accent" onClick={() => void begin()}>
            start <kbd>return</kbd>
          </button>
        )}
      </main>

      <footer className="keys muted fade">
        <span><kbd>a</kbd> <kbd>s</kbd> <kbd>d</kbd> <kbd>f</kbd> card</span>
        <span><kbd>j</kbd> <kbd>k</kbd> <kbd>l</kbd> <kbd>;</kbd> + − × ÷</span>
        <span><kbd>space</kbd> <kbd>delete</kbd> undo</span>
        {kind === 'zen' ? (
          <>
            <span><kbd>return</kbd> next</span>
            <span><kbd>shift</kbd> <kbd>return</kbd> back</span>
            <span><kbd>?</kbd> solutions</span>
          </>
        ) : (
          <>
            <span><kbd>return</kbd> next</span>
            <span><kbd>shift</kbd> <kbd>return</kbd> back</span>
            <span><kbd>↑</kbd> new run</span>
          </>
        )}
      </footer>

      {dialog === 'help' && !mustPickName && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'leaderboard' && <Leaderboard me={account.username} onClose={() => setDialog(null)} />}
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
function Clock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);
  return <span className="muted clock">{((now - startedAt) / 1000).toFixed(1)}s</span>;
}
