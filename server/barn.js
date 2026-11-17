// The Barn: a few stalls of eggs and bugs per account, raised in real time. One of them is the partner (doc.pens):
// the bug beside its owner in the mine and the terrarium. The rest wait in stalls (doc.bench), where a bug's needs,
// hunger and day XP run BENCH_SLOW times slower. The server decides everything:
// whether a mine shift has an egg (mines.js), which creature is inside (rolled at pickup, hidden until it hatches),
// when it hatches, how its needs decay, and its level. Bouts stake play money; bugs cannot be sold or traded.
// v33: residents are real bugs (engine/bugs.js); old hybrid rows are migrated once, quietly, on load.
// v33: bugs can die of neglect, tamagotchi-style, but only slowly: STARVE_MS (21 days) after the last feed (or the
// end of an automatic feeder's run). Warnings start at 7 days. Death is computed from stored times, never a timer,
// so a server restart can't cause or skip one. A dead bug leaves a gravestone until it's laid to rest; then the
// stall is empty and a new egg can turn up in the mines.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { ROSTER, BY_ID, MAX_LEVEL, levelFor, xpFor } from './engine/creatures.js';
import { Fights } from './fights.js';
import { movesFor, battleFor, combatStats, traitFor, STANCES, riskFor, upsetXp } from './engine/bug-combat.js';
import { line } from './engine/bout.js';
import { cents } from './accounts.js';

export const EGG_CHANCE = 10000; // out of 100,000 shifts (10%) with an empty barn; halved for each bug already kept
export const WILD_CHANCE = 15000; // out of 100,000 shifts (15%): a wild bug loose in the tunnels, for a miner whose partner can fight it
export const STALLS = 3;                        // every barn starts with room for three
export const STALL_COSTS = [1500, 4000, 10000]; // the fourth, fifth and sixth stall
export const BENCH_SLOW = 5;                    // a stalled bug lives this many times slower than the partner
/** What names one bug among its owner's: when its egg was picked up (rows from before stalls: when it hatched). */
export const idOf = (pen) => pen.eggAt || pen.bornAt;
const idOk = (v) => v === undefined || Number.isFinite(v);
export const DEFAULT_INCUBATE_MS = 3 * 24 * 3600e3;
// Needs decay gently: from full to empty in about a week (hunger, v33: was 2 days), 2.5 days (mood) and 3 days
// (cleanliness). Hunger is only the gauge; what kills is time since the last feed (STARVE_MS), not the gauge at zero.
export const DECAY_PER_HOUR = { hunger: 0.6, mood: 1.6, clean: 1.4 };
const DAY = 24 * 3600e3;
export const STARVE_MS = 21 * DAY;     // no food at all for three weeks
export const WARN_MS = [7 * DAY, 14 * DAY, 18 * DAY]; // hungry, weak, critical
export const MIN_LIFE_MS = 7 * DAY;    // belt and braces: never dies in its first week, whatever the clocks say
export const CARE = {
  feed: { stat: 'hunger', gain: 35, cooldownMs: 20 * 60e3, word: 'fed' },
  play: { stat: 'mood', gain: 30, cooldownMs: 20 * 60e3, word: 'played with' },
  clean: { stat: 'clean', gain: 45, cooldownMs: 40 * 60e3, word: 'hosed down' },
};
export const CARE_XP = 12;   // per care action. No daily cap: the care cooldowns are the only brake
export const DAY_XP = 10;    // per full day since hatching, while it's not neglected
export const BOOST_XP = 6;   // a mister or heat lamp (no longer sold; ones already held still work): half a care action
export const FEEDER_DAY_XP = 12; // per full day an automatic feeder covers: one feed's worth, so paying for it still levels the bug
export const BOUT_LEVEL = 1; // any hatched bug: they could already fight in the mine
export const BOUT_XP = 20;
export const BOUT_WIN_XP = 10; // on top, for the winner of an even fight; an underdog's win pays up to 18, a favourite's as little as 2 (upsetXp)
export const FIND_XP = 2;      // each acid pool a guide bug leads its miner to. ponytail: uncapped (pool travel time is the brake); cap it if someone farms shifts
export const BOUT_OPEN_MS = 60 * 60e3;
export const MAX_BOUT_STAKE = 10000;
export const BOUT_STAKE_STEP = 10; // a named stake is $0, $10, $20…: never cents
// Both mine bugs that fight to a verdict earn BATTLE_XP; the winner gets a bonus scaled by the line.
export const BATTLE_XP = 20;
export const WIN_BONUS_XP = 30;
export const RECOVER_MS = 60 * 60e3;
export const FAST_HEAL_COST = 50;
/** Outside a fight only a knockout persists. Older standing bugs with saved damage recover here too. */
export function healthOf(pen) {
  return pen && !pen.faintedAt ? 100 : 0;
}
export const CHALLENGE_OPEN_MS = 24 * 3600e3; // a challenge waits a day: nothing is held, so it can afford to
export const FIGHT_LOG = 20;                  // recent fights anyone can watch
const STATS = ['hunger', 'mood', 'clean'];
const ORDINALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => (n <= 10 ? ORDINALS[n - 1] : String(n));

export class Barn {
  constructor({ store, accounts, now, incubateMs, eggInt, forceEgg = false, forceWild = false, startXp = 0, starveMs, fights } = {}) {
    // starveMs: dev/e2e only (BARN_TEST_STARVE_MS), shrinks the whole neglect timeline proportionally
    this.starveMs = Number(starveMs) > 0 ? Number(starveMs) : STARVE_MS; this.k = this.starveMs / STARVE_MS;
    this.store = store; this.accounts = accounts; this.now = now; this.forceEgg = !!forceEgg; this.forceWild = !!forceWild; this.startXp = Math.max(0, Number(startXp) || 0);
    this.incubateMs = Number(incubateMs) > 0 ? Number(incubateMs) : DEFAULT_INCUBATE_MS;
    this.eggInt = eggInt || ((n) => crypto.randomInt(n)); // its own random source: never the mine's pay or vein ones
    this.doc = store.loadDoc('barn', { pens: {}, names: {}, count: {} });
    this.doc.pens ||= {}; this.doc.names ||= {}; this.doc.count ||= {}; this.doc.graves ||= {};
    this.doc.challenges ||= []; this.doc.fights ||= []; this.doc.bench ||= {}; this.doc.stalls ||= {};
    this.fights = fights || new Fights({ now }); // the mine shares this one (server/app.js)
    if (this.migrate()) this.save();
  }
  /** v33: hybrid eggs and creatures become randomly chosen bugs. Level, XP, needs, record and cooldowns are kept;
   * the name follows the new species; the feeding clock restarts so nobody's bug is suddenly starving. */
  migrate() {
    let n = 0; const now = this.now();
    for (const [id, pen] of Object.entries(this.doc.pens)) {
      if (pen.stage === 'creature' && !pen.combatVersion) {
        pen.legacyAbilities = [1, 3, 5].filter((level) => levelFor(pen.xp) >= level).length;
        pen.combatVersion = 1; n++;
      }
      if (BY_ID[pen.species]) continue;
      const bug = ROSTER[this.eggInt(ROSTER.length)];
      pen.oldSpecies = pen.species; pen.species = bug.id; pen.migratedAt = now; n++;
      if (pen.stage === 'creature') {
        pen.name = this.newName(id, bug);
        pen.fedAt = Math.max(pen.fedAt || 0, now);
        delete pen.lastBout; // its replay names a species that no longer exists
      }
    }
    return n;
  }
  newName(playerId, bug) {
    const nick = bug.sci.split(' ')[0];
    const n = (this.doc.count[bug.id] || 0) + 1;
    let name = `${nick} ${roman(n)}`.trim();
    while (this.doc.names[name.toLowerCase()]) name = `${nick} ${roman(n + 1)}-${crypto.randomInt(1000)}`; // belt and braces
    this.doc.count[bug.id] = n;
    this.doc.names[name.toLowerCase()] = playerId;
    return name;
  }
  /** When it dies if nobody feeds it (ms epoch). Automatic feeder time counts as fed. */
  deathAt(pen) {
    const fed = Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    let starves = fed + this.starveMs; // on the bug's own clock; a stalled bug's runs slow
    if (pen.benchedAt && starves > pen.benchedAt) starves = pen.benchedAt + (starves - pen.benchedAt) * BENCH_SLOW;
    return Math.max(starves, (pen.bornAt || 0) + MIN_LIFE_MS * this.k, (pen.migratedAt || 0) + MIN_LIFE_MS * this.k);
  }
  starving(pen, now) { // 0 fine, 1 hungry, 2 weak, 3 critical
    const since = this.own(pen, now) - Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    return WARN_MS.filter((w) => since >= w * this.k).length;
  }
  /**
   * A bug's own clock. Its needs, hunger and day XP are kept in this time: the wall's for the partner, BENCH_SLOW
   * times slower in a stall. ponytail: a store feeder's dates stay on the wall clock, so one bought for a bug that is
   * later stalled covers fewer of its slow days than it would as partner; put those on this clock if anyone minds.
   */
  own(pen, now) { return pen.benchedAt ? pen.benchedAt + Math.max(0, now - pen.benchedAt) / BENCH_SLOW : now; }
  /** Leaving a stall: the slow clock is settled into its times, so its needs carry on from where they are. */
  unstall(pen) {
    if (!pen.benchedAt) return pen;
    const now = this.now(), late = now - this.own(pen, now), { benchedAt: _benchedAt, ...out } = structuredClone(pen);
    for (const s of STATS) out.stats[s].at += late;
    out.fedAt += late; out.dayXpAt += late;
    return out;
  }
  save() { this.store.saveDoc('barn', this.doc); }
  /** Every bug a player keeps, partner first. */
  bugs(playerId) { const partner = this.doc.pens[playerId]; return [...(partner ? [partner] : []), ...(this.doc.bench[playerId] || [])]; }
  /** One of them by id; with no id, the partner. */
  penOf(playerId, bug) { return bug == null ? this.doc.pens[playerId] || null : this.bugs(playerId).find((pen) => idOf(pen) === Number(bug)) || null; }
  /** The change that puts `pen` back where it lives: its stall, or the partner's place. */
  slot(playerId, pen) {
    const partner = this.doc.pens[playerId], bench = this.doc.bench[playerId] || [], same = (other) => idOf(other) === idOf(pen);
    if (bench.some(same) && !(partner && same(partner))) return { bench: { ...this.doc.bench, [playerId]: bench.map((other) => (same(other) ? pen : other)) } };
    return { pens: { ...this.doc.pens, [playerId]: pen } };
  }
  commitPen(playerId, pen) { this.commitDoc(this.slot(playerId, pen)); }
  /** Written before it replaces what is in memory, so a failed write leaves the last saved barn in place. */
  commitDoc(changes) {
    const next = { ...this.doc, ...changes };
    this.store.saveDoc('barn', next);
    this.doc = next;
  }
  has(playerId) { return this.bugs(playerId).length > 0; }
  stalls(playerId) { return STALLS + (this.doc.stalls[playerId] || 0); }
  /** A stall is free. An egg, a bug and a grave not yet laid to rest each take one. */
  room(playerId) { return this.bugs(playerId).length < this.stalls(playerId); }

  /** At clock-in: does this shift have an egg in it? Only with a stall free, and half as often for each bug already kept. */
  rollEgg(playerId) { return this.room(playerId) && (this.forceEgg || this.eggInt(100000) < EGG_CHANCE / 2 ** this.bugs(playerId).length); }

  /** Picking the egg up in the mine. Which creature is inside is decided now and kept secret until it hatches. */
  layEgg(playerId) {
    if (!this.room(playerId)) throw new GameError('Every stall is taken. The egg stays where it is.', 409);
    const now = this.now();
    const species = ROSTER[this.eggInt(ROSTER.length)].id;
    let eggAt = now; while (this.bugs(playerId).some((pen) => idOf(pen) === eggAt)) eggAt++; // this bug's id among its owner's
    const egg = { stage: 'egg', species, eggAt, hatchAt: now + this.incubateMs, warmedAt: 0 };
    if (this.doc.pens[playerId]) (this.doc.bench[playerId] ||= []).push(egg); else this.doc.pens[playerId] = egg;
    this.save();
    return this.view(playerId);
  }
  /**
   * At clock-in: is a wild bug loose in this shift, and which? Only for a miner whose partner could fight it. `depth`
   * (0 and up: a rougher day, a deeper shaft) is how grown it is. Rolled from the barn's own source, like the egg.
   */
  rollWild(playerId, depth = 0) {
    if (!this.fit(playerId) || !(this.forceWild || this.eggInt(100000) < WILD_CHANCE)) return null;
    return { species: ROSTER[this.eggInt(ROSTER.length)].id, level: Math.max(1, Math.min(MAX_LEVEL, 1 + depth + this.eggInt(3))) };
  }
  /** A wild bug jarred in the mine takes a free stall at the level it was caught. */
  adopt(playerId, { species, level }) {
    if (!this.room(playerId)) throw new GameError('Every stall is taken. Nowhere to put it.', 409);
    const now = this.now(), stalled = !!this.doc.pens[playerId];
    let at = now; while (this.bugs(playerId).some((pen) => idOf(pen) === at || pen.bornAt === at)) at++; // its id, and the bornAt its fight receipts go by
    const pen = { stage: 'creature', species, name: this.newName(playerId, BY_ID[species]), eggAt: at, bornAt: at, caughtAt: now, fedAt: now, xp: xpFor(level), dayXpAt: now, cool: {}, combatVersion: 1,
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 60, at: now }])), ...(stalled ? { benchedAt: now } : {}) };
    if (stalled) (this.doc.bench[playerId] ||= []).push(pen); else this.doc.pens[playerId] = pen;
    this.save();
    return pen;
  }
  /** Another stall, paid for on the spot. */
  buildStall(playerId) {
    const built = this.doc.stalls[playerId] || 0, cost = STALL_COSTS[built];
    if (cost === undefined) throw new GameError('The barn has no room for another stall.', 409);
    const player = this.accounts.ensure(this.store.players[playerId]);
    this.accounts.requireFunds(player, cost, 'a new stall');
    this.accounts.change(player, -cost, 'barn-stall', 'Barn: built a stall');
    this.commitDoc({ stalls: { ...this.doc.stalls, [playerId]: built + 1 } });
    return this.view(playerId);
  }
  /** Choose the bug that comes with you. The old partner takes its stall, and its clock slows from now. */
  setPartner(playerId, bug) {
    this.refresh(playerId);
    const pen = this.refresh(playerId, bug), partner = this.doc.pens[playerId];
    if (!pen || pen.stage !== 'creature') throw new GameError('Only a hatched, living bug can be your partner.', 409);
    if (pen === partner) return this.view(playerId);
    if (this.fights.fightOf(playerId)) throw new GameError('Not while one of your bugs is in a fight.', 409);
    const stalled = partner.stage === 'creature' ? { ...partner, benchedAt: this.now() } : partner;
    this.commitDoc({ pens: { ...this.doc.pens, [playerId]: this.unstall(pen) }, bench: { ...this.doc.bench, [playerId]: this.doc.bench[playerId].map((other) => (other === pen ? stalled : other)) } });
    return this.view(playerId);
  }
  /** The partner's place is never left empty while a stall has someone in it: the first living bug steps up. */
  promote(playerId) {
    const bench = this.doc.bench[playerId];
    if (this.doc.pens[playerId] || !bench?.length) return;
    const next = bench.find((pen) => pen.stage === 'creature') || bench[0];
    this.commitDoc({ pens: { ...this.doc.pens, [playerId]: this.unstall(next) }, bench: { ...this.doc.bench, [playerId]: bench.filter((pen) => pen !== next) } });
  }

  /** Needs right now, from the last stored value and how long it's been (computed, never ticked on a timer). */
  needs(pen, now) { return this.needsAt(pen, this.own(pen, now)); }
  /** The same at a moment on the bug's own clock. */
  needsAt(pen, now) {
    const out = {};
    for (const s of STATS) {
      const v = pen.stats[s];
      let dt = Math.max(0, now - v.at);
      if (pen.feederUntil) dt -= Math.max(0, Math.min(now, pen.feederUntil) - Math.max(v.at, pen.feederFrom || 0)); // the feeder keeps all three where they were
      out[s] = Math.max(0, Math.min(100, v.v - (DECAY_PER_HOUR[s] * Math.max(0, dt)) / 3600e3));
    }
    return out;
  }
  hatchIfDue(playerId, pen, now, stalled = false) {
    if (pen.stage !== 'egg' || now < pen.hatchAt) return false;
    const at = pen.hatchAt;
    const name = this.newName(playerId, BY_ID[pen.species]);
    Object.assign(pen, { stage: 'creature', name, bornAt: at, fedAt: at, xp: this.startXp, dayXpAt: at, cool: {}, combatVersion: 1,
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 80, at }])), ...(stalled ? { benchedAt: at } : {}) });
    return true;
  }
  /** Day bonus: every full day alive (on its own clock) adds DAY_XP, if its needs averaged at least 25 at the end of that day, and `toyXp` for the toy it is left with. */
  accrue(pen, now, toyXp = 0) {
    now = this.own(pen, Math.min(now, pen.diedAt || Infinity));
    while (now - pen.dayXpAt >= 24 * 3600e3) {
      pen.dayXpAt += 24 * 3600e3;
      const n = this.needsAt(pen, pen.dayXpAt);
      if ((n.hunger + n.mood + n.clean) / 3 >= 25) pen.xp += DAY_XP;
      pen.xp += toyXp;
      if ((pen.feederUntil || 0) >= pen.dayXpAt && (pen.feederFrom || 0) < pen.dayXpAt) pen.xp += FEEDER_DAY_XP;
    }
  }
  /** Bring one bug up to date (the partner, or the one named) and hand it back. */
  refresh(playerId, bug) {
    this.applyBoutReward(playerId);
    this.promote(playerId);
    const pen = this.penOf(playerId, bug);
    if (!pen) { if (bug != null) throw new GameError('That bug is not in your barn.', 404); return null; }
    const now = this.now();
    let dirty = this.hatchIfDue(playerId, pen, now, pen !== this.doc.pens[playerId]);
    if (pen.stage === 'creature') {
      const before = pen.xp; const dies = this.deathAt(pen);
      if (now >= dies) { pen.diedAt = dies; }
      this.accrue(pen, now, pen === this.doc.pens[playerId] ? this.styleOf?.(playerId).toyXp || 0 : 0); dirty ||= pen.xp !== before; // the toy is in the terrarium, with the partner
      if (pen.diedAt) { pen.stage = 'dead'; dirty = true; }
    }
    if (dirty) this.save();
    return pen;
  }

  /** `seen` is the Barn page itself asking: it clears the "decided while you were away" flag and reports it once. */
  view(playerId, { seen = false } = {}) {
    this.fights.sweep();
    this.expireBouts();
    const player = this.store.players?.[playerId], unseenBout = seen && !!player?.barnBouts?.unseen;
    if (unseenBout) this.store.commitPlayerDrafts([{ ...player, barnBouts: { ...player.barnBouts, unseen: null } }]);
    const stable = this.stable(playerId);
    // `pen` is the partner, as every page that knows one bug expects; `lastBout` the newest fight of any of them.
    return { pen: stable.bugs.find((bug) => bug.partner) || null, serverNow: this.now(), stable, lastBout: stable.bugs.map((bug) => bug.lastBout).filter(Boolean).sort((a, b) => b.at - a.at)[0] || null,
      ...this.board(playerId), ...this.ring(playerId), unseenBout, live: this.fights.fightOf(playerId)?.id || null };
  }
  /** The stalls: how many, what the next one costs, and every bug in them as its owner sees it, partner first. */
  stable(playerId) {
    this.refresh(playerId);
    return { stalls: this.stalls(playerId), nextStall: STALL_COSTS[this.doc.stalls[playerId] || 0] ?? null, slow: BENCH_SLOW,
      bugs: this.bugs(playerId).map((pen) => idOf(pen)).map((id) => this.petView(playerId, id).pen) };
  }

  /** The ring: every living bug, the caller's challenges and the recent fights. The same for a player with no bug. */
  ring(playerId) {
    const now = this.now(), players = this.store.players || {}, corner = this.corner(playerId);
    const roster = Object.keys(this.doc.pens).flatMap((ownerId) => this.bugs(ownerId).flatMap((pen) => {
      const owner = players[ownerId];
      if (!owner || owner.hidden || pen.stage !== 'creature' || now >= this.deathAt(pen)) return [];
      const level = levelFor(pen.xp), theirs = ownerId !== playerId && !pen.faintedAt && level >= BOUT_LEVEL && corner.length ? this.fighter(ownerId, pen) : null;
      // What a visitor to the owner's room could already see, plus the record: never needs, XP or care history.
      return [{ id: idOf(pen), ownerId, owner: owner.name, name: pen.name, species: pen.species, level, style: this.looksOf(ownerId) || null,
        record: pen.record || { w: 0, l: 0, d: 0 }, fights: level >= BOUT_LEVEL, health: healthOf(pen), fainted: !!pen.faintedAt,
        ...(theirs ? { line: Object.fromEntries(corner.map(([id, mine]) => [id, line(mine, theirs)])) } : {}) }];
    })).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    // A challenge names both bugs (one sent before stalls means each owner's partner).
    const named = c => { const mine = this.penOf(c.from, c.fromBug), theirs = this.penOf(c.to, c.toBug);
      // `line` is the challenger's chance as the two stand now; `risk` what the challenged would put up against the stake
      const p = mine?.stage === 'creature' && theirs?.stage === 'creature' ? line(this.fighter(c.from, mine), this.fighter(c.to, theirs)) : null;
      return { ...c, fromName: players[c.from]?.name || 'Someone', toName: players[c.to]?.name || 'Someone', fromBug: mine ? idOf(mine) : null, toBug: theirs ? idOf(theirs) : null, fromBugName: mine?.name || 'A bug', toBugName: theirs?.name || 'a bug',
        ...(p ? { line: p, risk: riskFor(c.stake, p) } : {}) }; };
    return { roster,
      challenges: { incoming: this.doc.challenges.filter(c => c.to === playerId).map(named), outgoing: this.doc.challenges.filter(c => c.from === playerId).map(named) },
      fights: this.doc.fights.map(({ id, at, stake, pot, winner, sides }) => ({ id, at, pot: pot ?? cents(stake * 2), winner, sides: sides.map(({ ownerId, owner, fighter }) => ({ ownerId, owner, name: fighter.name, species: fighter.species, level: fighter.level })) })) };
  }

  /** The Barn button's count: challenges to this player, a fight decided while they were away, and (with a bug fit to fight) bouts anyone else has open. */
  challengeCount(playerId) {
    const now = this.now(), players = this.store.players || {};
    const canFight = this.bugs(playerId).some((pen) => pen.stage === 'creature' && !pen.faintedAt && levelFor(pen.xp) >= BOUT_LEVEL && now < this.deathAt(pen));
    return this.doc.challenges.filter(c => c.to === playerId && now < c.expiresAt).length + (players[playerId]?.barnBouts?.unseen ? 1 : 0) + (this.fights.fightOf(playerId) ? 1 : 0)
      + (canFight ? Object.values(players).filter(p => p.id !== playerId && p.barnBouts?.open && now < p.barnBouts.open.expiresAt).length : 0);
  }

  /** A recent fight as anyone may watch it: the bugs as drawn and the blows, without setups, condition or wallets. */
  fight(id) {
    const found = this.doc.fights.find(fight => fight.id === id);
    if (!found) throw new GameError('That fight has left the record.', 404);
    const [you, them] = found.sides.map(({ owner, fighter }) => ({ owner, name: fighter.name, species: fighter.species, level: fighter.level, style: fighter.style }));
    return { id: found.id, at: found.at, you, them, rounds: found.rounds, maxHp: found.maxHp, ...(found.startHp ? { startHp: found.startHp } : {}), pot: found.pot ?? cents(found.stake * 2),
      result: found.winner === null ? 'draw' : found.winner === 0 ? 'won' : 'lost' };
  }

  petView(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    const now = this.now();
    if (!pen) return { pen: null, serverNow: now };
    const which = { id: idOf(pen), partner: pen === this.doc.pens[playerId] };
    if (pen.stage === 'egg') return { pen: { ...which, stage: 'egg', eggAt: pen.eggAt, hatchAt: pen.hatchAt, warmCoolMs: Math.max(0, (pen.warmedAt || 0) + CARE.play.cooldownMs - now) }, serverNow: now };
    const c = BY_ID[pen.species];
    if (pen.stage === 'dead') return { pen: { ...which, stage: 'dead', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp), record: pen.record || { w: 0, l: 0, d: 0 } }, serverNow: now };
    const level = levelFor(pen.xp);
    const needs = this.needs(pen, now);
    const cool = Object.fromEntries(Object.entries(CARE).map(([k, a]) => [k, Math.max(0, (pen.cool[k] || 0) + a.cooldownMs - now)]));
    const dies = this.deathAt(pen); const warn = this.starving(pen, now);
    return { pen: { ...which, stage: 'creature', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt,
      fedAt: pen.fedAt, feederUntil: pen.feederUntil || 0, lunch: pen.lunch || null, style: this.looksOf(playerId) || null, gearBonus: this.styleOf?.(playerId).gearBonus || 0, starving: warn, diesInMs: warn ? Math.max(0, dies - now) : null,
      level, xp: pen.xp, xpThis: xpFor(level), xpNext: level >= 10 ? null : xpFor(level + 1),
      needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, Math.round(v)])), cool,
      abilities: movesFor(c.id, level, pen.legacyAbilities || 0), trait: traitFor(c.id),
      battle: battleFor(c.id, level, pen.legacyAbilities || 0, pen.battle),
      combat: { ...combatStats(level), stats: c.stats },
      arena: level >= BOUT_LEVEL, arenaLevel: BOUT_LEVEL, boutXp: BOUT_XP, boutWinXp: BOUT_XP + BOUT_WIN_XP, mood: moodWord(needs), record: pen.record || { w: 0, l: 0, d: 0 },
      title: pen.record?.w >= 5 ? 'Barn Menace' : null,
      fainted: !!pen.faintedAt, ...(pen.faintedAt ? { recoverMs: Math.max(0, pen.faintedAt + RECOVER_MS - now), healCost: FAST_HEAL_COST, faintedAt: pen.faintedAt, faintedBy: pen.faintedBy || null, faintedIn: pen.faintedIn || 'mines' } : {}),
      ...this.hpOf(pen, level),
      mineRecord: pen.mineRecord || { w: 0, l: 0 },
      lastBout: pen.lastBout || null }, serverNow: now };
  }

  /** HP for display: percent, points out of the level's max, and whether a nurse visit would help. */
  hpOf(pen, level = levelFor(pen.xp)) {
    const health = healthOf(pen), maxHp = combatStats(level).maxHp;
    return { health, hp: health === 0 ? 0 : maxHp, maxHp, hurt: health === 0 };
  }

  /** Feed, play or clean. Free, on a cooldown. */
  care(playerId, action, bug) {
    const a = CARE[action];
    if (!a) throw new GameError('The barn does not know how to do that.', 400);
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    const now = this.now();
    if (pen.stage === 'egg') {
      // The only thing you can do for an egg is keep it warm. It's for you; the egg doesn't care. Hatch time is fixed.
      if (action !== 'play') throw new GameError('It is an egg. Maybe just keep it warm.', 409);
      if (now - (pen.warmedAt || 0) < a.cooldownMs) throw new GameError('The egg is toasty. Give it a minute.', 429);
      pen.warmedAt = now; this.save();
      return this.view(playerId);
    }
    if (pen.stage === 'dead') throw new GameError('It is past caring now.', 409);
    if (now - (pen.cool[action] || 0) < a.cooldownMs) throw new GameError(`You just ${a.word} it. Give it a minute.`, 429);
    const n = this.needs(pen, now), own = this.own(pen, now); // needs and feeds are kept on the bug's own clock; cooldowns on the wall's
    for (const s of STATS) pen.stats[s] = { v: n[s], at: own }; // re-base all three, then bump one
    const toy = action === 'play' ? (this.styleOf?.(playerId).toyMood || 0) : 0; // store toy: capped at +20
    pen.stats[a.stat].v = Math.min(100, n[a.stat] + a.gain + toy);
    pen.cool[action] = now;
    if (action === 'feed') pen.fedAt = own;
    pen.xp += CARE_XP;
    this.save();
    return this.view(playerId);
  }

  /** Save an owned bug's unlocked moves; settings and fight rewards persist before becoming visible. */
  setBattle(playerId, settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.keys(settings).some((key) => key !== 'stance' && key !== 'bug') || !idOk(settings.bug)
      || typeof settings.stance !== 'string' || !Object.hasOwn(STANCES, settings.stance)) throw new GameError('Choose a stance: balanced, aggressive or defensive.', 400);
    const pen = this.refresh(playerId, settings.bug);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    this.expireBouts();
    if (this.store.players?.[playerId]?.barnBouts?.open) throw new GameError('Cancel your open bout before changing its setup.', 409);
    this.commitPen(playerId, { ...pen, battle: { stance: settings.stance } });
    return this.view(playerId);
  }

  bout() {
    throw new GameError('Choose an open bout or post your own on the bout board.', 409);
  }

  fighter(playerId, pen) {
    const level = levelFor(pen.xp);
    return { species: pen.species, name: pen.name, level, health: healthOf(pen),
      mood: Math.round(Math.min(...Object.values(this.needs(pen, this.now())))),
      gear: this.styleOf?.(playerId).gearBonus || 0, defense: this.styleOf?.(playerId).defenseBonus || 0, lunch: pen.lunch || null, style: this.looksOf(playerId),
      legacyAbilities: pen.legacyAbilities || 0, battle: battleFor(pen.species, level, pen.legacyAbilities || 0, pen.battle) };
  }

  /** Alive, standing and old enough to fight: the partner, or the bug named. One fight at a time per owner. */
  ready(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    if (pen.stage === 'dead') throw new GameError('It is resting. For good.', 409);
    if (pen.stage !== 'creature') throw new GameError('Eggs do not fight. Mostly.', 409);
    const level = levelFor(pen.xp);
    if (pen.faintedAt) throw new GameError(`${pen.name} fainted. Take it to the Bug Center first.`, 409);
    if (this.fights.fightOf(playerId)) throw new GameError('One of your bugs is in the ring right now.', 409);
    if (level < BOUT_LEVEL) throw new GameError(`Bouts open at level ${BOUT_LEVEL}.`, 409);
    return pen;
  }

  escrow(player) { return (player?.barnBouts?.open?.stake || 0) + (player?.barnBouts?.live?.stake || 0); }

  /** The caller's bugs that could step into the ring now, as the ring would take them: what each line on the board is worked out against. */
  corner(playerId) {
    const now = this.now();
    return this.bugs(playerId).filter((pen) => pen.stage === 'creature' && !pen.faintedAt && levelFor(pen.xp) >= BOUT_LEVEL && now < this.deathAt(pen)).map((pen) => [idOf(pen), this.fighter(playerId, pen)]);
  }
  /**
   * Both stakes for a fight: side 0 named `stake`, side 1's follows the line as the two bugs stand now. When the
   * page says what its owner `agreed` to put up, it must still be that.
   */
  terms(stake, fighters, agreed) {
    const risk = riskFor(stake, line(...fighters));
    if (agreed !== undefined && agreed !== risk) throw new GameError(`The line moved: your stake is now $${risk.toFixed(2)}. Look again.`, 409);
    return [stake, risk];
  }

  board(playerId) {
    const player = this.store.players?.[playerId], corner = this.corner(playerId);
    const bouts = Object.values(this.store.players || {}).flatMap(p => {
      const open = p.barnBouts?.open;
      if (!open) return [];
      const { petBornAt, ...shown } = open;
      const posted = this.bugs(p.id).find((kept) => kept.bornAt === petBornAt);
      const fighter = { ...open.fighter, health: healthOf(posted) };
      // for someone else's bout: each of your bugs' chance against it, and what joining with that bug would cost
      const host = p.id !== playerId && corner.length && posted && { ...fighter, lunch: posted.lunch || null };
      return [{ ...shown, fighter, hostName: p.name, ...(host ? { terms: Object.fromEntries(corner.map(([id, mine]) => { const q = line(host, mine); return [id, { win: (100 - Math.round(q * 100)) / 100, risk: riskFor(open.stake, q) }]; })) } : {}) }];
    }).sort((a, b) => a.openedAt - b.openedAt);
    return { bouts, openBout: bouts.find(bout => bout.hostId === playerId) || null,
      bankroll: player?.bankroll ?? null, maxStake: MAX_BOUT_STAKE, stakeStep: BOUT_STAKE_STEP };
  }

  /** The wallet receipt commits with the payout; the pet catches up once even after a restart. */
  applyBoutReward(playerId) {
    const receipt = this.store.players?.[playerId]?.barnBouts?.lastBout;
    const pen = receipt && this.bugs(playerId).find((kept) => kept.bornAt === receipt.petBornAt); // whichever of them fought
    if (!pen || pen.settledBoutId === receipt.id) return;
    const { petBornAt: _petBornAt, ...replay } = receipt;
    const next = structuredClone(pen);
    next.xp += receipt.xpEarned;
    next.record ||= { w: 0, l: 0, d: 0 };
    next.record[receipt.result === 'won' ? 'w' : receipt.result === 'lost' ? 'l' : 'd']++;
    if (receipt.healthAfter === 0) {
      next.faintedAt = receipt.at;
      next.faintedBy = receipt.owners?.[1]?.name || receipt.them?.name || null;
      next.faintedIn = 'ring';
    }
    next.lastBout = replay;
    next.settledBoutId = receipt.id;
    // The ring's public record rides on the first pet reward, so it needs no write of its own and survives the
    // same failures: whichever participant catches up first records the fight, as seen from their corner.
    const logged = !receipt.owners || this.doc.fights.some(fight => fight.id === receipt.id);
    const fights = logged ? this.doc.fights : [{ id: receipt.id, at: receipt.at, pot: cents(receipt.stake + (receipt.against ?? receipt.stake)), maxHp: receipt.maxHp, ...(receipt.startHp ? { startHp: receipt.startHp } : {}), rounds: receipt.rounds,
      winner: receipt.result === 'won' ? 0 : receipt.result === 'lost' ? 1 : null,
      sides: [receipt.you, receipt.them].map((fighter, i) => ({ ownerId: receipt.owners[i].id, owner: receipt.owners[i].name, fighter })) }, ...this.doc.fights].slice(0, FIGHT_LOG);
    this.commitDoc({ ...this.slot(playerId, next), fights });
  }

  refundOpen(player) {
    const open = player.barnBouts.open;
    const draft = { ...player, barnBouts: { ...player.barnBouts, open: null, closedId: open.id } };
    if (open.stake) this.accounts.change(draft, open.stake, 'barn-refund', 'Barn bout: stake returned', { save: false });
    this.store.commitPlayerDrafts([draft]);
  }

  expireBouts() {
    for (const player of Object.values(this.store.players || {})) {
      const live = player.barnBouts?.live;
      if (live && !this.fights.get(live.id)) this.refundLive(player);
      const open = player.barnBouts?.open;
      if (!open) continue;
      const pen = this.bugs(player.id).find((kept) => kept.bornAt === open.petBornAt);
      if (this.now() >= open.expiresAt || !pen || pen.stage !== 'creature' || pen.faintedAt || this.now() >= this.deathAt(pen)) this.refundOpen(player);
    }
    // Challenges hold no money, so a stale one is simply dropped: past its day, or either bug gone.
    const alive = (id, bug) => { const pen = this.penOf(id, bug); return !!this.store.players?.[id] && pen?.stage === 'creature' && this.now() < this.deathAt(pen); };
    const kept = this.doc.challenges.filter(c => this.now() < c.expiresAt && alive(c.from, c.fromBug) && alive(c.to, c.toBug));
    if (kept.length !== this.doc.challenges.length) this.commitDoc({ challenges: kept });
  }

  /** Call out another player's bug. Nothing is held: both stakes are checked and taken only if the owner accepts. */
  challenge(playerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['to', 'stake', 'bug', 'their'].includes(key)) || typeof body.to !== 'string' || !idOk(body.bug) || !idOk(body.their)
      || typeof body.stake !== 'number' || !Number.isFinite(body.stake) || body.stake < 0 || body.stake > MAX_BOUT_STAKE || body.stake % BOUT_STAKE_STEP !== 0) {
      throw new GameError(`Name a bug's owner and a stake from $0 to $${MAX_BOUT_STAKE}, in steps of $${BOUT_STAKE_STEP}.`, 400);
    }
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]), target = this.store.players[body.to];
    if (body.to === playerId) throw new GameError('Your bug cannot fight itself. It has tried.', 409);
    const theirs = target && !target.hidden ? this.penOf(body.to, body.their) : null;
    if (!theirs || theirs.stage !== 'creature' || this.now() >= this.deathAt(theirs)) throw new GameError('There is no bug there to challenge.', 404);
    if (levelFor(theirs.xp) < BOUT_LEVEL) throw new GameError(`That bug is too young. Bouts open at level ${BOUT_LEVEL}.`, 409);
    const pen = this.ready(playerId, body.bug);
    const mine = this.doc.challenges.filter(c => c.from === playerId), same = mine.find(c => c.to === body.to && this.penOf(c.to, c.toBug) === theirs);
    if (same) {
      if (same.stake !== body.stake) throw new GameError('Withdraw your challenge to that bug before changing it.', 409);
      return this.view(playerId);
    }
    this.accounts.requireFunds(player, body.stake, 'this challenge');
    const now = this.now(), made = { id: crypto.randomUUID(), from: playerId, to: body.to, fromBug: idOf(pen), toBug: idOf(theirs), stake: body.stake, at: now, expiresAt: now + CHALLENGE_OPEN_MS };
    this.commitDoc({ challenges: [...this.doc.challenges, made] });
    // Tell the owner, if they have alerts on. The challenge is already saved, so a failed alert changes nothing.
    try {
      this.onChallenge?.({ id: made.id, toId: body.to, from: player.name, bug: pen.name, species: BY_ID[pen.species].name, level: levelFor(pen.xp), yours: theirs.name, stake: made.stake,
        risk: riskFor(made.stake, line(this.fighter(playerId, pen), this.fighter(body.to, theirs))) });
    } catch { /* an alert must never undo or fail a challenge */ }
    return this.view(playerId);
  }

  /** Withdraw a challenge you sent or decline one you were sent. Asking twice is harmless. */
  dropChallenge(playerId, id) {
    const found = this.doc.challenges.find(c => c.id === id);
    if (found && found.from !== playerId && found.to !== playerId) throw new GameError('That is not your challenge.', 404);
    if (found) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
    return this.view(playerId);
  }

  /** The challenged owner takes it: both stakes are checked now and the fight is decided at once. */
  acceptChallenge(playerId, id, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'risk') || (body.risk !== undefined && typeof body.risk !== 'number')) throw new GameError('Accept the stake as shown.', 400);
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    const found = this.doc.challenges.find(c => c.id === id);
    if (this.fights.fightOf(playerId)?.id === id) return this.view(playerId); // a second tap while it is on
    if (player.barnBouts?.lastBout?.id === id) { // a retry after the fight was paid
      if (found) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
      return this.view(playerId);
    }
    if (!found || found.to !== playerId) throw new GameError('That challenge has expired or been withdrawn.', 409);
    const rival = this.accounts.ensure(this.store.players[found.from]);
    if (player.barnBouts?.open) throw new GameError('Cancel your open bout before taking a challenge.', 409);
    if (rival.barnBouts?.open) throw new GameError(`${rival.name} has a bout posted and cannot take this one yet.`, 409);
    let rivalPen;
    try { rivalPen = this.ready(found.from, found.fromBug); } catch (error) {
      if (!(error instanceof GameError)) throw error;
      throw new GameError(`${rival.name}'s bug is not ready. ${error.message}`, error.status);
    }
    const pen = this.ready(playerId, found.toBug);
    const fighters = [this.fighter(found.from, rivalPen), this.fighter(playerId, pen)], stakes = this.terms(found.stake, fighters, body.risk);
    this.accounts.requireFunds(player, stakes[1], 'this bout');
    if (rival.bankroll + 1e-9 < found.stake) throw new GameError(`${rival.name} can no longer cover that stake.`, 409);
    this.startFight(id, [{ player: rival, pen: rivalPen, fighter: fighters[0] }, { player, pen, fighter: fighters[1] }], stakes, false, playerId);
    return this.view(playerId);
  }

  /**
   * Both bugs go to the ring. Every stake is held now, in one players.json write, so nobody can spend theirs while
   * the fight is on. Side 0 posted the bout or sent the challenge and named `stakes[0]`; `held` says that is already
   * in escrow. `stakes[1]` is what the line asked of the other corner (terms).
   * `watcher` took the fight and is looking at it; the other owner's bug fights on its own until they turn up.
   */
  startFight(id, sides, stakes, held, watcher) {
    const now = this.now(), seed = `${now}:${this.eggInt(1e9)}`;
    const drafts = sides.map(({ player: p }, side) => {
      const stake = stakes[side], draft = { ...p, barnBouts: { ...p.barnBouts, open: null, live: { id, stake, at: now } } };
      if (stake && (side === 1 || !held)) this.accounts.change(draft, -stake, 'barn-stake', 'Barn bout: stake held', { save: false });
      return draft;
    });
    this.store.commitPlayerDrafts(drafts);
    if (this.doc.challenges.some(c => c.id === id)) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
    const entrants = sides.map(({ player, pen, fighter }) => ({ id: player.id, bornAt: pen.bornAt, fighter }));
    this.fights.start({ id, kind: 'barn', players: entrants.map(e => e.id), fighters: entrants.map(e => e.fighter), seed, watching: [watcher],
      onFinish: (fight) => this.settle(fight, entrants, stakes, seed) });
  }

  /**
   * The fight is over: pay the pot and write both reward receipts in one players.json write, then let each pet catch
   * up. An owner who was not watching at the end gets the result flagged until they open the Barn.
   */
  settle(fight, entrants, stakes, seed) {
    const now = this.now(), id = fight.id, winner = fight.over.winner, { rounds, maxHp, startHp, hp: endHp } = fight.S;
    const fighters = entrants.map(e => e.fighter);
    entrants.forEach((e, side) => { if (fight.S.side[side].ate) this.lunchEaten(e.id, e.bornAt); });
    const drafts = entrants.flatMap((e, side) => {
      const p = this.store.players[e.id];
      if (!p) return []; // the account was deleted mid-fight
      const xp = this.bugs(e.id).find((kept) => kept.bornAt === e.bornAt)?.xp || 0;
      const stake = stakes[side], against = stakes[1 - side], odds = this.fights.lineOf(fight, side); // this bug's chance as it walked in
      const xpEarned = BOUT_XP + (winner === side ? upsetXp(BOUT_WIN_XP, odds) : 0);
      const payout = winner === null ? stake : winner === side ? cents(stake + against) : 0;
      const healthAfter = endHp[side] > 0 ? 100 : 0;
      const receipt = { version: 5, id, at: now, seed, petBornAt: e.bornAt, healthAfter,
        startHp: side === 0 ? startHp : [...startHp].reverse(),
        you: fighters[side], them: fighters[1 - side],
        rounds: side === 0 ? rounds : rounds.map(round => ({ ...round, by: 1 - round.by, hp: [...round.hp].reverse() })),
        maxHp: side === 0 ? maxHp : [...maxHp].reverse(), xpEarned,
        levelBefore: levelFor(xp), levelAfter: levelFor(xp + xpEarned),
        result: winner === null ? 'draw' : winner === side ? 'won' : 'lost', line: odds, stake, against, payout, net: cents(payout - stake),
        owners: [side, 1 - side].map(i => ({ id: entrants[i].id, name: this.store.players[entrants[i].id]?.name || 'A former member' })) };
      const draft = { ...this.accounts.ensure(p), barnBouts: { ...p.barnBouts, live: null, lastBout: receipt, ...(fight.over.watched[side] ? {} : { unseen: id }) } };
      if (payout) this.accounts.change(draft, payout, winner === null ? 'barn-refund' : 'barn-win', winner === null ? 'Barn bout: draw, stake returned' : 'Barn bout: won the pot', { save: false });
      return [draft];
    });
    // Both wallets and their reward receipts must land in the same atomic players.json write.
    this.store.commitPlayerDrafts(drafts);
    for (const e of entrants) this.applyBoutReward(e.id);
  }

  /** A held stake whose fight is gone (the server restarted mid-fight): nobody won, so it goes back. */
  refundLive(player) {
    const live = player.barnBouts.live;
    const draft = { ...player, barnBouts: { ...player.barnBouts, live: null } };
    if (live.stake) this.accounts.change(draft, live.stake, 'barn-refund', 'Barn bout: called off, stake returned', { save: false });
    this.store.commitPlayerDrafts([draft]);
  }

  /** The fight your bug is in (or just finished), from your corner. `have` is how many blows the page already holds. */
  liveFight(playerId, id, have) {
    this.fights.sweep();
    const fight = this.fights.get(String(id || '')) || this.fights.fightOf(playerId);
    if (!fight || fight.kind !== 'barn' || this.fights.sideOf(fight, playerId) < 0) return { fight: null };
    return { fight: this.fights.view(fight, playerId, have) };
  }
  /** Line up your bug's next moves (up to three). It picks for itself whenever the list is empty or a move is not ready. */
  lineUp(playerId, id, body) {
    this.fights.sweep();
    const fight = this.fights.get(String(id || ''));
    if (!fight || fight.over || fight.kind !== 'barn' || this.fights.sideOf(fight, playerId) < 0) throw new GameError('That fight is over.', 409);
    if (!body || typeof body !== 'object' || !this.fights.line(fight, playerId, body.moves)) throw new GameError('Line up to three of your bug\'s own moves.', 400);
    return { fight: this.fights.view(fight, playerId, body.have) };
  }

  openBout(playerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'stake' && key !== 'bug') || !idOk(body.bug)
      || typeof body.stake !== 'number' || !Number.isFinite(body.stake) || body.stake < 0 || body.stake > MAX_BOUT_STAKE || body.stake % BOUT_STAKE_STEP !== 0) {
      throw new GameError(`Choose a stake from $0 to $${MAX_BOUT_STAKE}, in steps of $${BOUT_STAKE_STEP}.`, 400);
    }
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.open) {
      if (player.barnBouts.open.stake !== body.stake) throw new GameError('Cancel your open bout before posting another.', 409);
      return this.view(playerId);
    }
    const pen = this.ready(playerId, body.bug);
    this.accounts.requireFunds(player, body.stake, 'this bout');
    const now = this.now();
    const open = { id: crypto.randomUUID(), hostId: playerId, fighter: this.fighter(playerId, pen),
      petBornAt: pen.bornAt, stake: body.stake, openedAt: now, expiresAt: now + BOUT_OPEN_MS };
    const draft = { ...player, barnBouts: { ...player.barnBouts, open } };
    if (open.stake) this.accounts.change(draft, -open.stake, 'barn-stake', 'Barn bout: stake held', { save: false });
    this.store.commitPlayerDrafts([draft]);
    return this.view(playerId);
  }

  cancelBout(playerId, id) {
    this.expireBouts();
    const player = this.store.players[playerId];
    if (player.barnBouts?.closedId === id) return this.view(playerId);
    if (player.barnBouts?.open?.id !== id) throw new GameError('That is not your open bout.', 404);
    this.refundOpen(player);
    return this.view(playerId);
  }

  joinBout(playerId, id, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'bug' && key !== 'risk') || !idOk(body.bug) || (body.risk !== undefined && typeof body.risk !== 'number')) throw new GameError('Join the posted stake as shown.', 400);
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.lastBout?.id === id || this.fights.fightOf(playerId)?.id === id) return this.view(playerId);
    const host = Object.values(this.store.players).find(p => p.barnBouts?.open?.id === id);
    if (!host) throw new GameError('That bout has already filled, expired or been cancelled.', 409);
    if (host.id === playerId) throw new GameError('Your bug cannot fight itself. It has tried.', 409);
    if (player.barnBouts?.open) throw new GameError('Cancel your open bout before joining another.', 409);
    const open = host.barnBouts.open, posted = this.bugs(host.id).find((kept) => kept.bornAt === open.petBornAt);
    const hostPen = this.ready(host.id, posted && idOf(posted)), guestPen = this.ready(playerId, body.bug);
    const fighters = [{ ...open.fighter, health: healthOf(hostPen), lunch: hostPen.lunch || null }, this.fighter(playerId, guestPen)], stakes = this.terms(open.stake, fighters, body.risk);
    this.accounts.requireFunds(player, stakes[1], 'this bout');
    this.startFight(id, [{ player: host, pen: hostPen, fighter: fighters[0] }, { player, pen: guestPen, fighter: fighters[1] }], stakes, true, playerId);
    return this.view(playerId);
  }

  /** Can this bug fight or guide right now? (hatched, alive, not fainted) */
  fit(playerId) {
    const pen = this.doc.pens[playerId];
    return pen?.stage === 'creature' && !pen.faintedAt && !(this.now() >= this.deathAt(pen));
  }
  /** A guide bug led its miner to a pool with acid in it: a little XP. */
  foundAcid(playerId) {
    if (!this.fit(playerId)) return;
    const pen = this.doc.pens[playerId];
    this.commitPen(playerId, { ...pen, xp: (pen.xp || 0) + FIND_XP });
  }
  /**
   * A mine bug battle's result for one bug (pvp.js calls this while settling the raid). Idempotent per battle id, and
   * only for the same bug that fought (`bornAt`): a bug laid to rest and replaced since gets nothing. The winner gains
   * a win bonus; a loser that fought to the end gains BATTLE_XP even if it was knocked out.
   */
  battleResult(playerId, { battleId, bornAt, won, fought = true, fainted = false, foeName = null, odds = 0.5 }) {
    const pen = this.doc.pens[playerId];
    if (!pen || pen.stage !== 'creature' || pen.bornAt !== bornAt) return { xp: 0, fainted: false, skipped: true };
    if ((pen.mineBattles || []).includes(battleId)) return { xp: pen.lastMineBattle?.xp || 0, fainted, levelBefore: pen.lastMineBattle?.levelBefore, levelAfter: pen.lastMineBattle?.levelAfter, repeat: true };
    const next = structuredClone(pen);
    const bonus = won ? upsetXp(WIN_BONUS_XP, odds) : 0, xp = won ? BATTLE_XP + bonus : fought ? BATTLE_XP : 0; // `odds`: this bug's chance by the line
    const levelBefore = levelFor(next.xp || 0);
    next.xp = (next.xp || 0) + xp;
    next.mineRecord = { w: (next.mineRecord?.w || 0) + (won ? 1 : 0), l: (next.mineRecord?.l || 0) + (won ? 0 : 1) };
    if (fainted) { next.faintedAt = this.now(); next.faintedBy = foeName; next.faintedIn = 'mines'; }
    next.mineBattles = [...(next.mineBattles || []), battleId].slice(-20);
    next.lastMineBattle = { id: battleId, won, xp, levelBefore, levelAfter: levelFor(next.xp), at: this.now() };
    this.commitPen(playerId, next);
    return { xp, bonus, fainted, levelBefore, levelAfter: levelFor(next.xp) };
  }
  /** The nurse treats a knockout for free after RECOVER_MS or immediately for FAST_HEAL_COST. */
  heal(playerId, { pay = false, bug } = {}) {
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. The nurse has nobody to heal.', 404);
    if (pen.stage === 'egg') throw new GameError('Eggs do not faint. The nurse pats it anyway.', 409);
    if (pen.stage === 'dead') throw new GameError('The Bug Center cannot help with that one. Lay it to rest.', 409);
    const was = !!pen.faintedAt;
    const waitMs = pen.faintedAt ? pen.faintedAt + RECOVER_MS - this.now() : 0;
    let cost = 0;
    if (waitMs > 0) {
      if (!pay) throw new GameError(`${pen.name} needs ${Math.ceil(waitMs / 60e3)} more minutes of rest. Or $${FAST_HEAL_COST} gets it up now.`, 409);
      const player = this.accounts.ensure(this.store.players[playerId]);
      this.accounts.requireFunds(player, FAST_HEAL_COST, 'expedited recovery');
      this.accounts.change(player, -FAST_HEAL_COST, 'barn-heal', 'Bug Center: expedited recovery');
      cost = FAST_HEAL_COST;
    }
    if (was) {
      const { faintedAt: _f, faintedBy: _b, faintedIn: _i, health: _h, ...rest } = pen;
      this.commitPen(playerId, { ...rest, healedAt: this.now(), heals: (pen.heals || 0) + 1 });
    }
    return { ...this.view(playerId), healed: was, cost };
  }
  /** Store looks for a bug (skin palette, hat, accessory, equipped battle gear), for drawing only. */
  looksOf(playerId) {
    const st = this.styleOf?.(playerId) || {};
    const o = {}; for (const k of ['bugskin', 'bughat', 'bugacc']) if (st[k]) o[k] = st[k];
    for (const k of ['gear', 'defense']) if (typeof st[k] === 'string' && st[k].startsWith('gear-')) o[k] = { id: st[k], shape: st[k].slice(5) };
    return Object.keys(o).length ? o : undefined;
  }
  /** After a death: lay it to rest. The stall empties (a new egg can turn up in the mines); a small grave record stays. */
  bury(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    if (!pen || pen.stage !== 'dead') throw new GameError('There is nothing to bury. Good.', 409);
    (this.doc.graves[playerId] ||= []).push({ name: pen.name, species: pen.species, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp) });
    this.doc.graves[playerId] = this.doc.graves[playerId].slice(-10);
    if (pen === this.doc.pens[playerId]) delete this.doc.pens[playerId]; else this.doc.bench[playerId] = this.doc.bench[playerId].filter((kept) => kept !== pen);
    this.save();
    return { ...this.view(playerId), graves: this.doc.graves[playerId] };
  }
  /** A fight is over and this bug ate its packed lunch in it: the lunch is gone. Only for the bug that fought. */
  lunchEaten(playerId, bornAt) {
    const pen = this.bugs(playerId).find((kept) => kept.bornAt === bornAt); // a stalled bug can step into a Barn bout
    if (!pen?.lunch) return;
    const { lunch: _lunch, ...rest } = pen;
    this.commitPen(playerId, rest);
  }
  /**
   * A store consumable: bump one need and earn `xp` care XP (food also counts as a feed). Food leaves a `lunch`
   * ({ name, heal }) for the bug's next fight; it carries one, and keeps the bigger.
   */
  boost(playerId, { stat, gain, fed = false, xp = fed ? CARE_XP : 0, lunch = null }) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    const now = this.now(); const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats[stat].v = Math.min(100, n[stat] + Math.max(0, Math.min(100, gain)));
    if (fed) pen.fedAt = now;
    if (xp > 0) pen.xp += xp;
    if (lunch?.heal > 0 && lunch.heal >= (pen.lunch?.heal || 0)) pen.lunch = { name: lunch.name, heal: lunch.heal };
    this.save();
    return this.view(playerId);
  }
  /** Automatic feeder (bought in the General Store): fills Fed, Mood and Clean, keeps them full and pauses the starvation clock for `ms`. */
  addFeeder(playerId, ms) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('The feeder needs a hatched bug to feed.', 409);
    const now = this.now();
    for (const st of STATS) pen.stats[st] = { v: 100, at: now };
    if (!pen.feederUntil || pen.feederUntil < now) { pen.feederFrom = now; pen.feederUntil = now; }
    pen.feederUntil += ms; this.save();
    return this.view(playerId);
  }
  forget(playerId) { // account deleted: the barn goes with it; its name stays retired so it's never reused
    if (!this.has(playerId)) return;
    delete this.doc.pens[playerId]; delete this.doc.bench[playerId]; delete this.doc.stalls[playerId]; delete this.doc.graves[playerId]; this.save();
  }
}
function moodWord(n) {
  const low = Math.min(n.hunger, n.mood, n.clean);
  if (low >= 70) return 'thriving';
  if (low >= 40) return 'content';
  if (low >= 15) return n.hunger === low ? 'peckish' : n.mood === low ? 'bored' : 'grubby';
  return 'sulking';
}
