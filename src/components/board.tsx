'use client';

import { useEffect, useRef, useState } from 'react';
import { combine, isSolved, OP_SYMBOL, OPERATORS, undo, type BoardState, type Operator } from '@/lib/board';

/** A small, stable tilt per card (from its id) so the hand looks dealt, not drawn. */
const TILTS = [-1.5, 0.8, -0.4, 1.2, -1, 0.3, 1.5, -0.7];
const tilt = (id: number) => ({ '--tilt': `${TILTS[id % TILTS.length]}deg` }) as React.CSSProperties;
const SUITS = ['♠', '♥', '♣', '♦'];

/**
 * Home row: left hand picks cards (a s d f), right hand picks operators (j k l ;).
 * Matched by physical key, so the home row stays the home row on any layout.
 * Symbol keys (+ - * /) and 1–4 work too.
 */
const SLOT_KEYS = ['a', 's', 'd', 'f'];
const OP_KEYS: Record<Operator, string> = { '+': 'j', '-': 'k', '*': 'l', '/': ';' };
const CODE_TO_SLOT: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
};
const CODE_TO_OP: Record<string, Operator> = { KeyJ: '+', KeyK: '-', KeyL: '*', Semicolon: '/' };
const KEY_TO_OP: Record<string, Operator> = { '+': '+', '=': '+', '-': '-', '*': '*', '/': '/' };

interface Props {
  state: BoardState;
  onChange: (next: BoardState) => void;
  /** Ignore input (e.g. while a dialog is open). */
  disabled?: boolean;
}

/** Shrink long numbers so they fit their card. A fraction is stacked, so its widest line counts. */
function sizeClass(n: number, d: number) {
  const len = Math.max(`${n}`.length, d === 1 ? 0 : `${d}`.length);
  return len > 4 ? 'size-s' : len > 3 ? 'size-m' : '';
}

/**
 * Give each puzzle its own `key` so selection resets between puzzles.
 * Pick a card, an operator, then another card; the result stays selected so
 * chains are fast. Keys: a s d f (or 1–4) slots, j k l ; (or + - * /) operators,
 * space / backspace / delete undo, esc clears. Input reacts on press, not release.
 */
export function Board({ state, onChange, disabled }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const [op, setOp] = useState<Operator | null>(null);
  /** The selection is a card that was just made (selected for you, not by a tap). */
  const [fresh, setFresh] = useState(false);
  /** A card to shake: ÷0. */
  const [bad, setBad] = useState<number | null>(null);
  const solved = isSolved(state);
  const left = state.cards.filter(Boolean).length;
  const wrong = left === 1 && !solved;
  const locked = disabled || solved;

  const shake = (slot: number) => {
    setBad(slot);
    setTimeout(() => setBad(null), 300);
  };

  const pick = (slot: number) => {
    if (locked || !state.cards[slot]) return;
    const wasFresh = fresh;
    setFresh(false);
    if (sel === null || sel === slot) {
      // Tapping the card you just made keeps it (people tap it to start the next move).
      // Otherwise tapping the selected card cancels the operator, then the selection.
      if (sel === slot && op) setOp(null);
      else if (sel === slot && wasFresh) return;
      else setSel(sel === slot ? null : slot);
      return;
    }
    if (!op) {
      setSel(slot);
      return;
    }
    const next = combine(state, sel, slot, op);
    setOp(null);
    if (!next) {
      setSel(null);
      shake(slot); // ÷0
      return;
    }
    setSel(slot);
    setFresh(true);
    onChange(next);
  };

  const chooseOp = (o: Operator) => {
    if (locked || sel === null) return;
    setFresh(false);
    setOp(op === o ? null : o);
  };

  const back = () => {
    if (disabled || state.past.length === 0) return;
    onChange(undo(state));
    setSel(null);
    setOp(null);
    setFresh(false);
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (disabled || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    const isUndo = k === ' ' || k === 'backspace' || k === 'delete';
    if (isUndo) e.preventDefault();
    // Holding a key must not repeat a move (holding undo may unwind).
    if (e.repeat && !isUndo) return;
    const slot = e.shiftKey ? undefined : CODE_TO_SLOT[e.code];
    const o = KEY_TO_OP[e.key] ?? (e.shiftKey ? undefined : CODE_TO_OP[e.code]);
    if (slot !== undefined) pick(slot);
    else if (o) {
      e.preventDefault();
      chooseOp(o);
    } else if (isUndo) back();
    else if (k === 'escape') {
      setSel(null);
      setOp(null);
    }
  };
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // React on pointer down: faster than click, and nothing steals focus.
  const press = (fn: () => void) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    fn();
  };

  return (
    <div className={`board ${solved ? 'is-solved' : ''} ${wrong ? 'is-wrong' : ''}`}>
      <div className="cards">
        {state.cards.map((c, slot) => {
          if (!c) return <div key={`empty-${slot}`} className="card is-empty" />;
          const { numerator: n, denominator: d } = c.value;
          return (
            <button
              key={c.id}
              tabIndex={-1}
              className={`card ${c.suit % 2 ? 'is-red' : ''} ${sel === slot ? 'is-selected' : ''} ${bad === slot ? 'is-bad' : ''} ${sizeClass(n, d)}`}
              style={tilt(c.id)}
              onPointerDown={press(() => pick(slot))}
            >
              <span className="pip tl" aria-hidden>{SUITS[c.suit]}</span>
              <span className="pip br" aria-hidden>{SUITS[c.suit]}</span>
              <span className="card-key" aria-hidden>{SLOT_KEYS[slot]}</span>
              {d === 1 ? (
                n
              ) : (
                <span className="frac">
                  <span>{n}</span>
                  <span className="frac-bar" />
                  <span>{d}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="ops">
        {OPERATORS.map((o) => (
          <button
            key={o}
            tabIndex={-1}
            className={`op ${op === o ? 'is-selected' : ''}`}
            onPointerDown={press(() => chooseOp(o))}
            disabled={sel === null || locked}
          >
            {OP_SYMBOL[o]}
            <span className="op-key" aria-hidden>{OP_KEYS[o]}</span>
          </button>
        ))}
        <button
          tabIndex={-1}
          className={`op op-undo ${wrong ? 'is-hint' : ''}`}
          onPointerDown={press(back)}
          disabled={state.past.length === 0 || disabled}
          aria-label="undo"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
