// Bug types: what a species is, what it beats and what beats it. One relation does all of it: a type "beats" three
// others, which means its hits land harder on them and theirs land softer on it (EDGE). Nine types, and every one
// beats three and loses to three. Six are everyday: among themselves each beats two and loses to two. Fire, Sonic and
// Water each beat two of those six and one another in a ring (Water puts out Fire, nobody sings in a Fire, and sound
// carries in Water).
export const TYPES = {
  flier: { name: 'Flier', color: '#8fc7ff', beats: ['brawler', 'toxic', 'fire'] },
  brawler: { name: 'Brawler', color: '#e0a060', beats: ['shell', 'dazzle', 'fire'] },
  shell: { name: 'Shell', color: '#9aa6b8', beats: ['toxic', 'dazzle', 'sonic'] },
  toxic: { name: 'Toxic', color: '#9be36a', beats: ['ambush', 'brawler', 'sonic'] },
  ambush: { name: 'Ambush', color: '#c9a37a', beats: ['flier', 'shell', 'water'] },
  dazzle: { name: 'Dazzle', color: '#f0a8ff', beats: ['ambush', 'flier', 'water'] },
  fire: { name: 'Fire', color: '#ff7a3a', beats: ['shell', 'ambush', 'sonic'] },
  sonic: { name: 'Sonic', color: '#ffe27a', beats: ['flier', 'dazzle', 'water'] },
  water: { name: 'Water', color: '#3fd0c0', beats: ['brawler', 'toxic', 'fire'] },
};
/** Why each type beats what it beats. */
export const WHY = {
  'flier>brawler': 'Jaws are no use on something that will not land.',
  'flier>toxic': 'A spray only works on what stays in range.',
  'flier>fire': 'It leaves. Fire cannot follow.',
  'brawler>shell': 'Horns are for getting under a shell and tipping it over.',
  'brawler>dazzle': 'It charges head down. It sees nothing. It arrives anyway.',
  'brawler>fire': 'It stamps it out.',
  'shell>toxic': 'Spit, stink and spray run off a good shell.',
  'shell>dazzle': 'It pulls its head in and waits for the show to end.',
  'shell>sonic': 'It cannot hear you in there.',
  'toxic>ambush': 'An ambusher eats what it catches. That was the mistake.',
  'toxic>brawler': 'Size is no defence against chemistry.',
  'toxic>sonic': 'You have to breathe in to sing.',
  'ambush>flier': 'Mantises take flying insects out of the air for a living.',
  'ambush>shell': 'It waits by the one gap in the armour. It has all day.',
  'ambush>water': 'Something is always waiting at the edge of a pond.',
  'dazzle>ambush': 'A sudden eyespot ruins a patient hunter\'s whole afternoon.',
  'dazzle>flier': 'Fliers go to the light. They have never once learned.',
  'dazzle>water': 'Water bugs fly to lights too. They are known for it.',
  'fire>shell': 'A shell is also an oven.',
  'fire>ambush': 'The leaf it was hiding on is gone.',
  'fire>sonic': 'Nobody sings in a fire.',
  'sonic>flier': 'Hard to fly through a noise like that.',
  'sonic>dazzle': 'It does not need to see you.',
  'sonic>water': 'Sound carries further in water. There is nowhere to hide from it.',
  'water>brawler': 'It cannot charge what it cannot stand on.',
  'water>toxic': 'It dilutes.',
  'water>fire': 'Obviously.',
};

// Each species' type rests on its fact sheet (server/engine/bugs.js): how it moves, what it is covered in, what it
// does to its dinner. `rarity`: 1 common; 2 uncommon (its own sheet says it is rare, threatened or barely known, or
// it holds a record); 3 rare (one more stat point than the rest, and it keeps to the harder days down the mine).
const SPECIES = {
  phrictus: ['flier', 1], pyrops: ['flier', 1], nemoptera: ['flier', 1], mantispa: ['flier', 1], polyphylla: ['flier', 2],
  ceroplophana: ['brawler', 2], lamprima: ['brawler', 1], macrodontia: ['brawler', 2], manticora: ['brawler', 1], trachelophorus: ['brawler', 1],
  eupholus: ['shell', 1], pachyrhynchus: ['shell', 1], helicopsyche: ['shell', 1], onymacris: ['shell', 1], heteropteryx: ['shell', 1],
  platymeris: ['toxic', 1], sphaerocoris: ['toxic', 1], graphocephala: ['toxic', 1],
  pseudocreobotra: ['ambush', 1], deroplatys: ['ambush', 1], empusa: ['ambush', 2], acanthaspis: ['ambush', 1], umbonia: ['ambush', 1],
  phrixothrix: ['dazzle', 2], chrysochroa: ['dazzle', 1], phanaeus: ['dazzle', 1], sagra: ['dazzle', 1], bocydium: ['dazzle', 1],
  brachinus: ['fire', 1], pheropsophus: ['fire', 3], melanophila: ['fire', 2], solenopsis: ['fire', 1], pyrrhocoris: ['fire', 1],
  brevisana: ['sonic', 3], micronecta: ['sonic', 2], bertholdia: ['sonic', 2], gromphadorhina: ['sonic', 1], gryllotalpa: ['sonic', 1],
  lethocerus: ['water', 2], dytiscus: ['water', 1], notonecta: ['water', 1], gyrinus: ['water', 1], halobates: ['water', 3],
  phloeodes: ['shell', 3], photuris: ['dazzle', 2], arachnocampa: ['dazzle', 3], myrmeleon: ['ambush', 1], odontomachus: ['brawler', 2],
  dasymutilla: ['toxic', 2], peruphasma: ['toxic', 3], ampulex: ['toxic', 3], colobopsis: ['toxic', 3],
  dryococelus: ['shell', 4], megachile: ['flier', 4], meganeura: ['ambush', 4],
  steeze: ['dazzle', 2],
};
// 4 legendary: thought extinct and found again. Two more stat points than a common, never in an egg or the day's
// ordinary wild bugs, and only one of each alive in the whole Academy at a time (server/mines.js LEGEND_DAYS).
export const RARITY = { 1: { name: 'Common', mark: '●' }, 2: { name: 'Uncommon', mark: '◆' }, 3: { name: 'Rare', mark: '★' }, 4: { name: 'Legendary', mark: '✦' } };
export const LEGENDARY = 4;
export const typeOf = (species) => SPECIES[species]?.[0] || null;
export const rarityOf = (species) => SPECIES[species]?.[1] || 1;
/** The types some species has: the ones worth naming on a card or a chart. */
export const LIVE_TYPES = Object.keys(TYPES).filter((type) => Object.values(SPECIES).some(([t]) => t === type));
/** 1 if a bug of type `a` beats one of type `b`, -1 if it is the other way round, 0 if neither. */
export const edge = (a, b) => (TYPES[a]?.beats.includes(b) ? 1 : TYPES[b]?.beats.includes(a) ? -1 : 0);
/** The types that beat `type`, by key. */
export const weakTo = (type) => Object.keys(TYPES).filter((other) => TYPES[other].beats.includes(type));

// What an edge is worth to each hit. Fights are close, so a little goes a long way: with these, over every pairing
// at equal level with both bugs left to themselves, the type that beats the other wins about four fights in five,
// roughly what two levels are worth.
export const EDGE = { strong: 1.1, weak: 0.92 };
// What every bug of a type gets, whatever its species or level. The numbers were set the same way as the traits:
// every pairing fought at levels 1, 5 and 10 until each type's record sat within about five points of even, with the
// edge still worth about four fights in five. `toxin` is poison damage a turn; the rest are shares.
export const PERK = { quick: 0.06, heavy: 0.05, armour: 0.09, toxin: 2, strike: 0.4, startle: 0.5, flare: 0.1, loud: 0.35, dive: 0.06 };
const pct = (x) => `${Math.round(x * 100)}%`;
const PERKS = {
  flier: ['Quick', () => `Attacks are ${pct(PERK.quick)} less likely to hit it.`],
  brawler: ['Heavy', () => `Every hit it lands is ${pct(PERK.heavy)} harder.`],
  shell: ['Armour', () => `Takes ${pct(PERK.armour)} less from every hit that is not a pierce.`],
  toxic: ['Taint', () => `Every hit it lands poisons a target that is not poisoned already: ${PERK.toxin} a turn for two turns.`],
  ambush: ['First strike', () => `Its first attack cannot miss and hits ${pct(PERK.strike)} harder.`],
  dazzle: ['Startle', () => `The first time it drops below half health it flashes, and the opponent's next attack does ${pct(PERK.startle)} less.`],
  fire: ['Flare-up', () => `Below half health, every hit it lands is ${pct(PERK.flare)} harder.`],
  sonic: ['Loud', () => (PERK.loud >= 1 ? 'A guard does not block its hits.' : `A guard blocks ${pct(PERK.loud)} less of its hits.`)],
  water: ['Dive', () => `After a hit lands on it, the next attack against it is ${pct(PERK.dive)} less likely to hit.`],
};
/** A type's perk as the cards and the Combat tab say it. */
export const perkFor = (type) => { const [name, text] = PERKS[type] || []; return name ? { name, description: text() } : null; };

/** What a hit from `attacker` (a species) is multiplied by against `target`. A bug with no type (none, or a plain test fighter) has no edge. */
export const typeEdge = (attacker, target) => { const e = edge(typeOf(attacker), typeOf(target)); return e > 0 ? EDGE.strong : e < 0 ? EDGE.weak : 1; };

// How often a common, an uncommon and a rare turn up, to each other: as a wild bug in the mine on any day (rares
// only from RARE_TIER up), and in an egg, which is always a common.
export const WILD_ODDS = { 1: 10, 2: 4, 3: 1 };
export const RARE_TIER = 3;
