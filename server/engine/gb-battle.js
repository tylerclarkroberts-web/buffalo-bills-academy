// Mine bug battles: a small Game Boy-style (Gen 1) turn-based fight between two miners' barn bugs.
// Pure: every random number comes from an injected `rand(n)` (0..n-1); the server passes crypto.randomInt.
// Both sides pick a move, the faster bug goes first, damage uses the Gen 1 shape (level, power, attack/defence,
// same-type bonus, type chart, 217-255 spread, speed-based critical hits). Nothing here touches money.
import { BY_ID, MAX_LEVEL } from './creatures.js';
import { movesFor } from './bug-combat.js';

// Four bug types, a closed loop: each is strong against the next and weak against the one before it.
export const TYPES = ['SHELL', 'CLAW', 'SAP', 'ODD'];
const BEATS = { SHELL: 'CLAW', CLAW: 'SAP', SAP: 'ODD', ODD: 'SHELL' }; // claws bounce off shells, soft sap-suckers get clawed...
// Flavour, not taxonomy: armoured beetles are SHELL, hunters are CLAW, sap- and leaf-eaters are SAP, and the
// strange ones (sprays, glows, giraffe necks, snail cases) are ODD. Kept close to 8/8/7/7 so no type rules the mine.
const TYPE_OF = {
  SHELL: ['ceroplophana', 'eupholus', 'pachyrhynchus', 'chrysochroa', 'lamprima', 'polyphylla', 'phanaeus', 'onymacris'],
  CLAW: ['platymeris', 'acanthaspis', 'manticora', 'mantispa', 'pseudocreobotra', 'deroplatys', 'empusa', 'lethocerus'],
  SAP: ['bocydium', 'phrictus', 'pyrops', 'graphocephala', 'umbonia', 'sphaerocoris', 'sagra'],
  ODD: ['trachelophorus', 'helicopsyche', 'phrixothrix', 'heteropteryx', 'nemoptera', 'brachinus', 'macrodontia'],
};
const TYPE_BY_ID = Object.fromEntries(Object.entries(TYPE_OF).flatMap(([t, ids]) => ids.map((id) => [id, t])));
export function typeOf(species) {
  if (TYPE_BY_ID[species]) return TYPE_BY_ID[species];
  const order = BY_ID[species]?.order || ''; // a bug added later without a listing falls back on its order
  if (/^Beetle/.test(order)) return 'SHELL';
  if (/^Mantis|^Mantidfly|assassin/.test(order)) return 'CLAW';
  if (/^True bug|^Planthopper/.test(order)) return 'SAP';
  return 'ODD';
}
export function effectiveness(moveType, defType) {
  if (!TYPES.includes(moveType)) return 1;
  if (BEATS[moveType] === defType) return 1.25; // much softer than the Game Boy's 2x: one bug each, no switching, real stakes
  if (BEATS[defType] === moveType) return 0.8;
  return 1;
}

// Gen 1 stat stages.
const STAGE = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];
export const stageMul = (s) => STAGE[Math.max(-6, Math.min(6, s)) + 6] / 100;

/** Barn level 1..10 maps onto a Game Boy-ish battle level so the formulas have room to breathe. */
export const battleLevel = (level) => 40 + Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1)); // a raised bug is better, not untouchable

// Every bug gets the same shape of moveset so no species is stuck with one attack or two heals:
//   1) its plain jab (NORMAL), 2) its typed attack, 3) a guard (DEFENSE up), 4) its special, from the barn kit's
//   tactic: a heal, a piercing blow, venom, a guard of its own, or a weakening.
// Names come from the species' own moves (server/engine/bug-combat.js), so a horned chafer still headbutts.
const JAB = { kind: 'damage', power: 50, accuracy: 100, pp: 35, normal: true };
const TYPED = { kind: 'damage', power: 70, accuracy: 95, pp: 15 };
const BRACE = { kind: 'status', accuracy: 100, pp: 20, self: { def: 1 } };
const SPECIAL = {
  heal: { kind: 'heal', accuracy: 100, pp: 3, heal: 0.3 },
  pierce: { kind: 'damage', power: 90, accuracy: 85, pp: 5, highCrit: true },
  venom: { kind: 'damage', power: 40, accuracy: 95, pp: 10, poison: 60 },
  guard: { kind: 'status', accuracy: 100, pp: 10, self: { def: 2 } },
  weaken: { kind: 'status', accuracy: 100, pp: 10, foe: { atk: -2 } },
};
export const STRUGGLE = { id: 'struggle', name: 'Struggle', kind: 'damage', power: 50, accuracy: 100, type: 'NORMAL', recoil: 0.25 };

/**
 * One fighter: four moves named from its species kit (whatever its barn level), stats from the species' atk/def/spd
 * leanings and its level. `loaner` is the Foreman's spare beetle for miners without a bug.
 */
export function makeFighter({ owner, ownerName, name, species, level = 1, loaner = false }) {
  const bug = BY_ID[species];
  if (!bug) throw new RangeError('Unknown bug species.');
  const L = battleLevel(level), type = typeOf(species);
  const base = (s) => 60 + 10 * s; // species leanings 1..5: they lean, they don't decide
  const stat = (s) => Math.floor((base(s) * 2 * L) / 100) + 5;
  const maxHp = Math.floor(1.5 * Math.floor(((60 + 5 * bug.stats.def) * 2 * L) / 100)) + L + 15; // a bit more than a cartridge bug's: room for a plan
  const kit = movesFor(species, MAX_LEVEL); // [basic, technique, signature, tactic, capstone]
  const shapes = [JAB, TYPED, BRACE, SPECIAL[kit[3].effect] || SPECIAL.guard];
  const moves = kit.slice(0, 4).map((m, i) => {
    const g = shapes[i];
    return { id: m.id, name: m.name, kind: g.kind, power: g.power || 0, accuracy: g.accuracy, pp: g.pp, maxPp: g.pp,
      type: g.normal ? 'NORMAL' : type, ...(g.highCrit ? { highCrit: true } : {}), ...(g.poison ? { poison: g.poison } : {}),
      ...(g.self ? { self: g.self } : {}), ...(g.foe ? { foe: g.foe } : {}), ...(g.heal ? { heal: g.heal } : {}) };
  });
  return { owner, ownerName: ownerName || '', name, species, level: Math.max(1, Math.floor(level) || 1), battleLevel: L, type, loaner: !!loaner,
    stats: { atk: stat(bug.stats.atk), def: stat(bug.stats.def), spd: stat(bug.stats.spd) }, baseSpd: base(bug.stats.spd),
    maxHp, hp: maxHp, stages: { atk: 0, def: 0 }, poisoned: false, moves };
}

/** Moves a fighter can still use (indices); empty means Struggle. */
export function legalMoves(f) { return f.moves.map((m, i) => (m.pp > 0 ? i : -1)).filter((i) => i >= 0); }

/** What a timed-out or disconnected-for-a-moment side does: a random legal move (server RNG). */
export function autoMove(f, rand) {
  const legal = legalMoves(f);
  return legal.length ? legal[rand(legal.length)] : -1;
}

export function newBattle(a, b) {
  return { sides: { a: structuredClone(a), b: structuredClone(b) }, turn: 1, winner: null, log: [] };
}

const upper = (s) => String(s).toUpperCase();
/** Accuracy, less a little when the target is quicker: a fast bug is hard to pin down (up to -12). */
export function hitChance(move, att, def) {
  return move.accuracy - Math.max(0, Math.min(12, Math.floor((def.stats.spd - att.stats.spd) / 2)));
}
function damage(att, def, move, rand, events) {
  const crit = rand(256) < Math.min(255, Math.floor(att.baseSpd / 2) * (move.highCrit ? 4 : 1));
  // Gen 1: a critical hit ignores stat stages on both sides.
  const A = crit ? att.stats.atk : Math.max(1, Math.floor(att.stats.atk * stageMul(att.stages.atk)));
  const D = crit ? def.stats.def : Math.max(1, Math.floor(def.stats.def * stageMul(def.stages.def)));
  const L = att.battleLevel * (crit ? 2 : 1);
  let dmg = Math.floor(Math.floor((Math.floor((2 * L) / 5) + 2) * move.power * A / D) / 42) + 2; // /50 on the cartridge: a quicker fight for a phone
  if (move.type === att.type) dmg = Math.floor(dmg * 1.25); // same-type bonus
  const eff = effectiveness(move.type, def.type);
  dmg = Math.floor(dmg * eff);
  dmg = Math.max(1, Math.floor((dmg * (217 + rand(39))) / 255));
  if (crit) events.push({ t: 'text', s: 'A CRITICAL HIT!' });
  if (eff > 1) events.push({ t: 'text', s: "IT'S SUPER EFFECTIVE!" });
  if (eff < 1) events.push({ t: 'text', s: "IT'S NOT VERY EFFECTIVE..." });
  return dmg;
}

function hp(side, f, events) { events.push({ t: 'hp', side, hp: f.hp }); }

function useMove(state, side, idx, rand, events) {
  const foeSide = side === 'a' ? 'b' : 'a';
  const att = state.sides[side], def = state.sides[foeSide];
  let move = idx >= 0 && att.moves[idx]?.pp > 0 ? att.moves[idx] : null;
  if (!move) move = STRUGGLE; else move.pp -= 1;
  const who = `${upper(att.name)}`;
  events.push({ t: 'text', s: `${who} USED ${upper(move.name)}!`, side, move: move.id });
  if (move.kind !== 'heal' && !move.self && rand(100) >= hitChance(move, att, def)) { events.push({ t: 'text', s: `${who}'S ATTACK MISSED!` }); return; }
  if (move.kind === 'damage') {
    const dmg = damage(att, def, move, rand, events);
    def.hp = Math.max(0, def.hp - dmg); hp(foeSide, def, events);
    if (move.recoil) { att.hp = Math.max(0, att.hp - Math.max(1, Math.floor(dmg * move.recoil))); events.push({ t: 'text', s: `${who} IS HIT WITH RECOIL!` }); hp(side, att, events); }
    if (move.poison && def.hp > 0 && !def.poisoned && rand(100) < move.poison) { def.poisoned = true; events.push({ t: 'text', s: `${upper(def.name)} WAS POISONED!` }); }
  } else if (move.kind === 'heal') {
    if (att.hp >= att.maxHp) { events.push({ t: 'text', s: 'BUT IT FAILED!' }); return; }
    att.hp = Math.min(att.maxHp, att.hp + Math.floor(att.maxHp * move.heal)); events.push({ t: 'text', s: `${who} REGAINED HEALTH!` }); hp(side, att, events);
  } else {
    for (const [k, d] of Object.entries(move.self || {})) {
      if (att.stages[k] >= 6) { events.push({ t: 'text', s: 'NOTHING HAPPENED!' }); continue; }
      att.stages[k] = Math.min(6, att.stages[k] + d); events.push({ t: 'text', s: `${who}'S ${k === 'atk' ? 'ATTACK' : 'DEFENSE'} ${d > 1 ? 'SHARPLY ' : ''}ROSE!` });
    }
    for (const [k, d] of Object.entries(move.foe || {})) {
      if (def.stages[k] <= -6) { events.push({ t: 'text', s: 'NOTHING HAPPENED!' }); continue; }
      def.stages[k] = Math.max(-6, def.stages[k] + d); events.push({ t: 'text', s: `${upper(def.name)}'S ${k === 'atk' ? 'ATTACK' : 'DEFENSE'} ${d < -1 ? 'HARSHLY ' : ''}FELL!` });
    }
  }
}

function faint(state, side, events) {
  const f = state.sides[side];
  events.push({ t: 'text', s: `${upper(f.name)} FAINTED!`, faint: side });
  state.winner = side === 'a' ? 'b' : 'a';
}

/** Turn order: higher speed first; a tie is a coin flip. */
export function turnOrder(state, rand) {
  const { a, b } = state.sides;
  if (a.stats.spd !== b.stats.spd) return a.stats.spd > b.stats.spd ? ['a', 'b'] : ['b', 'a'];
  return rand(2) ? ['b', 'a'] : ['a', 'b'];
}

/**
 * Resolve one turn from both choices (move index, or -1 for Struggle). Returns the new state and the events to show.
 * The first bug to hit 0 HP loses; poison ticks at the end of the turn in speed order.
 */
export function resolveTurn(prev, choices, rand) {
  const state = structuredClone(prev), events = [];
  if (state.winner) return { state, events };
  for (const side of turnOrder(state, rand)) {
    useMove(state, side, choices[side], rand, events);
    for (const s of side === 'a' ? ['b', 'a'] : ['a', 'b']) if (state.sides[s].hp <= 0) { faint(state, s, events); break; }
    if (state.winner) break;
  }
  if (!state.winner) {
    for (const side of turnOrder(state, rand)) {
      const f = state.sides[side];
      if (!f.poisoned) continue;
      f.hp = Math.max(0, f.hp - Math.max(1, Math.floor(f.maxHp / 8)));
      events.push({ t: 'text', s: `${upper(f.name)} IS HURT BY POISON!` }); hp(side, f, events);
      if (f.hp <= 0) { faint(state, side, events); break; }
    }
  }
  state.turn += 1;
  state.log = [...state.log, ...events].slice(-60);
  return { state, events };
}

/** What a player may see of a fighter: everything about their own, HP/level/type/name for the other. */
export function fighterView(f, own) {
  return { name: f.name, ownerName: f.ownerName, species: f.species, level: f.level, type: f.type, hp: f.hp, maxHp: f.maxHp, loaner: f.loaner, poisoned: f.poisoned,
    ...(own ? { moves: f.moves.map(({ id, name, type, pp, maxPp, kind, power }) => ({ id, name, type, pp, maxPp, kind, power })) } : {}) };
}
