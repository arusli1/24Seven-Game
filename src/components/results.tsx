import { formatMs, modeLabel, type Size } from '@/lib/modes';
import { STAT_LABEL, STATS, type Stat } from '@/lib/stats';

export interface RankedOutcome {
  current: Partial<Record<Stat, number>>;
  pbs: Partial<Record<Stat, number | null>>;
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

export function Results({
  ms,
  size,
  splits,
  ranked,
  note,
  onRestart,
}: {
  ms: number;
  size: Size;
  /** Time for each puzzle, in the order solved. */
  splits: number[];
  /** Stats after a verified ranked run. */
  ranked: RankedOutcome | null;
  /** Small line under the time (e.g. "sign in to rank"). */
  note?: React.ReactNode;
  onRestart: () => void;
}) {
  return (
    <div className="results">
      <div className="score">{formatMs(ms)}</div>
      <p className="muted splits">
        {modeLabel(size)}
        {splits.length > 1 && ` · ${splits.map(secs).join(' · ')}`}
      </p>
      {ranked && (
        <div className="stats">
          {STATS.filter((s) => ranked.current[s] !== undefined).map((s) => {
            const value = ranked.current[s]!;
            const pb = ranked.pbs[s] === value;
            return (
              <span key={s}>
                <span className="muted">{STAT_LABEL[s]}</span> {formatMs(value)}
                {pb && <span className="accent"> pb</span>}
              </span>
            );
          })}
        </div>
      )}
      {note && <div className="muted note">{note}</div>}
      <button className="link again" onClick={onRestart}>
        again <kbd>return</kbd>
      </button>
    </div>
  );
}
