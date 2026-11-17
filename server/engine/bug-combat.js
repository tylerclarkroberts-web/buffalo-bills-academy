import { BY_ID, ABILITY_LEVELS, MAX_LEVEL } from './creatures.js';

export const MOVE_IDS = ['basic', 'technique', 'signature', 'tactic', 'capstone'];
export const STANCES = {
  balanced: { id: 'balanced', name: 'Balanced', description: 'Left alone, it rotates through its specials as they come ready. Normal damage and defence.', damage: 1, taken: 1 },
  aggressive: { id: 'aggressive', name: 'Aggressive', description: 'Left alone, it reaches for piercing and venom first. Deal and take 8% more direct attack damage.', damage: 1.08, taken: 1.08 },
  defensive: { id: 'defensive', name: 'Defensive', description: 'Left alone, it heals and guards first. Deal and take 8% less direct attack damage.', damage: 0.92, taken: 0.92 },
};

// The first three names stay with their species; effects and new moves share a small combat vocabulary.
const KITS = {
  ceroplophana: ['guard', 'pierce', 'Horn Feint', 'weaken', 'Sumatran Second Wind', 'heal'],
  bocydium: ['heal', 'weaken', 'Orbital Shell', 'guard', 'Globe Drill', 'pierce'],
  phrictus: ['guard', 'weaken', 'Dragon Sap', 'heal', 'Five-Point Lance', 'pierce'],
  pyrops: ['pierce', 'weaken', 'Longan Sip', 'heal', 'Lantern Shield', 'guard'],
  graphocephala: ['weaken', 'venom', 'Striped Shelter', 'guard', 'Meadow Renewal', 'heal'],
  umbonia: ['pierce', 'guard', 'Thorn Warning', 'weaken', 'Sapling Revival', 'heal'],
  trachelophorus: ['guard', 'pierce', 'Neck Sway', 'weaken', 'Rolled-Leaf Rest', 'heal'],
  eupholus: ['pierce', 'guard', 'Blue Scale Dazzle', 'weaken', 'Weevil Recovery', 'heal'],
  pachyrhynchus: ['guard', 'pierce', 'Prism Dazzle', 'weaken', 'Island Renewal', 'heal'],
  platymeris: ['venom', 'pierce', 'Two-Spot Threat', 'weaken', 'Assassin Carapace', 'guard'],
  acanthaspis: ['pierce', 'heal', 'Ant-Cloak Screen', 'guard', 'Assassin Secretion', 'venom'],
  helicopsyche: ['weaken', 'heal', 'Pebble Bastion', 'guard', 'Spiral Lance', 'pierce'],
  chrysochroa: ['weaken', 'pierce', 'Jewel Carapace', 'guard', 'Summer Renewal', 'heal'],
  lamprima: ['guard', 'heal', 'Stag Threat', 'weaken', 'Golden Mandible Drill', 'pierce'],
  onymacris: ['guard', 'heal', 'Dune Dazzle', 'weaken', 'Desert Piercer', 'pierce'],
  brachinus: ['venom', 'pierce', 'Warning Crackle', 'weaken', 'Pressure Shield', 'guard'],
  phrixothrix: ['heal', 'weaken', 'Railway Carapace', 'guard', 'Red-Light Lance', 'pierce'],
  macrodontia: ['pierce', 'weaken', 'Gallery Shelter', 'guard', 'Longhorn Recovery', 'heal'],
  sagra: ['weaken', 'pierce', 'Vine Shelter', 'guard', 'Leaf-Sap Renewal', 'heal'],
  manticora: ['weaken', 'pierce', 'Dune Carapace', 'guard', 'Nightfall Recovery', 'heal'],
  heteropteryx: ['weaken', 'guard', 'Jungle Sap', 'heal', 'Nymph Spike', 'pierce'],
  mantispa: ['heal', 'guard', 'Lacewing Feint', 'weaken', 'Lightning Pincer', 'pierce'],
  nemoptera: ['weaken', 'heal', 'Spoon-Wing Shield', 'guard', 'Lacewing Needle', 'pierce'],
  pseudocreobotra: ['weaken', 'pierce', 'Petal Shelter', 'guard', 'Flower Renewal', 'heal'],
  deroplatys: ['guard', 'weaken', 'Forest Renewal', 'heal', 'Dead-Leaf Ambush', 'pierce'],
  empusa: ['weaken', 'pierce', 'Conehead Guard', 'guard', 'Night-Sap Recovery', 'heal'],
  polyphylla: ['guard', 'pierce', 'Pine-Scent Feint', 'weaken', 'Forest Rest', 'heal'],
  phanaeus: ['heal', 'guard', 'Rainbow Dazzle', 'weaken', 'Scarab Horn Drill', 'pierce'],
  lethocerus: ['pierce', 'guard', 'Pond Recovery', 'heal', 'Water-Bug Venom', 'venom'],
  sphaerocoris: ['venom', 'guard', 'Painted Warning', 'weaken', 'Picasso Recovery', 'heal'],
};

const EFFECTS = {
  strike: { power: 18, accuracy: 0.9, cooldown: 0, description: 'A reliable direct attack.' },
  guard: { power: 12, accuracy: 0.9, cooldown: 3, guard: 0.5, description: 'Attack and halve the next incoming attack. Guard does not block venom.' },
  venom: { power: 10, accuracy: 0.9, cooldown: 3, venom: 5, duration: 2, description: 'On hit, poison for two turns. Venom bypasses armour and does not stack.' },
  pierce: { power: 20, accuracy: 0.88, cooldown: 3, description: 'Ignore armour and half of any guard. Stance protection still applies.' },
  heal: { power: 0, accuracy: 1, cooldown: 4, heal: 22, description: 'Recover HP instead of attacking. Left alone, a bug waits until 65% HP or lower.' },
  weaken: { power: 14, accuracy: 0.9, cooldown: 3, weaken: 0.65, description: 'On hit, reduce the next enemy attack by 35%. Does not stack.' },
};

export function movesFor(species, level, legacyAbilities = 0) {
  const bug = BY_ID[species];
  if (!bug) throw new RangeError('Unknown bug species.');
  const [technique, signature, tacticName, tactic, capstoneName, capstone] = KITS[species];
  const names = [...bug.abilities, tacticName, capstoneName];
  const effects = ['strike', technique, signature, tactic, capstone];
  return MOVE_IDS.map((id, tier) => {
    const effect = effects[tier], base = EFFECTS[effect], extra = Math.max(0, tier - 1) * 2;
    return { id, name: names[tier], level: ABILITY_LEVELS[tier], unlocked: level >= ABILITY_LEVELS[tier] || tier < Math.min(3, legacyAbilities),
      tier, effect, ...base, power: base.power ? base.power + extra : 0, ...(base.heal ? { heal: base.heal + extra } : {}),
      ...(id === 'capstone' && effect === 'pierce' ? { criticalChance: 0.05, description: `${base.description} On a nonlethal hit, 5% chance to leave the opponent at 1 HP.` } : {}) };
  });
}

/** The saved stance, and the specials a bug reaches for when nobody lines a move up: all of them (older saves chose two). */
export function battleFor(species, level, legacyAbilities = 0, stored = null) {
  const specials = movesFor(species, level, legacyAbilities).filter(move => move.unlocked && move.id !== 'basic').map(move => move.id);
  return { stance: Object.hasOwn(STANCES, stored?.stance) ? stored.stance : 'balanced', specials };
}

// One trait per species, each from a fact on its sheet (server/engine/bugs.js). TRAIT holds the numbers the fight
// reads (server/engine/bout.js). They were set by simulating every pairing at levels 1, 4, 7 and 10, both bugs left
// to themselves, until each species averaged near an even record. No single level is perfectly even: a trait tied to
// a move does nothing until that move is learned.
export const TRAIT = {
  still: 0.05, shell: 0.1, vanish: 0.25, fifth: 0.35, linger: 0.25, stun: 0.04, blind: 0.12, mask: 0.35, caseGuard: 0.35, log: 0.3, regen: 0.75, pop: 5, xylella: 0.3,
  scales: 0.55, lights: 0.06, front: 0.1, kick: 0.4, maneater: 0.3, heavy: 0.07, calm: 0.25, lure: 1, prey: 0.02, fan: 0.05, streak: 0.02, turtles: 0.05, smell: 0.15,
};
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const TRAITS = {
  ceroplophana: ['Type Specimen Missing', () => `Below a quarter HP, ${pct(TRAIT.vanish)} of attacks can't find it.`],
  bocydium: ['Purpose Unknown', () => 'Each fight the globes add +1 to a random stat.'],
  phrictus: ['Five Points', () => `Every fifth attack hits ${pct(TRAIT.fifth)} harder.`],
  pyrops: ['Through the Bark', () => 'Its pierce ignores guard completely.'],
  graphocephala: ['Carries Xylella', () => `Its venom does ${pct(TRAIT.xylella)} more each turn.`],
  umbonia: ['She Stays', () => `Its guard lingers: the attack after the blocked one is cut by ${pct(TRAIT.linger)}.`],
  trachelophorus: ['Off the Leaf', () => `${pct(TRAIT.stun)} of its hits knock the opponent off the leaf: it loses its next turn.`],
  eupholus: ['Scales, Not Pigment', () => `Venom and weaken are ${pct(TRAIT.scales)} weaker on it.`],
  pachyrhynchus: ['Fused Shell', () => `Pierce does not get past its armour or its guard, and does ${pct(TRAIT.shell)} less.`],
  platymeris: ['Spits', () => `When its venom lands, the opponent's next attack is ${pct(TRAIT.blind)} less likely to hit.`],
  acanthaspis: ['Corpse Mask', () => `The first hit against it does ${pct(TRAIT.mask)} less.`],
  helicopsyche: ['Coiled Case', () => `Healing also raises a guard that blocks ${pct(TRAIT.caseGuard)} of the next attack.`],
  chrysochroa: ['Tamamushi-iro', () => 'Its damage is rolled twice and read the favourable way.'],
  lamprima: ['His Log', () => `+${pct(TRAIT.log)} damage while it has more of its HP left than the opponent.`],
  onymacris: ['Headstand', () => `Regains ${TRAIT.regen * 4} HP every four turns.`],
  brachinus: ['Firing Chamber', () => `The first time it drops below half HP, it pops back for ${TRAIT.pop}.`],
  phrixothrix: ['Two Sets of Lights', () => `Its specials hit ${pct(TRAIT.lights)} harder.`],
  macrodontia: ['A Few Months as an Adult', () => `+${pct(TRAIT.front)} damage for its first three turns.`],
  sagra: ['Frog Legs', () => `After an attack misses it, its next hit deals +${pct(TRAIT.kick)}.`],
  manticora: ['Man-eater', () => `+${pct(TRAIT.maneater)} damage to an opponent below 30% HP.`],
  heteropteryx: ['65 Grams', () => `+${pct(TRAIT.heavy)} max HP.`],
  mantispa: ['60 Milliseconds', () => 'Always takes the first turn.'],
  nemoptera: ['Above 17 °C, No Wind', () => `Attacks are ${pct(TRAIT.calm)} less likely to hit it until it first takes damage.`],
  pseudocreobotra: ['Mistaken for a Flower', () => `Heals ${TRAIT.lure} HP whenever it lands a hit.`],
  deroplatys: ['Lies Still', () => `The first knockout blow leaves it at 1 HP, if it had more than ${pct(TRAIT.still)} of its HP.`],
  empusa: ['Only Live, Moving Prey', () => `+${pct(TRAIT.prey)} damage per point of the opponent's speed.`],
  polyphylla: ['Antenna Fan', () => `Its attacks ignore the opponent's speed and are ${pct(TRAIT.fan)} more likely to hit.`],
  phanaeus: ['Keeps Digging', () => `Each hit in a row adds +${pct(TRAIT.streak)} damage, up to five; a miss resets it.`],
  lethocerus: ['Has Taken Turtles', () => `+${pct(TRAIT.turtles)} damage to an opponent with more of its HP left.`],
  sphaerocoris: ['Nasty Smell', () => `Land a special on it and your next attack is ${pct(TRAIT.smell)} weaker.`],
};
// The line and what follows it. `p` is a bug's chance by the line (engine/bout.js).
/** What the other corner puts up against `stake` from a bug the line gives `p`: fair odds, so the favourite risks more. To the whole dollar: bout money never has cents. */
export const riskFor = (stake, p) => Math.round((stake * (1 - p)) / p);
/** A winner's bonus XP: `bonus` in an even fight, nearly double for the longest shot, a sliver for a sure thing. */
export const upsetXp = (bonus, p = 0.5) => Math.round(bonus * 2 * (1 - p));
export const traitFor = (species) => { const [name, text] = TRAITS[species] || []; return name ? { name, description: text() } : null; };

export function combatStats(level) {
  const growth = Math.max(0, Math.min(MAX_LEVEL, Number.isFinite(level) ? Math.floor(level) : 3) - 3);
  return { maxHp: 100 + growth * 3, damageMultiplier: (100 + growth * 2) / 100 };
}
