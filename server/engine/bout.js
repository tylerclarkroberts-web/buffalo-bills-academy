// Server-decided automatic fights. Stored events replay without running the battle or awarding XP again.
import { BY_ID } from './creatures.js';
import { battleFor, combatStats, movesFor, STANCES } from './bug-combat.js';

export const BOUT_HP = 100;
export const MAX_ROUNDS = 32; // actions; venom can add one event before each action
export const GEAR_CAP = 0.06;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const PRIORITY = { aggressive: ['pierce', 'venom', 'weaken', 'guard', 'heal'], defensive: ['heal', 'guard', 'weaken', 'venom', 'pierce'] };

/** Inputs include species, level, needs' minimum as mood, gear, and the selected battle stance/specials. */
export function simulateBout(a, b, seed) {
  const R = mulberry32(hash(`${seed}`) ^ hash(a.species) ^ (hash(b.species) << 1));
  const side = [a, b].map(c => {
    const st = BY_ID[c.species].stats, battle = battleFor(c.species, c.level, c.legacyAbilities, c.battle);
    const stats = combatStats(c.level), stance = STANCES[battle.stance];
    return { c, st, battle, stats, stance, moves: movesFor(c.species, c.level, c.legacyAbilities),
      boost: stats.damageMultiplier * (1 + Math.max(0, Math.min(100, c.mood ?? 60)) / 1000) * (1 + Math.max(0, Math.min(GEAR_CAP, Number(c.gear) || 0))) * stance.damage,
      turn: 0, readyAt: {}, guard: 0, weaken: 1, venom: null, lastSpecial: null };
  });
  const maxHp = side.map(s => s.stats.maxHp), hp = [...maxHp], rounds = [];
  let by = R() < 0.5 + (side[0].st.spd - side[1].st.spd) * 0.03 ? 0 : 1;
  for (let turn = 1; turn <= MAX_ROUNDS && hp[0] > 0 && hp[1] > 0; turn++, by = 1 - by) {
    const s = side[by], target = side[1 - by]; s.turn++;
    if (s.venom) {
      const dmg = Math.min(hp[by], s.venom.damage); hp[by] -= dmg;
      rounds.push({ by: 1 - by, type: 'venom', effect: 'venom', moveId: s.venom.moveId, ability: s.venom.name, tier: s.venom.tier, hit: true, dmg, hp: [...hp], turn,
        line: `${s.c.name} takes ${dmg} venom damage.` });
      if (--s.venom.left === 0) s.venom = null;
      if (hp[by] === 0) break;
    }
    let available = s.battle.specials.map(id => s.moves.find(move => move.id === id)).filter(move =>
      s.turn >= (s.readyAt[move.id] || 0) && (move.effect !== 'heal' || hp[by] <= maxHp[by] * 0.65) &&
      (move.effect !== 'venom' || !target.venom) && (move.effect !== 'guard' || !s.guard) && (move.effect !== 'weaken' || target.weaken === 1));
    if (PRIORITY[s.battle.stance]) available.sort((x, y) => PRIORITY[s.battle.stance].indexOf(x.effect) - PRIORITY[s.battle.stance].indexOf(y.effect));
    else if (available.length > 1 && available[0].id === s.lastSpecial) available = [available[1], available[0]];
    const move = available[0] || s.moves[0];
    if (move.id !== 'basic') { s.readyAt[move.id] = s.turn + move.cooldown; s.lastSpecial = move.id; }
    let dmg = 0, healed = 0, hit = true, detail = '';
    if (move.effect === 'heal') {
      healed = Math.min(maxHp[by] - hp[by], Math.round(move.heal * s.stats.damageMultiplier)); hp[by] += healed;
      detail = `recovers ${healed} HP`;
    } else {
      hit = R() < move.accuracy - (target.st.spd - 3) * 0.03;
      const armour = move.effect === 'pierce' ? 1 : 1 - (target.st.def - 3) * 0.04;
      const guard = 1 - target.guard * (move.effect === 'pierce' ? 0.5 : 1);
      if (hit) {
        dmg = Math.min(hp[1 - by], Math.max(1, Math.round(move.power * (0.8 + R() * 0.45) * s.boost * (1 + (s.st.atk - 3) * 0.04) * armour * target.stance.taken * guard * s.weaken)));
        hp[1 - by] -= dmg;
        if (move.effect === 'venom') { target.venom = { damage: Math.max(1, Math.round(move.venom * s.stats.damageMultiplier)), left: move.duration, name: move.name, moveId: move.id, tier: move.tier }; detail = ' and poisons for two turns'; }
        if (move.effect === 'weaken') { target.weaken = move.weaken; detail = ' and weakens the next attack'; }
      }
      target.guard = 0; s.weaken = 1; // protection/debuff is spent on the next attack, including a miss
      if (move.effect === 'guard') { s.guard = move.guard; detail += ' and raises a guard'; }
      detail = hit ? `deals ${dmg} damage${detail}` : `misses${move.effect === 'guard' ? ' but raises a guard' : ''}`;
    }
    rounds.push({ by, type: 'move', effect: move.effect, moveId: move.id, ability: move.name, tier: move.tier, hit, dmg, healed, hp: [...hp], turn, ownTurn: s.turn,
      line: `${s.c.name} uses ${move.name}: ${detail}.` });
  }
  const score = hp[0] * maxHp[1] - hp[1] * maxHp[0];
  return { rounds, winner: score === 0 ? null : score > 0 ? 0 : 1, maxHp };
}
