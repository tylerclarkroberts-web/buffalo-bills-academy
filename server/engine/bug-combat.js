import { BY_ID, ABILITY_LEVELS, LEVEL_CAP } from './creatures.js';

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
  pheropsophus: ['venom', 'pierce', 'Miidera Warning', 'weaken', 'Pressure Chamber', 'guard'],
  melanophila: ['pierce', 'weaken', 'Charred Bark', 'guard', 'Fresh Burn', 'heal'],
  solenopsis: ['venom', 'guard', 'Mound Rally', 'heal', 'Unconquered', 'pierce'],
  pyrrhocoris: ['guard', 'weaken', 'Lime Tree Huddle', 'heal', 'Extra Instar', 'pierce'],
  brevisana: ['weaken', 'pierce', 'Thorn Perch', 'guard', 'Midday Chorus', 'heal'],
  micronecta: ['weaken', 'heal', 'Shallows', 'guard', 'Calibration Check', 'pierce'],
  bertholdia: ['weaken', 'guard', 'Wake Forest', 'heal', 'Highest Click Rate', 'pierce'],
  gromphadorhina: ['guard', 'weaken', 'Glass Climb', 'heal', 'Breeding Rights', 'pierce'],
  gryllotalpa: ['pierce', 'weaken', 'Resonator Bulb', 'guard', 'Sunset Solo', 'heal'],
  dytiscus: ['pierce', 'guard', 'Wet Road Landing', 'weaken', 'Bubble Breath', 'heal'],
  notonecta: ['pierce', 'weaken', 'Drag Reduction', 'guard', 'A Hundred and Twenty Days', 'heal'],
  gyrinus: ['weaken', 'guard', 'Bubble Gill', 'heal', 'Split Sight', 'pierce'],
  halobates: ['weaken', 'pierce', 'Storm Drift', 'guard', 'Plastic Jug Nursery', 'heal'],
  phloeodes: ['guard', 'pierce', 'Eight Good Years', 'heal', 'Dead Weight', 'weaken'],
  photuris: ['weaken', 'pierce', 'Dusk Patrol', 'guard', 'Rover for Supper', 'heal'],
  arachnocampa: ['weaken', 'pierce', 'Midge Supper', 'heal', 'Silk Hammock', 'guard'],
  myrmeleon: ['pierce', 'weaken', 'Backward Shuffle', 'guard', 'Cocoon of Sand', 'heal'],
  odontomachus: ['pierce', 'guard', 'Four Trigger Hairs', 'weaken', 'Another Nest', 'heal'],
  dasymutilla: ['venom', 'guard', 'Warning Squeak', 'weaken', 'Nectar Stop', 'heal'],
  peruphasma: ['venom', 'pierce', 'Stands Very Still', 'guard', 'Schinus Leaves', 'heal'],
  ampulex: ['venom', 'pierce', 'Half an Antenna', 'heal', 'By the Antenna', 'weaken'],
  colobopsis: ['venom', 'guard', 'Epiphyte Graze', 'heal', 'Sixty Metres Up', 'pierce'],
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
  still: 0.05, shell: 0.1, vanish: 0.25, fifth: 0.35, linger: 0.25, stun: 0.04, blind: 0.12, mask: 0.35, caseGuard: 0.35, log: 0.3, regen: 0.75, pop: 8, xylella: 0.3,
  scales: 0.55, lights: 0.06, front: 0.1, kick: 0.4, maneater: 0.3, heavy: 0.07, calm: 0.25, lure: 1, prey: 0.02, fan: 0.05, streak: 0.02, turtles: 0.05, smell: 0.15,
  // the thirteen that came with Fire, Sonic and Water, set the same way with the type perks on
  // (the bombardier's pop went from 5 to 8 when it left Toxic for Fire)
  vomit: 0.43, heat: 0.12, raft: 0.06, moult: 10, din: 0.04, tiny: 0.05, jam: 0.12, hiss: 0.22, horn: 0.5, grip: 0.1, upside: 0.4, eyes: 0.06, skate: 0.08,
  // and the nine after those, for the types that were here already. `spray` and `goo` are HP; `thread` is a share per attack. An exploding ant's burst only ever helps it, and each point of `goo` was worth over a point of win rate, so `minor` takes a share off its hits to pay for a burst worth having.
  // (Three Sonic traits went up a little with them, tiny, jam and hiss: the newcomers were mostly Shell and Toxic, which beat Sonic.)
  iron: 0.2, encore: 0.6, thread: 0.012, pit: 0.08, jump: 0.3, pain: 0.14, spray: 3, sting: 0.05, goo: 14, minor: 0.12,
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
  pheropsophus: ['Comes Back Up', () => `${pct(TRAIT.vomit)} of the time, the first knockout blow leaves it at 1 HP instead.`],
  melanophila: ['Follows the Heat', () => `Its attacks are ${pct(TRAIT.heat)} more likely to hit an opponent below half health.`],
  solenopsis: ['Raft', () => `Takes ${pct(TRAIT.raft)} less from hits while above half health, and Water types get no edge on it.`],
  pyrrhocoris: ['Extra Moult', () => `The first time it drops below a third of its health, it moults and gets ${TRAIT.moult} HP back.`],
  brevisana: ['Loudest on Record', () => `${pct(TRAIT.din)} of its hits deafen the opponent: it loses its next turn.`],
  micronecta: ['Two Millimetres', () => `Attacks are ${pct(TRAIT.tiny)} less likely to hit it.`],
  bertholdia: ['Jams Sonar', () => `Every other attack against it is ${pct(TRAIT.jam)} less likely to hit.`],
  gromphadorhina: ['Three Hisses', () => `The opponent's first three attacks each do ${pct(TRAIT.hiss)} less.`],
  gryllotalpa: ['Tuned Burrow', () => `Its first special of a fight hits ${pct(TRAIT.horn)} harder.`],
  dytiscus: ['Suction Cups', () => `After it lands a hit, its next attack is ${pct(TRAIT.grip)} more likely to hit.`],
  notonecta: ['Upside Down', () => `The first attack against it is ${pct(TRAIT.upside)} less likely to hit.`],
  gyrinus: ['Split Eyes', () => `Its attacks are ${pct(TRAIT.eyes)} more likely to hit.`],
  halobates: ['Open Water', () => `While it has more than half its health, attacks are ${pct(TRAIT.skate)} less likely to hit it.`],
  phloeodes: ['39,000 Times Its Weight', () => `No single hit takes more than ${pct(TRAIT.iron)} of its health.`],
  photuris: ['Second Signal', () => `It flashes again the first time it drops below a quarter of its health: the opponent's next attack does ${pct(TRAIT.encore)} less.`],
  arachnocampa: ['Thirty Threads', () => `Every attack against it leaves the attacker in one more thread. Each takes ${pct(TRAIT.thread)} off that bug's hits, up to 30.`],
  myrmeleon: ['The Pit', () => `Once the opponent has attacked it three times it has slid in: the antlion's attacks are ${pct(TRAIT.pit)} more likely to hit.`],
  odontomachus: ['Escape Jump', () => `The first hit to land on it once it is below half health does ${pct(TRAIT.jump)} less.`],
  dasymutilla: ['Cow Killer', () => `A poisoned opponent's hits do ${pct(TRAIT.pain)} less.`],
  peruphasma: ['Sprays When Disturbed', () => `The first two hits that land on it cost the attacker ${TRAIT.spray} HP each.`],
  ampulex: ['Second Sting', () => `Once it has landed two hits, the opponent's hits do ${pct(TRAIT.sting)} less for the rest of the fight. Twice that on a cockroach.`],
  colobopsis: ['Yellow Goo', () => `Its hits do ${pct(TRAIT.minor)} less. The blow that would knock it out sets it off instead: ${TRAIT.goo} damage to the opponent, and if that finishes the opponent it is left standing on 1 HP.`],
};
// The line and what follows it. `p` is a bug's chance by the line (engine/bout.js).
/** What the other corner puts up against `stake` from a bug the line gives `p`: fair odds, so the favourite risks more. To the whole dollar: bout money never has cents. */
export const riskFor = (stake, p) => Math.round((stake * (1 - p)) / p);
/** A winner's bonus XP: `bonus` in an even fight, nearly double for the longest shot, a sliver for a sure thing. */
export const upsetXp = (bonus, p = 0.5) => Math.round(bonus * 2 * (1 - p));
// XP by level. A grown bug learns little from routine: care, daily and losing XP are whole through level FADE.from and
// fall in a straight line to FADE.floor of that at level FADE.to and beyond. A win is scaled by the gap to the bug it
// beat: more for each level above (up to GAP.most), much less for each level below.
export const FADE = { from: 5, to: 10, floor: 1 / 6 };
export const GAP = { up: 0.25, most: 2, down: [0.6, 0.3, 0.1] };
export const xpFade = (level) => Math.max(FADE.floor, Math.min(1, 1 - ((level - FADE.from) * (1 - FADE.floor)) / (FADE.to - FADE.from)));
/** XP that fades with the level of the bug earning it, never below 1. */
export const fadedXp = (xp, level) => (xp > 0 ? Math.max(1, Math.round(xp * xpFade(level))) : 0);
export const gapXp = (mine, theirs) => { const gap = theirs - mine; return gap >= 0 ? Math.min(GAP.most, 1 + GAP.up * gap) : GAP.down[Math.min(GAP.down.length, -gap) - 1]; };
/** What a fight pays: a win is `base` plus the upset `bonus`, scaled by the level gap; anything else is `base`, faded by the bug's own level. */
export const fightXp = ({ won, base, bonus, odds = 0.5, level, foeLevel = level }) => (won ? Math.max(1, Math.round((base + upsetXp(bonus, odds)) * gapXp(level, foeLevel))) : fadedXp(base, level));
export const traitFor = (species) => { const [name, text] = TRAITS[species] || []; return name ? { name, description: text() } : null; };

// What a level is worth: each one past GROWTH.from adds this much health and this share of damage.
export const GROWTH = { from: 1, hp: 5, dmg: 0.03 };
export function combatStats(level) {
  const growth = Math.max(0, Math.min(LEVEL_CAP, Number.isFinite(level) ? Math.floor(level) : 3) - GROWTH.from);
  return { maxHp: 100 + growth * GROWTH.hp, damageMultiplier: 1 + growth * GROWTH.dmg };
}
