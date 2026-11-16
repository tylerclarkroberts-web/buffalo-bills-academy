// Async Scum service: tables in scum.json, invite links (/scum/CODE), a clock that passes for you, bots, seat
// avatars and who-is-here dots. Play for pride: no bankroll ever moves here (betting stays off everywhere).
import crypto from 'node:crypto';
import { GameError } from '../engine/game.js';
import { attachSeatBugs } from '../tableBug.js';
import * as S from './rules.js';

export const cryptoRng = (n) => crypto.randomInt(n);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LIMITS = { turnSecs: [30, 120, 600, 3600, 86400], maxSeats: [3, 4, 5, 6, 7], bots: [0, 1, 2, 3, 4, 5, 6] };
const BOT_NAMES = ['Dusty', 'Slim', 'Ma Barker', 'Two-Toes', 'Deacon', 'Lil Ruth'];
const HERE_MS = 6000;
const PLACE = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const pick = (v, opts, def) => (opts.includes(Number(v)) ? Number(v) : def);
export function cleanSettings(s = {}) {
  const maxSeats = pick(s.maxSeats, LIMITS.maxSeats, 6);
  return { turnSec: pick(s.turnSec, LIMITS.turnSecs, 86400), maxSeats, bots: Math.min(maxSeats - 1, pick(s.bots, LIMITS.bots, 2)) };
}
const stats0 = () => ({ rounds: 0, king: 0, scum: 0, skips: 0, skipped: 0 });
const err = (e) => (e instanceof GameError ? e : new GameError(e.message, 409));

export class Scum {
  constructor({ store, getPlayer, now, rng = cryptoRng, tickMs = 1000, botMs = 1400, avatars = null, barn = null }) {
    Object.assign(this, { store, getPlayer, now, rng, botMs, avatars, barn });
    this.doc = store.loadDoc('scum', { tables: {} }); this.doc.tables ||= {};
    this.seen = new Map(); // `${code}:${playerId}` -> last time their table page was in front (memory only)
    if (tickMs) { this.timer = setInterval(() => this.tick(), tickMs); this.timer.unref?.(); }
  }
  stop() { clearInterval(this.timer); }
  save() { this.store.saveDoc('scum', this.doc); }
  table(code) { const t = this.doc.tables[String(code || '').toUpperCase()]; if (!t || t.status === 'closed') throw new GameError('No scum table with that code.', 404); return t; }
  changed(t, actorId = null) { try { this.onChange?.(t, actorId); } catch { /* alerts never break play */ } }
  mutate(t, actorId, fn) {
    let r; try { r = fn(); } catch (e) { throw err(e); }
    this.advance(t); this.save(); this.changed(t, actorId);
    return r?.closed ? r : this.viewOf(t, actorId);
  }
  tick() {
    const changed = [];
    for (const t of Object.values(this.doc.tables)) {
      if (t.status !== 'playing') continue;
      const seq = t.seq; try { this.advance(t); } catch { /* keep ticking */ }
      if (t.seq !== seq) changed.push(t);
    }
    if (changed.length) { this.save(); for (const t of changed) this.changed(t, null); }
  }
  log(t, text, e = null, vis = null) {
    t.seq = (t.seq || 0) + 1;
    t.log.push({ seq: t.seq, t: this.now(), round: t.round?.no || t.roundNo || 0, text, ...(e ? { ev: e } : {}), ...(vis ? { vis } : {}) });
    if (t.log.length > 300) t.log.splice(0, t.log.length - 300);
  }
  nm(t, s) { return t.seats[s]?.name || `Seat ${s + 1}`; }

  // ---------------------------------------------------------------- lobby
  list(p) {
    return Object.values(this.doc.tables).filter((t) => t.status !== 'closed' && (t.hostId === p.id || t.seats.some((s) => s && !s.left && s.id === p.id)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((t) => { const me = t.seats.findIndex((s) => s && !s.left && s.id === p.id); return { code: t.code, name: t.name, status: t.status, players: t.seats.filter((s) => s && !s.left).length, maxSeats: t.maxSeats, round: t.round?.no || 0, myTurn: me >= 0 && this.waitingOn(t).includes(me), title: me >= 0 ? t.titles?.[me] || null : null }; });
  }
  create(p, { name, settings } = {}) {
    let code; do { code = Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (this.doc.tables[code]);
    const st = cleanSettings(settings);
    const t = { code, name: String(name || `${p.name}'s scum table`).replace(/\s+/g, ' ').trim().slice(0, 40) || 'Scum', hostId: p.id, hostName: p.name, createdAt: this.now(),
      status: 'lobby', settings: st, turnSec: st.turnSec, maxSeats: st.maxSeats, seats: Array(st.maxSeats).fill(null), titles: null, roundNo: 0, round: null, lastRound: null, log: [], seq: 0 };
    this.doc.tables[code] = t;
    this.seat(t, p);
    this.log(t, `${p.name} opened the table.`, { k: 'open' });
    this.save();
    return this.viewOf(t, p.id);
  }
  seat(t, p) {
    if (t.seats.some((s) => s && !s.left && s.id === p.id)) return;
    let i = t.seats.findIndex((s) => !s); if (i < 0) i = t.seats.findIndex((s, k) => s.left && !(t.round?.order || []).includes(k));
    if (i < 0) throw new GameError('The table is full.', 409);
    t.seats[i] = { id: p.id, name: p.name, joinedAt: this.now(), stats: stats0(), ...(t.status === 'playing' ? { waiting: true } : {}) };
    this.log(t, t.status === 'playing' ? `${p.name} pulls up a chair and gets dealt in next round.` : `${p.name} sits down.`, { k: 'sit', seat: i });
  }
  join(p, code) {
    const t = this.table(code);
    if (t.status === 'over') throw new GameError('That game is over.', 409);
    return this.mutate(t, p.id, () => this.seat(t, p));
  }
  start(p, code) {
    const t = this.table(code);
    if (t.hostId !== p.id) throw new GameError('Only the host can deal.', 403);
    if (t.status !== 'lobby') throw new GameError('Already dealt.', 409);
    return this.mutate(t, p.id, () => {
      const added = [];
      for (let b = 0; b < t.settings.bots; b++) { const i = t.seats.findIndex((s) => !s); if (i < 0) break; t.seats[i] = { id: `scumbot-${b}`, name: BOT_NAMES[b], bot: true, stats: stats0() }; added.push(i); }
      const order = this.present(t);
      if (order.length < S.MIN_PLAYERS) { for (const i of added) t.seats[i] = null; throw new GameError(`Scum needs ${S.MIN_PLAYERS} players. Add a bot or wait for friends.`, 409); }
      t.status = 'playing'; t.startedAt = this.now();
      this.deal(t, order, null);
    });
  }
  present(t) { return t.seats.map((s, i) => (s && !s.left ? i : -1)).filter((i) => i >= 0); }
  deal(t, order, titles) {
    t.roundNo = (t.roundNo || 0) + 1;
    for (const i of order) if (t.seats[i].waiting) delete t.seats[i].waiting;
    const r = S.newRound({ no: t.roundNo, order, titles, rng: this.rng, dealOrder: titles ? order.slice().reverse() : null });
    t.round = r;
    this.log(t, `Round ${r.no}: 52 cards dealt to ${order.length}.`, { k: 'deal', no: r.no, order: r.order, counts: Object.fromEntries(r.order.map((s) => [s, r.hands[s].length])) });
    if (r.phase === 'exchange') {
      for (const pr of r.exchange.pairs) { pr.at = this.now(); pr.due = this.now() + t.turnSec * 1000; }
      this.log(t, `${r.exchange.pairs.map((x) => `${this.nm(t, x.from)} owes ${this.nm(t, x.to)} ${x.n === 2 ? 'their 2 best cards' : 'their best card'}`).join('; ')}.`, { k: 'owe' });
    } else {
      this.log(t, `${this.nm(t, r.turn)} ${titles ? 'leads' : 'has the 2♣ and leads'}.`, { k: 'lead', seat: r.turn });
      this.clock(t);
    }
  }
  clock(t) { const r = t.round; r.turnAt = this.now(); r.deadline = this.now() + t.turnSec * 1000; }

  // ---------------------------------------------------------------- play
  mySeat(t, p) { const i = t.seats.findIndex((s) => s && !s.left && s.id === p.id); if (i < 0) throw new GameError('Take a seat first.', 409); return i; }
  live(t) { if (t.status !== 'playing' || !t.round) throw new GameError('The game is not running.', 409); return t.round; }
  cardList(cards) { return Array.isArray(cards) ? cards.slice(0, 8).map(String) : []; }
  play(p, code, cards) { const t = this.table(code); this.live(t); return this.mutate(t, p.id, () => this.doPlay(t, this.mySeat(t, p), this.cardList(cards))); }
  pass(p, code) { const t = this.table(code); this.live(t); return this.mutate(t, p.id, () => this.doPass(t, this.mySeat(t, p))); }
  tribute(p, code, beg) { const t = this.table(code); this.live(t); return this.mutate(t, p.id, () => this.doTribute(t, this.mySeat(t, p), beg)); }
  give(p, code, cards) { const t = this.table(code); this.live(t); return this.mutate(t, p.id, () => this.doGive(t, this.mySeat(t, p), this.cardList(cards))); }
  doPlay(t, seat, cards, auto = false) {
    const r = t.round; const over = r.pile?.seat;
    const res = S.play(r, seat, cards);
    const who = this.nm(t, seat);
    const skipTxt = res.skipped != null ? ` Same rank: ${this.nm(t, res.skipped)} is SKIPPED!` : '';
    this.log(t, `${who} ${auto ? '(clock) ' : ''}plays ${S.describe(cards)}.${skipTxt}`, { k: 'play', seat, cards: cards.slice(), left: r.hands[seat].length, ...(res.skipped != null ? { skip: res.skipped, over } : {}) });
    if (res.skipped != null) { t.seats[seat].stats.skips++; t.seats[res.skipped].stats.skipped++; }
    if (res.out) this.log(t, `${who} is out ${PLACE[res.out] || `#${res.out}`}.`, { k: 'out', seat, place: res.out });
    if (res.cleared === 'ace') this.log(t, `Ace! The pile clears.${r.turn != null ? ` ${this.nm(t, r.turn)} leads.` : ''}`, { k: 'clear', why: 'ace', seat: r.turn });
    else if (res.cleared === 'pass') this.log(t, `Nobody can follow that. ${this.nm(t, r.turn)} leads.`, { k: 'clear', why: 'pass', seat: r.turn });
    if (r.phase === 'done') this.finishRound(t); else this.clock(t);
  }
  doPass(t, seat, auto = false) {
    const r = t.round; const res = S.pass(r, seat);
    this.log(t, `${this.nm(t, seat)} ${auto ? 'ran out the clock and passes' : 'passes'}.`, { k: 'pass', seat });
    if (res.cleared) this.log(t, `Everyone passed. ${this.nm(t, r.turn)} leads.`, { k: 'clear', why: 'pass', seat: r.turn });
    this.clock(t);
  }
  doTribute(t, seat, beg) {
    const r = t.round; const p = S.payTribute(r, seat, beg);
    p.at = this.now(); p.due = this.now() + t.turnSec * 1000;
    this.log(t, `${this.nm(t, seat)} hands ${this.nm(t, p.to)} ${p.n === 2 ? 'two cards' : 'a card'}${p.beg ? ' and begs' : ''}.`, { k: 'tribute', from: seat, to: p.to, n: p.n });
    if (p.beg) this.log(t, `${this.nm(t, seat)} begs: “${p.beg}”`, { k: 'beg', from: seat, to: p.to, beg: p.beg }, [seat, p.to]);
  }
  doGive(t, seat, cards) {
    const r = t.round; const done = S.giveBack(r, seat, cards);
    const p = r.exchange.pairs.find((x) => x.to === seat);
    this.log(t, `${this.nm(t, seat)} gives ${this.nm(t, p.from)} ${p.n === 2 ? 'two cards' : 'a card'} back.`, { k: 'give', from: seat, to: p.from, n: p.n });
    if (done) this.startPlay(t);
  }
  startPlay(t) {
    const r = t.round;
    if (r.phase === 'done') return this.finishRound(t);
    this.log(t, `${this.nm(t, r.turn)} leads round ${r.no}.`, { k: 'lead', seat: r.turn });
    this.clock(t);
  }
  finishRound(t) {
    const r = t.round;
    const finish = r.finished.filter((s) => t.seats[s] && !t.seats[s].left);
    const titles = S.titlesFor(finish.length);
    t.titles = Object.fromEntries(finish.map((s, k) => [s, titles[k]]));
    for (const s of finish) { const st = t.seats[s].stats; st.rounds++; if (t.titles[s] === 'king') st.king++; if (t.titles[s] === 'scum') st.scum++; }
    t.lastRound = { no: r.no, finish: finish.map((s) => ({ seat: s, name: this.nm(t, s), title: t.titles[s] })) };
    this.log(t, `Round ${r.no} over. ${t.lastRound.finish.map((x) => `${S.TITLES[x.title]}: ${x.name}`).join(' · ')}.`, { k: 'round', no: r.no, finish: t.lastRound.finish });
    const newcomers = this.present(t).filter((s) => !finish.includes(s));
    const order = S.nextOrder(finish, newcomers);
    if (order.length < S.MIN_PLAYERS || !order.some((s) => !t.seats[s].bot)) return this.endGame(t, order.length < S.MIN_PLAYERS ? 'Not enough players left for another round.' : 'Only bots left.');
    this.deal(t, order, t.titles);
  }
  endGame(t, why) { t.status = 'over'; t.endedAt = this.now(); if (t.round) t.round.turn = null; this.log(t, `Game over. ${why}`, { k: 'over' }); }

  /** The clock and the bots. Loops until nothing is due (a bot may answer a bot). */
  advance(t) {
    for (let n = 0; n < 400 && t.status === 'playing' && t.round; n++) {
      const r = t.round; const now = this.now();
      const bot = (s) => !!t.seats[s]?.bot;
      if (r.phase === 'exchange') {
        const p = r.exchange.pairs.find((x) => (!x.paid && (bot(x.from) ? now >= x.at + this.botMs : now >= x.due)) || (x.paid && !x.given && (bot(x.to) ? now >= x.at + this.botMs : now >= x.due)));
        if (!p) return;
        if (!p.paid) this.doTribute(t, p.from, bot(p.from) ? S.botBeg(this.rng) : '');
        else this.doGive(t, p.to, S.autoGift(r, p.to, p.n));
        continue;
      }
      if (r.phase === 'done') { this.finishRound(t); continue; }
      const s = r.turn; if (s == null) return;
      const isBot = bot(s);
      if (!(isBot ? now >= (r.turnAt || 0) + this.botMs : now >= r.deadline)) return;
      const m = S.autoMove(r, s, { bot: isBot });
      if (m.play) this.doPlay(t, s, m.play, !isBot); else this.doPass(t, s, !isBot);
    }
  }
  /** Seats the table is waiting on right now (humans and bots). */
  waitingOn(t) {
    const r = t.round; if (t.status !== 'playing' || !r) return [];
    if (r.phase === 'exchange') return r.exchange.pairs.flatMap((p) => (!p.paid ? [p.from] : !p.given ? [p.to] : []));
    return r.phase === 'play' && r.turn != null ? [r.turn] : [];
  }

  leave(p, code) {
    const t = this.table(code);
    return this.mutate(t, p.id, () => {
      const i = this.mySeat(t, p); const s = t.seats[i];
      if (t.status === 'lobby') { t.seats[i] = null; this.log(t, `${s.name} gets up.`, { k: 'leave', seat: i }); }
      else {
        s.left = true;
        const r = t.round; const holding = t.status === 'playing' && r?.order.includes(i) && !r.finished.includes(i);
        this.log(t, `${s.name} walks out${holding ? ' and takes their cards with them' : ''}.`, { k: 'leave', seat: i });
        if (t.status === 'playing' && r) {
          const wasTurn = r.turn === i; const wasExchange = r.phase === 'exchange';
          S.walkOut(r, i);
          if (!t.seats.some((x) => x && !x.left && !x.bot)) this.endGame(t, 'Everyone left.');
          else if (r.phase === 'done') this.finishRound(t);
          else if (r.phase === 'play' && wasExchange) this.startPlay(t);
          else if (r.phase === 'play' && wasTurn) this.clock(t);
        }
      }
      if (t.hostId === p.id) { const h = t.seats.find((x) => x && !x.left && !x.bot); if (h) { t.hostId = h.id; t.hostName = h.name; } }
      if (t.status === 'lobby' && !t.seats.some((x) => x)) t.status = 'closed';
      return t.status === 'closed' ? { closed: true } : null;
    });
  }
  close(p, code) {
    const t = this.table(code);
    if (t.hostId !== p.id) throw new GameError('Only the host can close the table.', 403);
    return this.mutate(t, p.id, () => { if (t.status === 'playing') this.endGame(t, 'The host closed the table.'); t.status = 'closed'; return { closed: true }; });
  }
  seatedOpen(pid) { return Object.values(this.doc.tables).some((t) => ['lobby', 'playing'].includes(t.status) && t.seats.some((s) => s && !s.left && s.id === pid)); }

  // ---------------------------------------------------------------- the view (never another player's cards)
  view(p, code, { away = false } = {}) {
    const t = this.table(code);
    if (!away && t.seats.some((s) => s && !s.left && s.id === p.id)) this.seen.set(`${t.code}:${p.id}`, this.now());
    return this.viewOf(t, p.id);
  }
  viewOf(t, viewerId) {
    const now = this.now(); const r = t.round;
    const me = t.seats.findIndex((s) => s && !s.left && s.id === viewerId);
    const here = t.seats.filter((s) => s && !s.left && !s.bot && now - (this.seen.get(`${t.code}:${s.id}`) ?? -Infinity) < HERE_MS).map((s) => s.id);
    const waiting = this.waitingOn(t);
    const seats = t.seats.map((s, i) => {
      if (!s || (s.left && !(r?.order || []).includes(i))) return null;
      const pl = s.bot ? null : this.getPlayer(s.id);
      const avatar = s.bot ? { kind: 'gen', seed: `scumbot:${s.name}`, bot: true } : this.avatars && pl ? this.avatars.info(pl) : { kind: 'gen', seed: s.id };
      return { i, id: s.bot ? null : s.id, name: s.name, me: i === me, bot: !!s.bot, left: !!s.left, waiting: !!s.waiting, count: r?.hands?.[i]?.length ?? 0,
        title: t.titles?.[i] || null, place: r ? r.finished.indexOf(i) + 1 || null : null, here: !s.bot && here.includes(s.id), turn: waiting.includes(i), avatar, stats: s.stats };
    });
    attachSeatBugs(seats, this.barn, (s) => s?.id);
    let round = null;
    if (r) {
      const ex = r.exchange ? { pairs: r.exchange.pairs.map((pr) => {
        const mine = me === pr.from || me === pr.to;
        return { from: pr.from, to: pr.to, n: pr.n, paid: pr.paid, given: pr.given, due: pr.given ? null : pr.due, ...(mine ? { beg: pr.beg, tribute: pr.tribute, gift: pr.gift, owe: me === pr.from && !pr.paid ? S.highest(r.hands[me], pr.n) : null } : {}) };
      }) } : null;
      round = { no: r.no, phase: r.phase, order: r.order, turn: r.turn, pile: r.pile, lastPlay: r.lastPlay, finished: r.finished, deadline: r.phase === 'play' ? r.deadline : null,
        hand: me >= 0 ? S.sortHand(r.hands[me] || []) : null, myTurn: me >= 0 && r.phase === 'play' && r.turn === me, leading: !r.pile, exchange: ex };
    }
    return {
      game: 'scum', code: t.code, name: t.name, status: t.status, isHost: t.hostId === viewerId, hostName: t.hostName, turnSec: t.turnSec, maxSeats: t.maxSeats, bots: t.settings.bots,
      minPlayers: S.MIN_PLAYERS, mySeat: me, seats, round, lastRound: t.lastRound, titles: t.titles, waiting, here, seq: t.seq, now,
      log: t.log.filter((e) => !e.vis || e.vis.includes(me)).slice(-80),
    };
  }
}
