'use client';

import { useEffect, useState } from 'react';
import { formatMs, modeLabel, SIZES, type Size } from '@/lib/modes';
import { STAT_LABEL, STATS, type Stat } from '@/lib/stats';

interface Entry { name: string; ms: number }

export function Leaderboard({
  me,
  initialSize,
  onClose,
}: {
  me: string | null;
  initialSize: Size;
  onClose: () => void;
}) {
  const [size, setSize] = useState<Size>(initialSize);
  const [stat, setStat] = useState<Stat>('single');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setEntries(null);
    setError(null);
    fetch(`/api/leaderboard/${size}/${stat}`)
      .then(async (r) => {
        const data = await r.json();
        if (!live) return;
        if (r.ok) setEntries(data.entries);
        else setError(data.error ?? 'could not load');
      })
      .catch(() => live && setError('could not load'));
    return () => {
      live = false;
    };
  }, [stat, size]);

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="leaderboard">
        <div className="dialog-head">
          <div className="lb-tabs">
            {SIZES.map((s) => (
              <button key={s} className={`link ${s === size ? 'is-active' : ''}`} onClick={() => setSize(s)}>
                {modeLabel(s)}
              </button>
            ))}
          </div>
          <button className="link" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="lb-tabs">
          {STATS.map((s) => (
            <button key={s} className={`link ${s === stat ? 'is-active' : ''}`} onClick={() => setStat(s)}>
              {STAT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="lb-list">
          {error && <p className="muted">{error}</p>}
          {!error && !entries && <p className="muted">…</p>}
          {entries?.length === 0 && <p className="muted">no times yet</p>}
          {entries?.map((e, i) => (
            <div key={e.name + i} className={`lb-row ${e.name === me ? 'is-me' : ''}`}>
              <span className="muted">{i + 1}</span>
              <span>{e.name}</span>
              <span>{formatMs(e.ms)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
