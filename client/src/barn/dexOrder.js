// The Bugdex's order: rarest first. Legendary, then Rare, Uncommon and Common; within a tier, card order (the species
// number). The legendaries go by how rarely you meet one: Wallace's Giant Bee and Meganeura are on the one shared
// legendary roll (server/mines.js LEGEND_DAYS), then the Lord Howe Island stick insect, which turns up on half of the hard days.
// STEEZE is Uncommon in the data, so it stays with the Uncommons.
import { ROSTER } from '../../../server/engine/creatures.js';
import { rarityOf, RARITY } from '../../../server/engine/bug-types.js';

const LEGEND_RANK = { megachile: 0, meganeura: 1, dryococelus: 2 };
const NO = new Map(ROSTER.map((bug, k) => [bug.id, k]));
const rank = (bug) => LEGEND_RANK[bug.id] ?? 99;

/** The roster, rarest first. Each bug keeps its card number (`no`, from 1). */
export const DEX_ORDER = ROSTER.map((bug) => ({ bug, no: NO.get(bug.id) + 1, rarity: rarityOf(bug.id) }))
  .sort((a, b) => b.rarity - a.rarity || rank(a.bug) - rank(b.bug) || a.no - b.no);

/** The same, in tiers for the dividers: [{ rarity, name, mark, bugs }], Legendary first. */
export const DEX_TIERS = [4, 3, 2, 1].map((rarity) => ({ rarity, ...RARITY[rarity], bugs: DEX_ORDER.filter((e) => e.rarity === rarity) })).filter((t) => t.bugs.length);
