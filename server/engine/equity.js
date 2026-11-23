// Hold'em equity from only what one player can see: their two hole cards, the
// visible board, and how many opponents are still in. Opponents' real holes and
// the undealt shoe are never inputs. Ties count as an equal share of the pot.
import { RANKS, SUITS } from './cards.js';
import { cardInt, score } from '../bots/eval.js';
import { rankOf } from './cards.js';
import { CATEGORY, bestHand } from './evaluator.js';

export const DEFAULT_TRIALS = 4000;
export const EXACT_CAP = 80000;

const FULL = [];
for (const s of SUITS) for (const r of RANKS) FULL.push(r + s);

const CARD = /^[2-9TJQKA][shdc]$/;

function mulberry(seed) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function rngFrom(seed) {
  if (seed == null) return (n) => Math.floor(Math.random() * n);
  const next = mulberry(seed);
  return (n) => next() % n;
}

function validCard(c) {
  return typeof c === 'string' && CARD.test(c);
}

function uniqueCards(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!list) continue;
    for (const c of list) {
      if (!validCard(c)) throw new Error(`Bad card: ${c}`);
      if (seen.has(c)) throw new Error(`Duplicate card: ${c}`);
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function remainingDeck(used) {
  const skip = new Set(used);
  const rest = [];
  for (const c of FULL) if (!skip.has(c)) rest.push(c);
  return rest;
}

function comboCount(n, k) {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

function ways(remain, boardNeed, opponents) {
  let n = remain, w = comboCount(n, boardNeed);
  n -= boardNeed;
  for (let i = 0; i < opponents; i++) {
    w *= comboCount(n, 2);
    n -= 2;
  }
  return w;
}

function* combos(arr, k) {
  const n = arr.length;
  if (k === 0) { yield []; return; }
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    const pick = [];
    for (let i = 0; i < k; i++) pick.push(arr[idx[i]]);
    yield pick;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function addTrial(acc, hero, opps) {
  acc.trials++;
  let best = hero, winners = 1, heroBest = true;
  for (const s of opps) {
    if (s > best) { best = s; winners = 1; heroBest = false; }
    else if (s === best) { winners++; }
  }
  if (!heroBest) return;
  if (winners === 1) { acc.wins++; acc.equity++; }
  else { acc.ties++; acc.equity += 1 / winners; }
}

function finish(acc, exact) {
  const n = acc.trials || 1;
  return {
    win: acc.wins / n,
    tie: acc.ties / n,
    equity: acc.equity / n,
    trials: acc.trials,
    exact: !!exact,
  };
}

function score7(ints) {
  return score(ints, ints.length);
}

function runDeal(heroHole, boardInts, boardNeed, oppNeed, pile, acc) {
  const fullBoard = boardNeed ? boardInts.concat(pile.slice(0, boardNeed)) : boardInts;
  const hero = score7(heroHole.concat(fullBoard));
  const opps = [];
  let at = boardNeed;
  for (let i = 0; i < oppNeed; i++) {
    opps.push(score7([pile[at], pile[at + 1], ...fullBoard]));
    at += 2;
  }
  addTrial(acc, hero, opps);
}

function enumerate(heroHole, boardInts, remain, boardNeed, opponents, acc) {
  const n = remain.length;
  const take = [];
  const used = new Uint8Array(n);
  const rec = (need, start) => {
    if (need === 0) {
      runDeal(heroHole, boardInts, boardNeed, opponents, take, acc);
      return;
    }
    // first segment may be the board (boardNeed cards), then 2-card hands
    const k = take.length < boardNeed ? boardNeed : 2;
    for (const pick of combosRange(n, k, used, start)) {
      for (const i of pick) { used[i] = 1; take.push(remain[i]); }
      rec(need - k, 0);
      for (const i of pick) { used[i] = 0; take.pop(); }
    }
  };
  rec(boardNeed + opponents * 2, 0);
}

// Iterate k-combinations of unused indexes in 0..n-1. `start` unused (kept for call shape).
function* combosRange(n, k, used) {
  if (k === 0) { yield []; return; }
  const free = [];
  for (let i = 0; i < n; i++) if (!used[i]) free.push(i);
  for (const c of combos(free, k)) yield c;
}

function monteCarlo(heroHole, boardInts, remain, boardNeed, opponents, trials, seed, acc) {
  const need = boardNeed + opponents * 2;
  const rng = rngFrom(seed);
  const buf = remain.slice();
  const m = buf.length;
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < need; i++) {
      const j = i + rng(m - i);
      const tmp = buf[i]; buf[i] = buf[j]; buf[j] = tmp;
    }
    runDeal(heroHole, boardInts, boardNeed, opponents, buf, acc);
  }
}

/**
 * Compute pot equity. Only these fields are read: hole, board, opponents.
 * Any other property (including leaked opponentCards) is ignored.
 */
export function computeEquity(input = {}) {
  const hole = uniqueCards(input.hole);
  if (hole.length !== 2) throw new Error('Need exactly two hole cards');
  const board = uniqueCards(input.board || []);
  if (board.length > 5) throw new Error('Board has at most five cards');
  const opponents = Math.max(0, Math.floor(Number(input.opponents) || 0));
  if (opponents > 9) throw new Error('Too many opponents');
  const used = uniqueCards(hole, board);
  const remain = remainingDeck(used);
  const boardNeed = 5 - board.length;
  const need = boardNeed + opponents * 2;
  if (need > remain.length) throw new Error('Not enough cards left');

  const heroHole = hole.map(cardInt);
  const boardInts = board.map(cardInt);
  const acc = { trials: 0, wins: 0, ties: 0, equity: 0 };

  if (opponents === 0) {
    acc.trials = 1; acc.wins = 1; acc.equity = 1;
    return finish(acc, true);
  }

  const exactWays = ways(remain.length, boardNeed, opponents);
  if (exactWays > 0 && exactWays <= EXACT_CAP) {
    enumerate(heroHole, boardInts, remain.map(cardInt), boardNeed, opponents, acc);
    return finish(acc, true);
  }

  const trials = Math.max(200, Math.min(20000, Math.floor(Number(input.trials) || DEFAULT_TRIALS)));
  monteCarlo(heroHole, boardInts, remain.map(cardInt), boardNeed, opponents, trials, input.seed, acc);
  return finish(acc, false);
}

/**
 * Pull equity inputs from a table view. Copies only this player's hole cards,
 * the public board, and the count of players still in (not folded). Opponent
 * card fields on the view, if somehow present, are not copied or used.
 */
export function equityFacts(view) {
  if (!view?.hand) return null;
  const street = view.hand.street;
  if (street === 'showdown') return null;
  const seat = view.me?.seat;
  if (!Number.isInteger(seat) || seat < 0) return null;
  const mine = view.seats?.[seat];
  if (!mine || mine.folded || !mine.inHand) return null;
  const hole = Array.isArray(mine.cards) ? mine.cards.filter(validCard).slice(0, 2) : null;
  if (!hole || hole.length !== 2) return null;
  const board = Array.isArray(view.hand.board) ? view.hand.board.filter(validCard).slice(0, 5) : [];
  let opponents = 0;
  for (const s of view.seats || []) {
    if (!s || s.seat === seat) continue;
    if (s.inHand && !s.folded) opponents++;
  }
  return { hole, board, opponents };
}

const FACE = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
function rankWord(r, many = false) {
  if (r >= 11) return many ? FACE[r] + 's' : FACE[r];
  return many ? `${r}s` : String(r);
}

function formatMade(s) {
  const [c, a, b] = s;
  switch (c) {
    case CATEGORY.STRAIGHT_FLUSH: return a === 14 ? 'Royal flush' : `Straight flush, ${rankWord(a)} high`;
    case CATEGORY.QUADS: return `Four of a kind, ${rankWord(a, true)}`;
    case CATEGORY.FULL_HOUSE: return `Full house, ${rankWord(a, true)} over ${rankWord(b, true)}`;
    case CATEGORY.FLUSH: return `Flush, ${rankWord(a)} high`;
    case CATEGORY.STRAIGHT: return `Straight, ${rankWord(a)} high`;
    case CATEGORY.TRIPS: return `Three of a kind, ${rankWord(a, true)}`;
    case CATEGORY.TWO_PAIR: return `Two pair, ${rankWord(a, true)} and ${rankWord(b, true)}`;
    case CATEGORY.PAIR: return `Pair of ${rankWord(a, true)}`;
    default: return `High card, ${rankWord(a)}`;
  }
}

/** Best made hand from hole cards plus the visible board. Preflop uses the two hole cards only. */
export function madeHandName(hole, board = []) {
  const cards = [];
  const seen = new Set();
  for (const c of [...(hole || []), ...(board || [])]) {
    if (!validCard(c) || seen.has(c)) continue;
    seen.add(c);
    cards.push(c);
  }
  if (cards.length < 2) return null;
  if (cards.length < 5) {
    const ranks = cards.map(rankOf).sort((a, b) => b - a);
    const counts = new Map();
    for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const [r, n] = groups[0];
    if (n >= 2) return `Pair of ${rankWord(r, true)}`;
    return `High card, ${rankWord(ranks[0])}`;
  }
  return formatMade(bestHand(cards).score);
}

/** Red at 0, yellow at 50%, green at 100%. */
export function equityColor(p) {
  const t = Math.max(0, Math.min(1, Number(p) || 0));
  const stops = [[0, [196, 48, 48]], [0.5, [232, 196, 58]], [1, [46, 176, 92]]];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
  const u = (t - t0) / (t1 - t0 || 1);
  const rgb = c0.map((v, j) => Math.round(v + (c1[j] - v) * u));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function formatEquity(eq) {
  if (!eq) return null;
  const winPct = Math.round(eq.equity * 100);
  const tiePct = Math.round(eq.tie * 100);
  return { winPct, tiePct, color: equityColor(eq.equity) };
}
