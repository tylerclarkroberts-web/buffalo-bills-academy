// v38 bots: the decision maker. Pure: (what the bot is allowed to see, a random source) -> an action.
// It is only ever given the bot's own view of the table (engine viewFor), so it never sees anyone else's hole cards.
// Style: equity-driven, position-aware, mixed (randomised) strategy that is close to a solid regular's GTO-ish play:
// position-based opening ranges, 3-bets for value and as bluffs, pot-odds calls, value bets sized to the pot,
// c-bets, semi-bluffs with draws and balanced river bluffs; opponents' ranges are narrowed by what they have done.
import { score, cardInt } from './eval.js';

// ---- preflop hand classes (169) ranked by equity against one random hand, computed once at load ----
const classOf = (a, b) => { const ra = a >> 2, rb = b >> 2; const hi = Math.max(ra, rb), lo = Math.min(ra, rb); return hi === lo ? hi * 13 + lo : (a & 3) === (b & 3) ? hi * 13 + lo : lo * 13 + hi; };
// index layout: pairs r*13+r, suited hi*13+lo (hi>lo), offsuit lo*13+hi
function xorshift(seed) { let x = seed >>> 0 || 0x9e3779b9; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const PCT = new Float64Array(169); // 0 = best hand (AA) .. 1 = worst (72o), weighted by combos
export const PREFLOP_EQ = new Float64Array(169);
(function build() {
  const rnd = xorshift(20261031); const deck = new Int32Array(52); const tmp = new Int32Array(7); const tmp2 = new Int32Array(7);
  const reps = [];
  for (let hi = 0; hi < 13; hi++) for (let lo = 0; lo <= hi; lo++) {
    if (hi === lo) reps.push([hi * 13 + lo, hi * 4, lo * 4 + 1, 6]);
    else { reps.push([hi * 13 + lo, hi * 4, lo * 4, 4]); reps.push([lo * 13 + hi, hi * 4, lo * 4 + 1, 12]); }
  }
  const N = 1400;
  for (const [cls, a, b] of reps) {
    let n = 0; for (let c = 0; c < 52; c++) if (c !== a && c !== b) deck[n++] = c;
    let w = 0;
    for (let it = 0; it < N; it++) {
      for (let k = 0; k < 7; k++) { const j = k + Math.floor(rnd() * (n - k)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
      tmp[0] = a; tmp[1] = b; tmp2[0] = deck[0]; tmp2[1] = deck[1];
      for (let k = 0; k < 5; k++) { tmp[2 + k] = deck[2 + k]; tmp2[2 + k] = deck[2 + k]; }
      const x = score(tmp, 7), y = score(tmp2, 7); w += x > y ? 1 : x === y ? 0.5 : 0;
    }
    PREFLOP_EQ[cls] = w / N;
  }
  reps.sort((p, q) => PREFLOP_EQ[q[0]] - PREFLOP_EQ[p[0]]);
  let acc = 0; for (const [cls, , , combos] of reps) { PCT[cls] = (acc + combos / 2) / 1326; acc += combos; }
})();
export const handPct = (a, b) => PCT[classOf(a, b)];

// ---- Monte Carlo equity against opponents' estimated ranges ----
// each opponent: { maxPct (preflop range width), agg (postflop bets/raises), calls (postflop calls) }
function improves(hole, board, nb) {
  if (nb === 0) return { made: true, draw: false };
  const all = [hole[0], hole[1], ...board.slice(0, nb)];
  const withH = score(all) >> 20, boardOnly = nb >= 5 ? score(board, 5) >> 20 : boardCat(board, nb);
  const made = withH > boardOnly || (withH === 1 && ((hole[0] >> 2) === pairRank(all) || (hole[1] >> 2) === pairRank(all)));
  if (made) return { made: true, draw: false };
  if (nb >= 5) return { made: false, draw: false };
  const suits = [0, 0, 0, 0]; for (const c of all) suits[c & 3]++;
  let draw = suits.some((k, s) => k >= 4 && ((hole[0] & 3) === s || (hole[1] & 3) === s));
  if (!draw) { let m = 0; for (const c of all) m |= 1 << (c >> 2); const w = (m << 1) | ((m >> 12) & 1); for (let h = 0; h <= 9; h++) if (popc((w >> h) & 31) >= 4) { draw = true; break; } }
  return { made: false, draw };
}
const popc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
function pairRank(cs) { const k = new Uint8Array(13); let best = -1; for (const c of cs) if (++k[c >> 2] === 2 && (c >> 2) > best) best = c >> 2; return best; }
function boardCat(board, nb) { const k = new Uint8Array(13); let mx = 1, pairs = 0; for (let i = 0; i < nb; i++) { const v = ++k[board[i] >> 2]; if (v > mx) mx = v; if (v === 2) pairs++; } return mx >= 3 ? 3 : pairs >= 2 ? 2 : pairs === 1 ? 1 : 0; }

export function equity(hole, board, opps, iters, rnd) {
  const used = new Uint8Array(52); for (const c of hole) used[c] = 1; for (const c of board) used[c] = 1;
  const base = []; for (let c = 0; c < 52; c++) if (!used[c]) base.push(c);
  const deck = Int32Array.from(base); const n = deck.length; const nb = board.length;
  const mine = new Int32Array(7); mine[0] = hole[0]; mine[1] = hole[1];
  const theirs = opps.map(() => new Int32Array(7));
  let won = 0;
  for (let it = 0; it < iters; it++) {
    let top = 0; // cards 0..top-1 of the deck are dealt this iteration
    const take = () => { const j = top + Math.floor(rnd() * (n - top)); const t = deck[top]; deck[top] = deck[j]; deck[j] = t; return deck[top++]; };
    for (let o = 0; o < opps.length; o++) {
      const op = opps[o]; let a, b, tries = 0;
      const mark = top;
      for (;;) {
        top = mark; a = take(); b = take(); tries++;
        if (tries > 40) break;
        if (PCT[classOf(a, b)] > op.maxPct && rnd() > 0.04) continue; // outside the range (small leak for mistakes)
        if (nb && (op.agg || op.calls)) {
          const f = improves([a, b], board, nb);
          const keep = f.made ? 1 : f.draw ? (op.agg ? 0.6 : 0.85) : op.agg ? 0.3 ** op.agg : 0.55 ** op.calls;
          if (rnd() > keep) continue;
        }
        break;
      }
      theirs[o][0] = a; theirs[o][1] = b;
    }
    for (let k = 0; k < nb; k++) { mine[2 + k] = board[k]; }
    for (let k = nb; k < 5; k++) mine[2 + k] = take();
    const me = score(mine, 7); let best = 0, ties = 0;
    for (let o = 0; o < opps.length; o++) { const t = theirs[o]; for (let k = 0; k < 5; k++) t[2 + k] = mine[2 + k]; const s = score(t, 7); if (s > best) best = s; }
    if (me > best) won += 1;
    else if (me === best) { for (let o = 0; o < opps.length; o++) if (score(theirs[o], 7) === me) ties++; won += 1 / (ties + 1); }
  }
  return won / iters;
}

// ---- reading the public log for this hand: who raised, bet, called, on which street ----
export function readHand(view) {
  const h = view.hand; const byName = new Map();
  for (const s of view.seats) if (s) byName.set(s.name, s.seat);
  const st = {}; let street = 'preflop'; let preRaises = 0; let lastPreRaiser = null;
  for (const s of view.seats) if (s) st[s.seat] = { aggPre: 0, callPre: 0, agg: 0, calls: 0, aggThis: 0 };
  for (const e of view.log || []) {
    if (e.hand !== h.number) continue;
    const m = /^(Flop|Turn|River): /.exec(e.text); if (m) { street = m[1].toLowerCase(); for (const k in st) st[k].aggThis = 0; continue; }
    for (const [name, seat] of byName) {
      if (!e.text.startsWith(name + ' ')) continue;
      const rest = e.text.slice(name.length + 1); const x = st[seat];
      if (/^(raises|bets)/.test(rest)) { if (street === 'preflop') { x.aggPre++; preRaises++; lastPreRaiser = seat; } else { x.agg++; x.aggThis++; } }
      else if (/^calls/.test(rest)) { if (street === 'preflop') x.callPre++; else x.calls++; }
      break;
    }
  }
  return { st, preRaises, lastPreRaiser };
}

const clampTo = (L, to) => Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(to)));
function raiseTo(L, to) { const v = clampTo(L, to); return { type: L.isBet ? 'bet' : 'raise', amount: v >= L.maxRaiseTo * 0.8 ? L.maxRaiseTo : v }; }
const passive = (L) => (L.canCheck ? { type: 'check' } : { type: 'fold' });
const call = (L) => (L.canCheck ? { type: 'check' } : { type: 'call' });

/** Decide. view = engine viewFor(table, botId). rng() in [0,1). Returns { action, why } with why for logs/tests only. */
export function decide(view, rng = Math.random, { iters = 700 } = {}) {
  const L = view.legal; const h = view.hand; const me = view.seats[view.me.seat];
  if (!L || !h || h.toAct !== view.me.seat) return null; // never act out of turn
  const rnd = xorshift(Math.floor(rng() * 2 ** 32));
  const hole = me.cards.map(cardInt); const board = h.board.map(cardInt);
  const bb = view.settings.bigBlind; const pot = h.pot; const toCall = L.toCall;
  const n = view.seats.length;
  const live = view.seats.filter((s) => s && s.inHand && !s.folded);
  const opps = live.filter((s) => s.seat !== me.seat);
  const dealt = view.seats.filter((s) => s && s.inHand).length;
  const { st, preRaises, lastPreRaiser } = readHand(view);
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const eff = Math.min(me.stack + me.bet, Math.max(...opps.map((o) => o.stack + o.bet)));
  const effBB = eff / bb;

  if (h.street === 'preflop') return preflop();
  return postflop();

  function preflop() {
    const pct = handPct(hole[0], hole[1]);
    const suited = (hole[0] & 3) === (hole[1] & 3);
    // how many players still to act behind me (to the big blind)
    let behind = 0; for (let k = 1; k < n; k++) { const i = (me.seat + k) % n; const s = view.seats[i]; if (s && s.inHand && !s.folded && i !== me.seat) behind++; if (i === h.bbSeat) break; }
    if (me.seat === h.bbSeat) behind = 0;
    const headsUp = dealt === 2;
    const level = preRaises; // 0 unopened (limps only), 1 facing a raise, 2+ facing a re-raise
    const limpers = opps.filter((o) => o.bet === h.currentBet && o.seat !== h.bbSeat).length;
    // short stacks: push or fold
    if (effBB <= 13) {
      const jam = headsUp ? 0.55 : [0.42, 0.33, 0.25, 0.2, 0.16, 0.13][Math.min(5, behind)];
      if (level === 0 && pct <= jam && L.canRaise) return { action: { type: 'allin' }, why: 'short jam' };
      if (toCall === 0) return { action: { type: 'check' }, why: 'short check' };
      const need = toCall >= me.stack ? 0.1 : 0.06;
      if (pct <= need + (potOdds > 0.4 ? 0.12 : 0) && L.canRaise) return { action: { type: 'allin' }, why: 'short re-jam' };
      if (pct <= need + 0.08 + (potOdds > 0.4 ? 0.2 : 0)) return { action: call(L), why: 'short call' };
      return { action: passive(L), why: 'short fold' };
    }
    if (level === 0) {
      const open = headsUp ? 0.82 : me.seat === h.sbSeat ? 0.4 : [0.48, 0.45, 0.3, 0.22, 0.18, 0.15, 0.13, 0.12, 0.11][Math.min(8, behind)];
      if (me.seat === h.bbSeat && toCall === 0) {
        if (pct <= 0.13 + (limpers === 1 ? 0.1 : 0) && L.canRaise) return { action: raiseTo(L, h.currentBet + bb * (3 + limpers)), why: 'iso raise' };
        return { action: { type: 'check' }, why: 'bb check' };
      }
      const mixed = pct <= open || (pct <= open + 0.07 && rng() < 0.3);
      if (mixed && L.canRaise) return { action: raiseTo(L, bb * ((headsUp ? 2.5 : me.seat === h.sbSeat ? 3 : 2.5) + limpers)), why: 'open' };
      if (me.seat === h.sbSeat && toCall <= bb / 2 && pct <= 0.55 && !headsUp) return { action: call(L), why: 'sb complete' };
      return { action: passive(L), why: 'fold preflop' };
    }
    const raiser = lastPreRaiser; const rs = raiser !== null ? st[raiser] : null;
    const range = level === 1 ? (headsUp ? 0.6 : 0.24) : level === 2 ? (headsUp ? 0.2 : 0.08) : 0.035;
    const field = opps.map((o) => ({ maxPct: o.seat === raiser ? range : st[o.seat]?.callPre ? Math.min(0.4, range * 1.6) : 0.6, agg: 0, calls: 0 }));
    const eq = equity(hole, board, field, 360, rnd);
    const ip = me.seat === h.buttonSeat || (headsUp && me.seat === h.sbSeat);
    const want = potOdds + (ip ? 0.0 : 0.04) + (opps.length > 1 ? 0.02 : 0) - (me.seat === h.bbSeat ? 0.05 : 0);
    if (level === 1) {
      const value = pct <= (headsUp ? 0.1 : 0.035);
      const bluff = !value && suited && pct > 0.08 && pct <= 0.2 && rng() < 0.28;
      if ((value || bluff) && L.canRaise) return { action: raiseTo(L, h.currentBet * (ip ? 3 : 3.8) + toCall * 0.5), why: value ? '3bet value' : '3bet bluff' };
      if (eq >= want) return { action: call(L), why: `call open eq ${eq.toFixed(2)}` };
      return { action: passive(L), why: `fold to open eq ${eq.toFixed(2)}` };
    }
    // facing a 3-bet or more
    if (pct <= (headsUp ? 0.04 : 0.018) && L.canRaise) return { action: level >= 3 || effBB < 60 ? { type: 'allin' } : raiseTo(L, h.currentBet * 2.3), why: '4bet value' };
    if (level === 2 && suited && pct > 0.05 && pct < 0.12 && rng() < 0.1 && L.canRaise) return { action: raiseTo(L, h.currentBet * 2.3), why: '4bet bluff' };
    if (eq >= want + 0.02) return { action: call(L), why: `call 3bet eq ${eq.toFixed(2)}` };
    return { action: passive(L), why: `fold to 3bet eq ${eq.toFixed(2)}` };
  }

  function postflop() {
    const dist = (i) => (i - h.buttonSeat - 1 + n) % n;
    const ip = live.every((s) => dist(me.seat) >= dist(s.seat));
    const range = (o) => {
      const x = st[o.seat] || { aggPre: 0, callPre: 0 };
      let r = x.aggPre >= 2 ? 0.05 : x.aggPre === 1 ? (dealt === 2 ? 0.6 : 0.22) : x.callPre ? (dealt === 2 ? 0.7 : 0.38) : o.seat === h.bbSeat ? 1 : 0.6;
      if (preRaises >= 2 && x.callPre && !x.aggPre) r = Math.min(r, 0.12);
      return r;
    };
    const field = opps.map((o) => ({ maxPct: range(o), agg: st[o.seat]?.agg || 0, calls: st[o.seat]?.calls || 0 }));
    const it = Math.max(250, Math.round(iters / Math.max(1, opps.length * 0.7)));
    const eq = equity(hole, board, field, it, rnd);
    const multi = opps.length;
    const valueThr = multi === 1 ? 0.64 : multi === 2 ? 0.5 : 0.42;
    const aggressor = lastPreRaiser === me.seat;
    const river = h.street === 'river';
    const drawy = !river && eq > 0.3 && eq < 0.5;
    const bet = (f) => raiseTo(L, Math.max(bb, pot * f));
    if (toCall === 0) {
      if (!L.canRaise) return { action: { type: 'check' }, why: 'check (cannot bet)' };
      if (eq >= valueThr) {
        if (eq > 0.85 && !river && rng() < 0.25 && ip === false) return { action: { type: 'check' }, why: `slowplay eq ${eq.toFixed(2)}` };
        return { action: bet(river ? (eq > 0.85 ? 0.8 : 0.6) : eq > 0.8 ? 0.7 : 0.55), why: `value bet eq ${eq.toFixed(2)}` };
      }
      if (h.street === 'flop' && aggressor && multi <= 2 && rng() < (multi === 1 ? 0.62 : 0.35)) return { action: bet(0.33), why: `c-bet eq ${eq.toFixed(2)}` };
      if (drawy && rng() < 0.42) return { action: bet(0.6), why: `semi-bluff eq ${eq.toFixed(2)}` };
      if (river && multi === 1 && eq < 0.18 && rng() < (ip ? 0.3 : 0.18)) return { action: bet(0.7), why: `river bluff eq ${eq.toFixed(2)}` };
      if (multi === 1 && ip && eq > 0.45 && rng() < 0.5) return { action: bet(0.4), why: `thin bet eq ${eq.toFixed(2)}` };
      return { action: { type: 'check' }, why: `check eq ${eq.toFixed(2)}` };
    }
    const raiseThr = multi === 1 ? 0.8 : 0.68;
    if (eq >= raiseThr && L.canRaise) return { action: raiseTo(L, h.currentBet * 2.6 + (pot - h.currentBet) * 0.35), why: `value raise eq ${eq.toFixed(2)}` };
    if (h.street === 'flop' && drawy && multi === 1 && rng() < 0.14 && L.canRaise) return { action: raiseTo(L, h.currentBet * 3), why: `semi-bluff raise eq ${eq.toFixed(2)}` };
    const small = toCall <= pot * 0.3;
    const need = potOdds + (river ? 0.01 : -0.03) - (small ? 0.03 : 0) + (toCall >= me.stack ? 0.03 : 0);
    if (eq >= need) return { action: call(L), why: `call eq ${eq.toFixed(2)} need ${need.toFixed(2)}` };
    return { action: passive(L), why: `fold eq ${eq.toFixed(2)} need ${need.toFixed(2)}` };
  }
}
