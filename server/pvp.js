// The shared daily mine (v71): miners on shift at the same time see each other, can ambush someone from behind,
// and fight Game Boy-style bug battles when they meet face to face. The server decides everything: positions are
// checked against the maze and a speed limit, "seen" is worked out here from those positions, every roll uses the
// server's random source, and the spoils (acid, play money, tobacco) move only through `raid()` below.
//
// Money here is the Academy's in-app play money (players.json bankroll). It has no cash value and is not connected to
// ConquestK; nothing in this file reads or changes the ConquestK betting switch.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { makeMaze, FIRST_POOL_STEPS } from './engine/maze.js';
import { mineDay } from './engine/daily-maze.js';
import { sees, touching, behind, onTunnel } from './engine/pvp-geometry.js';
import { makeFighter, newBattle, resolveTurn, autoMove, legalMoves, fighterView } from './engine/gb-battle.js';
import { levelFor } from './engine/creatures.js';
import { ITEM } from './catalog/index.js';
import { cents } from './accounts.js';

export const PVP = {
  staleMs: 4000,            // a miner who has not reported in this long is not in the tunnels as far as anyone can tell
  awareMs: 4000,            // "has seen you": within the last four seconds
  graceMs: 15000,           // the first 15 s of a shift, nobody can touch you (or touch anyone)
  safeTiles: 2.5,           // the elevator landing is neutral ground
  maxTilesPerSec: 1.64 * 1.5, // walking speed (3.6 m/s, 2.2 m tiles) with room for network jitter
  slackTiles: 0.6,
  pairCooldownMs: 2 * 3600e3, // the same two miners can only rob each other once every two hours (either way round)
  maxCashLossesPerDay: 3,   // after three cash losses in a mine day you still lose acid (and smokes) but not money
  minShifts: 3,             // greenhorns (fewer finished shifts, or an account under a day old, or a guest) are untouchable
  minAgeMs: 24 * 3600e3,
  cash: { min: 20, max: 100 },
  turnMs: 20000,            // pick a move within 20 s or your bug picks one for you
  disconnectMs: 15000,      // a battler not heard from for 15 s forfeits
  keepOverMs: 60000,        // a finished battle stays readable for a minute
  maxVisible: 12,
};

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const LOANER = { species: 'onymacris', name: 'Gerald', level: 1 }; // the Foreman's lunchbox beetle

export class Pvp {
  constructor({ store, accounts, mines, shop, barn, avatars, now, randInt }) {
    this.store = store; this.accounts = accounts; this.mines = mines; this.shop = shop; this.barn = barn; this.avatars = avatars;
    this.now = now; this.randInt = randInt || ((n) => crypto.randomInt(n));
    this.doc = store.loadDoc('pvp', { raids: {}, pairs: {}, losses: {} });
    this.doc.raids ||= {}; this.doc.pairs ||= {}; this.doc.losses ||= {};
    this.presence = new Map(); // playerId -> { shiftId, key, x, y, yaw, at, startedAt, seen: Map(otherId -> at), notice }
    this.battles = new Map();  // battleId -> battle (memory only: a restart mid-battle ends it with no spoils)
    this.inBattle = new Map(); // playerId -> battleId
    this.mazes = new Map();
    mines.busy = (id) => this.inBattle.has(id);
    this.recover();
  }
  save() { this.store.saveDoc('pvp', this.doc); }

  // ----- who is where -----
  maze(shift) {
    const cells = FIRST_POOL_STEPS[shift.cells] ? shift.cells : 7;
    return this.mazeAt(`${shift.seed}:${cells}`);
  }
  mazeAt(key) {
    let m = this.mazes.get(key);
    if (!m) {
      const [seed, cells] = key.split(':').map(Number);
      m = makeMaze(seed, cells, FIRST_POOL_STEPS[cells]); this.mazes.set(key, m);
      if (this.mazes.size > 8) this.mazes.delete(this.mazes.keys().next().value);
    }
    return { key, grid: m.grid, start: m.start };
  }
  shiftOf(playerId) {
    const s = this.mines.doc.active[playerId];
    return s && s.rulesVersion === 2 && !s.settlement ? s : null;
  }
  /** Greenhorns can't be robbed and can't rob: guests, accounts under a day old, fewer than three finished shifts. */
  greenhorn(p) {
    if (!p || p.kind === 'guest' || !(p.google || p.login)) return true;
    if (!p.createdAt || this.now() - p.createdAt < PVP.minAgeMs) return true;
    return (p.mining?.shifts || 0) < PVP.minShifts;
  }
  /** Why this miner is off limits right now (null when fair game). */
  shield(id) {
    const pr = this.presence.get(id), p = this.store.players[id];
    if (!pr) return 'gone';
    if (this.greenhorn(p)) return 'greenhorn';
    if (this.inBattle.has(id)) return 'battle';
    if (this.now() - pr.startedAt < PVP.graceMs) return 'elevator';
    const { start } = this.mazeAt(pr.key);
    if (Math.hypot(pr.x - start.x, pr.y - start.y) <= PVP.safeTiles) return 'elevator';
    return null;
  }
  cooling(a, b) { return this.now() - (this.doc.pairs[pairKey(a, b)] || -Infinity) < PVP.pairCooldownMs; }
  aware(a, b) { const t = this.presence.get(a)?.seen.get(b); return t != null && this.now() - t <= PVP.awareMs; }
  fresh(id) { const pr = this.presence.get(id); return pr && this.now() - pr.at <= PVP.staleMs && this.shiftOf(id)?.id === pr.shiftId ? pr : null; }
  /** Everyone else in the same tunnels right now. */
  neighbours(id) {
    const me = this.presence.get(id); if (!me) return [];
    const out = [];
    for (const [oid, pr] of this.presence) if (oid !== id && pr.key === me.key && this.fresh(oid)) out.push([oid, pr]);
    return out;
  }
  /** Could `a` ambush `b` this instant? Geometry from the server's own copy of both positions. */
  canAmbush(a, b) {
    const A = this.fresh(a), B = this.fresh(b);
    if (!A || !B || A.key !== B.key || a === b) return false;
    if (this.shield(a) || this.shield(b) || this.cooling(a, b)) return false;
    const { grid } = this.mazeAt(A.key);
    return touching(A, B) && behind(B, A) && !this.aware(b, a) && !sees(grid, B, A);
  }
  canBattle(a, b) {
    const A = this.fresh(a), B = this.fresh(b);
    if (!A || !B || A.key !== B.key || a === b) return false;
    if (this.shield(a) || this.shield(b) || this.cooling(a, b)) return false;
    return touching(A, B) && this.aware(a, b) && this.aware(b, a);
  }

  /**
   * The browser reports where its miner is about four times a second. Returns who else is down here, whether there is
   * someone to ambush, and the battle this miner is in (if any). A position that is inside rock or further than anyone
   * can walk since the last report is refused and the miner is put back (`snap`).
   */
  tick(player, body = {}) {
    if (body.rulesVersion !== 2) { const e = new GameError('The mine has changed. Reload.', 409); e.code = 'mine_reload'; throw e; }
    this.touch(player.id); this.sweep();
    const shiftId = String(body.shiftId || '');
    const shift = this.shiftOf(player.id);
    if (!shift || shift.id !== shiftId) return this.ended(player, shiftId);
    const now = this.now(), { key, grid, start } = this.maze(shift);
    let pr = this.presence.get(player.id);
    if (!pr || pr.shiftId !== shift.id || pr.key !== key) {
      pr = { shiftId: shift.id, key, x: start.x, y: start.y, yaw: 0, at: now, startedAt: shift.startedAt, seen: new Map(), notice: null };
      this.presence.set(player.id, pr);
    }
    const x = Number(body.x), y = Number(body.y), yaw = Number(body.yaw);
    let snap = false;
    if (!this.inBattle.has(player.id) && Number.isFinite(x) && Number.isFinite(y)) {
      const p = { x, y };
      const far = Math.hypot(x - pr.x, y - pr.y) > PVP.maxTilesPerSec * Math.max(0.05, (now - pr.at) / 1000) + PVP.slackTiles;
      // A fresh page (reload, resume) starts the miner back at the elevator: that one jump is allowed, nothing else.
      const restart = body.fresh === true && Math.hypot(x - start.x, y - start.y) <= 1.5;
      if (onTunnel(grid, p) && (!far || restart)) { pr.x = x; pr.y = y; } else snap = true;
    }
    if (Number.isFinite(yaw)) pr.yaw = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    pr.at = now;
    // Seeing goes both ways each report: my view of them now, and theirs of me from their last pose.
    for (const [oid, o] of this.neighbours(player.id)) {
      if (sees(grid, pr, o)) pr.seen.set(oid, now);
      if (sees(grid, o, pr)) o.seen.set(player.id, now);
    }
    if (!this.inBattle.has(player.id)) {
      for (const [oid] of this.neighbours(player.id)) if (this.canBattle(player.id, oid)) { this.startBattle(player.id, oid); break; }
    }
    return this.view(player, { snap });
  }

  view(player, { snap = false } = {}) {
    const pr = this.presence.get(player.id);
    const others = this.neighbours(player.id).slice(0, PVP.maxVisible).map(([oid, o]) => {
      const p = this.store.players[oid];
      return { id: oid, name: p?.name || 'A miner', avatar: this.avatars?.info(p) || null, x: o.x, y: o.y, yaw: o.yaw,
        bug: this.bugOf(oid, false), shield: this.shield(oid), cooling: this.cooling(player.id, oid) };
    });
    const target = others.find((o) => this.canAmbush(player.id, o.id));
    const notice = pr?.notice || null; if (pr) pr.notice = null;
    const bid = this.inBattle.get(player.id) || pr?.lastBattle;
    const battle = bid && this.battles.has(bid) ? this.battleView(this.battles.get(bid), player.id) : null;
    return { serverNow: this.now(), others, ambush: target ? { id: target.id, name: target.name } : null, shield: this.shield(player.id),
      ...(snap ? { snap: { x: pr.x, y: pr.y } } : {}), ...(battle ? { battle } : {}),
      ...(notice ? { notice, shift: this.mines.stateFor(player) } : {}) };
  }

  /** The shift this report is about has ended: say how (an ambush or a lost battle shows its receipt). */
  ended(player, shiftId) {
    const pr = this.presence.get(player.id);
    const bid = pr?.lastBattle || null;
    const battle = bid && this.battles.has(bid) ? this.battleView(this.battles.get(bid), player.id) : null;
    if (pr?.shiftId === shiftId) this.presence.delete(player.id);
    const receipt = this.mines.doc.completed?.[player.id];
    const done = receipt?.shiftId === shiftId ? this.mines.completionView(player, receipt) : { pending: null };
    return { ended: true, ...(battle ? { battle } : {}), ...done };
  }

  // ----- the ambush -----
  ambush(player, body = {}) {
    this.sweep();
    const target = String(body.target || ''), shift = this.shiftOf(player.id);
    if (!shift || shift.id !== String(body.shiftId || '')) throw new GameError('That shift is not yours or already ended.', 409);
    if (target === player.id) throw new GameError('You cannot ambush yourself. You tried. It was sad.', 400);
    if (!this.canAmbush(player.id, target)) throw new GameError('Too late. They are not where you need them to be.', 409);
    const rec = this.raid('ambush', player.id, target);
    const state = this.mines.stateFor(player);
    return { raid: this.publicRaid(rec), ...(state || {}) };
  }

  // ----- bug battles -----
  bugOf(id, full = true) {
    const pen = this.barn?.doc?.pens?.[id];
    const alive = pen?.stage === 'creature' && !(this.barn.deathAt && this.now() >= this.barn.deathAt(pen));
    const p = this.store.players[id];
    if (!alive) return full ? { ...LOANER, loaner: true, ownerName: p?.name } : null;
    return full ? { species: pen.species, name: pen.name, level: levelFor(pen.xp || 0), loaner: false, ownerName: p?.name } : { species: pen.species, name: pen.name };
  }
  startBattle(a, b) {
    const now = this.now(), id = crypto.randomBytes(9).toString('base64url');
    const fa = this.bugOf(a), fb = this.bugOf(b);
    const state = newBattle(
      makeFighter({ owner: a, ownerName: fa.ownerName, name: fa.loaner ? `${fa.name} (on loan)` : fa.name, species: fa.species, level: fa.level, loaner: fa.loaner }),
      makeFighter({ owner: b, ownerName: fb.ownerName, name: fb.loaner ? `${fb.name} (on loan)` : fb.name, species: fb.species, level: fb.level, loaner: fb.loaner }));
    const battle = { id, a, b, startedAt: now, deadline: now + PVP.turnMs, state, choices: {}, lastSeen: { [a]: now, [b]: now }, turns: [], over: null };
    this.battles.set(id, battle); this.inBattle.set(a, id); this.inBattle.set(b, id);
    for (const pid of [a, b]) { this.mines.holds.delete(pid); const pr = this.presence.get(pid); if (pr) pr.lastBattle = id; }
    return battle;
  }
  /** Hearing from a battler at all keeps them in the fight (before the sweep decides who has gone quiet). */
  touch(pid) { const b = this.battles.get(this.inBattle.get(pid)); if (b && !b.over) b.lastSeen[pid] = this.now(); }
  sideOf(battle, pid) { return battle.a === pid ? 'a' : battle.b === pid ? 'b' : null; }
  battleView(battle, pid) {
    const side = this.sideOf(battle, pid), foe = side === 'a' ? 'b' : 'a';
    if (!side) return null;
    battle.lastSeen[pid] = this.now();
    const st = battle.state;
    return { id: battle.id, side, turn: st.turn, msLeft: Math.max(0, battle.deadline - this.now()),
      you: fighterView(st.sides[side], true), foe: fighterView(st.sides[foe], false),
      chosen: battle.choices[side] !== undefined, foeChosen: battle.choices[foe] !== undefined,
      turns: battle.turns.slice(-3), // the last few resolved turns' events, numbered, for the text box
      over: battle.over ? { won: battle.over.winner === side, reason: battle.over.reason, raid: battle.over.raid ? this.publicRaid(this.doc.raids[battle.over.raid], pid) : null } : null };
  }
  move(player, body = {}) {
    this.touch(player.id); this.sweep();
    const id = this.inBattle.get(player.id), battle = id && this.battles.get(id);
    if (!battle || battle.id !== String(body.battleId || '')) throw new GameError('That battle is over.', 409);
    const side = this.sideOf(battle, player.id);
    if (battle.choices[side] !== undefined) throw new GameError('Your bug already has its orders.', 409);
    const legal = legalMoves(battle.state.sides[side]);
    const idx = Number(body.move);
    if (!(legal.length ? legal.includes(idx) : idx === -1)) throw new GameError('Your bug does not know that one (or is out of PP).', 400);
    battle.choices[side] = idx; battle.lastSeen[player.id] = this.now();
    if (battle.choices.a !== undefined && battle.choices.b !== undefined) this.resolve(battle);
    return { battle: this.battleView(battle, player.id) };
  }
  resolve(battle) {
    const { state, events } = resolveTurn(battle.state, battle.choices, this.randInt);
    battle.turns = [...battle.turns, { turn: battle.state.turn, events }].slice(-10);
    battle.state = state; battle.choices = {}; battle.deadline = this.now() + PVP.turnMs;
    if (state.winner) this.finish(battle, state.winner, 'fainted');
  }
  /** Walking away from a battle (clocking out, closing the page for good) is a forfeit. */
  forfeit(playerId, reason = 'forfeit') {
    const id = this.inBattle.get(playerId), battle = id && this.battles.get(id);
    if (!battle || battle.over) return null;
    const side = this.sideOf(battle, playerId);
    this.finish(battle, side === 'a' ? 'b' : 'a', reason);
    return battle;
  }
  finish(battle, winnerSide, reason) {
    const winner = winnerSide === 'a' ? battle.a : battle.b, loser = winnerSide === 'a' ? battle.b : battle.a;
    this.inBattle.delete(battle.a); this.inBattle.delete(battle.b);
    battle.over = { winner: winnerSide, reason, at: this.now(), raid: null };
    if (reason !== 'abandoned') battle.over.raid = this.raid('battle', winner, loser, battle.id).id;
  }
  /** Turn timers and disconnects, checked on every PvP request (and by the app's one-second sweep). */
  sweep() {
    const now = this.now();
    for (const [id, battle] of this.battles) {
      if (battle.over) { if (now - battle.over.at > PVP.keepOverMs) this.battles.delete(id); continue; }
      const goneA = now - battle.lastSeen[battle.a] > PVP.disconnectMs, goneB = now - battle.lastSeen[battle.b] > PVP.disconnectMs;
      if (goneA && goneB) { this.finish(battle, 'a', 'abandoned'); continue; } // nobody left to collect: no spoils
      if (goneA || goneB) { this.finish(battle, goneA ? 'b' : 'a', 'disconnect'); continue; }
      if (now >= battle.deadline) {
        for (const s of ['a', 'b']) if (battle.choices[s] === undefined) battle.choices[s] = autoMove(battle.state.sides[s], this.randInt);
        this.resolve(battle);
      }
    }
    // Forget miners whose shift is over (a battle loser keeps theirs until their page hears how it went).
    for (const [pid, pr] of this.presence) if (this.shiftOf(pid)?.id !== pr.shiftId && !(pr.lastBattle && this.battles.has(pr.lastBattle)) && !this.inBattle.has(pid)) this.presence.delete(pid);
  }

  // ----- the spoils -----
  /**
   * Prepare the whole raid, persist it, then apply it in three idempotent steps: the mines (end the loser's shift,
   * pour their bucket into the winner's), the bankrolls (one atomic players.json write for both), and, after a bug
   * battle, the tobacco (one shop.json write). Each step leaves a marker keyed by the raid id, and `recover()` finishes
   * any raid a crash interrupted, so nothing can be paid twice or half-moved for good.
   */
  raid(kind, winnerId, loserId, battleId = null) {
    const now = this.now(), day = mineDay(now);
    const winner = this.accounts.ensure(this.store.players[winnerId]), loser = this.accounts.ensure(this.store.players[loserId]);
    if (!winner || !loser || winnerId === loserId) throw new GameError('Nobody to rob.', 409);
    const losses = this.doc.losses[loserId]?.day === day ? this.doc.losses[loserId].n : 0;
    let cash = 0;
    if (losses < PVP.maxCashLossesPerDay) {
      const roll = PVP.cash.min + this.randInt(PVP.cash.max - PVP.cash.min + 1);
      cash = Math.max(0, Math.min(roll, Math.floor(Math.max(0, loser.bankroll) * 100) / 100));
    }
    const tobacco = kind === 'battle' ? this.shop?.tobaccoOf(loserId) || [] : [];
    const rec = { id: crypto.randomBytes(9).toString('base64url'), kind, at: now, day, battleId,
      winner: winnerId, winnerName: winner.name, loser: loserId, loserName: loser.name,
      winnerShift: this.shiftOf(winnerId)?.id || null, loserShift: this.shiftOf(loserId)?.id || null,
      cash: cents(cash), cashCapped: losses >= PVP.maxCashLossesPerDay, tobacco, tobaccoNames: tobacco.map((id) => ITEM[id]?.name || id), steps: {} };
    this.doc = { ...this.doc, raids: { ...this.doc.raids, [rec.id]: rec }, pairs: { ...this.doc.pairs, [pairKey(winnerId, loserId)]: now },
      losses: { ...this.doc.losses, ...(cash > 0 ? { [loserId]: { day, n: losses + 1 } } : {}) } };
    this.save();
    return this.apply(rec);
  }
  apply(rec) {
    if (!rec.steps.mines) { rec.mines = this.mines.applyRaid(rec); rec.steps.mines = true; this.save(); }
    if (!rec.steps.money) { rec.paid = this.pay(rec); rec.steps.money = true; this.save(); }
    if (!rec.steps.shop) { rec.shop = rec.tobacco.length && this.shop ? this.shop.applyRaid(rec) : { moved: [], smoked: [] }; rec.steps.shop = true; this.save(); }
    if (!rec.done) {
      rec.done = true; this.prune(); this.save();
      const pr = this.presence.get(rec.winner); if (pr) pr.notice = this.publicRaid(rec, rec.winner);
      if (this.presence.get(rec.loser)) this.presence.get(rec.loser).seen.clear();
    }
    return rec;
  }
  /** Both bankrolls in one atomic write, with the raid id on both players so a retry is a no-op. Never below zero. */
  pay(rec) {
    const winner = this.store.players[rec.winner], loser = this.store.players[rec.loser];
    if (!winner || !loser) return 0;
    if ((loser.pvp?.raids || []).includes(rec.id)) return rec.cash;
    const amount = cents(Math.max(0, Math.min(rec.cash, loser.bankroll)));
    const mark = (p) => ({ ...(p.pvp || {}), raids: [...(p.pvp?.raids || []), rec.id].slice(-50) });
    const l = { ...loser, pvp: mark(loser) }, w = { ...winner, pvp: mark(winner) };
    const battle = rec.kind === 'battle';
    if (amount > 0) {
      this.accounts.change(l, -amount, 'pvp', `Acid Mines: ${battle ? 'lost a bug battle to' : 'ambushed by'} ${rec.winnerName}`, { save: false });
      this.accounts.change(w, amount, 'pvp', `Acid Mines: ${battle ? 'won a bug battle against' : 'ambushed'} ${rec.loserName}`, { save: false });
    }
    this.store.commitPlayerDrafts([l, w]);
    return amount;
  }
  prune() {
    const cut = this.now() - 30 * 86400e3, raids = { ...this.doc.raids }, pairs = { ...this.doc.pairs };
    for (const [id, r] of Object.entries(raids)) if (r.done && r.at < cut) delete raids[id];
    for (const [k, t] of Object.entries(pairs)) if (this.now() - t > PVP.pairCooldownMs) delete pairs[k];
    this.doc = { ...this.doc, raids, pairs };
  }
  recover() {
    for (const rec of Object.values(this.doc.raids)) if (!rec.done) { try { this.apply(rec); } catch (e) { console.error(`[pvp] raid ${rec.id} recovery failed: ${e.message}`); } }
  }
  publicRaid(rec, viewer) {
    if (!rec) return null;
    const won = viewer ? rec.winner === viewer : true;
    return { id: rec.id, kind: rec.kind, won, winner: rec.winnerName, loser: rec.loserName, cash: rec.paid ?? rec.cash, cashCapped: !!rec.cashCapped,
      acid: rec.mines?.acid ?? 0, gained: rec.mines?.gained ?? 0, spilled: rec.mines?.spilled ?? 0,
      tobacco: (rec.shop?.moved || []).map((id) => ITEM[id]?.name || id), smoked: (rec.shop?.smoked || []).map((id) => ITEM[id]?.name || id) };
  }
  forget(playerId) {
    this.forfeit(playerId, 'forfeit');
    this.presence.delete(playerId);
  }
}
