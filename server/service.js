// Glue between HTTP, the pure engine, storage, the turn-timer scheduler and live updates (SSE).
import crypto from 'node:crypto';
import * as G from './engine/game.js';
import { Store } from './store.js';
import { Accounts } from './accounts.js';
import * as F from './engine/fight.js';
import { BotDriver } from './bots/driver.js';
import { lookOf } from './shop.js';
import { checkUsername, normUsername } from './passwords.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
const MAX_TIMER = 2 ** 31 - 1;
const hashToken = (tok) => crypto.createHash('sha256').update(tok).digest('hex');

export class PokerService {
  constructor({ dataDir, now = () => Date.now(), botDelayScale = 1 }) {
    this.store = new Store(dataDir);
    this.now = now;
    this.accounts = new Accounts({ store: this.store, now: this.now });
    this.listeners = new Map(); // code -> Set(fn)
    this.timer = null;
    this.byTokenHash = new Map(Object.values(this.store.players).filter((p) => p.tokenHash).map((p) => [p.tokenHash, p]));
    this.bots = new BotDriver(this, { delayScale: botDelayScale });
    this.reschedule();
    // Recovery after restart: anything already overdue is handled right away, and bots pick up where they were.
    setImmediate(() => { this.runDue(); for (const t of this.store.allTables()) if (t.bots && t.status !== 'closed') this.bots.kick(t.code); });
  }

  // ----- players -----
  createPlayer(name, extra = {}) {
    const clean = cleanName(name);
    const token = crypto.randomBytes(24).toString('base64url');
    const p = { id: crypto.randomUUID(), name: clean, tokenHash: hashToken(token), createdAt: this.now(), kind: 'guest', ...(extra.hidden ? { hidden: true } : {}) };
    this.store.players[p.id] = p;
    this.byTokenHash.set(p.tokenHash, p);
    this.accounts.ensure(p);
    this.store.savePlayers();
    return { id: p.id, name: p.name, token };
  }
  /** Sign-in accounts (Google or dev login) are found by their provider id. */
  playerForIdentity({ sub, email, name, picture, kind = 'google' }) {
    let p = Object.values(this.store.players).find((x) => x.google?.sub === sub);
    if (!p) {
      const base = String(name || email?.split('@')[0] || 'Player');
      p = { id: crypto.randomUUID(), name: safeName(base), createdAt: this.now(), kind };
      this.store.players[p.id] = p;
    }
    p.google = { sub, email: email || null, picture: picture || null };
    if (!p.login) p.kind = kind;
    this.accounts.ensure(p);
    this.store.savePlayers();
    return p;
  }
  /** Username/password accounts. `identifier` is a username or an email address. */
  findLogin(identifier) {
    const n = String(identifier || '').trim().toLowerCase();
    if (!n) return null;
    return Object.values(this.store.players).find((x) => x.login && (x.login.username === n || (x.login.email && x.login.email === n))) || null;
  }
  loginTaken({ username, email }, exceptId = null) {
    const all = Object.values(this.store.players).filter((x) => x.id !== exceptId);
    if (username && all.some((x) => x.login?.username === username)) return 'That username is taken.';
    if (email && all.some((x) => x.login?.email === email)) return 'That email already has an account. Sign in instead.';
    return null;
  }
  createPasswordPlayer({ username, email, hash, name }) {
    const p = { id: crypto.randomUUID(), name: safeName(String(name || username)), createdAt: this.now(), kind: 'password',
      login: { username, email: email || null, hash, changedAt: this.now() } };
    this.store.players[p.id] = p;
    this.accounts.ensure(p);
    this.store.savePlayers();
    return p;
  }
  setPasswordHash(p, hash) { p.login.hash = hash; p.login.changedAt = this.now(); this.store.savePlayers(); }
  /** Link a Google account to a signed-in password player. Returns an error string or null. */
  linkGoogle(p, { sub, email, picture }) {
    const other = Object.values(this.store.players).find((x) => x.google?.sub === sub);
    if (other && other.id !== p.id) return 'taken';
    p.google = { sub, email: email || null, picture: picture || null };
    this.store.savePlayers();
    return null;
  }
  getPlayer(id) { return this.store.players[id] || null; }
  forgetPlayer(id) {
    const p = this.store.players[id];
    if (!p) return;
    if (p.tokenHash) this.byTokenHash.delete(p.tokenHash);
    delete this.store.players[id];
    this.store.savePlayers();
  }
  playerFromToken(token) { return token ? this.byTokenHash.get(hashToken(String(token))) || null : null; }
  renamePlayer(player, name) {
    player.name = cleanName(name);
    this.store.savePlayers();
    // Every table that knows this player: their seat, and their standings row if they have left.
    for (const t of this.store.allTables()) {
      const seated = t.seats.some((x) => x && x.playerId === player.id && x.name !== player.name);
      const listed = t.ledger?.[player.id] && t.ledger[player.id].name !== player.name;
      if (!seated && !listed) continue;
      this.mutate(t.code, (tb) => {
        for (const s of tb.seats) if (s && s.playerId === player.id) s.name = player.name;
        if (tb.ledger[player.id]) tb.ledger[player.id].name = player.name;
      });
    }
    return { id: player.id, name: player.name };
  }
  /**
   * Change the login handle (@username). Sessions stay on player id. The display name is separate (renamePlayer),
   * but a player who never chose one is still shown under their handle, so in that case the name follows the handle.
   */
  changeUsername(player, raw) {
    const username = normUsername(raw);
    const err = checkUsername(username);
    if (err) throw new G.GameError(err, 400);
    if (player.login?.username === username) return { username };
    const taken = this.loginTaken({ username }, player.id);
    if (taken) throw new G.GameError(taken, 409);
    const followed = !!player.login?.username && String(player.name).trim().toLowerCase() === player.login.username;
    if (!player.login) {
      player.login = { username, email: player.google?.email || null, hash: null, changedAt: this.now() };
    } else {
      player.login.username = username;
      player.login.changedAt = this.now();
    }
    this.store.savePlayers();
    if (followed) this.renamePlayer(player, String(raw).trim());
    return { username };
  }

  // ----- tables -----
  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.store.getTable(c)) return c;
    }
  }
  createTable(player, { name, settings, bots, visibility = 'private' }) {
    if (!['private', 'public'].includes(visibility)) throw new G.GameError('Choose Public or Private for table visibility.');
    if (bots && visibility === 'public') throw new G.GameError('Bot practice tables cannot be public.');
    const code = this.newCode();
    if (bots) return this.createBotTable(player, { code, name, settings, bots });
    const t = G.createTable({ id: crypto.randomUUID(), code, name, host: { id: player.id, name: player.name }, settings }, this.ctx());
    t.visibility = visibility;
    // Tables made after the economy launched are paid for from bankrolls (1 chip = $1).
    // Older tables have no `econ` and keep working exactly as before.
    t.econ = { debited: {}, credited: {} };
    // The host is seated straight away, so their buy-in has to be covered now (never let a bankroll go negative).
    const hostIn = t.ledger[player.id]?.buyIn || 0;
    if (hostIn > 0) { this.accounts.ensure(player); this.accounts.requireFunds(player, hostIn, 'the buy-in'); }
    this.settleEconomy(t);
    this.store.saveTable(t);
    return t;
  }
  /**
   * v38 bot table: you plus 1-5 always-strong bots, on practice chips (never your bankroll, so bots can't mint or
   * drain play money), unlimited rebuys, dealt straight away. Friends may join only if the host opened it to them.
   */
  createBotTable(player, { code, name, settings, bots }) {
    const count = Math.max(1, Math.min(5, Math.floor(Number(bots?.count) || 3)));
    const s = { ...(settings || {}), maxRebuys: -1 };
    s.maxPlayers = Math.max(count + (bots?.friends ? 2 : 1), Math.min(9, Number(s.maxPlayers) || 0));
    const ctx = this.ctx();
    const t = G.createTable({ id: crypto.randomUUID(), code, name: name || 'Bot practice', host: { id: player.id, name: player.name }, settings: s }, ctx);
    t.visibility = 'private';
    t.bots = { count, friends: !!bots?.friends };
    this.bots.seat(t, count, ctx);
    G.startGame(t, player.id, ctx);
    this.store.saveTable(t);
    this.bots.kick(t.code);
    return t;
  }
  getTable(code) {
    const t = this.store.getTable(String(code || '').toUpperCase());
    if (!t) throw new G.GameError('No table with that code', 404);
    return t;
  }
  view(code, player) {
    const t = this.getTable(code);
    const avatars = {};
    for (const s of t.seats) if (s?.playerId) avatars[s.playerId] = s.bot ? botAvatar(t, s.playerId) : this.avatars ? this.avatars.info(this.store.players[s.playerId]) : null;
    for (const e of t.log) for (const s of e.frame?.seats || []) if (s?.playerId && !(s.playerId in avatars)) {
      avatars[s.playerId] = s.bot ? botAvatar(t, s.playerId) : this.avatars && this.store.players[s.playerId] ? this.avatars.info(this.store.players[s.playerId]) : null;
    }
    for (const l of t.lastHand?.allInLosers || []) if (!(l.playerId in avatars) && this.store.players[l.playerId]) avatars[l.playerId] = this.avatars ? this.avatars.info(this.store.players[l.playerId]) : null;
    const v = { ...G.viewFor(t, player?.id ?? null, this.now()), visibility: t.visibility === 'public' ? 'public' : 'private', econ: !!t.econ, avatars };
    if (t.bots) { v.bots = { count: t.bots.count, friends: t.bots.friends }; for (const st of v.seats) if (st && t.seats[st.seat]?.bot) st.bot = true; }
    if (v.fightOffer) v.fightOffer.stake = G.fightStake(this.ctx().bankrollOf(player.id));
    if (v.fight && this.avatars && !(v.fight.playerId in avatars) && this.store.players[v.fight.playerId]) avatars[v.fight.playerId] = this.avatars.info(this.store.players[v.fight.playerId]);
    return v;
  }
  tablesFor(player) {
    return this.store.allTables()
      .filter((t) => t.ledger[player.id])
      .map((t) => {
        const seat = t.seats.findIndex((s) => s && s.playerId === player.id);
        return {
          code: t.code, name: t.name, status: t.status, visibility: t.visibility === 'public' ? 'public' : 'private', players: t.seats.filter(Boolean).length, maxPlayers: t.settings.maxPlayers,
          seated: seat >= 0, myTurn: !!t.hand && t.hand.toAct === seat && seat >= 0, deadline: t.hand && t.hand.toAct === seat ? t.hand.deadline : null,
          turn: G.turnSummary(t, player.id),
          handNumber: t.handNumber, isHost: t.hostId === player.id, createdAt: t.createdAt, bots: !!t.bots,
          ready: t.seats.filter((_, i) => G.eligibleForHand(t, i)).length, // players who could be dealt in (2+ to start)
          afkMoved: seat < 0 && t.status !== 'closed' ? t.afkMoved?.[player.id] || null : null, // moved out after missed turns
        };
      })
      .sort((a, b) => (b.myTurn - a.myTurn) || (a.status === 'closed') - (b.status === 'closed') || b.createdAt - a.createdAt);
  }

  publicTables(player) {
    return this.store.allTables()
      .filter((t) => t.visibility === 'public' && !t.bots && t.status !== 'closed'
        && (t.status !== 'lobby' || this.getPlayer(t.hostId))
        && t.seats.some((s) => !s) && !t.seats.some((s) => s?.playerId === player.id))
      .map((t) => ({
        code: t.code, name: t.name, hostName: this.getPlayer(t.hostId)?.name || t.ledger[t.hostId]?.name || 'Host',
        players: t.seats.filter(Boolean).length, maxPlayers: t.settings.maxPlayers,
        buyIn: t.settings.buyIn, smallBlind: t.settings.smallBlind, bigBlind: t.settings.bigBlind,
        turnSeconds: t.settings.turnSeconds, status: t.status, createdAt: t.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  ctx() {
    return { now: this.now(), bankrollOf: (id) => { const p = this.store.players[id]; if (!p) return 0; this.accounts.ensure(p); return p.bankroll; } };
  }

  /** Apply a change to a table atomically: clone, change, save, notify, reschedule timers. */
  mutate(code, fn, actorId = null) {
    const current = this.getTable(code);
    const draft = structuredClone(current);
    const result = fn(draft, this.ctx());
    draft.version = (current.version || 0) + 1;
    this.settleEconomy(draft);
    this.store.saveTable(draft);
    this.recordHands(current, draft);
    this.notify(draft.code);
    this.reschedule();
    this.bots?.kick(draft.code);
    if (this.onTableChanged) { try { this.onTableChanged(draft, actorId); } catch (e) { console.error('onTableChanged:', e.message); } }
    return result;
  }

  /** Move buy-ins out of, and cash-outs back into, bankrolls by diffing the table ledger. */
  settleEconomy(t) {
    if (!t.econ) return;
    let changed = false;
    for (const [pid, l] of Object.entries(t.ledger)) {
      const p = this.store.players[pid];
      if (!p) continue;
      const owe = l.buyIn - (t.econ.debited[pid] || 0);
      if (owe > 0) { this.accounts.change(p, -owe, 'buyin', `Buy-in at ${t.name}`, { force: true, save: false }); t.econ.debited[pid] = l.buyIn; changed = true; }
      const back = l.cashOut - (t.econ.credited[pid] || 0);
      if (back > 0) { this.accounts.change(p, back, 'cashout', `Cashed out of ${t.name}`, { save: false }); t.econ.credited[pid] = l.cashOut; changed = true; }
    }
    // Guntrad fights: refunds come from the house (a faucet, like the mines); a loss after its hand ended goes to the house (a sink)
    const book = t.fightBook;
    if (book) {
      t.econ.fightPaid ||= {}; t.econ.fightTaken ||= {};
      for (const [pid, amt] of Object.entries(book.refund || {})) {
        const p = this.store.players[pid]; const due = amt - (t.econ.fightPaid[pid] || 0);
        if (p && due > 0) { this.accounts.change(p, due, 'guntrad', `Beat Guntrad at ${t.name}: big blind covered`, { save: false }); t.econ.fightPaid[pid] = amt; changed = true; }
      }
      for (const [pid, amt] of Object.entries(book.take || {})) {
        const p = this.store.players[pid]; const due = amt - (t.econ.fightTaken[pid] || 0);
        if (p && due > 0) { this.accounts.change(p, -due, 'guntrad', `Lost to Guntrad at ${t.name}`, { force: true, save: false }); t.econ.fightTaken[pid] = amt; changed = true; }
      }
    }
    if (changed) this.store.savePlayers();
  }
  /** Lifetime hand stats: counted once, when a hand's result first appears. */
  recordHands(before, after) {
    if (after.bots) return; // v38: practice hands against bots don't count toward lifetime stats
    const lh = after.lastHand;
    if (!lh || before.lastHand?.number === lh.number) return;
    const ids = new Set();
    const hp = before.hand && before.hand.number === lh.number ? before.hand.players : null;
    if (hp) hp.forEach((x) => x && ids.add(x.playerId));
    for (const w of lh.winners || []) ids.add(w.playerId);
    const pot = (lh.pots || []).reduce((a, x) => a + (x.amount || 0), 0) || (lh.winners || []).reduce((a, w) => a + w.amount, 0);
    for (const id of ids) {
      const p = this.store.players[id];
      if (!p) continue;
      const won = (lh.winners || []).filter((w) => w.playerId === id).reduce((a, w) => a + w.amount, 0);
      this.accounts.recordHand(p, { won: won > 0, amount: won, pot });
    }
    if (ids.size) this.store.savePlayers();
  }
  requireBuyIn(code, player, what) {
    const t = this.getTable(code);
    if (t.econ) this.accounts.requireFunds(player, t.settings.buyIn, what);
  }
  /** Chips a player has on tables that are backed by real bankroll money (counts toward net worth). */
  chipsInPlay(playerId, exceptCode = null) {
    let total = 0;
    for (const t of this.store.allTables()) {
      if (!t.econ || t.code === exceptCode) continue;
      const i = t.seats.findIndex((s) => s && s.playerId === playerId);
      if (i < 0) continue;
      total += t.seats[i].stack;
      const hp = t.hand?.players?.[i];
      if (hp && hp.playerId === playerId) total += hp.total || 0;
    }
    return total;
  }

  join(code, player, seat) {
    const t = this.getTable(code);
    if (t.bots && !t.bots.friends && player.id !== t.hostId) throw new G.GameError("This is a bot practice table; the host didn't open it to friends.", 403);
    if (!t.ledger[player.id] || !t.seats.some((s) => s && s.playerId === player.id)) this.requireBuyIn(code, player, 'the buy-in');
    return this.mutate(code, (tb, ctx) => G.joinTable(tb, { id: player.id, name: player.name }, seat, ctx), player.id);
  }
  start(code, player) { return this.mutate(code, (t, ctx) => G.startGame(t, player.id, ctx), player.id); }
  updateSettings(code, player, input) { return this.mutate(code, (t, ctx) => G.updateSettings(t, player.id, input, ctx), player.id); }
  act(code, player, action) { return this.mutate(code, (t, ctx) => G.act(t, player.id, action, ctx), player.id); }
  rebuy(code, player) { this.requireBuyIn(code, player, 'a rebuy'); return this.mutate(code, (t, ctx) => G.rebuy(t, player.id, ctx), player.id); }
  autoCheck(code, player, on) { return this.mutate(code, (t, ctx) => G.setAutoCheck(t, player.id, on, ctx), player.id); }
  sitOut(code, player, sitOut) { return this.mutate(code, (t, ctx) => G.setSittingOut(t, player.id, sitOut, ctx), player.id); }
  leave(code, player) { return this.mutate(code, (t, ctx) => G.leaveTable(t, player.id, ctx), player.id); }
  showdownSeen(code, player, number) { return this.mutate(code, (t) => G.markShowdownSeen(t, player.id, number), player.id); }
  show(code, player, which) { return this.mutate(code, (t, ctx) => G.showCards(t, player.id, which, ctx), player.id); }
  /** Speech bubble: seated players only, 10 edits a minute each (in memory; resets on restart, which is fine). */
  say(code, player, text) {
    const t = this.getTable(code);
    if (!t.seats.some((x) => x && x.playerId === player.id)) throw new G.GameError('Take a seat to talk at this table', 403);
    if (F.isPracticePhrase(text)) return this.view(code, player); // the secret practice-fight phrase is never posted
    G.cleanSay(text); // reject too-long text before it costs a rate-limit slot
    const now = this.now();
    this.sayLog ||= new Map();
    const recent = (this.sayLog.get(player.id) || []).filter((x) => now - x < 60000);
    if (recent.length >= SAY_PER_MIN) throw new G.GameError('Easy, partner. Too many bubbles: try again in a minute.', 429);
    recent.push(now); this.sayLog.set(player.id, recent);
    return this.mutate(code, (tb, ctx) => G.setSay(tb, player.id, text, ctx), player.id);
  }
  // ----- Fight Guntrad -----
  fightStart(code, player) {
    return this.mutate(code, (t, ctx) => G.startFight(t, player.id, { id: crypto.randomUUID(), seed: crypto.randomInt(1, 2 ** 31) }, ctx), player.id);
  }
  fightDecline(code, player) { return this.mutate(code, (t, ctx) => G.declineFight(t, player.id, ctx), player.id); }
  fightForfeit(code, player, id) { const r = this.mutate(code, (t, ctx) => G.forfeitFight(t, player.id, id, ctx), player.id); this.liveDone(r); return r; }
  fightSubmit(code, player, { id, log, frames }) {
    const live = this.fightLive?.get(id);
    // the final replay has to continue exactly what was streamed live while playing
    if (live && live.log.length && Array.isArray(log)) {
      const n = live.log.length;
      if (log.length < n || live.log.some((e, i) => !Array.isArray(log[i]) || log[i][0] !== e[0] || log[i][1] !== e[1])) throw new G.GameError('Fight replay rejected (does not match the live fight)');
    }
    const r = this.mutate(code, (t, ctx) => G.finishFight(t, player.id, { id, log, frames }, ctx), player.id);
    this.liveDone(r);
    return r;
  }
  /** v29: cosmetic finisher after a verified win; money and result are already settled and don't change. */
  fightFinishHim(code, player, id) { return this.mutate(code, (t, ctx) => G.finishHim(t, player.id, id, ctx), player.id); }
  /** Live relay for watchers: the fighter streams their input log; watchers replay it with the same seed. In memory only. */
  fightStream(code, player, { id, from, log, frame }) {
    const t = this.getTable(code); const f = t.fight;
    if (!f || f.id !== id) throw new G.GameError('No such fight', 404);
    if (f.playerId !== player.id) throw new G.GameError('That is not your fight', 403);
    if (f.status !== 'running') throw new G.GameError('That fight is already over', 409);
    this.fightLive ||= new Map();
    let live = this.fightLive.get(id);
    if (!live) { for (const [k, v] of this.fightLive) if (this.now() - v.at > 10 * 60000) this.fightLive.delete(k); live = { code: t.code, log: [], frame: 0, at: this.now(), posts: [] }; this.fightLive.set(id, live); }
    const now = this.now();
    live.posts = live.posts.filter((x) => now - x < 1000);
    if (live.posts.length >= 12) throw new G.GameError('Slow down', 429);
    live.posts.push(now);
    if (from !== live.log.length) return { next: live.log.length, frame: live.frame }; // out of step: client resends from here
    if (!Array.isArray(log) || log.length > 600 || !Number.isInteger(frame) || frame < live.frame) throw new G.GameError('Bad stream chunk');
    const maxFrames = Math.floor(((now - f.startedAt) * F.FPS) / 1000) + G.FIGHT_CLOCK_SLACK_FRAMES;
    if (frame > maxFrames || frame > F.MAX_FRAMES) throw new G.GameError('Stream runs ahead of the clock');
    let last = live.log.length ? live.log[live.log.length - 1][0] : -1;
    for (const e of log) {
      if (!Array.isArray(e) || e.length !== 2 || !Number.isInteger(e[0]) || e[0] <= last || e[0] > frame || !Number.isInteger(e[1]) || e[1] < 0 || e[1] > 255) throw new G.GameError('Bad stream chunk');
      last = e[0];
    }
    live.log.push(...log); live.frame = frame; live.at = now;
    if (live.log.length > F.LOG_MAX) throw new G.GameError('Fight replay too long');
    return { next: live.log.length, frame };
  }
  /** What a watcher needs: the fight (seed, who), the input log from `since`, and how far the fighter has got. */
  fightWatch(code, since = 0) {
    const t = this.getTable(code); const f = t.fight;
    if (!f) return { fight: null };
    const live = this.fightLive?.get(f.id);
    const from = Math.max(0, Math.min(Number(since) || 0, live?.log.length || 0));
    return { fight: { id: f.id, seed: f.seed, name: f.name, playerId: f.playerId, status: f.status, reason: f.reason || null, fatality: f.fatality ?? null, gag: f.gag ?? null, finale: !!f.finale, finaleOpen: G.finaleOpen(f, this.now()) }, from, log: live ? live.log.slice(from, from + 2000) : [], next: live ? Math.min(live.log.length, from + 2000) : 0, frame: live?.frame || 0, done: f.status !== 'running', finalFrames: f.frames ?? null };
  }
  liveDone() { /* the relay keeps the log so late watchers can still see the ending; old entries expire on the next stream */ }
  close(code, player) { return this.mutate(code, (t, ctx) => G.closeTable(t, player.id, ctx), player.id); }

  // ----- timers: one timer for the earliest deadline across all tables (survives restarts because deadlines are stored) -----
  reschedule() {
    if (this.closed) return;
    clearTimeout(this.timer);
    let next = Infinity;
    for (const t of this.store.allTables()) {
      const w = G.nextWakeAt(t);
      if (w !== null && w < next) next = w;
    }
    if (next === Infinity) { this.timer = null; return; }
    const delay = Math.min(Math.max(0, next - this.now()), MAX_TIMER);
    this.timer = setTimeout(() => this.runDue(), delay);
    this.timer.unref?.();
  }
  runDue() {
    if (this.closed) return;
    for (const t of this.store.allTables()) {
      const w = G.nextWakeAt(t);
      if (w === null || w > this.now()) continue;
      try {
        this.mutate(t.code, (draft, ctx) => { let guard = 0; while (G.tick(draft, ctx) && guard++ < 50) { /* catch up */ } });
      } catch (e) { console.error(`Timer error on table ${t.code}:`, e); }
    }
    this.reschedule();
  }

  // ----- live updates -----
  subscribe(code, fn) {
    const set = this.listeners.get(code) || new Set();
    set.add(fn); this.listeners.set(code, set);
    return () => set.delete(fn);
  }
  /** Push a one-off event (a prank) to everyone watching a table, without changing the table. */
  push(code, extra) {
    const t = this.store.getTable(code);
    for (const fn of this.listeners.get(code) || []) { try { fn(t.version, extra); } catch { /* ignore */ } }
  }
  notify(code) {
    const t = this.store.getTable(code);
    for (const fn of this.listeners.get(code) || []) { try { fn(t.version); } catch { /* ignore */ } }
  }
  shutdown() { this.closed = true; clearTimeout(this.timer); this.bots?.shutdown(); this.market?.shutdown(); }
}

const SAY_PER_MIN = 10;
function botAvatar(t, id) {
  const c = t.bots?.cast?.[id]; const wear = {};
  for (const [slot, item] of Object.entries(c?.wear || {})) { const l = lookOf(item); if (l) wear[slot] = l; }
  return { kind: 'gen', seed: `tiki:${c?.name || id}`, bot: true, ...(Object.keys(wear).length ? { wear } : {}) };
}
function safeName(n) { return String(n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Player'; }
function cleanName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!n) throw new G.GameError('Please enter a name');
  return n;
}
