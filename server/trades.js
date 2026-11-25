// The Trading Post: bugs change hands between players. A trade names bugs on either side and, optionally, cash from
// the one proposing it; a plain cash offer is a trade with no bugs on the proposer's side. The recipient accepts or
// declines, the proposer can cancel, and an offer nobody answers expires after TRADE_OPEN_MS.
//
// Money safety. Cash offered is taken from the proposer's bankroll the moment the offer is made and held on their
// player record (`barnTrades.held[tradeId]`), in the same players.json write as the ledger debit, so it is counted
// in their net worth (Barn.escrow) and can't be spent twice. It leaves escrow exactly once, in one players.json write:
// to the recipient when the trade is accepted, back to the proposer otherwise. Bugs move in one barn.json write, with
// the trade's status flipped in that same write. If the server dies between the two writes, `settle()` finishes the
// job on the next look: a held amount whose trade was accepted is paid to the recipient, any other held amount whose
// trade is no longer open (or has vanished) goes back to its owner. The presence of the held entry is the marker, so
// a retry can never pay twice. Everything here is synchronous: one request runs to the end before the next starts,
// so a double tap or two players racing to accept see the first one's result.
//
// Ownership is checked when the offer is made and again at accept: bugs in a fight, posted on the bout board, down the
// mine with their owner, taken by the Heeshee, sick, collected by the specialist, fainted, dead, eggs and STEEZE can't
// go. A legendary can be traded: it moves, so there is still only the one.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { levelFor, formOf } from './engine/creatures.js';
import { isSteeze, STEEZE_STUCK } from './engine/steeze.js';
import { cents } from './accounts.js';
import { idOf, isHeesheeHeld } from './barn.js';
import { MAX_SHIFT_MS } from './mines.js';

export const TRADE_OPEN_MS = 48 * 3600e3;   // an unanswered offer expires after two days
export const TRADE_KEEP_MS = 14 * 24 * 3600e3; // closed trades stay in the history this long
export const TRADE_HISTORY = 200;          // and at most this many closed ones are kept in all
export const MAX_SIDE = 6;                  // bugs on one side of one trade
export const MAX_OPEN = 8;                  // open offers one player can have out at once
export const MAX_TRADE_CASH = 1_000_000;
const OPEN = 'open', ACCEPTED = 'accepted';
const DONE_WORD = { accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired', void: 'Called off' };

const asIds = (list) => {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new GameError('Pick bugs from the list.', 400);
  const ids = list.map(Number);
  if (ids.some((n) => !Number.isFinite(n))) throw new GameError('Pick bugs from the list.', 400);
  if (new Set(ids).size !== ids.length) throw new GameError('The same bug is in there twice.', 400);
  return ids;
};
const asCash = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new GameError('Offer a real amount of money.', 400);
  if (Math.abs(cents(n) - n) > 1e-9) throw new GameError('Money comes in whole cents.', 400);
  if (n > MAX_TRADE_CASH) throw new GameError(`The most one trade can carry is $${MAX_TRADE_CASH.toLocaleString('en-US')}.`, 400);
  return cents(n);
};
const formsOf = (pen) => (pen.stage === 'egg' ? [] : Array.from({ length: (pen.evo || 0) + 1 }, (_, evo) => formOf(pen.species, evo)));
const heldOf = (p) => p?.barnTrades?.held || {};

export class Trades {
  constructor({ barn, store, accounts, now }) {
    this.barn = barn; this.store = store; this.accounts = accounts; this.now = now;
    barn.doc.trades ||= [];
    barn.trades = this; // the Barn button's count and the net-worth escrow read from here
    try { this.settle(); } catch (error) { console.error('Trade settle at boot failed:', error.message); }
  }
  get doc() { return this.barn.doc; }
  list() { return this.doc.trades || []; }
  find(id) { return this.list().find((t) => t.id === id) || null; }
  player(id) { const p = this.store.players?.[id]; return p ? this.accounts.ensure(p) : null; }
  /** Cash this player has tied up in their own open offers. */
  escrow(p) { return cents(Object.values(heldOf(p)).reduce((sum, n) => sum + (Number(n) || 0), 0)); }

  /** Why this bug can't be traded right now, or null when it can. */
  why(ownerId, pen) {
    const barn = this.barn, now = this.now();
    if (!pen) return 'That bug is not in the barn any more.';
    if (pen.stage === 'egg') return 'Eggs stay put until they hatch.';
    if (pen.stage === 'dead' || now >= barn.deathAt(pen)) return 'It is resting. For good.';
    if (isSteeze(pen.species)) return STEEZE_STUCK;
    if (isHeesheeHeld(pen)) return 'The Heeshee Mazode has it.';
    if (pen.sick) return `${pen.name} is sick. The Bug Center first.`;
    if (pen.taken) return `${pen.name} is with the specialist.`;
    if (pen.faintedAt) return `${pen.name} fainted. The Bug Center first.`;
    if (barn.fights.fightOf(ownerId)) return 'Not while a bug from that barn is in a fight.';
    const open = this.store.players?.[ownerId]?.barnBouts?.open;
    if (open && open.petBornAt === pen.bornAt) return `${pen.name} is posted on the bout board.`;
    const shift = barn.mines?.doc?.active?.[ownerId];
    if (pen === barn.doc.pens[ownerId] && shift && !shift.settlement && now - shift.startedAt < MAX_SHIFT_MS) return `${pen.name} is down the mine right now.`;
    return null;
  }
  /** One bug as both sides see it in a trade: what it is, never its needs or care history. */
  card(ownerId, pen) {
    const level = levelFor(pen.xp, pen.cap);
    return { id: idOf(pen), species: pen.species, name: pen.name, level, evo: pen.evo || 0, style: this.barn.looksOf(ownerId, pen) || null };
  }
  /** Look up and check every bug one side puts in. */
  pick(ownerId, ids, whose) {
    return ids.map((id) => {
      const pen = this.barn.penOf(ownerId, id);
      if (!pen) throw new GameError(`${whose === 'yours' ? 'One of your bugs' : 'One of their bugs'} has left the barn. Look again.`, 409);
      const why = this.why(ownerId, pen);
      if (why) throw new GameError(why, 409);
      return pen;
    });
  }
  /**
   * Room for what comes in. ONE place decides: the 6-stall / GFR Farms change (separate PR) will point this and
   * `place` below at its barn.placeNewBug helper, after which overflow goes to the farm instead of refusing.
   */
  roomFor(playerId, incoming, outgoing) {
    if (typeof this.barn.placeNewBug === 'function') return true; // GFR Farms takes the overflow
    return this.barn.bugs(playerId).length - outgoing + incoming <= this.barn.stalls(playerId);
  }
  /**
   * Put one received bug into `changes` (a barn.json change set built for the accept write): the partner's place if
   * it is empty, otherwise a stall, on the slow stall clock from now. The single trade-receipt path.
   * ponytail: when GFR Farms lands, route through barn.placeNewBug(playerId, bug) here (it must write into the same
   * change set, or the accept is no longer one write).
   */
  place(changes, playerId, pen) {
    const now = this.now();
    if (!changes.pens[playerId]) changes.pens[playerId] = pen;
    else changes.bench[playerId] = [...(changes.bench[playerId] || []), { ...pen, benchedAt: now }];
  }

  /** Expire old offers, then make sure every held amount is where its trade says. Safe to call any time. */
  settle() {
    const now = this.now();
    const stale = this.list().filter((t) => t.status === OPEN && now >= t.expiresAt);
    if (stale.length) this.close(stale.map((t) => t.id), 'expired');
    this.reconcile();
  }
  /** Money still held for trades that are no longer open: paid on, or returned. One players.json write. */
  reconcile() {
    const drafts = new Map(), draft = (id) => { if (!drafts.has(id)) { const p = this.player(id); drafts.set(id, p ? { ...p, barnTrades: { ...p.barnTrades, held: { ...heldOf(p) } } } : null); } return drafts.get(id); };
    for (const p of Object.values(this.store.players || {})) {
      for (const [id, amount] of Object.entries(heldOf(p))) {
        const t = this.find(id);
        if (t && t.status === OPEN) continue;
        const from = draft(p.id); delete from.barnTrades.held[id];
        const to = t?.status === ACCEPTED && t.from === p.id ? draft(t.to) : null;
        const toName = this.store.players?.[t?.to]?.name || 'someone', fromName = p.name || 'someone';
        if (to) this.accounts.change(to, amount, 'barn-trade', `Bug trade: paid by ${fromName}`, { save: false });
        else if (amount > 0) this.accounts.change(from, amount, 'barn-trade', `Bug trade: offer to ${toName} returned`, { save: false });
      }
    }
    const list = [...drafts.values()].filter(Boolean);
    if (list.length) this.store.commitPlayerDrafts(list);
  }
  /** Close open trades (declined, cancelled, expired, void) in one barn write, then hand back their held cash. */
  close(ids, status, extra = {}) {
    const now = this.now(), set = new Set(ids);
    const trades = this.list().map((t) => (set.has(t.id) && t.status === OPEN ? { ...t, status, closedAt: now, ...extra } : t));
    this.barn.commitDoc({ trades: this.prune(trades) });
    this.reconcile();
  }
  /** Open trades, plus closed ones from the last TRADE_KEEP_MS (newest TRADE_HISTORY). One whose cash is still held is never dropped. */
  prune(trades) {
    const now = this.now(), held = (t) => Object.hasOwn(heldOf(this.store.players?.[t.from]), t.id);
    const keep = trades.filter((t) => t.status === OPEN || held(t) || now - (t.closedAt || t.at) < TRADE_KEEP_MS);
    const closed = keep.filter((t) => t.status !== OPEN && !held(t)), drop = new Set(closed.slice(0, Math.max(0, closed.length - TRADE_HISTORY)).map((t) => t.id));
    return keep.filter((t) => !drop.has(t.id));
  }

  /** Offer a trade. `give`: your bug ids; `want`: theirs; `money`: cash from you on top. */
  propose(playerId, body = {}) {
    this.settle();
    const to = String(body.to || ''), me = this.player(playerId), them = this.player(to);
    if (!me) throw new GameError('Sign in first.', 401);
    if (!them || them.hidden || to === playerId) throw new GameError('Pick another player to trade with.', 400);
    const give = asIds(body.give), want = asIds(body.want), money = asCash(body.money);
    if (!give.length && !want.length) throw new GameError('A trade needs at least one bug in it.', 400);
    if (!want.length && money > 0) throw new GameError('Ask for one of their bugs to go with the money.', 400);
    if (give.length > MAX_SIDE || want.length > MAX_SIDE) throw new GameError(`At most ${MAX_SIDE} bugs on each side.`, 400);
    if (this.list().filter((t) => t.status === OPEN && t.from === playerId).length >= MAX_OPEN) throw new GameError(`You have ${MAX_OPEN} offers out already. Cancel one first.`, 409);
    const mine = this.pick(playerId, give, 'yours'), theirs = this.pick(to, want, 'theirs');
    if (!this.roomFor(to, mine.length, theirs.length)) throw new GameError(`${them.name} has no free stall for that many bugs.`, 409);
    if (!this.roomFor(playerId, theirs.length, mine.length)) throw new GameError('You have no free stall for that many bugs. Build one, or put one of yours in.', 409);
    if (money > 0) this.accounts.requireFunds(me, money, 'that offer');
    const now = this.now(), id = crypto.randomUUID();
    const trade = { id, from: playerId, to, at: now, expiresAt: now + TRADE_OPEN_MS, status: OPEN, money,
      give: mine.map((pen) => this.card(playerId, pen)), want: theirs.map((pen) => this.card(to, pen)) };
    // Money first, in one write with its escrow entry. If the barn write after it fails, settle() sees a held amount
    // with no trade and returns it.
    if (money > 0) {
      const d = { ...me, barnTrades: { ...me.barnTrades, held: { ...heldOf(me), [id]: money } } };
      this.accounts.change(d, -money, 'barn-trade', `Bug trade: offer to ${them.name} held`, { save: false });
      this.store.commitPlayerDrafts([d]);
    }
    try { this.barn.commitDoc({ trades: this.prune([...this.list(), trade]) }); } catch (error) { try { this.reconcile(); } catch { /* the next settle returns it */ } throw error; }
    return this.view(playerId);
  }

  cancel(playerId, id) {
    this.settle();
    const t = this.find(id);
    if (!t || t.from !== playerId) throw new GameError('That offer is not yours to cancel.', 404);
    if (t.status !== OPEN) return this.view(playerId); // already closed: a second tap
    this.close([id], 'cancelled');
    return this.view(playerId);
  }
  decline(playerId, id) {
    this.settle();
    const t = this.find(id);
    if (!t || t.to !== playerId) throw new GameError('That offer is not for you.', 404);
    if (t.status !== OPEN) return this.view(playerId);
    this.close([id], 'declined');
    return this.view(playerId);
  }

  /** The recipient says yes: every bug and every cent moves, or nothing does. */
  accept(playerId, id) {
    this.settle();
    const t = this.find(id);
    if (!t || t.to !== playerId) throw new GameError('That offer is not for you.', 404);
    if (t.status === ACCEPTED) return this.view(playerId); // a double tap: the first one did it
    if (t.status !== OPEN) throw new GameError(`That offer was ${t.status}.`, 409);
    const from = this.player(t.from), to = this.player(playerId);
    if (!from) { this.close([id], 'void', { reason: 'Their account is gone.' }); throw new GameError('That player has left the Academy.', 409); }
    const giveIds = t.give.map((b) => b.id), wantIds = t.want.map((b) => b.id);
    let mine, theirs;
    try { theirs = this.pick(t.from, giveIds, 'theirs'); mine = this.pick(playerId, wantIds, 'yours'); } catch (error) {
      if (error instanceof GameError && /left the barn/.test(error.message)) this.close([id], 'void', { reason: 'A bug in it changed hands.' });
      throw error;
    }
    if (t.money > 0 && cents(heldOf(from)[id] || 0) !== cents(t.money)) { // never pay out money that isn't held
      this.close([id], 'void', { reason: 'The money was not held.' });
      throw new GameError('That offer fell through. Nothing moved.', 409);
    }
    if (!this.roomFor(playerId, theirs.length, mine.length)) throw new GameError('No free stall for that. Build one, or let a bug go first.', 409);
    if (!this.roomFor(t.from, mine.length, theirs.length)) throw new GameError(`${from.name} has no free stall for that right now.`, 409);

    // One barn.json write: both sides' bugs out, both sides' bugs in, names, Bugdex, stale challenges, the trade's status.
    const now = this.now(), barn = this.barn, doc = barn.doc;
    const changes = { pens: { ...doc.pens }, bench: { ...doc.bench }, names: { ...doc.names } };
    const out = { [t.from]: new Set(theirs.map(idOf)), [playerId]: new Set(mine.map(idOf)) };
    const partnerMoved = {};
    for (const [owner, ids] of Object.entries(out)) {
      if (changes.pens[owner] && ids.has(idOf(changes.pens[owner]))) { delete changes.pens[owner]; partnerMoved[owner] = true; }
      changes.bench[owner] = (changes.bench[owner] || []).filter((pen) => !ids.has(idOf(pen)));
    }
    const arrive = (pens, toId, fromId) => {
      const used = new Set([...(changes.pens[toId] ? [changes.pens[toId]] : []), ...(changes.bench[toId] || [])].flatMap((pen) => [idOf(pen), pen.bornAt]));
      for (const pen of pens) {
        let next = barn.unstall(pen); // its slow stall clock settled into its times
        next = structuredClone(next);
        delete next.lastBout; // fight receipts belong to the old owner's ledger
        while (used.has(idOf(next)) || used.has(next.bornAt)) { next.bornAt += 1; if (next.eggAt) next.eggAt += 1; } // ids are per owner
        used.add(idOf(next)); used.add(next.bornAt);
        next.tradedAt = now; next.tradedFrom = this.store.players[fromId]?.name || 'someone';
        if (next.name) changes.names[next.name.toLowerCase()] = toId;
        barn.saw(toId, formsOf(next)); // the Bugdex: the receiver has met it
        this.place(changes, toId, next);
      }
    };
    arrive(theirs, playerId, t.from);
    arrive(mine, t.from, playerId);
    for (const owner of Object.keys(out)) { // the partner's place is never left empty while a stall has someone
      if (!changes.pens[owner] && changes.bench[owner]?.length) {
        const next = changes.bench[owner].find((pen) => pen.stage === 'creature') || changes.bench[owner][0];
        changes.pens[owner] = barn.unstall(next); changes.bench[owner] = changes.bench[owner].filter((pen) => pen !== next);
      }
    }
    const gone = (owner, bug) => out[owner] && (bug == null ? partnerMoved[owner] : out[owner].has(Number(bug)));
    changes.challenges = (doc.challenges || []).filter((c) => !gone(c.from, c.fromBug) && !gone(c.to, c.toBug));
    // other open offers that named a bug that just moved can't happen now: called off in this same write
    const moved = (owner, cards) => cards.some((b) => out[owner]?.has(b.id));
    const trades = this.list().map((x) => {
      if (x.id === id) return { ...x, status: ACCEPTED, closedAt: now };
      if (x.status === OPEN && (moved(x.from, x.give) || moved(x.to, x.want))) { return { ...x, status: 'void', closedAt: now, reason: 'A bug in it changed hands.' }; }
      return x;
    });
    changes.trades = this.prune(trades);
    barn.commitDoc(changes);
    // One players.json write: the held cash to the recipient (and any voided offers' cash back). If this write fails,
    // the next settle() does it: the held entries are still there.
    this.reconcile();
    return { ...this.view(playerId), accepted: { id, got: theirs.map((pen) => pen.name), gave: mine.map((pen) => pen.name), money: t.money } };
  }

  /** Account deleted: every open offer to or from them is called off, and their held cash is settled first. */
  forget(playerId) {
    const ids = this.list().filter((t) => t.status === OPEN && (t.from === playerId || t.to === playerId)).map((t) => t.id);
    if (ids.length) this.close(ids, 'void', { reason: 'An account was deleted.' });
  }

  /** The Barn button: offers waiting on you, plus your offers that were answered and you have not looked at. */
  count(playerId) {
    const now = this.now();
    return this.list().filter((t) => (t.status === OPEN && t.to === playerId && now < t.expiresAt) || (t.from === playerId && t.status !== OPEN && !t.seen)).length;
  }

  /** The trading post as this player sees it. `seen` marks their answered offers as read. */
  view(playerId, { seen = false } = {}) {
    this.settle();
    const players = this.store.players || {}, now = this.now(), name = (id) => players[id]?.name || 'A former member';
    if (seen && this.list().some((t) => t.from === playerId && t.status !== OPEN && !t.seen)) {
      this.barn.commitDoc({ trades: this.list().map((t) => (t.from === playerId && t.status !== OPEN && !t.seen ? { ...t, seen: true } : t)) });
    }
    const show = (t) => ({ id: t.id, from: t.from, to: t.to, fromName: name(t.from), toName: name(t.to), at: t.at, expiresAt: t.expiresAt, money: t.money, give: t.give, want: t.want,
      status: t.status, word: DONE_WORD[t.status] || null, closedAt: t.closedAt || null, ...(t.reason ? { reason: t.reason } : {}), ...(t.status !== OPEN && t.from === playerId && !t.seen ? { fresh: true } : {}),
      ...(t.status === OPEN ? { expiresIn: Math.max(0, t.expiresAt - now) } : {}) });
    const mineAll = this.list().filter((t) => t.from === playerId || t.to === playerId);
    const yours = (ownerId) => this.barn.bugs(ownerId).filter((pen) => pen.stage === 'creature').map((pen) => ({ ...this.card(ownerId, pen), ...(this.why(ownerId, pen) ? { why: this.why(ownerId, pen) } : {}) }));
    const others = Object.values(players).filter((p) => p.id !== playerId && !p.hidden && this.barn.bugs(p.id).some((pen) => pen.stage === 'creature'))
      .map((p) => ({ id: p.id, name: p.name, bugs: yours(p.id), room: this.barn.stalls(p.id) - this.barn.bugs(p.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const me = players[playerId];
    return { serverNow: now, bankroll: me?.bankroll ?? null, held: this.escrow(me), maxSide: MAX_SIDE, maxOpen: MAX_OPEN, openMs: TRADE_OPEN_MS,
      mine: yours(playerId), room: this.barn.stalls(playerId) - this.barn.bugs(playerId).length, players: others,
      incoming: mineAll.filter((t) => t.status === OPEN && t.to === playerId).map(show),
      outgoing: mineAll.filter((t) => t.status === OPEN && t.from === playerId).map(show),
      history: mineAll.filter((t) => t.status !== OPEN).sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)).slice(0, 20).map(show) };
  }
}
