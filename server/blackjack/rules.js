// v44 Blackjack: rules, bounds, card math, basic strategy and royal-bet math. Pure (no I/O, no clock, no RNG of its own).
// Play money only.

export const RANKS = 'A23456789TJQK';
export const SUITS = 'shdc';
export const freshDeck = () => { const d = []; for (const s of SUITS) for (const r of RANKS) d.push(r + s); return d; };
/** Fisher–Yates with an injected integer RNG (rng(n) → 0..n-1). The server passes crypto.randomInt. */
export function shuffle(cards, rng) { const d = cards.slice(); for (let i = d.length - 1; i > 0; i--) { const j = rng(i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; }
export const rankVal = (c) => (c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]));
/** Best total and whether an ace still counts as 11. */
export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += rankVal(c); if (c[0] === 'A') aces++; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
export const tenish = (c) => rankVal(c) === 10;

// ---------------- table rules ----------------
// Guntrad's house = a typical big Las Vegas single-deck pit table.
export const GUNTRAD_RULES = Object.freeze({
  s17: true,          // dealer stands on all 17s (false = H17: hits soft 17)
  bjPays: 1.5,        // 3:2 (1.2 = 6:5)
  das: true,          // double after split
  doubleOn: 'any',    // 'any' first two cards | '9-11' | '10-11'
  maxHands: 4,        // split up to 3 times (4 hands); 1 = no splitting
  resplitAces: false, hitSplitAces: false, // split aces get one card each
  surrender: false,   // late surrender (after the dealer peeks), first two cards only
  insurance: true,    // offered when the dealer shows an ace; pays 2:1, up to half the bet
});
export const RULE_CHOICES = {
  s17: [true, false], bjPays: [1.5, 1.2], das: [true, false], doubleOn: ['any', '9-11', '10-11'],
  maxHands: [1, 2, 3, 4], resplitAces: [false, true], hitSplitAces: [false, true], surrender: [false, true], insurance: [true, false],
};
export function cleanRules(input = {}) {
  const r = { ...GUNTRAD_RULES };
  for (const [k, opts] of Object.entries(RULE_CHOICES)) if (k in input && opts.some((o) => o === input[k])) r[k] = input[k];
  return r;
}

// ---------------- money bounds (play money) ----------------
export const LIMITS = {
  minBets: [1, 2, 5, 10, 25], maxBetX: [10, 20, 50], maxBetCap: 500,
  buyIns: [100, 200, 500, 1000, 2000], houseBanks: [500, 1000, 2000, 5000],
  royalMax: 25, maxSeats: [2, 3, 4, 5, 6], turnSecs: [30, 120, 600, 3600, 86400],
};

// ---------------- royal bets ----------------
// Side bets on your first two cards, settled at the deal, paid X to 1 (the stake comes back on a win).
// Single deck, so a "suited pair" is impossible (there is one K♥). Probabilities come from a fresh 52-card deck:
// C(52,2) = 1326 two-card hands.
//   Royal Match: K-Q suited 4 hands; any other suited two cards 4·C(13,2) − 4 = 308; anything else 1014.
//   Royal Pairs: J-J, Q-Q or K-K 3·C(4,2) = 18; any other pair 10·6 = 60; anything else 1248.
export const ROYAL = {
  match: { name: 'Royal Match', tiers: [
    { k: 'royal', label: 'K-Q suited', combos: 4, def: 25, min: 10, max: 50 },
    { k: 'easy', label: 'Any suited', combos: 308, def: 2.5, min: 1, max: 5 },
  ] },
  pairs: { name: 'Royal Pairs', tiers: [
    { k: 'royal', label: 'J-J, Q-Q or K-K', combos: 18, def: 25, min: 10, max: 50 },
    { k: 'pair', label: 'Any other pair', combos: 60, def: 11, min: 5, max: 15 },
  ] },
};
export const TWO_CARD_HANDS = 1326;
export const STEP = 0.5;
export function cleanRoyal(input = {}) {
  const out = {};
  for (const [bet, def] of Object.entries(ROYAL)) {
    const inp = input[bet] || {};
    out[bet] = { on: inp.on !== false };
    for (const t of def.tiers) {
      let v = Number(inp[t.k]); if (!Number.isFinite(v)) v = t.def;
      v = Math.round(Math.min(t.max, Math.max(t.min, v)) / STEP) * STEP;
      out[bet][t.k] = v;
    }
  }
  return out;
}
/** Exact player EV per $1 and the house edge for a payout set; warns when generous. */
export function royalEv(bet, pays) {
  const def = ROYAL[bet]; let win = 0, hits = 0;
  for (const t of def.tiers) { win += t.combos * pays[t.k]; hits += t.combos; }
  const ev = (win - (TWO_CARD_HANDS - hits)) / TWO_CARD_HANDS;
  const edge = -ev;
  const warn = edge < 0 ? 'Players have the edge: the house loses money on this bet over time.' : edge < 0.02 ? 'Generous: the house edge is under 2%.' : null;
  return { ev, edge, hitRate: hits / TWO_CARD_HANDS, warn };
}
/** Which tier (if any) two cards hit. */
export function royalHit(bet, cards) {
  const [a, b] = cards;
  if (bet === 'match') {
    if (a[1] !== b[1]) return null;
    return [a[0], b[0]].sort().join('') === 'KQ' ? 'royal' : 'easy';
  }
  if (a[0] !== b[0]) return null;
  return 'JQK'.includes(a[0]) ? 'royal' : 'pair';
}

// ---------------- basic strategy (single deck, S17, DAS) ----------------
const up = (c) => (c[0] === 'A' ? 11 : rankVal(c));
/** Returns 'hit' | 'stand' | 'double' | 'split' | 'surrender' given what is allowed. */
export function basicStrategy(cards, dealerUp, can) {
  const d = up(dealerUp); const { total, soft } = handValue(cards);
  const two = cards.length === 2;
  if (can.surrender && two && !soft) {
    if (total === 16 && !(cards[0][0] === '8' && cards[1][0] === '8') && (d === 10 || d === 11)) return 'surrender';
    if (total === 15 && d === 10) return 'surrender';
  }
  if (can.split && two && rankVal(cards[0]) === rankVal(cards[1]) && cards[0][0] === cards[1][0] || (can.split && two && tenish(cards[0]) && tenish(cards[1]))) {
    const r = rankVal(cards[0]);
    const das = can.das;
    const split = r === 11 || r === 8 ? true : r === 10 ? false : r === 9 ? [2, 3, 4, 5, 6, 8, 9].includes(d)
      : r === 7 ? d <= (das ? 8 : 7) : r === 6 ? d <= (das ? 7 : 6) : r === 5 ? false : r === 4 ? das && d >= 4 && d <= 6
      : d <= 7 && (das || d >= 3);
    if (split) return 'split';
  }
  const dbl = (x) => (can.double ? 'double' : x);
  if (soft && total <= 21) {
    if (total >= 20) return 'stand';
    if (total === 19) return d === 6 ? dbl('stand') : 'stand';
    if (total === 18) return d >= 3 && d <= 6 ? dbl('stand') : d === 2 || d === 7 || d === 8 || d === 11 ? 'stand' : 'hit';
    if (total === 17) return d >= 2 && d <= 6 ? dbl('hit') : 'hit';
    if (total >= 13) return d >= 4 && d <= 6 ? dbl('hit') : 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return d <= 6 ? 'stand' : 'hit';
  if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (total === 11) return dbl('hit');
  if (total === 10) return d <= 9 ? dbl('hit') : 'hit';
  if (total === 9) return d <= 6 ? dbl('hit') : 'hit';
  if (total === 8) return d === 5 || d === 6 ? dbl('hit') : 'hit';
  return 'hit';
}
