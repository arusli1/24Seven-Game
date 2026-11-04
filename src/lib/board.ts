import { Rational } from './rational';

export type Operator = '+' | '-' | '*' | '/';

export const OPERATORS: Operator[] = ['+', '-', '*', '/'];
export const OP_SYMBOL: Record<Operator, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export interface Card {
  id: number;
  value: Rational;
  /** 0–3 = ♠ ♥ ♣ ♦. Cosmetic: each dealt card gets a different, random suit. */
  suit: number;
}

/** Four fixed slots; merging empties one slot so positions (and keys 1–4) never shift. */
export type Slot = Card | null;

/** One merge: slot a (op) slot b → result lands in slot b. */
export type Move = [a: number, b: number, op: Operator];

export interface BoardState {
  cards: Slot[];
  /** Moves so far; ranked runs send these so the server can replay them. */
  moves: Move[];
  /** Earlier slot sets, for undo. */
  past: Slot[][];
}

let nextId = 1;

function shuffledSuits() {
  const suits = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [suits[i], suits[j]] = [suits[j], suits[i]];
  }
  return suits;
}

export function newBoard(nums: number[]): BoardState {
  const suits = shuffledSuits();
  return {
    cards: nums.map((n, i) => ({ id: nextId++, value: Rational.fromInteger(n), suit: suits[i] })),
    moves: [],
    past: [],
  };
}

function apply(x: Rational, y: Rational, op: Operator): Rational | null {
  try {
    return op === '+' ? x.add(y) : op === '-' ? x.sub(y) : op === '*' ? x.mul(y) : x.div(y);
  } catch {
    return null; // ÷0
  }
}

/** Merge slot a into slot b. Returns null for an invalid move or ÷0. */
export function combine(state: BoardState, a: number, b: number, op: Operator): BoardState | null {
  const x = state.cards[a];
  const y = state.cards[b];
  if (!x || !y || a === b) return null;
  const value = apply(x.value, y.value, op);
  if (!value) return null;
  const cards = [...state.cards];
  cards[a] = null;
  cards[b] = { id: nextId++, value, suit: y.suit };
  return { cards, moves: [...state.moves, [a, b, op]], past: [...state.past, state.cards] };
}

export function undo(state: BoardState): BoardState {
  if (state.past.length === 0) return state;
  return {
    cards: state.past[state.past.length - 1],
    moves: state.moves.slice(0, -1),
    past: state.past.slice(0, -1),
  };
}

export function isSolved(state: BoardState) {
  const left = state.cards.filter((c): c is Card => c !== null);
  return left.length === 1 && left[0].value.numerator === 24 && left[0].value.denominator === 1;
}

/** Server-side check: do these moves turn these numbers into 24? */
export function verifyMoves(nums: number[], moves: unknown): boolean {
  if (!Array.isArray(moves) || moves.length !== 3) return false;
  let state: BoardState | null = newBoard(nums);
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 3) return false;
    const [a, b, op] = m;
    if (!Number.isInteger(a) || !Number.isInteger(b) || !OPERATORS.includes(op)) return false;
    state = combine(state, a, b, op);
    if (!state) return false;
  }
  return isSolved(state);
}
