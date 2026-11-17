// Server-decided fights, one action at a time. The Barn and the mine both run this: each bug acts in turn, using the
// move its owner lined up or, with nothing lined up, the one it picks for itself. Stored events replay without
// running the fight or awarding XP again.
import { BY_ID } from './creatures.js';
import { battleFor, combatStats, movesFor, STANCES, TRAIT } from './bug-combat.js';

export const BOUT_HP = 100;
export const MAX_ROUNDS = 32; // actions; venom and a bombardier's pop can add events around an action
export const GEAR_CAP = 0.06;
// HP: the most a packed lunch (store food) gives back, once a fight. Measured over every species pair, 10 HP moves an
// even fight to about 65% (60% at level 10), level with the best armour; 15 HP made it 72%, more than any gear.
export const LUNCH_CAP = 10;

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
    return { c, t: c.plain ? null : c.species, st: BY_ID[c.species].stats, battle, stats, stance, moves: movesFor(c.species, c.level, c.legacyAbilities),
      boost: stats.damageMultiplier * (1 + Math.max(0, Math.min(100, c.mood ?? 60)) / 1000) * (1 + Math.max(0, Math.min(GEAR_CAP, Number(c.gear) || 0))) * stance.damage,
      ward: 1 - Math.max(0, Math.min(GEAR_CAP, Number(c.defense) || 0)), // defense gear: what is left of each hit it takes
      lunch: Number(c.lunch?.heal) > 0 ? { name: String(c.lunch.name || 'packed lunch'), heal: Math.min(LUNCH_CAP, Math.round(Number(c.lunch.heal))) } : null, ate: false,
      turn: 0, readyAt: {}, usedAt: {}, guard: 0, guardLeft: 0, weaken: 1, venom: null, lastSpecial: null,
      attacks: 0, streak: 0, kick: false, blind: false, skip: false, damaged: false, mask: true, still: true, popped: false, regen: 0 };
  });
  for (const s of side) if (s.t === 'bocydium') { const k = ['atk', 'def', 'spd'][Math.floor(R() * 3)]; s.st = { ...s.st, [k]: s.st[k] + 1 }; s.globes = k; }
  // v76: a hurt bug starts where the last fight left it (c.health, percent of max; absent = full). Never below 1.
  const maxHp = side.map(s => Math.round(s.stats.maxHp * (s.t === 'heteropteryx' ? 1 + TRAIT.heavy : 1)));
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
/** The chance side `by`'s attack lands, as things stand. */
function aim(S, by, move) {
  const foe = 1 - by, s = S.side[by], target = S.side[foe];
  let spd = (target.st.spd - 3) * 0.03; if (s.t === 'polyphylla') spd = Math.min(0, spd) - TRAIT.fan;
  let acc = move.accuracy - spd;
  if (target.t === 'nemoptera' && !target.damaged) acc -= TRAIT.calm;
  if (s.blind) acc -= TRAIT.blind;
  if (target.t === 'ceroplophana' && S.hp[foe] < S.maxHp[foe] / 4) acc *= 1 - TRAIT.vanish;
  return acc;
}
/** What side `by`'s attack does at a given roll (0.8 up to 1.25), on its `attacks`-th attack and `turnNo`-th turn. */
function blow(S, by, move, roll, attacks, turnNo) {
  const { side, hp, maxHp } = S, foe = 1 - by, s = side[by], target = side[foe];
  const pierce = move.effect === 'pierce', shell = target.t === 'pachyrhynchus';
  const armour = pierce && !shell ? 1 : 1 - (target.st.def - 3) * 0.04;
  const guard = 1 - target.guard * (!pierce || shell ? 1 : s.t === 'pyrops' ? 0 : 0.5);
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
  if (s.t === 'phrixothrix' && move.id !== 'basic') mult *= 1 + TRAIT.lights;
  if (target.t === 'acanthaspis' && target.mask) mult *= 1 - TRAIT.mask;
  if (shell && pierce) mult *= 1 - TRAIT.shell;
  return Math.min(hp[foe], Math.max(1, Math.round(move.power * roll * s.boost * (1 + (s.st.atk - 3) * 0.04) * armour * target.stance.taken * target.ward * guard * s.weaken * mult)));
}
const scalesOf = (target) => (target.t === 'eupholus' ? 1 - TRAIT.scales : 1); // venom and weaken half flake off
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
    return [move.id, { hit: Math.max(0, Math.min(1, aim(S, i, move))), dmg: [0.8, 1.25].map(roll => blow(S, i, move, roll, s.attacks + 1, s.turn + 1)),
      ...(move.criticalChance ? { crit: move.criticalChance } : {}),
      ...(move.effect === 'venom' ? { venom: [venomOf(s, target, move), move.duration] } : {}),
      ...(move.effect === 'weaken' ? { weaken: (1 - move.weaken) * scalesOf(target) } : {}),
      ...(move.effect === 'guard' ? { guard: move.guard } : {}) }];
  }));
}

/** One action by whoever's turn it is. `choice` is a move id its owner lined up; anything unusable falls back to the bug's own pick. */
export function stepBout(S, choice) {
  if (S.over) return [];
  const { side, hp, maxHp, R, rounds } = S, from = rounds.length, by = S.by, foe = 1 - by, s = side[by], target = side[foe];
  const turn = ++S.turn; s.turn++;
  let stood = false;
  const hurt = (i, n) => {
    let d = Math.min(hp[i], n);
    if (d >= hp[i] && side[i].t === 'deroplatys' && side[i].still && hp[i] > maxHp[i] * TRAIT.still) { d = hp[i] - 1; side[i].still = false; stood = true; }
    hp[i] -= d; if (d > 0) side[i].damaged = true;
    return d;
  };
  const pop = (i) => {
    const q = side[i];
    if (q.t !== 'brachinus' || q.popped || hp[i] <= 0 || hp[i] >= maxHp[i] / 2) return;
    q.popped = true; const dmg = hurt(1 - i, TRAIT.pop);
    rounds.push({ by: i, type: 'venom', pop: true, effect: 'pierce', moveId: 'trait', ability: 'Firing Chamber', tier: 2, hit: true, dmg, hp: [...hp], turn,
      line: `${q.c.name} is below half and fires its chamber: ${dmg} damage.` });
  };
  // A packed lunch is eaten once, the first time its bug is left standing below half health. It costs no turn.
  const snack = (i) => {
    const q = side[i];
    if (!q.lunch || q.ate || hp[i] <= 0 || hp[i] >= maxHp[i] / 2) return;
    q.ate = true; const healed = Math.min(maxHp[i] - hp[i], q.lunch.heal); hp[i] += healed;
    rounds.push({ by: i, type: 'snack', effect: 'heal', moveId: 'lunch', ability: q.lunch.name, tier: 0, hit: true, dmg: 0, healed, hp: [...hp], turn,
      line: `${q.c.name} is below half and stops to eat its ${q.lunch.name}: ${healed} HP back.` });
  };
  const done = () => {
    snack(by); snack(foe);
    S.by = foe;
    if (hp[0] <= 0 || hp[1] <= 0 || S.turn >= MAX_ROUNDS) { const score = hp[0] * maxHp[1] - hp[1] * maxHp[0]; S.over = true; S.winner = score === 0 ? null : score > 0 ? 0 : 1; }
    return rounds.slice(from);
  };

  if (s.venom) {
    const dmg = hurt(by, s.venom.damage);
    rounds.push({ by: foe, type: 'venom', effect: 'venom', moveId: s.venom.moveId, ability: s.venom.name, tier: s.venom.tier, hit: true, dmg, hp: [...hp], turn,
      line: `${s.c.name} takes ${dmg} venom damage${stood ? ' and lies still at 1 HP' : ''}.` });
    if (--s.venom.left === 0) s.venom = null;
    pop(by); snack(by); snack(foe);
    if (hp[0] <= 0 || hp[1] <= 0) return done();
  }
  if (s.t === 'onymacris') { s.regen += TRAIT.regen; const n = Math.floor(s.regen); s.regen -= n; hp[by] = Math.min(maxHp[by], hp[by] + n); }
  if (s.skip) {
    s.skip = false;
    rounds.push({ by, type: 'move', skipped: true, effect: 'strike', moveId: 'basic', ability: s.moves[0].name, tier: 0, hit: false, critical: false, dmg: 0, healed: 0, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} is still climbing back onto the leaf and loses the turn.` });
    return done();
  }

  const move = (choice && s.moves.find(m => m.id === choice && usable(s, m, s.turn))) || pickFor(S, by, s.turn);
  if (move.id !== 'basic') { s.readyAt[move.id] = s.turn + move.cooldown; s.usedAt[move.id] = s.turn; s.lastSpecial = move.id; }
  let dmg = 0, healed = 0, hit = true, critical = false, detail = '';
  if (move.effect === 'heal') {
    healed = Math.min(maxHp[by] - hp[by], Math.round(move.heal * s.stats.damageMultiplier)); hp[by] += healed;
    detail = `recovers ${healed} HP`;
    if (s.t === 'helicopsyche') { s.guard = TRAIT.caseGuard; s.guardLeft = 1; detail += ' and coils into its case'; }
  } else {
    s.attacks++;
    hit = R() < aim(S, by, move); s.blind = false;
    if (hit) {
      const masked = target.t === 'acanthaspis' && target.mask;
      let roll = 0.8 + R() * 0.45; if (s.t === 'chrysochroa') roll = Math.max(roll, 0.8 + R() * 0.45);
      dmg = blow(S, by, move, roll, s.attacks, s.turn);
      s.kick = false; if (masked) target.mask = false;
      if (move.criticalChance && dmg < hp[foe] && R() < move.criticalChance) {
        critical = true; dmg = hp[foe] - 1;
        detail = `; critical hit leaves ${target.c.name} at 1 HP`;
      }
      dmg = hurt(foe, dmg); s.streak++;
      if (masked) detail += `; ${target.c.name}'s corpse mask takes some of it`;
      if (stood) detail += `; ${target.c.name} lies still at 1 HP`;
      if (move.effect === 'venom') {
        target.venom = { damage: venomOf(s, target, move), left: move.duration, name: move.name, moveId: move.id, tier: move.tier };
        detail += ' and poisons for two turns';
        if (s.t === 'platymeris') target.blind = true;
      } else if (move.effect === 'weaken') { target.weaken = 1 - (1 - move.weaken) * scalesOf(target); detail += ' and weakens the next attack'; }
      if (s.t === 'trachelophorus' && hp[foe] > 0 && R() < TRAIT.stun) { target.skip = true; detail += `; ${target.c.name} is knocked off the leaf`; }
      if (s.t === 'pseudocreobotra') hp[by] = Math.min(maxHp[by], hp[by] + TRAIT.lure);
    } else { s.streak = 0; if (target.t === 'sagra') target.kick = true; }
    // protection/debuff is spent on the next attack, including a miss (a thorn bug's guard lingers for one more)
    if (target.guard) target.guard = --target.guardLeft <= 0 ? 0 : TRAIT.linger;
    s.weaken = 1;
    if (hit && move.id !== 'basic' && target.t === 'sphaerocoris') s.weaken = 1 - TRAIT.smell;
    if (move.effect === 'guard') { s.guard = move.guard; s.guardLeft = s.t === 'umbonia' ? 2 : 1; detail += ' and raises a guard'; }
    detail = hit ? `deals ${dmg} damage${detail}` : `misses${move.effect === 'guard' ? ' but raises a guard' : ''}`;
  }
  rounds.push({ by, type: 'move', effect: move.effect, moveId: move.id, ability: move.name, tier: move.tier, hit, critical, dmg, healed, hp: [...hp], turn, ownTurn: s.turn,
    line: `${s.c.name} uses ${move.name}: ${detail}.` });
  pop(foe);
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
const lineKey = (c) => JSON.stringify([c.species, c.level, c.legacyAbilities || 0, c.battle || null, c.mood ?? 60, c.gear || 0, c.defense || 0, c.lunch?.heal || 0, c.health ?? 100, !!c.plain]);
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
