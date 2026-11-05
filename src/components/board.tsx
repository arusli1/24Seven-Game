'use client';

import { useEffect, useRef, useState } from 'react';
import { combine, isSolved, OP_SYMBOL, OPERATORS, undo, type BoardState, type Operator } from '@/lib/board';

/** Hearts and diamonds print in red. */

/** A small, stable tilt per card (from its id) so the hand looks dealt, not drawn. */
const TILTS = [-1.5, 0.8, -0.4, 1.2, -1, 0.3, 1.5, -0.7];
const tilt = (id: number) => ({ '--tilt': `${TILTS[id % TILTS.length]}deg` }) as React.CSSProperties;
const SUITS = ['♠', '♥', '♣', '♦'];

/** Home row: left hand picks cards (a s d f), right hand picks operators (j k l ;). */
const SLOT_KEYS = ['a', 's', 'd', 'f'];
const OP_KEYS: Record<Operator, string> = { '+': 'j', '-': 'k', '*': 'l', '/': ';' };
const KEY_TO_SLOT: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
const KEY_TO_OP: Record<string, Operator> = {
  j: '+', k: '-', l: '*', ';': '/',
  '+': '+', '=': '+', '-': '-', '*': '*', '/': '/',
};

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
  const solved = isSolved(state);
  const locked = disabled || solved;

  const pick = (slot: number) => {
    if (locked || !state.cards[slot]) return;
    if (sel === null || sel === slot) {
      // Tapping the selected card again cancels the operator, then the selection.
      if (sel === slot && op) setOp(null);
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
      setSel(null); // ÷0
      return;
    }
    setSel(slot);
    onChange(next);
  };

  const chooseOp = (o: Operator) => {
    if (locked || sel === null) return;
    setOp(op === o ? null : o);
  };

  const back = () => {
    if (disabled || state.past.length === 0) return;
    onChange(undo(state));
    setSel(null);
    setOp(null);
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (disabled || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k in KEY_TO_SLOT) pick(KEY_TO_SLOT[k]);
    else if (KEY_TO_OP[k]) {
      e.preventDefault();
      chooseOp(KEY_TO_OP[k]);
    } else if (k === ' ' || k === 'backspace' || k === 'delete') {
      e.preventDefault();
      back();
    }
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
    <div className={`board ${solved ? 'is-solved' : ''}`}>
      <div className="cards">
        {state.cards.map((c, slot) => {
          if (!c) return <div key={`empty-${slot}`} className="card is-empty" />;
          const { numerator: n, denominator: d } = c.value;
          return (
            <button
              key={c.id}
              tabIndex={-1}
              className={`card ${c.suit % 2 ? 'is-red' : ''} ${sel === slot ? 'is-selected' : ''} ${sizeClass(n, d)}`}
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
          className="op op-undo"
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
