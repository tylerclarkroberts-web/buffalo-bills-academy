// Barn bouts (v31; v33 adds bug traits and capped store gear): a cosmetic, server-decided scrap between two level-5+ creatures.
// Deterministic: the same seed and the same two creatures always give the same bout, so the client only replays
// the log it's handed. No money, no XP, no stakes: the winner gets a ribbon on its record, the loser a sulk.
import { BY_ID, ABILITY_LEVELS } from './creatures.js';

export const BOUT_HP = 100;
export const MAX_ROUNDS = 16;
/** Battle gear from the General Store adds at most +6% damage, total, however much is equipped. */
export const GEAR_CAP = 0.06;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** An ability's base punch: 17, 20 or 23 by tier, the same for every species, so none is simply better. */
export const abilityPower = (tier) => 17 + tier * 3;

const MISS = ['trips over its own feet', 'gets distracted by a moth', 'swings at a cloud', 'sneezes mid-wind-up', 'forgets what it was doing'];
const HIT = ['lands it', 'connects', 'makes it stick', 'gets it right in the dignity', 'lands it with a wet slap'];

/**
 * @param a,b {species, name, level, mood?} mood 0-100 (the current lowest need), worth up to +10% damage.
 * @returns {rounds:[{by:0|1, ability, tier, hit, dmg, hp:[a,b], line}], winner: 0|1|null}
 */
export function simulateBout(a, b, seed) {
  const R = mulberry32(hash(`${seed}`) ^ hash(a.species) ^ (hash(b.species) << 1));
  const side = [a, b].map((c) => {
    const k = BY_ID[c.species];
    const tiers = k.abilities.map((name, i) => ({ name, tier: i })).filter((x) => (c.level || 1) >= ABILITY_LEVELS[x.tier]);
    const st = k.stats || { atk: 3, def: 3, spd: 3 };
    const gear = Math.max(0, Math.min(GEAR_CAP, Number(c.gear) || 0)); // store battle gear: capped, see GEAR_CAP
    return { c, k, tiers, st, boost: (1 + Math.max(0, Math.min(100, c.mood ?? 60)) / 1000) * (1 + gear) };
  });
  const hp = [BOUT_HP, BOUT_HP];
  const rounds = [];
  // the quicker bug (higher spd) is a little more likely to go first
  let by = R() < 0.5 + (side[0].st.spd - side[1].st.spd) * 0.03 ? 0 : 1;
  for (let r = 0; r < MAX_ROUNDS && hp[0] > 0 && hp[1] > 0; r++, by = 1 - by) {
    const s = side[by];
    const pick = s.tiers[Math.floor(R() * s.tiers.length)];
    const hit = R() < 0.82 - pick.tier * 0.06 - (side[1 - by].st.spd - 3) * 0.03; // bigger moves miss more; quick bugs dodge
    let dmg = 0;
    // traits: attack adds and the target's armour takes off up to 8%; every bug's stats sum to 9, so it nets out
    const trait = (1 + (s.st.atk - 3) * 0.04) * (1 - (side[1 - by].st.def - 3) * 0.04);
    if (hit) dmg = Math.round(abilityPower(pick.tier) * (0.8 + R() * 0.45) * s.boost * trait);
    hp[1 - by] = Math.max(0, hp[1 - by] - dmg);
    const line = hit ? `${s.c.name} uses ${pick.name} and ${HIT[Math.floor(R() * HIT.length)]}!` : `${s.c.name} tries ${pick.name} but ${MISS[Math.floor(R() * MISS.length)]}.`;
    rounds.push({ by, ability: pick.name, tier: pick.tier, hit, dmg, hp: [hp[0], hp[1]], line });
  }
  const winner = hp[0] === hp[1] ? null : hp[0] > hp[1] ? 0 : 1;
  return { rounds, winner };
}
