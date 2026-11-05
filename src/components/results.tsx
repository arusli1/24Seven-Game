import { formatMs } from '@/lib/modes';
import { STAT_LABEL, STATS, type Stat } from '@/lib/stats';

export interface RankedOutcome {
  current: Partial<Record<Stat, number>>;
  pbs: Partial<Record<Stat, number | null>>;
}

export function Results({
  ms,
  ranked,
  note,
  onRestart,
}: {
  ms: number;
  /** Stats after a verified ranked run. */
  ranked: RankedOutcome | null;
  /** Small line under the time (e.g. "sign in to rank"), as a node. */
  note?: React.ReactNode;
  onRestart: () => void;
}) {
  return (
    <div className="results">
      <div className="score accent">{formatMs(ms)}</div>
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
