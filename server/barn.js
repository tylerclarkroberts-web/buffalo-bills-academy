// The Barn (v30): one egg or creature per account, raised in real time. The server decides everything:
// whether a mine shift has an egg (mines.js), which creature is inside (rolled at pickup, hidden until it hatches),
// when it hatches, how its needs decay, and its level. Bouts stake play money; bugs cannot be sold or traded.
// v33: residents are real bugs (engine/bugs.js); old hybrid rows are migrated once, quietly, on load.
// v33: bugs can die of neglect, tamagotchi-style, but only slowly: STARVE_MS (21 days) after the last feed (or the
// end of an automatic feeder's run). Warnings start at 7 days. Death is computed from stored times, never a timer,
// so a server restart can't cause or skip one. A dead bug leaves a gravestone until it's laid to rest; then the
// stall is empty and a new egg can turn up in the mines.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { ROSTER, BY_ID, levelFor, xpFor } from './engine/creatures.js';
import { simulateBout } from './engine/bout.js';
import { movesFor, battleFor, combatStats, STANCES } from './engine/bug-combat.js';
import { cents } from './accounts.js';

export const EGG_CHANCE = 10000; // out of 100,000 shifts (10%), for players with an empty barn
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
export const CARE_XP = 12;   // per care action...
export const CARE_XP_PER_DAY = 120; // ...shared with store care, per UTC day
export const DAY_XP = 10;    // per full day since hatching, while it's not neglected
export const BOOST_XP = 6;   // a store mister or heat lamp: half a care action, inside the same daily cap
export const FEEDER_DAY_XP = 12; // per full day an automatic feeder covers: one feed's worth, so paying for it still levels the bug
export const BOUT_LEVEL = 3;
export const BOUT_XP = 20;
export const BOUT_COOLDOWN_MS = 60 * 60e3; // one bout an hour
export const BOUT_OPEN_MS = 60 * 60e3;
export const MAX_BOUT_STAKE = 10000;
const STATS = ['hunger', 'mood', 'clean'];
const ORDINALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => (n <= 10 ? ORDINALS[n - 1] : String(n));

export class Barn {
  constructor({ store, accounts, now, incubateMs, eggInt, forceEgg = false, startXp = 0, starveMs } = {}) {
    // starveMs: dev/e2e only (BARN_TEST_STARVE_MS), shrinks the whole neglect timeline proportionally
    this.starveMs = Number(starveMs) > 0 ? Number(starveMs) : STARVE_MS; this.k = this.starveMs / STARVE_MS;
    this.store = store; this.accounts = accounts; this.now = now; this.forceEgg = !!forceEgg; this.startXp = Math.max(0, Number(startXp) || 0);
    this.incubateMs = Number(incubateMs) > 0 ? Number(incubateMs) : DEFAULT_INCUBATE_MS;
    this.eggInt = eggInt || ((n) => crypto.randomInt(n)); // its own random source: never the mine's pay or vein ones
    this.doc = store.loadDoc('barn', { pens: {}, names: {}, count: {} });
    this.doc.pens ||= {}; this.doc.names ||= {}; this.doc.count ||= {}; this.doc.graves ||= {};
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
    return Math.max(fed + this.starveMs, (pen.bornAt || 0) + MIN_LIFE_MS * this.k, (pen.migratedAt || 0) + MIN_LIFE_MS * this.k);
  }
  starving(pen, now) { // 0 fine, 1 hungry, 2 weak, 3 critical
    const since = now - Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    return WARN_MS.filter((w) => since >= w * this.k).length;
  }
  save() { this.store.saveDoc('barn', this.doc); }
  commitPen(playerId, pen) {
    const next = { ...this.doc, pens: { ...this.doc.pens, [playerId]: pen } };
    this.store.saveDoc('barn', next);
    this.doc = next;
  }
  has(playerId) { return !!this.doc.pens[playerId]; }

  /** At clock-in: does this shift have an egg in it? Only ever for a player whose barn is empty. */
  rollEgg(playerId) { return !this.has(playerId) && (this.forceEgg || this.eggInt(100000) < EGG_CHANCE); }

  /** Picking the egg up in the mine. Which creature is inside is decided now and kept secret until it hatches. */
  layEgg(playerId) {
    if (this.has(playerId)) throw new GameError('Your barn already has a resident. One per rancher.', 409);
    const now = this.now();
    const species = ROSTER[this.eggInt(ROSTER.length)].id;
    this.doc.pens[playerId] = { stage: 'egg', species, eggAt: now, hatchAt: now + this.incubateMs, warmedAt: 0 };
    this.save();
    return this.view(playerId);
  }

  /** Needs right now, from the last stored value and how long it's been (computed, never ticked on a timer). */
  needs(pen, now) {
    const out = {};
    for (const s of STATS) {
      const v = pen.stats[s];
      let dt = Math.max(0, now - v.at);
      if (s === 'hunger' && pen.feederUntil) dt -= Math.max(0, Math.min(now, pen.feederUntil) - Math.max(v.at, pen.feederFrom || 0)); // the feeder keeps the bowl full
      out[s] = Math.max(0, Math.min(100, v.v - (DECAY_PER_HOUR[s] * Math.max(0, dt)) / 3600e3));
    }
    return out;
  }
  hatchIfDue(playerId, pen, now) {
    if (pen.stage !== 'egg' || now < pen.hatchAt) return false;
    const at = pen.hatchAt;
    const name = this.newName(playerId, BY_ID[pen.species]);
    Object.assign(pen, { stage: 'creature', name, bornAt: at, fedAt: at, xp: this.startXp, dayXpAt: at, cool: {}, combatVersion: 1,
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 80, at }])) });
    return true;
  }
  /** Day bonus: every full day alive adds DAY_XP, if its needs averaged at least 25 at the end of that day. */
  accrue(pen, now) {
    now = Math.min(now, pen.diedAt || Infinity);
    while (now - pen.dayXpAt >= 24 * 3600e3) {
      pen.dayXpAt += 24 * 3600e3;
      const n = this.needs(pen, pen.dayXpAt);
      if ((n.hunger + n.mood + n.clean) / 3 >= 25) pen.xp += DAY_XP;
      if ((pen.feederUntil || 0) >= pen.dayXpAt && (pen.feederFrom || 0) < pen.dayXpAt) pen.xp += FEEDER_DAY_XP;
    }
  }
  refresh(playerId) {
    this.applyBoutReward(playerId);
    const pen = this.doc.pens[playerId]; if (!pen) return null;
    const now = this.now();
    let dirty = this.hatchIfDue(playerId, pen, now);
    if (pen.stage === 'creature') {
      const before = pen.xp; const dies = this.deathAt(pen);
      if (now >= dies) { pen.diedAt = dies; }
      this.accrue(pen, now); dirty ||= pen.xp !== before;
      if (pen.diedAt) { pen.stage = 'dead'; dirty = true; }
    }
    if (dirty) this.save();
    return pen;
  }

  view(playerId) {
    this.expireBouts();
    return { ...this.petView(playerId), ...this.board(playerId) };
  }

  petView(playerId) {
    const pen = this.refresh(playerId);
    const now = this.now();
    if (!pen) return { pen: null, serverNow: now };
    if (pen.stage === 'egg') return { pen: { stage: 'egg', eggAt: pen.eggAt, hatchAt: pen.hatchAt, warmCoolMs: Math.max(0, (pen.warmedAt || 0) + CARE.play.cooldownMs - now) }, serverNow: now };
    const c = BY_ID[pen.species];
    if (pen.stage === 'dead') return { pen: { stage: 'dead', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp), record: pen.record || { w: 0, l: 0, d: 0 } }, serverNow: now };
    const level = levelFor(pen.xp);
    const needs = this.needs(pen, now);
    const cool = Object.fromEntries(Object.entries(CARE).map(([k, a]) => [k, Math.max(0, (pen.cool[k] || 0) + a.cooldownMs - now)]));
    const dies = this.deathAt(pen); const warn = this.starving(pen, now);
    return { pen: { stage: 'creature', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt,
      fedAt: pen.fedAt, feederUntil: pen.feederUntil || 0, style: this.looksOf(playerId) || null, gearBonus: this.styleOf?.(playerId).gearBonus || 0, starving: warn, diesInMs: warn ? Math.max(0, dies - now) : null,
      level, xp: pen.xp, xpThis: xpFor(level), xpNext: level >= 10 ? null : xpFor(level + 1),
      needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, Math.round(v)])), cool,
      abilities: movesFor(c.id, level, pen.legacyAbilities || 0),
      battle: battleFor(c.id, level, pen.legacyAbilities || 0, pen.battle),
      combat: { ...combatStats(level), stats: c.stats },
      arena: level >= BOUT_LEVEL, arenaLevel: BOUT_LEVEL, boutXp: BOUT_XP, mood: moodWord(needs), record: pen.record || { w: 0, l: 0, d: 0 },
      title: pen.record?.w >= 5 ? 'Barn Menace' : null,
      boutCoolMs: Math.max(0, (pen.boutAt || 0) + BOUT_COOLDOWN_MS - now), lastBout: pen.lastBout || null }, serverNow: now };
  }

  /** Feed, play or clean. Free, on a cooldown. */
  care(playerId, action) {
    const a = CARE[action];
    if (!a) throw new GameError('The barn does not know how to do that.', 400);
    const pen = this.refresh(playerId);
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
    const n = this.needs(pen, now);
    const day = Math.floor(now / 86400e3);
    if (pen.xpDay !== day) { pen.xpDay = day; pen.xpToday = 0; }
    for (const s of STATS) pen.stats[s] = { v: n[s], at: now }; // re-base all three, then bump one
    const toy = action === 'play' ? (this.styleOf?.(playerId).toyMood || 0) : 0; // store toy: capped at +20
    pen.stats[a.stat].v = Math.min(100, n[a.stat] + a.gain + toy);
    pen.cool[action] = now;
    if (action === 'feed') pen.fedAt = now;
    const gain = Math.min(CARE_XP, CARE_XP_PER_DAY - pen.xpToday);
    if (gain > 0) { pen.xp += gain; pen.xpToday += gain; }
    this.save();
    return this.view(playerId);
  }

  /** Save an owned bug's unlocked moves; settings and fight rewards persist before becoming visible. */
  setBattle(playerId, settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.keys(settings).some((key) => !['stance', 'specials'].includes(key))
      || typeof settings.stance !== 'string' || !Object.hasOwn(STANCES, settings.stance)
      || !Array.isArray(settings.specials) || settings.specials.length > 2
      || new Set(settings.specials).size !== settings.specials.length) throw new GameError('Choose a fighting style and up to two different unlocked specials.', 400);
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    this.expireBouts();
    if (this.store.players?.[playerId]?.barnBouts?.open) throw new GameError('Cancel your open bout before changing its setup.', 409);
    const unlocked = movesFor(pen.species, levelFor(pen.xp), pen.legacyAbilities || 0).filter((move) => move.unlocked && move.id !== 'basic');
    if (settings.specials.some((id) => !unlocked.some((move) => move.id === id))) throw new GameError('Choose only special moves your bug has learned.', 400);
    this.commitPen(playerId, { ...pen, battle: { stance: settings.stance, specials: [...settings.specials] } });
    return this.view(playerId);
  }

  bout() {
    throw new GameError('Choose an open bout or post your own on the bout board.', 409);
  }

  fighter(playerId, pen) {
    const level = levelFor(pen.xp);
    return { species: pen.species, name: pen.name, level,
      mood: Math.round(Math.min(...Object.values(this.needs(pen, this.now())))),
      gear: this.styleOf?.(playerId).gearBonus || 0, style: this.looksOf(playerId),
      legacyAbilities: pen.legacyAbilities || 0, battle: battleFor(pen.species, level, pen.legacyAbilities || 0, pen.battle) };
  }

  ready(playerId) {
    const pen = this.refresh(playerId);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    if (pen.stage === 'dead') throw new GameError('It is resting. For good.', 409);
    if (pen.stage !== 'creature') throw new GameError('Eggs do not fight. Mostly.', 409);
    const now = this.now();
    const level = levelFor(pen.xp);
    if (level < BOUT_LEVEL) throw new GameError(`Bouts open at level ${BOUT_LEVEL}.`, 409);
    if (now - (pen.boutAt || 0) < BOUT_COOLDOWN_MS) throw new GameError('It is still icing its ego. Try again later.', 429);
    return pen;
  }

  escrow(player) { return player?.barnBouts?.open?.stake || 0; }

  board(playerId) {
    const player = this.store.players?.[playerId];
    const bouts = Object.values(this.store.players || {}).flatMap(p => {
      const open = p.barnBouts?.open;
      if (!open) return [];
      const { petBornAt: _petBornAt, ...shown } = open;
      return [{ ...shown, hostName: p.name }];
    }).sort((a, b) => a.openedAt - b.openedAt);
    return { bouts, openBout: bouts.find(bout => bout.hostId === playerId) || null,
      bankroll: player?.bankroll ?? null, maxStake: MAX_BOUT_STAKE };
  }

  /** The wallet receipt commits with the payout; the pet catches up once even after a restart. */
  applyBoutReward(playerId) {
    const receipt = this.store.players?.[playerId]?.barnBouts?.lastBout;
    const pen = this.doc.pens[playerId];
    if (!receipt || !pen || pen.settledBoutId === receipt.id || pen.bornAt !== receipt.petBornAt) return;
    const { petBornAt: _petBornAt, ...replay } = receipt;
    const next = structuredClone(pen);
    next.xp += receipt.xpEarned;
    next.record ||= { w: 0, l: 0, d: 0 };
    next.record[receipt.result === 'won' ? 'w' : receipt.result === 'lost' ? 'l' : 'd']++;
    next.boutAt = receipt.at;
    next.lastBout = replay;
    next.settledBoutId = receipt.id;
    this.commitPen(playerId, next);
  }

  refundOpen(player) {
    const open = player.barnBouts.open;
    const draft = { ...player, barnBouts: { ...player.barnBouts, open: null, closedId: open.id } };
    if (open.stake) this.accounts.change(draft, open.stake, 'barn-refund', 'Barn bout: stake returned', { save: false });
    this.store.commitPlayerDrafts([draft]);
  }

  expireBouts() {
    for (const player of Object.values(this.store.players || {})) {
      const open = player.barnBouts?.open;
      if (!open) continue;
      const pen = this.doc.pens[player.id];
      if (this.now() >= open.expiresAt || !pen || pen.stage !== 'creature' || pen.bornAt !== open.petBornAt || this.now() >= this.deathAt(pen)) this.refundOpen(player);
    }
  }

  openBout(playerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'stake')
      || typeof body.stake !== 'number' || !Number.isFinite(body.stake) || body.stake < 0 || body.stake > MAX_BOUT_STAKE || cents(body.stake) !== body.stake) {
      throw new GameError(`Choose a stake from $0 to $${MAX_BOUT_STAKE}, in whole cents.`, 400);
    }
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.open) {
      if (player.barnBouts.open.stake !== body.stake) throw new GameError('Cancel your open bout before posting another.', 409);
      return this.view(playerId);
    }
    const pen = this.ready(playerId);
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
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new GameError('Join the posted stake as shown.', 400);
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.lastBout?.id === id) return this.view(playerId);
    const host = Object.values(this.store.players).find(p => p.barnBouts?.open?.id === id);
    if (!host) throw new GameError('That bout has already filled, expired or been cancelled.', 409);
    if (host.id === playerId) throw new GameError('Your bug cannot fight itself. It has tried.', 409);
    if (player.barnBouts?.open) throw new GameError('Cancel your open bout before joining another.', 409);
    const hostPen = this.ready(host.id), guestPen = this.ready(playerId);
    const open = host.barnBouts.open, stake = open.stake, now = this.now();
    this.accounts.requireFunds(player, stake, 'this bout');
    const fighters = [open.fighter, this.fighter(playerId, guestPen)];
    const seed = `${now}:${this.eggInt(1e9)}`;
    const { rounds, winner, maxHp } = simulateBout(...fighters, seed);
    const drafts = [host, player].map((p, side) => {
      const pen = side === 0 ? hostPen : guestPen;
      const payout = winner === null ? stake : winner === side ? cents(stake * 2) : 0;
      const receipt = { version: 3, id, at: now, seed, petBornAt: pen.bornAt,
        you: fighters[side], them: fighters[1 - side],
        rounds: side === 0 ? rounds : rounds.map(round => ({ ...round, by: 1 - round.by, hp: [...round.hp].reverse() })),
        maxHp: side === 0 ? maxHp : [...maxHp].reverse(), xpEarned: BOUT_XP,
        levelBefore: levelFor(pen.xp), levelAfter: levelFor(pen.xp + BOUT_XP),
        result: winner === null ? 'draw' : winner === side ? 'won' : 'lost', stake, payout, net: cents(payout - stake) };
      const draft = { ...p, barnBouts: { ...p.barnBouts, open: null, lastBout: receipt } };
      if (side === 1 && stake) this.accounts.change(draft, -stake, 'barn-stake', 'Barn bout: stake held', { save: false });
      if (payout) this.accounts.change(draft, payout, winner === null ? 'barn-refund' : 'barn-win', winner === null ? 'Barn bout: draw, stake returned' : 'Barn bout: won the pot', { save: false });
      return draft;
    });
    // Both wallets and their reward receipts must land in the same atomic players.json write.
    this.store.commitPlayerDrafts(drafts);
    this.applyBoutReward(host.id);
    return this.view(playerId);
  }

  /** Store looks for a bug (skin palette, hat, accessory, equipped battle gear), for drawing only. */
  looksOf(playerId) {
    const st = this.styleOf?.(playerId) || {};
    const o = {}; for (const k of ['bugskin', 'bughat', 'bugacc']) if (st[k]) o[k] = st[k];
    if (typeof st.gear === 'string' && st.gear.startsWith('gear-')) o.gear = { id: st.gear, shape: st.gear.slice(5) };
    return Object.keys(o).length ? o : undefined;
  }
  /** After a death: lay it to rest. The stall empties (a new egg can turn up in the mines); a small grave record stays. */
  bury(playerId) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'dead') throw new GameError('There is nothing to bury. Good.', 409);
    (this.doc.graves[playerId] ||= []).push({ name: pen.name, species: pen.species, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp) });
    this.doc.graves[playerId] = this.doc.graves[playerId].slice(-10);
    delete this.doc.pens[playerId]; this.save();
    return { ...this.view(playerId), graves: this.doc.graves[playerId] };
  }
  /** A store consumable: bump one need and earn `xp` care XP inside the daily cap (food also counts as a feed). */
  boost(playerId, { stat, gain, fed = false, xp = fed ? CARE_XP : 0 }) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    const now = this.now(); const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats[stat].v = Math.min(100, n[stat] + Math.max(0, Math.min(100, gain)));
    if (fed) pen.fedAt = now;
    if (xp > 0) {
      const day = Math.floor(now / 86400e3);
      if (pen.xpDay !== day) { pen.xpDay = day; pen.xpToday = 0; }
      const g = Math.min(xp, CARE_XP_PER_DAY - pen.xpToday);
      if (g > 0) { pen.xp += g; pen.xpToday += g; }
    }
    this.save();
    return this.view(playerId);
  }
  /** Automatic feeder (bought in the General Store): keeps the bowl full and the starvation clock paused for `ms`. */
  addFeeder(playerId, ms) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('The feeder needs a hatched bug to feed.', 409);
    const now = this.now();
    const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats.hunger.v = 100;
    if (!pen.feederUntil || pen.feederUntil < now) { pen.feederFrom = now; pen.feederUntil = now; }
    pen.feederUntil += ms; this.save();
    return this.view(playerId);
  }
  forget(playerId) { // account deleted: the barn goes with it; its name stays retired so it's never reused
    if (!this.doc.pens[playerId]) return;
    delete this.doc.pens[playerId]; delete this.doc.graves[playerId]; this.save();
  }
}
function moodWord(n) {
  const low = Math.min(n.hunger, n.mood, n.clean);
  if (low >= 70) return 'thriving';
  if (low >= 40) return 'content';
  if (low >= 15) return n.hunger === low ? 'peckish' : n.mood === low ? 'bored' : 'grubby';
  return 'sulking';
}
