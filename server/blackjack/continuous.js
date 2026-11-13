// Individual continuous play: everyone at the table plays their own single-deck blackjack against the house, round
// after round, without waiting on anyone. Each seat gets a "lane" (its own deck, discards, round and last result);
// the bankrolls stay shared: seat chips live on the seat and a human house's bank on the table, so N lanes settle
// against one bank. The pure engine in ./game.js runs unchanged on a lane view of the table.
import * as G from './game.js';
import { GameError } from '../engine/game.js';
import { ROYAL } from './rules.js';

export const isContinuous = (t) => !!t.settings?.continuous;
const LANE_KEYS = ['deck', 'discards', 'round', 'roundNo', 'last', 'shuffles', 'status', 'final', 'overReason'];
const SHARED_KEYS = ['code', 'name', 'rules', 'royal', 'limits', 'turnSec', 'maxSeats', 'house', 'settings', 'log', 'seq', 'hostId'];

/** The table as one seat's game sees it: its own deck/round, the shared house and log, and only its own seat. */
export function laneView(t, seat) {
  const lane = t.lanes[seat];
  if (!lane) throw new GameError('Take a seat first.', 409);
  const v = { lane: seat };
  for (const k of LANE_KEYS) Object.defineProperty(v, k, { get: () => lane[k], set: (x) => { lane[k] = x; }, enumerable: true });
  for (const k of SHARED_KEYS) Object.defineProperty(v, k, { get: () => t[k], set: (x) => { t[k] = x; }, enumerable: true });
  Object.defineProperty(v, 'seats', { get: () => t.seats.map((s, i) => (i === seat ? s : null)), enumerable: true });
  return v;
}
const lanesOf = (t) => Object.entries(t.lanes || {}).map(([i, l]) => [+i, l]);
const humanSeat = (t, i) => { const s = t.seats[i]; return s && !s.left && !s.bot ? s : null; };

// ---------------- the house's exposure cap ----------------
// A human house's bank backs every lane at once, so each open bet reserves the most it can still win:
//   a main hand not yet dealt or not doubled reserves 2× its bet (a doubled win; a 3:2 blackjack pays less),
//   a doubled hand reserves its (already doubled) bet, and a royal bet not yet settled reserves its top payout.
// A new bet is refused when its reserve would not fit in the bank left after everyone else's reserves.
// Splits can still go past a reserve; then the engine's existing rule applies: the house pays what is left.
const topPay = (t, k) => Math.max(...ROYAL[k].tiers.map((x) => t.royal[k][x.k]));
export function betReserve(t, bet, side = {}) {
  let x = 2 * bet;
  for (const k of ['match', 'pairs']) if (side[k]) x += side[k] * topPay(t, k);
  return x;
}
export function laneReserve(t, lane) {
  const r = lane.round; if (!r || lane.status === 'over') return 0;
  if (r.phase === 'betting') return Object.values(r.bets).reduce((a, b) => a + (b.out ? 0 : betReserve(t, b.bet, b.side)), 0);
  if (['done', 'over'].includes(r.phase)) return 0;
  return r.hands.reduce((a, h) => a + (h.doubled ? h.bet : 2 * h.bet), 0);
}
/** Bank not yet promised to other seats' open bets (Infinity for Guntrad). */
export function freeBank(t, exceptSeat = null) {
  if (t.house.mode === 'guntrad') return Infinity;
  let res = 0; for (const [i, l] of lanesOf(t)) if (i !== exceptSeat) res += laneReserve(t, l);
  return Math.max(0, t.house.bank - res);
}
/** Biggest main bet this seat can place right now: the usual limit, and no more than half the free bank. */
export function laneMaxBet(t, seat) {
  const m = G.maxBetNow(t);
  return t.house.mode === 'guntrad' ? m : Math.max(0, Math.min(m, Math.floor(freeBank(t, seat) / 2)));
}

// ---------------- lanes ----------------
export function openLane(t, seat, now, rng) {
  if (!humanSeat(t, seat)) return;
  t.lanes ||= {};
  t.lanes[seat] = { status: 'playing', deck: null, discards: [], round: null, roundNo: 0, last: null, shuffles: 0 };
  G.startRound(laneView(t, seat), now, rng);
  check(t, now);
}
/** Before a seat cashes out: hand back a bet that was not dealt yet; a hand in play must finish first. */
export function closeLane(t, seat, now) {
  const lane = t.lanes?.[seat]; if (!lane) return;
  const r = lane.round;
  if (lane.status === 'playing' && r && !['betting', 'done', 'over'].includes(r.phase)) throw new GameError('Finish this round first.', 409);
  if (lane.status === 'playing') G.voidRound(laneView(t, seat), now);
  delete t.lanes[seat];
}
/** Run one seat's game, then let the table react (house broke, everyone done). */
export function laneOp(t, seat, now, rng, fn) {
  const lane = t.lanes?.[seat];
  if (!lane) throw new GameError('Take a seat first.', 409);
  if (lane.status === 'over') throw new GameError(lane.overReason || 'Your game here is over: cash out.', 409);
  const v = laneView(t, seat);
  G.advance(v, now, rng);
  const out = fn(v);
  check(t, now);
  return out;
}
export function placeBet(t, seat, body, now, rng) {
  return laneOp(t, seat, now, rng, (v) => {
    const r = v.round;
    if (t.house.mode !== 'guntrad' && r?.phase === 'betting' && !r.bets[seat]) {
      const bet = Number(body.bet); const side = {};
      for (const k of ['match', 'pairs']) { const x = Number(body.royal?.[k] || 0); if (x > 0) side[k] = x; }
      const free = freeBank(t, seat);
      if (Number.isFinite(bet) && betReserve(t, bet, side) > free) {
        const busy = lanesOf(t).filter(([i, l]) => i !== seat && laneReserve(t, l) > 0).length;
        throw new GameError(`The house can only cover $${Math.floor(free)} more right now (${busy} other hand${busy === 1 ? '' : 's'} in play). Bet less or wait a hand.`, 409);
      }
    }
    G.placeBet(v, seat, body, now, rng);
  });
}
export function advanceAll(t, now, rng) {
  if (t.status !== 'playing') return;
  for (const [i, l] of lanesOf(t)) {
    if (l.status !== 'playing' || t.status !== 'playing') continue;
    try { G.advance(laneView(t, i), now, rng); } catch { /* keep the other lanes going */ }
  }
  check(t, now);
}
/** Table-level consequences of what the lanes did. */
export function check(t, now) {
  if (t.status !== 'playing') return;
  const broke = t.house.mode !== 'guntrad' && (t.house.bank <= 0 || t.house.bank < t.limits.min || G.maxBetNow(t) < t.limits.min);
  if (broke) return endTable(t, now, `${t.house.name || 'The house'} is out of money.`);
  const seated = t.seats.map((s, i) => [s, i]).filter(([s]) => s && !s.left && !s.bot);
  if (seated.length && seated.every(([, i]) => t.lanes?.[i]?.status === 'over')) endTable(t, now, 'No one can cover the minimum bet.');
}
/** The whole table stops: every lane's unsettled stakes go back, then the normal game-over (final standings). */
export function endTable(t, now, why) {
  for (const [i, l] of lanesOf(t)) {
    if (l.status !== 'playing') continue;
    const v = laneView(t, i); G.voidRound(v, now); l.status = 'over'; l.overReason = why; if (l.round) l.round.phase = 'over';
  }
  t.round = null;
  G.endGame(t, now, why);
}
/** Public, card-free summary of every seat's own game, for the felt. */
export function laneSummary(t) {
  return Object.fromEntries(lanesOf(t).map(([i, l]) => {
    const r = l.round; const b = r?.bets?.[i];
    const mine = l.last?.results?.filter((x) => x.seat === i) || [];
    return [i, { no: r?.no || 0, phase: l.status === 'over' ? 'over' : r?.phase || 'betting', bet: r?.hands?.length ? r.hands.reduce((a, h) => a + h.bet, 0) : b && !b.out ? b.bet : 0,
      lastNet: mine.length ? mine.reduce((a, x) => a + x.net, 0) : null, lastNo: l.last?.no || 0, reserve: laneReserve(t, l) }];
  }));
}
