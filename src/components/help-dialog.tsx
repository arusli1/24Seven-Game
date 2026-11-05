'use client';

/** How to play. Opens by itself on a first visit, then from the ? button (or h). */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog help" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="how to play">
        <p>
          make <span className="accent">24</span> using each card once
          <br />
          <span className="muted">+ − × ÷ as many times as you like</span>
        </p>
        <div className="move" aria-label="pick a card, an operator, then another card">
          <span className="mini">4</span>
          <span className="muted">×</span>
          <span className="mini">6</span>
          <span className="muted">→</span>
          <span className="mini is-red">24</span>
        </div>
        <p className="muted">
          tap a card, an operator, another card
          <span className="keys-only"><br />or use the keys below</span>
        </p>
        <p className="muted modes-help">
          <span><span className="label">zen</span> just for fun</span>
          <span><span className="label">1 timed · 3 timed</span> race the clock</span>
        </p>
        <button className="link help-ok" onClick={onClose}>got it</button>
      </div>
    </div>
  );
}
