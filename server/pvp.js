// The shared daily mine (v71): miners on shift at the same time see each other, can ambush someone from behind,
// and their bugs fight when they meet face to face (the same ring fight as the Barn's: server/fights.js). The server decides everything: positions are
// checked against the maze and a speed limit, "seen" is worked out here from those positions, every roll uses the
// server's random source, and the spoils (acid, play money, tobacco) move only through `raid()` below.
//
// Money here is the Academy's in-app play money (players.json bankroll). It has no cash value and is not connected to
// ConquestK; nothing in this file reads or changes the ConquestK betting switch.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { FIRST_POOL_STEPS } from './engine/maze.js';
import { shiftMaze } from './engine/mine-tiers.js';
import { mineDay } from './engine/daily-maze.js';
import { MAX_SHIFT_MS } from './mines.js';
import { RUN_SPEED } from './engine/mine-movement.js';
import { sees, touching, behind, onTunnel } from './engine/pvp-geometry.js';
import { BY_ID, levelFor, xpFor, MAX_LEVEL } from './engine/creatures.js';
import { ITEM } from './catalog/index.js';
import { danceId } from './engine/dances.js';
import { cents } from './accounts.js';
import { healthOf, pctOf } from './barn.js';

export const PVP = {
  staleMs: 4000,            // a miner who has not reported in this long is not in the tunnels as far as anyone can tell
  awareMs: 4000,            // "has seen you": within the last four seconds
  graceMs: 15000,           // the first 15 s of a shift, nobody can touch you (or touch anyone)
  safeTiles: 2.5,           // the elevator landing is neutral ground
  maxTilesPerSec: (RUN_SPEED / 2.2) * 1.5, // running speed in tiles, with room for network jitter
  slackTiles: 0.6,
  pairCooldownMs: 2 * 3600e3, // the same two miners can only rob each other once every two hours (either way round)
  maxCashLossesPerDay: 3,   // after three cash losses in a mine day you still lose acid (and smokes) but not money
  minShifts: 3,             // greenhorns (fewer finished shifts, or an account under a day old, or a guest) are untouchable
  minAgeMs: 24 * 3600e3,
  cash: { min: 20, max: 100 },
  disconnectMs: 15000,      // a battler not heard from for 15 s forfeits
  keepOverMs: 60000,        // a finished battle stays readable for a minute
  maxVisible: 12,
  danceGapMs: 400,          // v89: starting or switching a dance at most every 0.4 s (stopping is always allowed)
};

// Wild bugs share the day's tunnels. A miner's own standing partner can fight one.
export const WILD = {
  reach: 1.6,   // tiles, by the server's copy of where the miner is: this close and it goes for your bug (the page asks at about one)
  jarAt: 0.25,  // a jar only works on a wild bug at or under a quarter of its health
  jarBase: 0.35, jarBest: 0.85, // the chance at exactly a quarter, and the most it can be; it climbs as the bug weakens
};
/** The chance a jar holds, from the wild bug's health as a share of its full health. */
export const jarChance = (share) => (share > WILD.jarAt ? 0 : Math.min(WILD.jarBest, WILD.jarBase + (WILD.jarAt - share) * 2));

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const LOANER = { species: 'onymacris', name: 'Gerald', level: 1 }; // the Foreman's lunchbox beetle

export class Pvp {
  constructor({ store, accounts, mines, shop, barn, avatars, now, randInt, fights }) {
    this.store = store; this.accounts = accounts; this.mines = mines; this.shop = shop; this.barn = barn; this.avatars = avatars;
    this.now = now; this.randInt = randInt || ((n) => crypto.randomInt(n)); this.fights = fights || barn.fights;
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
    return this.mazeAt(`${shift.seed}:${cells}:${shift.tier || 0}`); // the tier's cave-ins are rock here too
  }
  mazeAt(key) {
    let m = this.mazes.get(key);
    if (!m) {
      const [seed, cells, tier] = key.split(':').map(Number);
      m = shiftMaze({ seed, cells, tier }); this.mazes.set(key, m);
      if (this.mazes.size > 8) this.mazes.delete(this.mazes.keys().next().value);
    }
    return { key, grid: m.grid, start: m.start };
  }
  shiftOf(playerId) {
    const s = this.mines.doc.active[playerId];
    return s && s.rulesVersion === 2 && !s.settlement ? s : null;
  }
  wildsFor(shift) {
    return shift && this.now() - shift.startedAt < MAX_SHIFT_MS ? this.mines.wildsFor(shift) : [];
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
   * can run since the last report is refused and the miner is put back (`snap`).
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
    let snap = false, moved = false;
    if (!this.inBattle.has(player.id) && Number.isFinite(x) && Number.isFinite(y)) {
      const p = { x, y };
      const far = Math.hypot(x - pr.x, y - pr.y) > PVP.maxTilesPerSec * Math.max(0.05, (now - pr.at) / 1000) + PVP.slackTiles;
      // A fresh page (reload, resume) starts the miner back at the elevator: that one jump is allowed, nothing else.
      const restart = body.fresh === true && Math.hypot(x - start.x, y - start.y) <= 1.5;
      if (Math.hypot(x - pr.x, y - pr.y) > 0.02) moved = true;
      if (onTunnel(grid, p) && (!far || restart)) { pr.x = x; pr.y = y; } else snap = true;
    }
    if (Number.isFinite(yaw)) pr.yaw = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.setDance(pr, body.dance, { now, still: !moved && !snap && !this.inBattle.has(player.id) });
    pr.at = now;
    // Seeing goes both ways each report: my view of them now, and theirs of me from their last pose.
    for (const [oid, o] of this.neighbours(player.id)) {
      if (sees(grid, pr, o)) pr.seen.set(oid, now);
      if (sees(grid, o, pr)) o.seen.set(player.id, now);
    }
    if (!this.inBattle.has(player.id)) {
      for (const [oid] of this.neighbours(player.id)) if (this.canBattle(player.id, oid)) { this.startBattle(player.id, oid); break; }
    }
    return this.view(player, { snap, have: body.have });
  }

  /**
   * v89: a dance is cosmetic. Only the nine known ids pass; walking, a snap or a bug battle ends it; starting or switching
   * is rate limited. It never touches facing, so who can see whom (and so the ambush rules) is exactly as without it.
   */
  setDance(pr, raw, { now, still = true } = {}) {
    const want = still ? danceId(raw) : null;
    if (want === (pr.dance || null)) return;
    if (!want) { pr.dance = null; return; }
    if (now - (pr.danceAt ?? -Infinity) < PVP.danceGapMs) return;
    pr.dance = want; pr.danceAt = now;
  }

  view(player, { snap = false, have = 0 } = {}) {
    const pr = this.presence.get(player.id);
    const others = this.neighbours(player.id).slice(0, PVP.maxVisible).map(([oid, o]) => {
      const p = this.store.players[oid];
      return { id: oid, name: p?.name || 'A miner', avatar: this.avatars?.info(p) || null, x: o.x, y: o.y, yaw: o.yaw,
        bug: this.bugOf(oid, false), shield: this.shield(oid), cooling: this.cooling(player.id, oid), dance: o.dance || null };
    });
    const target = others.find((o) => this.canAmbush(player.id, o.id));
    const notice = pr?.notice || null; if (pr) pr.notice = null;
    const bid = this.inBattle.get(player.id) || pr?.lastBattle;
    const battle = bid && this.battles.has(bid) ? this.battleView(this.battles.get(bid), player.id, have) : null;
    const shift = this.shiftOf(player.id), wilds = this.wildsFor(shift);
    const canFightWild = wilds.length > 0 && !this.fights.fightOf(player.id) && !!this.bugOf(player.id, false);
    return { serverNow: this.now(), others, wilds, canFightWild, ambush: target ? { id: target.id, name: target.name } : null, shield: this.shield(player.id), dance: pr?.dance || null,
      ...(shift?.egg ? { egg: this.mines.eggAvailable(shift, player.id) } : {}),
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
  /**
   * The bug a miner fights with. A fainted bug (v75) stays home until the Bug Center heals it, so its miner borrows
   * the Foreman's beetle like anyone without a bug: being fainted is never a shield. `benched` names the fainted one.
   */
  bugOf(id, full = true) {
    let pen = this.barn?.doc?.pens?.[id];
    if (pen?.stage === 'egg' && this.now() >= pen.hatchAt) pen = this.barn.refresh(id);
    const alive = pen?.stage === 'creature' && !(this.barn.deathAt && this.now() >= this.barn.deathAt(pen));
    const fit = alive && !pen.faintedAt;
    const p = this.store.players[id];
    if (!fit) return full ? { ...LOANER, loaner: true, ownerName: p?.name, ...(alive ? { benched: pen.name } : {}) } : null;
    const xp = pen.xp || 0, level = levelFor(xp);
    return full ? { species: pen.species, name: pen.name, level, loaner: false, ownerName: p?.name, bornAt: pen.bornAt, xp, health: healthOf(pen) } : { species: pen.species, name: pen.name };
  }
  /** Own-side XP bar numbers for the battle screen (null for a loaner). */
  xpBar(xp) {
    if (xp == null) return null;
    const level = levelFor(xp);
    return { xp, level, from: xpFor(level), to: level >= MAX_LEVEL ? null : xpFor(level + 1) };
  }
  startBattle(a, b) {
    const now = this.now(), id = crypto.randomBytes(9).toString('base64url');
    // A bug already in a Barn bout cannot be in two rings at once: its miner borrows Gerald, like anyone without one.
    const pick = (pid) => (this.fights.fightOf(pid) ? { ...LOANER, loaner: true, ownerName: this.store.players[pid]?.name } : this.bugOf(pid));
    const fa = pick(a), fb = pick(b);
    const fighter = (f, pid) => (f.loaner ? { species: f.species, name: `${f.name} (on loan)`, level: f.level, owner: f.ownerName }
      : { ...this.barn.fighter(pid, this.barn.doc.pens[pid]), owner: f.ownerName });
    const battle = { id, a, b, startedAt: now, lastSeen: { [a]: now, [b]: now }, over: null,
      bugs: { a: fa.loaner ? null : { bornAt: fa.bornAt, xp: fa.xp }, b: fb.loaner ? null : { bornAt: fb.bornAt, xp: fb.xp } },
      benched: { a: fa.benched || null, b: fb.benched || null } };
    // The same fight the Barn runs (server/fights.js): one action a beat, each miner lining up moves or leaving it to the bug.
    battle.fight = this.fights.start({ id, kind: 'mine', players: [a, b], fighters: [fighter(fa, a), fighter(fb, b)], seed: `${now}:${this.randInt(1e9)}`, watching: [a, b],
      onFinish: (fight) => this.fought(battle, fight) });
    this.battles.set(id, battle); this.inBattle.set(a, id); this.inBattle.set(b, id);
    for (const pid of [a, b]) { this.mines.holds.delete(pid); const pr = this.presence.get(pid); if (pr) pr.lastBattle = id; }
    return battle;
  }
  /**
   * The miner has walked into the shift's wild bug and it goes for their partner: the same ring fight, with nobody in
   * the other corner. It only fights a bug that is the miner's own and standing; the Foreman's loaner it ignores.
   */
  meetWild(player, body = {}) {
    this.touch(player.id); this.sweep();
    const shift = this.shiftOf(player.id), pr = this.fresh(player.id);
    if (this.inBattle.has(player.id)) return this.view(player);
    const wilds = shift?.id === body.shiftId ? this.wildsFor(shift) : [];
    const distance = (bug) => pr ? Math.hypot(pr.x - bug.x, pr.y - bug.y) : Infinity;
    const wild = body.wildId == null ? wilds.toSorted((a, b) => distance(a) - distance(b))[0] : wilds.find(bug => bug.id === body.wildId);
    if (!wild) throw new GameError('There is nothing wild here.', 409);
    if (distance(wild) > WILD.reach) throw new GameError('It is further off than that.', 409);
    for (const battle of this.battles.values()) {
      if (!battle.over && battle.wild?.id === wild.id) throw new GameError('Another miner is fighting this bug.', 409);
    }
    if (!this.startWild(player.id, shift, wild)) throw new GameError('It looks straight past you. It wants a bug to fight.', 409);
    return this.view(player);
  }
  startWild(a, shift, wild) {
    const mine = this.bugOf(a);
    if (mine.loaner || this.fights.fightOf(a)) return null;
    const now = this.now(), id = crypto.randomBytes(9).toString('base64url'), { species, level } = wild;
    const battle = { id, a, b: null, wild: { id: wild.id, species, level, name: BY_ID[species].name }, shiftId: shift.id, startedAt: now, lastSeen: { [a]: now }, over: null,
      bugs: { a: { bornAt: mine.bornAt, xp: mine.xp }, b: null }, benched: { a: null, b: null } };
    battle.fight = this.fights.start({ id, kind: 'mine', players: [a, null], seed: `${now}:${this.randInt(1e9)}`, watching: [a],
      fighters: [{ ...this.barn.fighter(a, this.barn.doc.pens[a]), owner: mine.ownerName }, { species, name: battle.wild.name, level, wild: true }],
      onFinish: (fight) => this.fought(battle, fight) });
    this.battles.set(id, battle); this.inBattle.set(a, id);
    this.mines.holds.delete(a); const pr = this.presence.get(a); if (pr) pr.lastBattle = id;
    return battle;
  }
  /**
   * A wild fight is over. Nobody is robbed either way. Beating or jarring it pays the partner its battle XP; losing
   * faints it; running, the bell or a dropped connection just keeps the damage. Whatever happened, the wild bug is
   * gone from this shift.
   */
  wildOver(battle, winnerSide, reason, fight) {
    if (reason !== 'jarred') this.mines.wildGone(battle.a, battle.shiftId, battle.wild.id);
    const bug = battle.bugs.a, hpPct = pctOf(fight.S.hp[0], fight.S.maxHp[0]);
    if (reason === 'fainted' || reason === 'jarred') battle.over.bug = this.barn.battleResult(battle.a, { battleId: battle.id, bornAt: bug.bornAt, won: winnerSide === 'a', foeName: `a wild ${battle.wild.name}`, hpPct, odds: fight.line });
    else if (reason !== 'abandoned') this.barn.keepScrapes(battle.a, { battleId: battle.id, bornAt: bug.bornAt, hpPct });
  }
  /**
   * Throw a jar at the wild bug you are fighting. It has to be at or under a quarter of its health, you need a jar
   * (General Store) and a free stall, and it shakes off one throw per action of the fight. A miss still spends the jar.
   */
  jar(player, body = {}) {
    this.touch(player.id); this.sweep();
    const id = this.inBattle.get(player.id), battle = id && this.battles.get(id);
    if (!battle?.wild || battle.over || battle.id !== String(body.battleId || '')) throw new GameError('That fight is over.', 409);
    const S = battle.fight.S, share = S.hp[1] / S.maxHp[1];
    if (share > WILD.jarAt) throw new GameError('It is far too lively for a jar. Get it under a quarter of its health.', 409);
    if (!this.barn.room(player.id)) throw new GameError('Every stall is taken. Nowhere to put it.', 409);
    if (battle.jarTurn === S.turn) throw new GameError('It is still shaking off the last one.', 429);
    const held = this.randInt(1000) < Math.round(jarChance(share) * 1000);
    const wildId = battle.wild.id, battleId = battle.id;
    if (!this.shop.takeJar(player.id, held ? { wildId, battleId } : null)) throw new GameError('You are out of jars. The General Store sells them.', 409);
    if (held) {
      const caught = this.barn.adopt(player.id, { wildId, battleId, species: battle.wild.species, level: battle.wild.level, health: pctOf(S.hp[1], S.maxHp[1]) });
      this.finish(battle, 'a', 'jarred', caught.name);
    } else battle.jarTurn = S.turn;
    return { held, battle: this.battleView(battle, player.id, body.have) };
  }
  /** The fight ran its course. A draw at the bell is no contest: nobody is robbed. */
  fought(battle, fight) {
    if (battle.over) return; // a forfeit or a disconnect already ended it
    const winner = fight.over.winner;
    this.finish(battle, winner === 1 ? 'b' : 'a', winner === null ? 'draw' : 'fainted');
  }
  /** Hearing from a battler at all keeps them in the fight (before the sweep decides who has gone quiet). */
  touch(pid) { const b = this.battles.get(this.inBattle.get(pid)); if (b && !b.over) b.lastSeen[pid] = this.now(); }
  sideOf(battle, pid) { return battle.a === pid ? 'a' : battle.b === pid ? 'b' : null; }
  /** The ring's view of the fight from this miner's corner, plus what the mine adds: the spoils and the bug's XP. */
  battleView(battle, pid, have = 0) {
    const side = this.sideOf(battle, pid), foe = side === 'a' ? 'b' : 'a';
    if (!side) return null;
    battle.lastSeen[pid] = this.now();
    const rec = battle.over?.raid ? this.doc.raids[battle.over.raid] : null;
    const mine = battle.wild ? battle.over?.bug || null : rec?.barn?.[side === battle.over?.winner ? 'winner' : 'loser'] || null;
    const S = battle.fight.S, share = S.hp[1] / S.maxHp[1];
    const xpBefore = battle.bugs?.[side]?.xp;
    return { ...this.fights.view(battle.fight, pid, have), benched: battle.benched?.[side] || null,
      // against a wild bug: how many jars you carry, whether a stall is free, and the chance one holds right now (0 until it is weak enough)
      ...(battle.wild ? { wild: true, wildId: battle.wild.id, ...(battle.over ? {} : { jar: { have: this.shop.jars(pid), room: this.barn.room(pid), at: WILD.jarAt, chance: jarChance(share) } }) } : {}),
      over: battle.over ? { won: battle.over.winner === side, reason: battle.over.reason, ...(battle.over.caught ? { caught: battle.over.caught } : {}), raid: rec ? this.publicRaid(rec, pid) : null,
        // what happened to your own bug: XP (with the win bonus), level change, and whether it fainted
        bug: mine && !mine.skipped ? { xp: mine.xp || 0, bonus: mine.bonus || 0, fainted: !!mine.fainted, levelBefore: mine.levelBefore, levelAfter: mine.levelAfter, xpBar: this.xpBar((xpBefore || 0) + (mine.xp || 0)) } : null,
        foeFainted: battle.over.winner === side && !!battle.bugs?.[foe] } : null };
  }
  /** Line up your bug's next moves (up to three). */
  move(player, body = {}) {
    this.touch(player.id); this.sweep();
    const id = this.inBattle.get(player.id), battle = id && this.battles.get(id);
    if (!battle || battle.id !== String(body.battleId || '')) throw new GameError('That battle is over.', 409);
    if (!this.fights.line(battle.fight, player.id, body.moves)) throw new GameError('Your bug does not know that one.', 400);
    return { battle: this.battleView(battle, player.id, body.have) };
  }
  /** Walking away from a battle (clocking out, closing the page for good) is a forfeit. */
  forfeit(playerId, reason = 'forfeit') {
    const id = this.inBattle.get(playerId), battle = id && this.battles.get(id);
    if (!battle || battle.over) return null;
    const side = this.sideOf(battle, playerId);
    this.finish(battle, side === 'a' ? 'b' : 'a', reason);
    return battle;
  }
  finish(battle, winnerSide, reason, caught) {
    const winner = winnerSide === 'a' ? battle.a : battle.b, loser = winnerSide === 'a' ? battle.b : battle.a;
    this.inBattle.delete(battle.a); this.inBattle.delete(battle.b);
    battle.over = { winner: winnerSide, reason, at: this.now(), raid: null, ...(caught ? { caught } : {}) };
    const fight = battle.fight, w = winnerSide === 'a' ? 0 : 1;
    this.fights.finish(fight, reason === 'draw' ? null : w, reason); // stops a fight that was walked out on; a no-op when it ran its course
    for (const [k, i] of [['a', 0], ['b', 1]]) if (battle.bugs?.[k] && fight.S.side[i].ate) this.barn?.lunchEaten?.(battle[k], battle.bugs[k].bornAt); // a packed lunch eaten in the fight is gone, however it ended
    if (battle.wild) return this.wildOver(battle, winnerSide, reason, fight);
    if (reason === 'draw') { // no contest: nobody is robbed, but the damage stays (HP never comes back on its own)
      for (const [k, i] of [['a', 0], ['b', 1]]) {
        const bug = battle.bugs?.[k];
        if (bug) this.barn?.keepScrapes?.(battle[k], { battleId: battle.id, bornAt: bug.bornAt, hpPct: pctOf(fight.S.hp[i], fight.S.maxHp[i]) });
      }
      return;
    }
    if (reason === 'abandoned') return;
    const loserSide = winnerSide === 'a' ? 'b' : 'a';
    const bugs = { winner: battle.bugs?.[winnerSide] ? { ...battle.bugs[winnerSide], hpPct: pctOf(fight.S.hp[w], fight.S.maxHp[w]), odds: this.fights.lineOf(fight, w) } : null, loser: battle.bugs?.[loserSide] || null, fought: reason === 'fainted',
      winnerBug: fight.fighters[w].name, loserBug: fight.fighters[1 - w].name };
    battle.over.raid = this.raid('battle', winner, loser, battle.id, bugs).id;
  }
  /** Turn timers and disconnects, checked on every PvP request (and by the app's one-second sweep). */
  sweep() {
    const now = this.now();
    for (const battle of this.battles.values()) {
      if (!battle.wild || battle.over) continue;
      const shift = this.shiftOf(battle.a);
      if (shift?.id !== battle.shiftId || !this.wildsFor(shift).some(bug => bug.id === battle.wild.id)) this.finish(battle, 'b', 'forfeit');
      else if (now - battle.lastSeen[battle.a] > PVP.disconnectMs) this.finish(battle, 'b', 'disconnect');
    }
    this.fights.sweep();
    for (const [id, battle] of this.battles) {
      if (battle.over) { if (now - battle.over.at > PVP.keepOverMs) this.battles.delete(id); continue; }
      const goneA = now - battle.lastSeen[battle.a] > PVP.disconnectMs, goneB = now - battle.lastSeen[battle.b] > PVP.disconnectMs;
      if (goneA && goneB) { this.finish(battle, 'a', 'abandoned'); continue; } // nobody left to collect: no spoils
      if (goneA || goneB) this.finish(battle, goneA ? 'b' : 'a', 'disconnect');
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
  raid(kind, winnerId, loserId, battleId = null, bugs = null) {
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
      cash: cents(cash), cashCapped: losses >= PVP.maxCashLossesPerDay, tobacco, tobaccoNames: tobacco.map((id) => ITEM[id]?.name || id), ...(bugs ? { bugs } : {}), steps: {} };
    this.doc = { ...this.doc, raids: { ...this.doc.raids, [rec.id]: rec }, pairs: { ...this.doc.pairs, [pairKey(winnerId, loserId)]: now },
      losses: { ...this.doc.losses, ...(cash > 0 ? { [loserId]: { day, n: losses + 1 } } : {}) } };
    this.save();
    return this.apply(rec);
  }
  apply(rec) {
    if (!rec.steps.mines) { rec.mines = this.mines.applyRaid(rec); rec.steps.mines = true; this.save(); }
    if (!rec.steps.money) { rec.paid = this.pay(rec); rec.steps.money = true; this.save(); }
    if (!rec.steps.shop) { rec.shop = rec.tobacco.length && this.shop ? this.shop.applyRaid(rec) : { moved: [], smoked: [] }; rec.steps.shop = true; this.save(); }
    if (rec.bugs && !rec.steps.barn) { rec.barn = this.settleBugs(rec); rec.steps.barn = true; this.save(); }
    if (!rec.done) {
      rec.done = true; this.prune(); this.save();
      const pr = this.presence.get(rec.winner); if (pr) pr.notice = this.publicRaid(rec, rec.winner);
      if (this.presence.get(rec.loser)) this.presence.get(rec.loser).seen.clear();
    }
    return rec;
  }
  /** v75: XP for both real bugs (bonus for the winner), and the loser's bug faints. Each call is idempotent per battle. */
  settleBugs(rec) {
    const b = rec.bugs, out = { winner: null, loser: null };
    if (!this.barn?.battleResult) return out;
    if (b.winner) out.winner = this.barn.battleResult(rec.winner, { battleId: rec.battleId, bornAt: b.winner.bornAt, won: true, foeName: rec.loserName, hpPct: b.winner.hpPct ?? null, odds: b.winner.odds });
    if (b.loser) out.loser = this.barn.battleResult(rec.loser, { battleId: rec.battleId, bornAt: b.loser.bornAt, won: false, fought: b.fought, foeName: rec.winnerName });
    return out;
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
      tobacco: (rec.shop?.moved || []).map((id) => ITEM[id]?.name || id), smoked: (rec.shop?.smoked || []).map((id) => ITEM[id]?.name || id),
      ...(rec.bugs ? { winnerBug: rec.bugs.winnerBug || null, loserBug: rec.bugs.loserBug || null, fainted: !!rec.barn?.loser?.fainted, bugXp: (won ? rec.barn?.winner?.xp : rec.barn?.loser?.xp) || 0 } : {}) };
  }
  forget(playerId) {
    this.forfeit(playerId, 'forfeit');
    this.presence.delete(playerId);
  }
}
