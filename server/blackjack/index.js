// v44 Blackjack service: persistence, bankroll moves, timers. Play money only.
// Bankroll rule: you buy in for the table's buy-in (chips come out of your bankroll) and cash out what is left when
// you leave or the game ends. A human house stakes a bank from their bankroll at the start and gets back whatever is
// left. Guntrad's bank is unlimited (it never touches anyone's bankroll).
import crypto from 'node:crypto';
import { cents } from '../accounts.js';
import { GameError } from '../engine/game.js';
import { newTable, viewFor, royalInfo, RULE_TEXT, cleanSettings, tableEdge } from './table.js';
import { edgeReport, ruleOptions, royalMaxPay, guntradProblems, MAIN_FLOOR, ROYAL_FLOOR, ACK, MIX, EDGE_TABLE } from './edge.js';
import * as G from './game.js';
import * as C from './continuous.js';
import { GUNTRAD_RULES, RULE_CHOICES, LIMITS, ROYAL } from './rules.js';
import { attachSeatBugs, tableBugOf } from '../tableBug.js';

const edgeSummary = (t) => { const e = tableEdge(t); return { main: { edge: e.main.edge, tone: e.main.tone }, side: Object.fromEntries(Object.entries(e.side).map(([k, v]) => [k, { edge: v.edge, tone: v.tone }])), needsAck: e.needsAck, grandfathered: !!e.grandfathered }; };
export const cryptoRng = (n) => crypto.randomInt(n);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const stats0 = () => ({ rounds: 0, wagered: 0, won: 0, lost: 0, bj: 0, biggest: 0 });

export class Blackjack {
  constructor({ store, accounts, getPlayer, now, rng = cryptoRng, tickMs = 1000, avatars = null, barn = null }) {
    Object.assign(this, { store, accounts, getPlayer, now, rng, avatars, barn });
    this.doc = store.loadDoc('blackjack', { tables: {} }); this.doc.tables ||= {};
    if (!this.doc.earnings) {
      this.doc.earnings = {};
      // Older tables reused seats without a ledger, so only their surviving cash-outs can be recovered.
      this.doc.earningsSince = Object.keys(this.doc.tables).length ? now() : null;
      for (const t of Object.values(this.doc.tables)) {
        for (const s of t.seats) if (s?.left && !s.bot && Number.isFinite(s.cashedOut) && Number.isFinite(s.startChips)) this.recordEarnings(s.id, s.cashedOut - s.startChips);
        if (t.paidOut && t.house.mode === 'player' && t.house.id && !t.house.staked && t.house.startBank > 0) this.recordEarnings(t.house.id, t.house.bank - t.house.startBank);
      }
      if (this.doc.earningsSince != null) this.save();
    }
    if (tickMs) { this.timer = setInterval(() => this.tick(), tickMs); this.timer.unref?.(); }
  }
  recordEarnings(pid, net) { this.doc.earnings[pid] = cents((this.doc.earnings[pid] || 0) + net); }
  earnings(pid) { return { net: this.doc.earnings[pid] || 0, partial: this.doc.earningsSince != null && !(this.getPlayer(pid)?.createdAt > this.doc.earningsSince) }; }
  save() { this.store.saveDoc('blackjack', this.doc); }
  table(code) { const t = this.doc.tables[String(code || '').toUpperCase()]; if (!t) throw new GameError('No blackjack table with that code.', 404); return t; }
  mutate(t, actorId, fn) { const r = fn(); this.settleMoney(t); this.save(); this.changed(t, actorId); return r; }
  /** v48: after a saved change, tell listeners (Slack turn DMs). Never throws into the game. */
  changed(t, actorId = null) { try { this.onChange?.(t, actorId); } catch { /* alerts must never break play */ } }
  tick() {
    const now = this.now(); let dirty = false;
    for (const t of Object.values(this.doc.tables)) {
      if (t.status !== 'playing') continue;
      const seq = t.seq; try { if (C.isContinuous(t)) C.advanceAll(t, now, this.rng); else G.advance(t, now, this.rng); } catch { /* keep ticking */ }
      if (t.seq !== seq) { this.settleMoney(t); dirty = true; (this._tickChanged ||= []).push(t); }
    }
    if (dirty) this.save();
    for (const t of this._tickChanged || []) this.changed(t, null); this._tickChanged = null;
  }
  /** When a game ends, every chip goes back to its owner's bankroll, once. */
  settleMoney(t) {
    if (t.status !== 'over' || t.paidOut) return;
    t.paidOut = true;
    for (const s of t.seats) if (s && !s.left && !s.bot) this.cashOut(t, s);
    if (t.house.mode === 'player' && t.house.id && t.house.staked) {
      const p = this.getPlayer(t.house.id);
      if (p && t.house.bank > 0) this.accounts.change(p, t.house.bank, 'blackjack', `Blackjack: house bank back (${t.code})`);
      this.recordEarnings(t.house.id, t.house.bank - t.house.startBank);
      t.house.staked = false;
    }
  }
  cashOut(t, s) {
    if (s.left) return;
    const p = this.getPlayer(s.id); s.left = true;
    if (p && s.chips > 0) this.accounts.change(p, s.chips, 'blackjack', `Blackjack cash-out (${t.code})`);
    this.recordEarnings(s.id, s.chips - s.startChips);
    s.cashedOut = s.chips; s.chips = 0;
  }

  /** Attach seat avatars (same Bust pipeline as poker). Bots get a stable gen seed.
   *  BJ view nulls bot ids (privacy); hang the avatar on the seat and also key avatars by seat index. */
  viewOf(t, viewerId) {
    const v = C.isContinuous(t) ? this.continuousView(t, viewerId) : viewFor(t, viewerId, this.now());
    if (!C.isContinuous(t) && v.round && v.mySeat >= 0) v.round.sneak = G.sneakable(t, v.mySeat);
    const avatars = {};
    v.seats = v.seats.map((seat, i) => {
      if (!seat) return null;
      const raw = t.seats[i];
      let avatar;
      if (raw.bot) avatar = { kind: 'gen', seed: `bjbot:${raw.name}`, bot: true };
      else {
        const p = this.getPlayer(raw.id);
        avatar = this.avatars && p ? this.avatars.info(p) : { kind: 'gen', seed: raw.id };
        avatars[raw.id] = avatar;
      }
      avatars[`seat:${i}`] = avatar;
      return { ...seat, avatar };
    });
    v.avatars = avatars;
    attachSeatBugs(v.seats, this.barn, (s) => s.id);
    // A player dealer stands behind the felt where Guntrad would: their avatar (photo or generated) and hatched bug.
    if (v.house && t.house.mode === 'player' && t.house.id) {
      const hp = this.getPlayer(t.house.id);
      v.house.avatar = this.avatars && hp ? this.avatars.info(hp) : { kind: 'gen', seed: t.house.id };
      const bug = tableBugOf(this.barn, t.house.id);
      if (bug) v.house.bug = bug;
    }
    return v;
  }
  /** Continuous play: you see your own game (deck, round, last hand) and a card-free line for everyone else's. */
  continuousView(t, viewerId) {
    const i = t.seats.findIndex((s) => s && !s.left && s.id === viewerId);
    const lane = i >= 0 ? t.lanes?.[i] : null;
    const mine = lane ? { ...t, round: lane.round, deck: lane.deck, last: lane.last, shuffles: lane.shuffles } : { ...t, round: null, last: null };
    const v = viewFor(mine, viewerId, this.now());
    v.continuous = true;
    v.lanes = C.laneSummary(t);
    v.log = t.log.filter((e) => e.lane == null || e.lane === i).slice(-60);
    v.limits.maxNow = i >= 0 && t.lanes?.[i] ? C.laneMaxBet(t, i) : v.limits.maxNow;
    v.house.free = t.house.mode === 'guntrad' ? null : C.freeBank(t);
    if (lane) { v.laneOver = lane.status === 'over' ? lane.overReason : null; if (v.round) v.round.sneak = G.sneakable(C.laneView(t, i), i); }
    return v;
  }
  info() {
    return { defaults: GUNTRAD_RULES, choices: RULE_CHOICES, limits: LIMITS, royal: ROYAL, royalEv: royalInfo(cleanSettings({}).royal), ruleText: RULE_TEXT(GUNTRAD_RULES),
      floors: { main: MAIN_FLOOR, royal: ROYAL_FLOOR, ack: ACK, mix: MIX }, edgeBase: { base: EDGE_TABLE.base, se: EDGE_TABLE.baseSe } };
  }
  /** v46: live house edge for the setup screen, plus which choices Guntrad refuses (and the royal payout caps). */
  preview(settings) {
    const s = cleanSettings(settings); const g = s.house === 'guntrad';
    const caps = {}; for (const [bet, def] of Object.entries(ROYAL)) caps[bet] = Object.fromEntries(def.tiers.map((t) => [t.k, g ? royalMaxPay(bet, t.k, s.royal[bet]) : t.max]));
    return { settings: s, royal: royalInfo(s.royal), ruleText: RULE_TEXT(s.rules), edge: edgeReport(s), options: ruleOptions(s.rules, g), caps, problems: g ? guntradProblems(s) : [] };
  }
  list(p) {
    return Object.values(this.doc.tables).filter((t) => t.status !== 'closed' && (t.hostId === p.id || t.house.id === p.id || t.seats.some((s) => s && !s.left && s.id === p.id)))
      .map((t) => ({ edge: edgeSummary(t), code: t.code, name: t.name, status: t.status, house: t.house.name, players: t.seats.filter((s) => s && !s.left).length, maxSeats: t.maxSeats,
        myTurn: C.isContinuous(t) ? Object.entries(t.lanes || {}).some(([i, l]) => t.seats[i]?.id === p.id && !t.seats[i].left && l.status === 'playing' && ['play', 'insurance'].includes(l.round?.phase))
          : !!(t.round?.phase === 'play' && t.seats[t.round.hands[t.round.turn]?.seat]?.id === p.id) }));
  }
  create(p, { name, settings }) {
    this.accounts.ensure(p);
    let code; do { code = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (this.doc.tables[code]);
    const t = newTable({ code, name, host: { id: p.id, name: p.name }, settings });
    t.createdAt = this.now();
    this.doc.tables[code] = t;
    if (t.house.id !== p.id) this.seat(t, p);
    G.log(t, this.now(), `${p.name} opened the table. House: ${t.house.mode === 'guntrad' ? 'Guntrad (unlimited bank)' : t.house.name || 'to be picked'}.`, { k: 'open' });
    this.save();
    return this.viewOf(t, p.id);
  }
  seat(t, p) {
    if (t.seats.some((s) => s && !s.left && s.id === p.id)) return;
    const i = t.seats.findIndex((s) => !s || s.left);
    if (i < 0) throw new GameError('The table is full.', 409);
    this.accounts.requireFunds(p, t.settings.buyIn, 'the blackjack buy-in');
    this.accounts.change(p, -t.settings.buyIn, 'blackjack', `Blackjack buy-in (${t.code})`);
    t.seats[i] = { id: p.id, name: p.name, chips: t.settings.buyIn, startChips: t.settings.buyIn, stats: stats0() };
    G.log(t, this.now(), `${p.name} sits down with $${t.settings.buyIn}.`, { k: 'sit', seat: i });
    if (C.isContinuous(t) && t.status === 'playing') C.openLane(t, i, this.now(), this.rng);
  }
  join(p, code, ack) {
    const t = this.table(code);
    const ed = tableEdge(t);
    if (ed.needsAck && ack !== true) { const e = new GameError(`High house edge: ${ed.ackReasons.join('; ')}. Tap "I understand" to sit down.`, 409); e.code = 'edge-ack'; throw e; }
    if (t.status === 'over' || t.status === 'closed') throw new GameError('That game is over.', 409);
    if (t.house.id === p.id) throw new GameError("You're the house at this table.", 409);
    return this.mutate(t, p.id, () => { this.seat(t, p); if (!C.isContinuous(t)) G.advance(t, this.now(), this.rng); return this.viewOf(t, p.id); });
  }
  setHouse(p, code, playerId) {
    const t = this.table(code);
    if (t.hostId !== p.id) throw new GameError('Only the host picks the house.', 403);
    if (t.status !== 'lobby' || t.house.mode !== 'player') throw new GameError('The house is set.', 409);
    const s = t.seats.find((x) => x && !x.left && x.id === playerId);
    if (!s && playerId !== p.id) throw new GameError('Pick someone sitting at the table.', 400);
    return this.mutate(t, p.id, () => {
      if (t.house.id && t.house.id !== playerId) { const back = this.getPlayer(t.house.id); if (back) this.seat(t, back); }
      if (s) { this.cashOut(t, s); const i = t.seats.indexOf(s); t.seats[i] = null; }
      const hp = this.getPlayer(playerId); t.house.id = playerId; t.house.name = hp?.name || 'House';
      G.log(t, this.now(), `${t.house.name} will be the house.`, { k: 'house' });
      return this.viewOf(t, p.id);
    });
  }
  start(p, code) {
    const t = this.table(code);
    if (t.hostId !== p.id) throw new GameError('Only the host can start.', 403);
    if (t.status !== 'lobby') throw new GameError('Already started.', 409);
    if (t.house.mode === 'player' && !t.house.id) throw new GameError('Pick the house first.', 409);
    if (!t.seats.some((s) => s && !s.left)) throw new GameError('Nobody is sitting down yet.', 409);
    return this.mutate(t, p.id, () => {
      if (t.house.mode === 'player') {
        const hp = this.getPlayer(t.house.id);
        this.accounts.requireFunds(hp, t.settings.houseBank, 'the house bank');
        this.accounts.change(hp, -t.settings.houseBank, 'blackjack', `Blackjack: house bank (${t.code})`);
        t.house.bank = t.house.startBank = t.settings.houseBank; t.house.staked = true;
      }
      for (let b = 0; b < t.settings.bots; b++) {
        const i = t.seats.findIndex((s) => !s || s.left); if (i < 0) break;
        t.seats[i] = { id: `bot-${b}`, name: ['Dusty', 'Slim', 'Ma Barker'][b], bot: true, chips: t.settings.buyIn, startChips: t.settings.buyIn, stats: stats0() };
      }
      t.status = 'playing'; t.startedAt = this.now();
      if (C.isContinuous(t)) { t.lanes = {}; t.seats.forEach((s, i) => { if (s && !s.left && !s.bot) C.openLane(t, i, this.now(), this.rng); }); }
      else G.startRound(t, this.now(), this.rng);
      return this.viewOf(t, p.id);
    });
  }
  mySeat(t, p) { const i = t.seats.findIndex((s) => s && !s.left && s.id === p.id); if (i < 0) throw new GameError('Take a seat first.', 409); return i; }
  play(p, code, fn) {
    const t = this.table(code);
    if (t.status !== 'playing') throw new GameError('The game is not running.', 409);
    if (C.isContinuous(t)) return this.mutate(t, p.id, () => { const i = this.mySeat(t, p); C.laneOp(t, i, this.now(), this.rng, (lane) => fn(lane, i, true)); return this.viewOf(t, p.id); });
    return this.mutate(t, p.id, () => { G.advance(t, this.now(), this.rng); fn(t, this.mySeat(t, p)); return this.viewOf(t, p.id); });
  }
  bet(p, code, body) {
    const t = this.table(code); const b = { bet: body?.bet, royal: body?.royal || {} };
    if (C.isContinuous(t) && t.status === 'playing') return this.mutate(t, p.id, () => { C.placeBet(t, this.mySeat(t, p), b, this.now(), this.rng); return this.viewOf(t, p.id); });
    return this.play(p, code, (t, i) => G.placeBet(t, i, b, this.now(), this.rng));
  }
  sitOut(p, code) {
    if (C.isContinuous(this.table(code))) throw new GameError("Nobody's waiting on you here: just bet when you're ready.", 409);
    return this.play(p, code, (t, i) => G.sitOut(t, i, this.now(), this.rng));
  }
  insure(p, code, yes) { return this.play(p, code, (t, i) => G.insure(t, i, !!yes, this.now(), this.rng)); }
  act(p, code, action) { return this.play(p, code, (t, i) => G.act(t, i, String(action || ''), this.now(), this.rng)); }
  /** Easter egg: a late royal bet against a player dealer (see G.sneakBet). */
  sneak(p, code, body) { return this.play(p, code, (t, i) => G.sneakBet(t, i, body?.royal || {}, this.now())); }
  view(p, code) { const t = this.table(code); return this.viewOf(t, p.id); }
  leave(p, code) {
    const t = this.table(code);
    return this.mutate(t, p.id, () => {
      if (t.house.id === p.id) { if (t.status === 'playing') this.endTable(t, `${t.house.name} closed the bank.`); else if (t.status === 'lobby') { t.house.id = null; t.house.name = null; } return this.viewOf(t, p.id); }
      const i = this.mySeat(t, p); const r = t.round;
      if (C.isContinuous(t)) C.closeLane(t, i, this.now());
      if (t.status === 'playing' && r && r.phase !== 'betting' && r.hands.some((h) => h.seat === i)) throw new GameError('Finish this round first.', 409);
      if (r?.bets[i] && !r.bets[i].out) { t.seats[i].chips += r.bets[i].bet + (r.bets[i].side.match || 0) + (r.bets[i].side.pairs || 0); delete r.bets[i]; }
      const s = t.seats[i]; this.cashOut(t, s);
      G.log(t, this.now(), `${s.name} cashes out $${s.cashedOut}.`, { k: 'leave', seat: i });
      if (t.status === 'playing' && !t.seats.some((x) => x && !x.left && !x.bot)) this.endTable(t, 'Everyone left.');
      else if (C.isContinuous(t)) C.check(t, this.now());
      else G.advance(t, this.now(), this.rng);
      return this.viewOf(t, p.id);
    });
  }
  close(p, code) {
    const t = this.table(code);
    if (t.hostId !== p.id) throw new GameError('Only the host can close the table.', 403);
    return this.mutate(t, p.id, () => { if (t.status !== 'over') this.endTable(t, 'The host closed the table.'); this.settleMoney(t); t.status = 'closed'; return this.viewOf(t, p.id); });
  }
  endTable(t, why) { if (C.isContinuous(t) && t.status === 'playing') C.endTable(t, this.now(), why); else G.endGame(t, this.now(), why); }
  seatedOpen(pid) { return Object.values(this.doc.tables).some((t) => (t.status === 'playing' || t.status === 'lobby') && (t.house.id === pid || t.seats.some((s) => s && !s.left && s.id === pid))); }
}
