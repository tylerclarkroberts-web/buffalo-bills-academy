// Player money in the closed economy: bankroll, transaction log, poker/mining stats.
// Money is play money in whole cents (stored as dollars rounded to 2 decimals).
import { GameError } from './engine/game.js';

export const STARTING_BANKROLL = 1000;
const MAX_TXNS = 200;
const MAX_SHIFT_HISTORY = 50;
export const cents = (x) => Math.round(x * 100) / 100;

export class Accounts {
  constructor({ store, now }) { this.store = store; this.now = now; }

  /** Lazily give any player (new or from before the economy existed) a wallet. */
  ensure(p) {
    if (!p) return p;
    if (typeof p.bankroll !== 'number') {
      p.bankroll = STARTING_BANKROLL;
      p.txns = [{ t: this.now(), type: 'start', amount: STARTING_BANKROLL, note: 'Starting bankroll', balance: STARTING_BANKROLL }];
      p.stats ||= { handsPlayed: 0, handsWon: 0, biggestPot: 0, chipsWon: 0 };
      p.mining ||= { shifts: 0, earned: 0, jackpots: 0, best: 0, history: [], recentStarts: [], totalMs: 0, timedShifts: 0 };
      p.holdings ||= {};
      p.invest ||= { realized: 0 };
      this.store.savePlayers();
    }
    p.stats ||= { handsPlayed: 0, handsWon: 0, biggestPot: 0, chipsWon: 0 };
    p.mining ||= { shifts: 0, earned: 0, jackpots: 0, best: 0, history: [], recentStarts: [], totalMs: 0, timedShifts: 0 };
    p.holdings ||= {};
    p.invest ||= { realized: 0 };
    return p;
  }
  save() { this.store.savePlayers(); }

  log(p, type, amount, note) {
    p.txns = [...(p.txns || []), { t: this.now(), type, amount: cents(amount), note, balance: p.bankroll }].slice(-MAX_TXNS);
  }
  requireFunds(p, amount, what = 'that') {
    this.ensure(p);
    if (p.bankroll + 1e-9 < amount) {
      throw new GameError(`You need $${fmt(amount)} for ${what} but have $${fmt(p.bankroll)}. Sell some investments or work a shift in the Acid Mines.`, 402);
    }
  }
  /** Move money. `force` lets the poker hook record a buy-in that was already checked. */
  change(p, amount, type, note, { force = false, save = true } = {}) {
    this.ensure(p);
    const next = cents(p.bankroll + amount);
    if (next < -1e-9 && !force) throw new GameError(`Not enough money: you have $${fmt(p.bankroll)}.`, 402);
    p.bankroll = next;
    this.log(p, type, amount, note);
    if (save) this.save();
    return p.bankroll;
  }

  touchMining(p, patch) { this.ensure(p); Object.assign(p.mining, patch); this.save(); }
  recordShift(p, r) {
    this.ensure(p);
    const m = p.mining;
    m.shifts += 1; m.earned = cents(m.earned + r.amount); m.best = Math.max(m.best, r.amount);
    if (r.amount >= 10000) m.jackpots += 1;
    // v38: how long each finished shift took (clock-in to payout, ms), plus a running total. Stored only, not shown yet.
    const ms = Number.isFinite(r.ms) && r.ms > 0 ? Math.round(r.ms) : 0;
    m.totalMs = (m.totalMs || 0) + ms; m.timedShifts = (m.timedShifts || 0) + (ms ? 1 : 0);
    m.history = [...m.history, { t: r.at, outcome: r.outcome, amount: r.amount, ...(ms ? { ms } : {}) }].slice(-MAX_SHIFT_HISTORY);
    this.change(p, r.amount, 'mine', `Acid Mines: ${r.title.toLowerCase()}`);
  }
  recordHand(p, { won, amount, pot }) {
    this.ensure(p);
    const s = p.stats;
    s.handsPlayed += 1;
    if (won) { s.handsWon += 1; s.chipsWon += amount; s.biggestPot = Math.max(s.biggestPot, pot); }
  }
}
export const fmt = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 });
