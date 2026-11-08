// v38: simple baseline opponents, used only by the simulation and tests to measure how strong the real bots are.
import { score, cardInt } from './eval.js';
import { handPct, equity } from './brain.js';

const call = (L) => (L.canCheck ? { type: 'check' } : { type: 'call' });
const passive = (L) => (L.canCheck ? { type: 'check' } : { type: 'fold' });
const to = (L, x) => ({ type: L.isBet ? 'bet' : 'raise', amount: Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(x))) });
const made = (v) => { const me = v.seats[v.me.seat]; const b = v.hand.board.map(cardInt); if (!b.length) return 0; const all = [...me.cards.map(cardInt), ...b]; const c = score(all) >> 20; const bc = b.length >= 5 ? score(b) >> 20 : 0; return c > bc ? c : 0; };

export const BASELINES = {
  /** Calls or checks everything. */
  station: (v) => call(v.legal),
  /** Uniformly random legal move (bets half the pot when it raises). */
  random: (v, rng) => { const L = v.legal; const r = rng(); if (r < 0.2 && !L.canCheck) return { type: 'fold' }; if (r < 0.35 && L.canRaise) return to(L, L.currentBet + v.hand.pot * 0.5); return call(L); },
  /** Raises a lot, calls a lot. */
  maniac: (v, rng) => { const L = v.legal; const r = rng(); if (r < 0.5 && L.canRaise) return to(L, L.currentBet + v.hand.pot * 0.9 + v.settings.bigBlind); if (r < 0.85) return call(L); return passive(L); },
  /** An honest equity player: Monte Carlo equity against random hands, bets strength, calls by pot odds, never bluffs, ignores position and reads. */
  equity: (v, rng) => {
    const L = v.legal; const me = v.seats[v.me.seat]; const h = v.hand;
    const opps = v.seats.filter((s) => s && s.inHand && !s.folded && s.seat !== v.me.seat).map(() => ({ maxPct: 1, agg: 0, calls: 0 }));
    const e = equity(me.cards.map(cardInt), h.board.map(cardInt), opps, 400, rng);
    const po = L.toCall > 0 ? L.toCall / (h.pot + L.toCall) : 0;
    const fair = 1 / (opps.length + 1);
    if (e > fair * 1.6 && L.canRaise) return to(L, L.currentBet + h.pot * 0.66 + v.settings.bigBlind);
    if (L.toCall === 0) return { type: 'check' };
    return e >= po ? { type: 'call' } : { type: 'fold' };
  },
  /** A tight "ABC" player: plays the top 15%, bets and calls with any made hand. */
  abc: (v) => {
    const L = v.legal; const me = v.seats[v.me.seat]; const h = v.hand; const bb = v.settings.bigBlind;
    if (h.street === 'preflop') {
      const p = handPct(cardInt(me.cards[0]), cardInt(me.cards[1]));
      if (h.currentBet <= bb && p <= 0.15 && L.canRaise) return to(L, bb * 3);
      if (h.currentBet > bb && p <= 0.05 && L.canRaise && h.currentBet < bb * 10) return to(L, h.currentBet * 3);
      if (p <= (h.currentBet > bb * 4 ? 0.06 : 0.15)) return call(L);
      return passive(L);
    }
    const m = made(v);
    if (m >= 2 && L.canRaise) return to(L, L.currentBet + h.pot * 0.6);
    if (m >= 1) return L.canCheck && L.canRaise ? to(L, h.pot * 0.5) : call(L);
    return passive(L);
  },
};
