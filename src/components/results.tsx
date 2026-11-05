import { formatMs, modeLabel, type Size } from '@/lib/modes';
import type { Stat } from '@/lib/stats';

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
  /** Your best after a verified ranked run. */
  ranked: RankedOutcome | null;
  /** Small line under the time (e.g. "sign in to rank"). */
  note?: React.ReactNode;
  onRestart: () => void;
}) {
  const best = ranked?.pbs.single ?? undefined;
  return (
    <div className="results">
      <div className="score">{formatMs(ms)}</div>
      <p className="muted splits">
        {modeLabel(size)}
        {splits.length > 1 && ` · ${splits.map(secs).join(' · ')}`}
      </p>
      {ranked && best !== undefined && (
        <div className="stats">
          {best === ms ? <span className="accent">pb</span> : <span><span className="muted">pb</span> {formatMs(best)}</span>}
        </div>
      )}
      {note && <div className="muted note">{note}</div>}
      <button className="link again" onClick={onRestart}>
        again <kbd>return</kbd>
      </button>
    </div>
  );
}
