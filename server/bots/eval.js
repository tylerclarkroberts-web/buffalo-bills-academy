// v38 bots: a fast 5-7 card evaluator on integer cards (rank*4 + suit), for Monte Carlo equity.
// Scores compare as plain integers and rank hands exactly like engine/evaluator.js (a unit test checks).
import { RANKS, SUITS } from '../engine/cards.js';

export const cardInt = (c) => RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]);
export const intCard = (n) => RANKS[n >> 2] + SUITS[n & 3];

function straightHigh(m) { // m: 13-bit rank mask; returns the high rank index or -1
  const w = (m << 1) | ((m >> 12) & 1); // bit 0 = the ace played low
  for (let h = 13; h >= 4; h--) if (((w >> (h - 4)) & 31) === 31) return h - 1;
  return -1;
}
function topBits(m, k) { // the k highest rank indexes in mask m, as a packed nibble list
  let out = 0, got = 0;
  for (let r = 12; r >= 0 && got < k; r--) if (m & (1 << r)) { out = (out << 4) | r; got++; }
  return out << (4 * (5 - got));
}
const RC = new Uint8Array(13);
/** Score of the best 5-card hand in cs (array of ints, length 5..7). Category is score >> 20 (0 high card .. 8 straight flush). */
export function score(cs, n = cs.length) {
  RC.fill(0); let s0 = 0, s1 = 0, s2 = 0, s3 = 0, c0 = 0, c1 = 0, c2 = 0, c3 = 0, mask = 0;
  for (let i = 0; i < n; i++) {
    const c = cs[i], r = c >> 2, b = 1 << r; RC[r]++; mask |= b;
    switch (c & 3) { case 0: s0 |= b; c0++; break; case 1: s1 |= b; c1++; break; case 2: s2 |= b; c2++; break; default: s3 |= b; c3++; }
  }
  const fm = c0 >= 5 ? s0 : c1 >= 5 ? s1 : c2 >= 5 ? s2 : c3 >= 5 ? s3 : 0;
  if (fm) { const sf = straightHigh(fm); if (sf >= 0) return (8 << 20) | (sf << 16); }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = RC[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | (topBits(mask & ~(1 << quad), 1) >> 12);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  if (fm) return (5 << 20) | topBits(fm, 5);
  const st = straightHigh(mask); if (st >= 0) return (4 << 20) | (st << 16);
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (topBits(mask & ~(1 << t1), 2) >> 4);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (topBits(mask & ~(1 << p1) & ~(1 << p2), 1) >> 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topBits(mask & ~(1 << p1), 3) >> 4);
  return topBits(mask, 5);
}
