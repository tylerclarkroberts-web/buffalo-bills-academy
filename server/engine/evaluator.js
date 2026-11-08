// Poker hand evaluator: best 5-card hand out of 5..7 cards (checks every 5-card combination).
import { rankOf, suitOf } from './cards.js';

export const CATEGORY = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};
export const CATEGORY_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

/** Returns a score array [category, tiebreak1, tiebreak2, ...]; compare with compareScores. */
export function evaluate5(cards) {
  if (cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards');
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // wheel: A-2-3-4-5
  }
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const gr = groups.map((g) => g[0]);

  if (straightHigh && flush) return [CATEGORY.STRAIGHT_FLUSH, straightHigh];
  if (shape === '41') return [CATEGORY.QUADS, ...gr];
  if (shape === '32') return [CATEGORY.FULL_HOUSE, ...gr];
  if (flush) return [CATEGORY.FLUSH, ...ranks];
  if (straightHigh) return [CATEGORY.STRAIGHT, straightHigh];
  if (shape === '311') return [CATEGORY.TRIPS, ...gr];
  if (shape === '221') return [CATEGORY.TWO_PAIR, ...gr];
  if (shape === '2111') return [CATEGORY.PAIR, ...gr];
  return [CATEGORY.HIGH_CARD, ...ranks];
}

export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function* combinations(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) {
    yield* combinations(arr, k, i + 1, [...prefix, arr[i]]);
  }
}

/** Best hand from 5..7 cards. Returns { score, cards, category, name }. */
export function bestHand(cards) {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const score = evaluate5(combo);
    if (!best || compareScores(score, best.score) > 0) best = { score, cards: combo };
  }
  return { ...best, category: best.score[0], name: describeScore(best.score) };
}

const RANK_NAME = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const plural = (r) => (r === 6 ? 'Sixes' : RANK_NAME[r] + 's');

export function describeScore(s) {
  const [c, a, b] = s;
  switch (c) {
    case CATEGORY.STRAIGHT_FLUSH: return a === 14 ? 'Royal Flush' : `Straight Flush, ${RANK_NAME[a]} high`;
    case CATEGORY.QUADS: return `Four of a Kind, ${plural(a)}`;
    case CATEGORY.FULL_HOUSE: return `Full House, ${plural(a)} full of ${plural(b)}`;
    case CATEGORY.FLUSH: return `Flush, ${RANK_NAME[a]} high`;
    case CATEGORY.STRAIGHT: return `Straight, ${RANK_NAME[a]} high`;
    case CATEGORY.TRIPS: return `Three of a Kind, ${plural(a)}`;
    case CATEGORY.TWO_PAIR: return `Two Pair, ${plural(a)} and ${plural(b)}`;
    case CATEGORY.PAIR: return `Pair of ${plural(a)}`;
    default: return `High Card, ${RANK_NAME[a]}`;
  }
}
