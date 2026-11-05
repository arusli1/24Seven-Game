'use client';

/** How to play. Opens by itself on a first visit, then only from the ? button. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog help" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="how to play">
        <p>
          make <span className="accent">24</span> using each card once.
          <br />
          <span className="muted">+ − × ÷ as many times as you like.</span>
        </p>
        <p className="muted">
          tap<span className="keys-only">, or use the keys below</span>.
        </p>
        <p className="muted">
          <span className="accent">zen:</span> just for fun
          <br />
          <span className="accent">count:</span> solve 3 puzzles (or 1), timed and ranked
        </p>
        <button className="link help-ok" onClick={onClose}>got it</button>
      </div>
    </div>
  );
}
