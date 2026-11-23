// Server-decided fights, one action at a time. The Barn and the mine both run this: each bug acts in turn, using the
// move its owner lined up or, with nothing lined up, the one it picks for itself. Stored events replay without
// running the fight or awarding XP again.
import { BY_ID } from './creatures.js';
import { battleFor, combatStats, movesFor, STANCES, TRAIT } from './bug-combat.js';
import { typeEdge, typeOf, PERK } from './bug-types.js';

export const BOUT_HP = 100;
export const MAX_ROUNDS = 32; // actions; venom and a bombardier's pop can add events around an action
export const GEAR_CAP = 0.06;
// A bug whose evolution went wrong (server/barn.js, evolve) carries one of these as `botched`, for good. Lazy: now and
// then it does not take its turn. Berserk: it hits harder, is hit harder, and will not stop to heal. Haywire: its hits
// land anywhere from a tap to a wallop, and now and then the arm goes for its owner instead.
export const QUIRKS = ['lazy', 'berserk', 'haywire'];
// A second rebuild that goes wrong leaves the bug sure it is a man. Polite: half the time it lets the other one go
// first. Salaried: after six turns it is on overtime, unpaid, and hits like it. Squeamish: it pulls its punches on anything already losing.
export const MAN_QUIRKS = ['polite', 'salaried', 'squeamish'];
export const QUIRK = { lazy: { skip: 0.08 }, berserk: { power: 0.3, open: 0.18 }, haywire: { low: 0.4, span: 1.5, self: 0.06, hp: 0.06 },
  polite: { chance: 0.5 }, salaried: { after: 6, power: 0.9 }, squeamish: { below: 0.5, pull: 0.5 } };
// HP: the most a packed lunch (store food) gives back, once a fight. Measured over every species pair, 10 HP moves an
// even fight to about 65% (60% at level 10), level with the best armour; 15 HP made it 72%, more than any gear.
export const LUNCH_CAP = 10;
// A circuit leader's house rule, carried on their bug (`c.rule`). Dodgeball: every third own turn its attack cannot
// miss and lands harder, and the leader's tell (Fights.view) warns the owner a turn ahead so they can line up a guard.
// Cough: before any action, either bug may lose its turn to a coughing fit. Flood: from overall turn `from` the water
// is up, and every bug that is not a Water type loses `hp` at the start of each of its own turns.
// Flicker: every third overall turn the porch light is off, and an attack from anything but a Dazzle bug is likelier
// to miss. Grill: its bug's Fire flare-up is always on, and every fourth own turn is an order up, which hits harder.
// Linger: poison its bug puts on never wears off. Dark: nothing in the fight itself; the page hides its bug's health.
// Rage: below half health its bug hits harder. Mulligan: its bug takes up to `tries` missed attacks again.
// Rewind: once, the first time its bug is left standing under `at` of its health, the reel goes back and it is at `to`.
// The Fair Board. Encore: the other bug's move does less if it is the move it used last. Inspect: the other bug's hits
// go by its condition, from `low` at mood 0 to `low + span` at 100. Best in show: the other bug takes `bare` more for
// each gear slot it left empty. Pull: its own hits do `power` more and are `aim` likelier to miss.
// Retake: a mulligan by another name, `tries` a fight; the Retake prize gives the player's bug one.
export const RULES = { dodgeball: { every: 3, power: 0.25 }, cough: { chance: 0.12 }, flood: { from: 9, hp: 3 },
  flicker: { every: 3, aim: 0.22 }, grill: { every: 4, power: 0.3 }, rage: { power: 0.25 }, mulligan: { tries: 3 }, rewind: { at: 0.25, to: 0.45 }, retake: { tries: 2 },
  encore: { power: 0.2 }, inspect: { low: 0.85, span: 0.2 }, bestinshow: { bare: 0.08 }, pull: { power: 0.5, aim: 0.18 },
  // Feature-presentation bosses. Web: a word written over the other bug, whose hits do less and land less often.
  // Conscience: it heals whenever the other bug uses a dirty move (poison or a pierce). Sing: it heals a little at the
  // start of every turn of its own. Telepod: once, when it drops under `at` of its health, the two bugs swap how hurt they are.
  web: { power: 0.12, aim: 0.05 }, conscience: { heal: 7 }, sing: { heal: 3 }, telepod: { at: 0.35 } };
const ruled = (S, rule) => S.side.some((q) => q.c.rule === rule);
// Circuit prizes ride on the player's bug (`c.prizes`), in circuit fights only. Whistle: its first attack cannot miss.
// Floaties: the flood and the porch light do nothing to it. Mitt: Fire bugs' hits on it do less. Antidote: poison does
// half damage to it and always wears off. Night eyes: an Ambush bug's first strike can miss it. (Night light is the page's.)
export const PRIZE = { mitt: 0.1, popcorn: 2 };
const has = (q, prize) => !!q.c.prizes?.includes(prize);
/** A circuit trainer's bug is drilled (`c.trained`): that share more health and damage than a barn bug of its level. */
const trainedOf = (c) => Math.max(0, Math.min(0.5, Number(c.trained) || 0));
const ball = (s, turnNo) => s.c.rule === 'dodgeball' && turnNo % RULES.dodgeball.every === 0;
/** Whether side `i`'s next own turn is its leader's big one: what the tell is for. */
export const tellDue = (S, i) => { const q = S.side[i], rule = q.c.rule;
  return ball(q, q.turn + 1) || (rule === 'flood' && S.turn + 1 >= RULES.flood.from - 2 && S.turn + 1 <= RULES.flood.from)
    || (rule === 'flicker' && (S.turn + 1) % RULES.flicker.every === 0) || (rule === 'grill' && (q.turn + 1) % RULES.grill.every === 0)
    || (rule === 'linger' && !S.side[1 - i].venom) || (rule === 'telepod' && !q.podded && S.hp[i] / S.maxHp[i] < RULES.telepod.at + 0.15) || (rule === 'rewind' && !q.rewound && S.hp[i] / S.maxHp[i] < RULES.rewind.at + 0.15) || (rule === 'dark' && S.by === i && nextMove(S, i).effect === 'pierce'); };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const PRIORITY = { aggressive: ['pierce', 'venom', 'weaken', 'guard', 'heal'], defensive: ['heal', 'guard', 'weaken', 'venom', 'pierce'] };

/** Inputs include species, level, needs' minimum as mood, attack gear (`gear`), defense gear (`defense`), a packed `lunch` ({ name, heal }) and the saved stance. The state lives in memory only. */
export function startBout(a, b, seed) {
  const R = mulberry32(hash(`${seed}`) ^ hash(a.species) ^ (hash(b.species) << 1));
  const side = [a, b].map(c => {
    const battle = battleFor(c.species, c.level, c.legacyAbilities, c.battle), stats = combatStats(c.level), stance = STANCES[battle.stance];
    // `plain` (tests, balance runs) fights without the species trait
    return { c, t: c.plain ? null : c.species, ty: c.plain ? null : typeOf(c.species), st: BY_ID[c.species].stats, battle, stats, stance, moves: movesFor(c.species, c.level, c.legacyAbilities),
      boost: (1 + trainedOf(c)) * stats.damageMultiplier * (1 + Math.max(0, Math.min(100, c.mood ?? 60)) / 1000) * (1 + Math.max(0, Math.min(GEAR_CAP, Number(c.gear) || 0))) * stance.damage * (c.botched === 'berserk' ? 1 + QUIRK.berserk.power : 1),
      ward: 1 - Math.max(0, Math.min(GEAR_CAP, Number(c.defense) || 0)), // defense gear: what is left of each hit it takes
      lunch: Number(c.lunch?.heal) > 0 ? { name: String(c.lunch.name || 'packed lunch'), heal: Math.min(LUNCH_CAP, Math.round(Number(c.lunch.heal))) } : null, ate: false,
      turn: 0, readyAt: {}, usedAt: {}, guard: 0, guardLeft: 0, weaken: 1, venom: null, lastSpecial: null,
      attacks: 0, streak: 0, kick: false, blind: false, skip: false, damaged: false, mask: true, still: true, popped: false, flashed: false, spots: 0, regen: 0,
      met: false, grip: false, sung: false, under: false, moulted: false, again: false, jumped: false, landed: 0, sprays: 0, burst: false };
  });
  for (const s of side) if (s.t === 'bocydium') { const k = ['atk', 'def', 'spd'][Math.floor(R() * 3)]; s.st = { ...s.st, [k]: s.st[k] + 1 }; s.globes = k; }
  // Fighter snapshots can specify a starting health percentage; otherwise they enter at full HP.
  const maxHp = side.map(s => Math.round(s.stats.maxHp * (1 + trainedOf(s.c)) * (s.t === 'heteropteryx' ? 1 + TRAIT.heavy : 1)));
  const hp = side.map((s, i) => { const h = Number(s.c.health); return Number.isFinite(h) && h < 100 ? Math.max(1, Math.ceil((maxHp[i] * Math.max(0, h)) / 100)) : maxHp[i]; });
  let by = R() < 0.5 + (side[0].st.spd - side[1].st.spd) * 0.03 ? 0 : 1;
  const quick = side.map(s => s.t === 'mantispa'); if (quick[0] !== quick[1]) by = quick[0] ? 0 : 1;
  return { R, side, hp, maxHp, startHp: [...hp], by, turn: 0, rounds: [], over: false, winner: null };
}

const usable = (s, move, turnNo) => move.unlocked && (move.id === 'basic' || turnNo >= (s.readyAt[move.id] || 0));
function pickFor(S, i, turnNo) {
  const s = S.side[i], target = S.side[1 - i];
  let available = s.battle.specials.map(id => s.moves.find(move => move.id === id)).filter(move =>
    usable(s, move, turnNo) && (move.effect !== 'heal' || S.hp[i] <= S.maxHp[i] * 0.65) &&
    (move.effect !== 'venom' || !target.venom) && (move.effect !== 'guard' || !s.guard) && (move.effect !== 'weaken' || target.weaken === 1));
  if (PRIORITY[s.battle.stance]) available.sort((x, y) => PRIORITY[s.battle.stance].indexOf(x.effect) - PRIORITY[s.battle.stance].indexOf(y.effect));
  else { // balanced: mend when hurt, otherwise take the specials in turn
    const heal = available.find(move => move.effect === 'heal'); if (heal) return heal;
    available.sort((x, y) => (s.usedAt[x.id] || 0) - (s.usedAt[y.id] || 0)); // the one it has gone longest without
  }
  return available[0] || s.moves[0];
}
/** What side `i` would do on its next action: its owner's move if that one will be ready, otherwise its own pick. */
export function nextMove(S, i, wanted) {
  const s = S.side[i], turnNo = s.turn + 1;
  return (wanted && s.moves.find(move => move.id === wanted && usable(s, move, turnNo))) || pickFor(S, i, turnNo);
}
/** Own turns until each of side `i`'s moves can be used again (0 = ready on its next action). */
export function cooldowns(S, i) {
  const s = S.side[i];
  return Object.fromEntries(s.moves.map(move => [move.id, move.id === 'basic' ? 0 : Math.max(0, (s.readyAt[move.id] || 0) - (s.turn + 1))]));
}

// The three sums below only read the fight. stepBout rolls against them; odds() shows them to the owner first.
/** The chance side `by`'s attack lands, as things stand, on its `attacks`-th attack. */
function aim(S, by, move, attacks, turnNo = S.turn) {
  const foe = 1 - by, s = S.side[by], target = S.side[foe];
  let spd = (target.st.spd - 3) * 0.03; if (s.t === 'polyphylla') spd = Math.min(0, spd) - TRAIT.fan;
  let acc = move.accuracy - spd;
  if (target.t === 'nemoptera' && !target.damaged) acc -= TRAIT.calm;
  if (s.blind) acc -= TRAIT.blind;
  if (ruled(S, 'flicker') && turnNo % RULES.flicker.every === 0 && s.ty !== 'dazzle' && !has(s, 'floaties')) acc -= RULES.flicker.aim; // the porch light is off
  if (target.ty === 'flier') acc -= PERK.quick;
  if (target.under) acc -= PERK.dive; // a Water bug that was just hit has gone under
  if (target.t === 'micronecta') acc -= TRAIT.tiny;
  if (s.c.rule === 'pull') acc -= RULES.pull.aim; // it went 310. Into what, nobody could say
  if (target.c.rule === 'web') acc -= RULES.web.aim; // hard to concentrate with that written over you
  if (target.t === 'meganeura') acc -= TRAIT.griffinDodge;
  if (target.t === 'halobates' && S.hp[foe] > S.maxHp[foe] / 2) acc -= TRAIT.skate;
  if (target.t === 'notonecta' && !target.met) acc -= TRAIT.upside;
  if (target.t === 'bertholdia' && attacks % 2 === 0) acc -= TRAIT.jam; // it clicks in bursts: every other attack
  if (s.t === 'gyrinus') acc += TRAIT.eyes;
  if (s.t === 'melanophila' && S.hp[foe] < S.maxHp[foe] / 2) acc += TRAIT.heat;
  if (s.t === 'dytiscus' && s.grip) acc += TRAIT.grip;
  if (s.t === 'myrmeleon' && target.attacks >= 3) acc += TRAIT.pit; // three attacks in, the opponent has slid into the pit
  if (target.t === 'ceroplophana' && S.hp[foe] < S.maxHp[foe] / 4) acc *= 1 - TRAIT.vanish;
  return (s.ty === 'ambush' && attacks === 1 && !has(target, 'nighteyes')) || (attacks === 1 && has(s, 'whistle')) || ball(s, s.turn) ? 1 : acc; // an Ambush bug's first strike cannot miss; nor can a dodgeball
}
/** What side `by`'s attack does at a given roll (0.8 up to 1.25), on its `attacks`-th attack and `turnNo`-th turn. */
function blow(S, by, move, roll, attacks, turnNo) {
  const { side, hp, maxHp } = S, foe = 1 - by, s = side[by], target = side[foe];
  const pierce = move.effect === 'pierce', shell = target.t === 'pachyrhynchus';
  const armour = pierce && !shell ? 1 : 1 - (target.st.def - 3) * 0.04;
  const guard = 1 - target.guard * (!pierce || shell ? 1 : s.t === 'pyrops' ? 0 : 0.5) * (s.ty === 'sonic' ? 1 - PERK.loud : 1); // a guard does not block sound
  const mine = hp[by] / maxHp[by], theirs = hp[foe] / maxHp[foe];
  let mult = 1;
  if (s.t === 'macrodontia' && turnNo <= 3) mult *= 1 + TRAIT.front;
  if (s.t === 'phrictus' && attacks % 5 === 0) mult *= 1 + TRAIT.fifth;
  if (s.t === 'phanaeus') mult *= 1 + TRAIT.streak * Math.min(5, s.streak);
  if (s.t === 'manticora' && theirs < 0.3) mult *= 1 + TRAIT.maneater;
  if (s.t === 'lamprima' && mine > theirs) mult *= 1 + TRAIT.log;
  if (s.t === 'lethocerus' && theirs > mine) mult *= 1 + TRAIT.turtles;
  if (s.t === 'empusa') mult *= 1 + TRAIT.prey * target.st.spd;
  if (s.kick) mult *= 1 + TRAIT.kick;
  if (s.c.rule === 'grill') mult *= (s.ty === 'fire' && mine >= 0.5 ? 1 + PERK.flare : 1) * (turnNo % RULES.grill.every === 0 ? 1 + RULES.grill.power : 1); // the grill is always lit, and every fourth is an order up
  if (s.c.rule === 'rage' && mine < 0.5) mult *= 1 + RULES.rage.power;
  if (target.c.botched === 'berserk') mult *= 1 + QUIRK.berserk.open; // it does not look where it is going
  if (s.c.botched === 'squeamish' && theirs < QUIRK.squeamish.below) mult *= QUIRK.squeamish.pull; // it cannot watch
  if (s.c.botched === 'salaried' && turnNo > QUIRK.salaried.after) mult *= QUIRK.salaried.power;
  if (target.c.rule === 'web') mult *= 1 - RULES.web.power;
  if (target.c.rule === 'encore' && s.prev === move.id) mult *= 1 - RULES.encore.power; // the judge has seen that one
  if (target.c.rule === 'inspect') mult *= RULES.inspect.low + RULES.inspect.span * Math.max(0, Math.min(100, s.c.mood ?? 60)) / 100;
  if (s.c.rule === 'bestinshow') mult *= 1 + RULES.bestinshow.bare * (!(Number(target.c.gear) > 0) + !(Number(target.c.defense) > 0));
  if (s.c.rule === 'pull') mult *= 1 + RULES.pull.power;
  if (s.ty === 'fire' && has(target, 'mitt')) mult *= 1 - PRIZE.mitt;
  if (s.t === 'phrixothrix' && move.id !== 'basic') mult *= 1 + TRAIT.lights;
  if (target.t === 'acanthaspis' && target.mask) mult *= 1 - TRAIT.mask;
  if (shell && pierce) mult *= 1 - TRAIT.shell;
  // its type beats the target's, or the other way round: hits only, like gear. A fire ant's raft floats: Water has no edge on it
  if (!((s.t === 'solenopsis' && target.ty === 'water') || (target.t === 'solenopsis' && s.ty === 'water'))) mult *= typeEdge(s.t, target.t);
  if (s.ty === 'fire' && mine < 0.5) mult *= 1 + PERK.flare;
  if (s.t === 'gryllotalpa' && move.id !== 'basic' && !s.sung) mult *= 1 + TRAIT.horn;
  if (target.t === 'gromphadorhina' && attacks <= 3) mult *= 1 - TRAIT.hiss; // one hiss each
  if (target.t === 'solenopsis' && theirs > 0.5) mult *= 1 - TRAIT.raft;
  if (target.t === 'arachnocampa') mult *= 1 - TRAIT.thread * Math.min(30, attacks - 1); // one more thread for every attack so far
  if (target.t === 'odontomachus' && !target.jumped && theirs < 0.5) mult *= 1 - TRAIT.jump; // it flings itself clear, once
  if (target.t === 'dasymutilla' && s.venom) mult *= 1 - TRAIT.pain;
  if (s.t === 'colobopsis') mult *= 1 - TRAIT.minor; // a minor worker: built to burst, not to bite
  if (target.t === 'ampulex' && target.landed >= 2) mult *= 1 - TRAIT.sting * (s.t === 'gromphadorhina' ? 2 : 1); // stung twice, it stops trying; a cockroach more so
  if (s.ty === 'brawler') mult *= 1 + PERK.heavy;
  if (s.t === 'megachile') mult *= 1 + TRAIT.giant;
  if (s.t === 'meganeura') mult *= 1 + TRAIT.griffin;
  if (target.t === 'dryococelus') mult *= 1 - TRAIT.lobster; // a tree lobster: hard to finish off
  if (ball(s, turnNo)) mult *= 1 + RULES.dodgeball.power;
  if (s.ty === 'ambush' && attacks === 1) mult *= 1 + PERK.strike;
  if (target.ty === 'shell' && !pierce) mult *= 1 - PERK.armour;
  mult *= 1 - s.spots; // a Dazzle bug flashed at it: its next attack is off
  const dmg = Math.max(1, Math.round(move.power * roll * s.boost * (1 + (s.st.atk - 3) * 0.04) * armour * target.stance.taken * target.ward * guard * s.weaken * mult));
  return Math.min(hp[foe], dmg, target.t === 'phloeodes' ? Math.round(maxHp[foe] * TRAIT.iron) : Infinity); // an ironclad beetle: no single hit gets more than a share of its health
}
const scalesOf = (target) => (target.t === 'eupholus' ? 1 - TRAIT.scales : 1); // venom and weaken half flake off
/** Any hit a Toxic bug lands poisons a target that is not poisoned already (its venom moves do their own, stronger). */
const taints = (s, target, move) => s.ty === 'toxic' && move.effect !== 'venom' && move.effect !== 'heal' && !target.venom;
const TAINT = { venom: PERK.toxin, duration: 2 };
const venomOf = (s, target, move) => Math.max(1, Math.round(move.venom * s.stats.damageMultiplier * scalesOf(target) * (s.t === 'graphocephala' ? 1 + TRAIT.xylella : 1)));
/**
 * For the move panel: how each of side `i`'s unlocked moves would go if used on its next action, as things stand
 * now. Nothing is rolled. `hit` is a chance, `dmg` the least and most a hit does, `venom` [damage a turn, turns],
 * `weaken` and `guard` the share taken off the next attack, `heal` the HP it would give back.
 */
export function odds(S, i) {
  const s = S.side[i], target = S.side[1 - i];
  return Object.fromEntries(s.moves.filter(move => move.unlocked).map(move => {
    if (move.effect === 'heal') return [move.id, { heal: Math.min(S.maxHp[i] - S.hp[i], Math.round(move.heal * s.stats.damageMultiplier)) }];
    return [move.id, { hit: Math.max(0, Math.min(1, aim(S, i, move, s.attacks + 1, S.turn + 1))), dmg: [0.8, 1.25].map(roll => blow(S, i, move, roll, s.attacks + 1, s.turn + 1)),
      ...(move.criticalChance ? { crit: move.criticalChance } : {}),
      ...(move.effect === 'venom' ? { venom: [venomOf(s, target, move), move.duration] } : taints(s, target, move) ? { venom: [venomOf(s, target, TAINT), TAINT.duration] } : {}),
      ...(move.effect === 'weaken' ? { weaken: (1 - move.weaken) * scalesOf(target) } : {}),
      ...(move.effect === 'guard' ? { guard: move.guard } : {}) }];
  }));
}

/** One action by whoever's turn it is. `choice` is a move id its owner lined up; anything unusable falls back to the bug's own pick. */
export function stepBout(S, choice) {
  if (S.over) return [];
  const { side, hp, maxHp, R, rounds } = S, from = rounds.length, by = S.by, foe = 1 - by, s = side[by], target = side[foe];
  const turn = ++S.turn; s.turn++;
  let stood = '', flash = -1; // `stood`: how a bug that should have gone down is still there, for the line
  const hurt = (i, n) => {
    let d = Math.min(hp[i], n);
    if (d >= hp[i] && side[i].t === 'deroplatys' && side[i].still && hp[i] > maxHp[i] * TRAIT.still) { d = hp[i] - 1; side[i].still = false; stood = 'lies still'; }
    if (d >= hp[i] && side[i].t === 'pheropsophus' && side[i].still) { side[i].still = false; if (R() < TRAIT.vomit) { d = hp[i] - 1; stood = 'comes back up'; } } // the first knockout blow only
    if (d >= hp[i] && side[i].t === 'colobopsis' && !side[i].burst) { d = hp[i] - 1; side[i].burst = 'due'; stood = 'hangs on'; } // an exploding ant goes off before it goes down: see burst
    hp[i] -= d; if (d > 0) side[i].damaged = true;
    // a Dazzle bug's startle: the first time it is left standing below half, the other bug's next attack is off
    if (side[i].ty === 'dazzle' && !side[i].flashed && hp[i] > 0 && hp[i] < maxHp[i] / 2) { side[i].flashed = true; side[1 - i].spots = PERK.startle; flash = i; }
    else if (side[i].t === 'photuris' && side[i].flashed && !side[i].again && hp[i] > 0 && hp[i] < maxHp[i] / 4) { side[i].again = true; side[1 - i].spots = TRAIT.encore; flash = i; } // a Photuris has a second signal
    return d;
  };
  /** For the line of whatever just hurt it: said once. */
  const spots = () => { if (flash < 0) return ''; const i = flash; flash = -1; return ` ${side[i].c.name} flashes its colours and ${side[1 - i].c.name} is left seeing spots.`; };
  const pop = (i) => {
    const q = side[i];
    if (q.t !== 'brachinus' || q.popped || hp[i] <= 0 || hp[i] >= maxHp[i] / 2) return;
    q.popped = true; const dmg = hurt(1 - i, TRAIT.pop);
    rounds.push({ by: i, type: 'venom', pop: true, effect: 'pierce', moveId: 'trait', ability: 'Firing Chamber', tier: 2, hit: true, dmg, hp: [...hp], turn,
      line: `${q.c.name} is below half and fires its chamber: ${dmg} damage.${spots()}` });
  };
  // An exploding ant's last act, once a fight: the blow that would have knocked it out sets it off instead (hurt, above, holds it at 1 HP until this
  // runs). If the burst finishes the opponent the ant stays standing on that 1 HP; if not, it goes down after all.
  const burst = (i) => {
    const q = side[i];
    if (q.burst !== 'due') return;
    q.burst = true;
    if (hp[1 - i] <= 0) return; // nothing left to burst at
    const dmg = hurt(1 - i, TRAIT.goo), won = hp[1 - i] <= 0;
    if (!won) hp[i] = 0;
    rounds.push({ by: i, type: 'venom', pop: true, effect: 'pierce', moveId: 'trait', ability: 'Yellow Goo', tier: 2, hit: true, dmg, hp: [...hp], turn,
      line: `${q.c.name} bursts instead of going down: ${dmg} damage. ${won ? `That finishes ${side[1 - i].c.name}.` : 'It was not enough.'}${spots()}` });
  };
  const bursts = () => { for (const i of [foe, by, foe]) burst(i); }; // either corner, and an ant set off by the other ant's burst
  // A packed lunch is eaten once, the first time its bug is left standing below half health. It costs no turn.
  const snack = (i) => {
    const q = side[i];
    if (!q.lunch || q.ate || hp[i] <= 0 || hp[i] >= maxHp[i] / 2) return;
    q.ate = true; const healed = Math.min(maxHp[i] - hp[i], q.lunch.heal); hp[i] += healed;
    rounds.push({ by: i, type: 'snack', effect: 'heal', moveId: 'lunch', ability: q.lunch.name, tier: 0, hit: true, dmg: 0, healed, hp: [...hp], turn,
      line: `${q.c.name} is below half and stops to eat its ${q.lunch.name}: ${healed} HP back.` });
  };
  // A firebug's extra moult: once, the first time it is left standing below a third of its health. It costs no turn.
  const moult = (i) => {
    const q = side[i];
    if (q.t !== 'pyrrhocoris' || q.moulted || hp[i] <= 0 || hp[i] >= maxHp[i] / 3) return;
    q.moulted = true; const healed = Math.min(maxHp[i] - hp[i], TRAIT.moult); hp[i] += healed;
    rounds.push({ by: i, type: 'snack', effect: 'heal', moveId: 'trait', ability: 'Extra Moult', tier: 0, hit: true, dmg: 0, healed, hp: [...hp], turn,
      line: `${q.c.name} is below a third and moults: ${healed} HP back.` });
  };
  // Dr. Brindle's telepod: once, the first time his bug is left standing under a share of its health, the two bugs trade how hurt they are.
  const telepod = (i) => {
    const q = side[i];
    if (q.c.rule !== 'telepod' || q.podded || hp[i] <= 0 || hp[1 - i] <= 0 || hp[i] / maxHp[i] >= RULES.telepod.at) return;
    q.podded = true;
    const mine = hp[i] / maxHp[i], theirs = hp[1 - i] / maxHp[1 - i], before = hp[i];
    hp[i] = Math.max(1, Math.round(maxHp[i] * theirs)); hp[1 - i] = Math.max(1, Math.round(maxHp[1 - i] * mine));
    rounds.push({ by: i, type: 'snack', effect: 'heal', moveId: 'rule', ability: 'Telepod', tier: 0, hit: true, dmg: 0, healed: Math.max(0, hp[i] - before), hp: [...hp], turn,
      line: `${q.c.name} steps into the telepod with ${side[1 - i].c.name}. They come out having traded how hurt they are.` });
  };
  // Reel Ray's rewind: once, the first time his bug is left standing under a share of its health, the last few minutes did not happen.
  const rewind = (i) => {
    const q = side[i];
    if (q.c.rule !== 'rewind' || q.rewound || hp[i] <= 0 || hp[1 - i] <= 0 || hp[i] / maxHp[i] >= RULES.rewind.at) return;
    q.rewound = true;
    const before = hp[i]; hp[i] = Math.round(maxHp[i] * RULES.rewind.to);
    rounds.push({ by: i, type: 'snack', effect: 'heal', moveId: 'rule', ability: 'Rewind', tier: 0, hit: true, dmg: 0, healed: hp[i] - before, hp: [...hp], turn,
      line: `The reel runs backwards. ${q.c.name} is back where it was a few minutes ago.` });
  };
  const rest = () => { for (const i of [by, foe]) { snack(i); moult(i); telepod(i); rewind(i); } };
  const done = () => {
    rest();
    S.by = foe;
    if (hp[0] <= 0 || hp[1] <= 0 || S.turn >= MAX_ROUNDS) { const score = hp[0] * maxHp[1] - hp[1] * maxHp[0]; S.over = true; S.winner = score === 0 ? null : score > 0 ? 0 : 1; }
    return rounds.slice(from);
  };

  if (s.venom) {
    const dmg = hurt(by, has(s, 'antidote') ? Math.ceil(s.venom.damage / 2) : s.venom.damage);
    rounds.push({ by: foe, type: 'venom', effect: 'venom', moveId: s.venom.moveId, ability: s.venom.name, tier: s.venom.tier, hit: true, dmg, hp: [...hp], turn,
      line: `${s.c.name} takes ${dmg} venom damage${stood ? ` and ${stood} at 1 HP` : ''}.${spots()}` });
    if ((target.c.rule !== 'linger' || has(s, 'antidote')) && --s.venom.left === 0) s.venom = null; // a retired exterminator's poison does not wear off
    pop(by); bursts(); rest();
    if (hp[0] <= 0 || hp[1] <= 0) return done();
  }
  if (ruled(S, 'flood') && S.turn >= RULES.flood.from && s.ty !== 'water' && !has(s, 'floaties')) { // the water is up: anything that cannot swim is struggling
    const dmg = hurt(by, RULES.flood.hp);
    rounds.push({ by: foe, type: 'venom', effect: 'weaken', moveId: 'rule', ability: 'Rising Water', tier: 0, hit: true, dmg, hp: [...hp], turn,
      line: `The water is up to ${s.c.name}'s knees: ${dmg} damage.${spots()}` });
    pop(by); bursts(); rest();
    if (hp[0] <= 0 || hp[1] <= 0) return done();
  }
  if (ruled(S, 'cough') && R() < RULES.cough.chance) { // it is going round
    rounds.push({ by, type: 'move', skipped: true, effect: 'strike', moveId: 'basic', ability: s.moves[0].name, tier: 0, hit: false, critical: false, dmg: 0, healed: 0, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} *coughs* and loses the turn.` });
    return done();
  }
  if (s.c.rule === 'sing') hp[by] = Math.min(maxHp[by], hp[by] + RULES.sing.heal); // the chorus picks it back up
  if (has(s, 'popcorn')) hp[by] = Math.min(maxHp[by], hp[by] + PRIZE.popcorn); // it never runs out
  if (s.t === 'onymacris') { s.regen += TRAIT.regen; const n = Math.floor(s.regen); s.regen -= n; hp[by] = Math.min(maxHp[by], hp[by] + n); }
  if (s.skip) {
    const why = s.skip === 'din' ? 'cannot hear a thing' : 'is still climbing back onto the leaf'; s.skip = false;
    rounds.push({ by, type: 'move', skipped: true, effect: 'strike', moveId: 'basic', ability: s.moves[0].name, tier: 0, hit: false, critical: false, dmg: 0, healed: 0, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} ${why} and loses the turn.` });
    return done();
  }
  // The quirks roll only for a botched bug, so every other fight draws the same numbers it always did.
  if (s.c.botched === 'lazy' && R() < QUIRK.lazy.skip) {
    rounds.push({ by, type: 'move', skipped: true, effect: 'strike', moveId: 'basic', ability: s.moves[0].name, tier: 0, hit: false, critical: false, dmg: 0, healed: 0, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} cannot be bothered and loses the turn.` });
    return done();
  }
  const off = s.c.botched === 'polite' && s.turn === 1 && R() < QUIRK.polite.chance && 'holds the door. After you.';
  if (off) {
    rounds.push({ by, type: 'move', skipped: true, effect: 'strike', moveId: 'basic', ability: s.moves[0].name, tier: 0, hit: false, critical: false, dmg: 0, healed: 0, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} ${off}` });
    return done();
  }
  if (s.c.botched === 'haywire' && R() < QUIRK.haywire.self) {
    const dmg = hurt(by, Math.max(1, Math.round(maxHp[by] * QUIRK.haywire.hp)));
    rounds.push({ by: foe, type: 'venom', effect: 'weaken', moveId: 'rule', ability: 'Loose Wiring', tier: 0, hit: true, dmg, hp: [...hp], turn,
      line: `${s.c.name}'s arm goes for ${s.c.name} instead: ${dmg} damage, and the turn is gone.${spots()}` });
    pop(by); bursts(); rest();
    return done();
  }

  let move = (choice && s.moves.find(m => m.id === choice && usable(s, m, s.turn))) || pickFor(S, by, s.turn);
  if (s.c.botched === 'berserk' && move.effect === 'heal') move = s.moves[0]; // it will not stop to heal, whoever asks
  const thrown = ball(s, s.turn);
  if (thrown && move.effect === 'heal') move = s.moves[0]; // the tell promised a ball: it throws one
  if (move.id !== 'basic') { s.readyAt[move.id] = s.turn + move.cooldown; s.usedAt[move.id] = s.turn; s.lastSpecial = move.id; }
  let dmg = 0, healed = 0, hit = true, critical = false, detail = '', poisons = false, mulligan = false;
  const encore = target.c.rule === 'encore' && s.prev === move.id && move.effect !== 'heal';
  if (move.effect === 'heal') {
    healed = Math.min(maxHp[by] - hp[by], Math.round(move.heal * s.stats.damageMultiplier)); hp[by] += healed;
    detail = `recovers ${healed} HP`;
    if (s.t === 'helicopsyche') { s.guard = TRAIT.caseGuard; s.guardLeft = 1; detail += ' and coils into its case'; }
  } else {
    s.attacks++;
    hit = R() < aim(S, by, move, s.attacks);
    if (!hit && (s.taken || 0) < (s.c.rule === 'mulligan' ? RULES.mulligan.tries : s.c.rule === 'retake' ? RULES.retake.tries : has(s, 'retake') ? 1 : 0)) { s.taken = (s.taken || 0) + 1; hit = R() < aim(S, by, move, s.attacks); mulligan = true; }
    s.blind = false; target.met = true; s.grip = hit;
    if (target.ty === 'water') target.under = hit;
    if (hit) {
      const masked = target.t === 'acanthaspis' && target.mask;
      let roll = 0.8 + R() * 0.45; if (s.t === 'chrysochroa') roll = Math.max(roll, 0.8 + R() * 0.45);
      if (s.c.botched === 'haywire') roll = QUIRK.haywire.low + R() * QUIRK.haywire.span;
      const leaps = target.t === 'odontomachus' && !target.jumped && hp[foe] < maxHp[foe] / 2;
      dmg = blow(S, by, move, roll, s.attacks, s.turn);
      s.kick = false; if (masked) target.mask = false;
      if (move.criticalChance && dmg < hp[foe] && target.t !== 'phloeodes' && R() < move.criticalChance) {
        critical = true; dmg = hp[foe] - 1;
        detail = `; critical hit leaves ${target.c.name} at 1 HP`;
      }
      dmg = hurt(foe, dmg); s.streak++; s.landed++;
      if (masked) detail += `; ${target.c.name}'s corpse mask takes some of it`;
      if (stood) detail += `; ${target.c.name} ${stood} at 1 HP`;
      if (leaps) { target.jumped = true; detail += `; ${target.c.name} flings itself clear of most of it`; }
      if (target.t === 'peruphasma' && target.sprays < 2 && hp[foe] > 0) { target.sprays++; detail += `; ${target.c.name} sprays it in the eyes for ${hurt(by, TRAIT.spray)}`; }
      if (move.effect === 'venom') {
        target.venom = { damage: venomOf(s, target, move), left: move.duration, name: move.name, moveId: move.id, tier: move.tier };
        detail += ' and poisons for two turns';
        if (s.t === 'platymeris') target.blind = true;
      } else if (move.effect === 'weaken') { target.weaken = 1 - (1 - move.weaken) * scalesOf(target); detail += ' and weakens the next attack'; }
      if (taints(s, target, move) && hp[foe] > 0) { target.venom = { damage: venomOf(s, target, TAINT), left: TAINT.duration, name: move.name, moveId: move.id, tier: move.tier }; poisons = true; detail += ' and poisons for two turns'; }
      if (s.t === 'trachelophorus' && hp[foe] > 0 && R() < TRAIT.stun) { target.skip = true; detail += `; ${target.c.name} is knocked off the leaf`; }
      if (s.t === 'brevisana' && hp[foe] > 0 && R() < TRAIT.din) { target.skip = 'din'; detail += `; ${target.c.name} is deafened`; }
      if (s.t === 'pseudocreobotra') hp[by] = Math.min(maxHp[by], hp[by] + TRAIT.lure);
      if (target.c.rule === 'conscience' && (move.effect === 'venom' || move.effect === 'pierce') && hp[foe] > 0) { hp[foe] = Math.min(maxHp[foe], hp[foe] + RULES.conscience.heal); detail += `; ${target.c.name} tuts, and feels better about itself`; }
    } else { s.streak = 0; if (target.t === 'sagra') target.kick = true; }
    if (flash !== foe) s.spots = 0; // the spots clear with this attack, hit or miss, unless this is the blow that set the flash off
    if (move.id !== 'basic') s.sung = true; // a mole cricket's tuned burrow carries its first special only
    // protection/debuff is spent on the next attack, including a miss (a thorn bug's guard lingers for one more)
    if (target.guard) target.guard = --target.guardLeft <= 0 ? 0 : TRAIT.linger;
    s.weaken = 1;
    if (hit && move.id !== 'basic' && target.t === 'sphaerocoris') s.weaken = 1 - TRAIT.smell;
    if (move.effect === 'guard') { s.guard = move.guard; s.guardLeft = s.t === 'umbonia' ? 2 : 1; detail += ' and raises a guard'; }
    detail = hit ? `deals ${dmg} damage${detail}` : `misses${move.effect === 'guard' ? ' but raises a guard' : ''}`;
  }
  s.prev = move.id;
  if (encore && hit) detail += '; the judge has seen that one';
  rounds.push({ by, type: 'move', effect: move.effect, moveId: move.id, ability: move.name, tier: move.tier, hit, critical, dmg, healed, hp: [...hp], turn, ownTurn: s.turn, ...(poisons ? { poisons } : {}),
    line: `${s.c.name} ${thrown ? 'throws a DODGEBALL with' : mulligan ? (s.c.rule === 'mulligan' ? 'takes a mulligan and uses' : 'says that one did not count, and retakes') : 'uses'} ${move.name}: ${detail}.${spots()}` });
  pop(foe); bursts();
  return done();
}

/** The whole fight with both bugs left to themselves. */
export function simulateBout(a, b, seed) {
  const S = startBout(a, b, seed);
  while (!S.over) stepBout(S);
  return { rounds: S.rounds, winner: S.winner, maxHp: S.maxHp, startHp: S.startHp };
}

export const LINE = { fights: 200, min: 10, max: 90, step: 5 }; // percent
const lines = new Map();
const lineKey = (c) => JSON.stringify([c.botched || 0, c.species, c.level, c.legacyAbilities || 0, c.battle || null, c.mood ?? 60, c.gear || 0, c.defense || 0, c.lunch?.heal || 0, c.health ?? 100, !!c.plain, c.rule || null, c.trained || 0, (c.prizes || []).join()]);
/**
 * The line: how often `a` beats `b` with both bugs left to themselves, as they stand (level, health, mood, attack and
 * defense gear, packed lunch, stance). Each seed is fought both ways round, so a mirror match is exactly even and line(a, b) + line(b, a) is
 * exactly 1. To the nearest 5%, kept between 10% and 90%: 400 fights say no more than that, and an owner who picks
 * the moves can beat it. Stakes and win XP follow this number (riskFor, upsetXp).
 */
export function line(a, b) {
  const ka = lineKey(a), kb = lineKey(b);
  if (ka > kb) return (100 - Math.round(line(b, a) * 100)) / 100;
  const key = `${ka}|${kb}`;
  if (!lines.has(key)) {
    if (lines.size >= 5000) lines.clear(); // ponytail: the whole cache at once; a line costs 3 ms, so evict properly only if that ever shows
    let won = 0;
    for (let k = 0; k < LINE.fights; k++) {
      const x = simulateBout(a, b, `line:${k}`).winner, y = simulateBout(b, a, `line:${k}`).winner;
      won += (x === 0 ? 1 : x === null ? 0.5 : 0) + (y === 1 ? 1 : y === null ? 0.5 : 0);
    }
    lines.set(key, Math.min(LINE.max, Math.max(LINE.min, Math.round((won / (2 * LINE.fights)) * (100 / LINE.step)) * LINE.step)) / 100);
  }
  return lines.get(key);
}
