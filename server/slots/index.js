// v39 "Three Lil' Squatches" slot machine (play money only; nothing here is ever real money).
// Server-authoritative: the server draws every symbol with crypto.randomInt, computes the result with the same pure
// engine the simulator runs (./math.js), then debits the bet and credits the win in one Accounts.change. The client
// only replays the result it is sent. Responsible-play guard rails: bets $1..$100 and never more than a tenth of
// your balance; a minimum gap between spins; a reality check every 100 spins; a forced 5-minute break after 300
// spins or 45 minutes in one session; and a session summary.
import crypto from 'node:crypto';
import { GameError } from '../engine/game.js';
import { cents } from '../accounts.js';
import { M, CFG, spin as runSpin } from './math.js';

export const BETS = [1, 2, 5, 10, 25, 50, 100];
export const SLOTS = {
  minGapMs: 700,               // fastest allowed spin rate
  idleMs: 15 * 60e3,           // a gap this long starts a new session
  realityEvery: 100,           // spins between reality checks
  breakAfterSpins: 300, breakAfterMs: 45 * 60e3, breakMs: 5 * 60e3,
  balanceShare: 0.1,           // max bet is a tenth of your balance (rounded down to a bet step)
  keep: 50,                    // recent spins kept per player
};
export const PLAY_MONEY_NOTE = 'Play money only. Nothing here can be bought with, won as, or cashed out for real money.';

export const cryptoRng = (n) => crypto.randomInt(n);
/** The biggest bet allowed for this balance (0 = cannot spin). */
export function maxBetFor(balance) {
  const cap = Math.min(100, Math.max(1, Math.floor(balance * SLOTS.balanceShare)), Math.floor(balance));
  let best = 0; for (const b of BETS) if (b <= cap) best = b;
  return best;
}

export class Slots {
  constructor({ store, accounts, now, rng = cryptoRng, force = null }) {
    this.store = store; this.accounts = accounts; this.now = now; this.rng = rng;
    this.force = force; // dev/e2e only: 'toot' | 'stash' | 'free' forces the next spins' feature (never set in production)
    this.doc = store.loadDoc('slots', { players: {} });
    this.doc.players ||= {};
    this.lastAt = new Map();
  }
  save() { this.store.saveDoc('slots', this.doc); }
  forget(pid) { delete this.doc.players[pid]; this.lastAt.delete(pid); this.save(); }
  rec(pid) {
    const r = (this.doc.players[pid] ||= { life: { spins: 0, wagered: 0, won: 0, biggest: 0 }, session: null, recent: [], breakUntil: 0, muted: false });
    r.life ||= { spins: 0, wagered: 0, won: 0, biggest: 0 }; r.recent ||= [];
    return r;
  }
  freshSession(t) { return { id: crypto.randomBytes(4).toString('hex'), startedAt: t, lastAt: t, spins: 0, wagered: 0, won: 0, biggest: 0, biggestX: 0, features: { toot: 0, stash: 0, free: 0 }, startBalance: null, reality: 0 }; }
  session(r, t, balance) {
    if (!r.session || t - r.session.lastAt > SLOTS.idleMs) { r.session = this.freshSession(t); r.session.startBalance = balance; }
    return r.session;
  }
  summary(s, balance) {
    if (!s) return null;
    return { spins: s.spins, wagered: cents(s.wagered), won: cents(s.won), net: cents(s.won - s.wagered), biggest: cents(s.biggest), biggestX: s.biggestX, features: s.features, minutes: Math.round((s.lastAt - s.startedAt) / 60e3), startedAt: s.startedAt, startBalance: s.startBalance, balance };
  }

  view(p) {
    this.accounts.ensure(p);
    const r = this.rec(p.id); const t = this.now();
    const live = r.session && t - r.session.lastAt <= SLOTS.idleMs ? r.session : null;
    return {
      bets: BETS, maxBet: maxBetFor(p.bankroll), bankroll: p.bankroll, note: PLAY_MONEY_NOTE,
      rtp: '~95%', session: this.summary(live, p.bankroll), life: r.life, recent: r.recent.slice(-10),
      breakUntil: r.breakUntil > t ? r.breakUntil : 0, minGapMs: SLOTS.minGapMs, serverNow: t,
      limits: { realityEvery: SLOTS.realityEvery, breakAfterSpins: SLOTS.breakAfterSpins, breakAfterMin: SLOTS.breakAfterMs / 60e3, breakMin: SLOTS.breakMs / 60e3 },
      paytable: Object.fromEntries(Object.entries(M.pays).map(([k, v]) => [k, v.map((x) => Math.round(x * 100) / 100)])), jackpots: CFG.jackpots, maxWinX: CFG.maxWin,
    };
  }

  spin(p, betIn) {
    this.accounts.ensure(p);
    const t = this.now(); const r = this.rec(p.id);
    const bet = Number(betIn);
    if (!BETS.includes(bet)) throw new GameError(`Pick a bet: ${BETS.map((b) => '$' + b).join(', ')}.`, 400);
    if (r.breakUntil > t) throw Object.assign(new GameError(`Break time: the machine is resting until ${new Date(r.breakUntil).toISOString()}. Stretch your legs!`, 429), { until: r.breakUntil });
    const last = this.lastAt.get(p.id) || 0;
    if (t - last < SLOTS.minGapMs) throw new GameError('Easy there: one spin at a time.', 429);
    const max = maxBetFor(p.bankroll);
    if (!max) throw new GameError(`You need at least $1 to spin (you have $${p.bankroll.toFixed(2)}). Work a shift in the Acid Mines.`, 402);
    if (bet > max) throw new GameError(`Max bet right now is $${max} (a tenth of your balance, capped at $100).`, 402);
    this.accounts.requireFunds(p, bet, 'that spin');
    this.lastAt.set(p.id, t);

    const res = this.forced() || runSpin(this.rng, M);
    const win = cents(res.x * bet);
    const s = this.session(r, t, p.bankroll);
    // one money movement per spin; consecutive spins in a session share one rolling statement line
    const before = p.bankroll;
    this.accounts.change(p, win - bet, 'slots', 'Slots', { save: false });
    this.mergeTxn(p, s, before);
    s.lastAt = t; s.spins++; s.wagered = cents(s.wagered + bet); s.won = cents(s.won + win);
    if (win > s.biggest) { s.biggest = win; s.biggestX = Math.round(res.x * 100) / 100; }
    for (const f of ['toot', 'stash', 'free']) if (res[f]) s.features[f]++;
    r.life.spins++; r.life.wagered = cents(r.life.wagered + bet); r.life.won = cents(r.life.won + win); r.life.biggest = Math.max(r.life.biggest, win);
    const feature = res.toot ? 'toot' : res.free ? 'free' : res.stash ? 'stash' : null;
    r.recent = [...r.recent, { t, bet, win, x: Math.round(res.x * 100) / 100, feature }].slice(-SLOTS.keep);
    // responsible play
    let reality = null, breakUntil = 0;
    if (s.spins % SLOTS.realityEvery === 0) reality = this.summary(s, p.bankroll);
    if (s.spins >= SLOTS.breakAfterSpins || t - s.startedAt >= SLOTS.breakAfterMs) {
      breakUntil = r.breakUntil = t + SLOTS.breakMs;
      reality = this.summary(s, p.bankroll); r.lastSummary = reality; r.session = null; // the break ends the session
    }
    this.accounts.save(); this.save();
    return { bet, win, x: res.x, result: res, bankroll: p.bankroll, maxBet: maxBetFor(p.bankroll), session: this.summary(r.session, p.bankroll), reality, breakUntil, feature, bigWin: res.x >= 10 };
  }
  /** Keep the statement readable: one line per slots session instead of one per spin. */
  mergeTxn(p, s, before) {
    const txns = p.txns; const cur = txns[txns.length - 1];
    const prev = txns[txns.length - 2];
    if (prev && prev.type === 'slots' && prev.session === s.id) { prev.amount = cents(prev.amount + cur.amount); prev.balance = cur.balance; prev.t = cur.t; prev.spins = (prev.spins || 1) + 1; prev.note = `Slots: ${prev.spins} spins`; txns.pop(); }
    else { cur.session = s.id; cur.spins = 1; cur.note = 'Slots: 1 spin'; void before; }
  }
  end(p) {
    this.accounts.ensure(p);
    const r = this.rec(p.id); const sum = this.summary(r.session, p.bankroll);
    r.session = null; this.save();
    return { summary: sum, bankroll: p.bankroll };
  }
  forced() {
    if (!this.force) return null;
    // dev only: keep drawing with the real RNG until the spin carries the requested feature (bounded)
    for (let i = 0; i < 200000; i++) { const res = runSpin(this.rng, M); if (res[this.force] && (this.force !== 'toot' || res.x >= 10)) return res; }
    return null;
  }
}
