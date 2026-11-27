// Species fact cards: shown once after a successful catch, and from a bug's stall in the barn.
// Science copy is taken from the roster (bugs.js) and from sources listed there or on a fill below;
// nothing is invented. Where a diet or range was never recorded for that species, the card says so.
// STEEZE, botched rebuilds and Stage II barn names are Academy lore, never presented as natural history.
import { BUGS, BUG_BY_ID } from './bugs.js';

export const FOUND_MAX = 160;
export const EATS_MAX = 140;
export const FACT_MAX = 180;

/** In-world Stage II names used around the barn (client/src/barn/stageTwoArt.js comments). Not wild taxa. */
export const STAGE_II_NAME = {
  ceroplophana: 'Bronze Rhino Knight', lamprima: 'Golden Stag Crown', trachelophorus: 'Crane Weevil',
  graphocephala: 'Candy Dart', mantispa: 'Hornet Reaper', halobates: 'Tide Strider', chrysochroa: 'Emerald Bullet',
  melanophila: 'Cinder Beetle', onymacris: 'Mist Stilt', brachinus: 'Blast Cannon', pheropsophus: 'Hazard Mortar',
  macrodontia: 'Saber Fang', sagra: 'Leap Titan', manticora: 'Scissor Jaw', polyphylla: 'Plume Crown',
  phanaeus: 'Prism Horn', bocydium: 'Signal Orb', phrictus: 'Dragon Lantern', pyrops: 'Candlewick',
  umbonia: 'Thornback', helicopsyche: 'Spiral Hermit', nemoptera: 'Ribbon Dancer', brevisana: 'Siren Cicada',
  bertholdia: 'Cinnabar Fluff', meganeura: 'Sky Lance', ampulex: 'Jade Stinger', megachile: 'Titan Bee',
  pseudocreobotra: 'Bloom Eye', deroplatys: 'Leaf Warden', empusa: 'Cone Oracle', heteropteryx: 'Thorn Bastion',
  peruphasma: 'Night Blade', dryococelus: 'Ancient Lobster', solenopsis: 'Blaze Legion', odontomachus: 'Snap Trap',
  dasymutilla: 'Velvet Fury', colobopsis: 'Plug Bomb', myrmeleon: 'Sand Pit King', platymeris: 'Night Stalker',
  acanthaspis: 'Shroud Ninja', gromphadorhina: 'Iron Hisser', gryllotalpa: 'Burrow Brawler', menacanthus: 'Gobbler Louse',
  eupholus: 'Drill Sapphire', pachyrhynchus: 'Egg Fortress', phrixothrix: 'Night Express', arachnocampa: 'Lantern Weaver',
  lethocerus: 'Tide Crusher', micronecta: 'Oar Rower', notonecta: 'Moon Diver', dytiscus: 'Torrent Diver',
  gyrinus: 'Whirl Spinner', sphaerocoris: 'Canvas Shield', pyrrhocoris: 'Mask Guard', phloeodes: 'Iron Bastion',
  photuris: 'Lantern Hunter',
};

// Fills only where bugs.js has no range or diet, or where in-world colour had to be split off. Sources on each fill.
const FILL = {
  ceroplophana: {
    eats: 'Larvae live in rotting wood. What the adults eat has not been recorded.',
    sources: ['https://no.wikipedia.org/wiki/Ceroplophana_modiglianii'],
  },
  eupholus: {
    eats: 'Leaves of wild yams (Dioscorea), as do others in its species group.',
    sources: ['https://doi.org/10.1371/journal.pone.0188044'],
  },
  helicopsyche: {
    eats: 'Larvae scrape algae, diatoms and fine detritus from stones in streams.',
    sources: ['https://doi.org/10.1139/z83-301'],
  },
  chrysochroa: {
    eats: 'Adults eat leaves of hackberry and zelkova; larvae tunnel in decaying wood of those and other broadleaf trees.',
    sources: ['https://www.takao599museum.jp/treasures/insects/%e3%82%bf%e3%83%9e%e3%83%a0%e3%82%b7%e7%a7%91/2913/?lang=en'],
  },
  onymacris: {
    eats: 'Wind-blown plant detritus on the Namib dunes, and dead insects when it finds them.',
    sources: ['https://doi.org/10.14411/eje.2008.110'],
  },
  phrixothrix: {
    found: 'Moist forest soils in Brazil, including the Atlantic Forest and the Cerrado.',
    eats: 'Larvae and larviform females hunt millipedes in the soil and leaf litter.',
    sources: ['https://en.wikipedia.org/wiki/Phrixothrix_hirtus', 'https://doi.org/10.1093/aesa/90.3.389', 'https://edis.ifas.ufl.edu/publication/IN610'],
  },
  manticora: {
    eats: 'Other insects, including grasshoppers and crickets, taken as prey.',
    sources: ['https://doi.org/10.1163/157075600783538237'],
  },
  heteropteryx: {
    eats: 'Leaves, especially bramble, and other forest plants.',
    sources: ['https://www.zoologicaljournal.com/article/85/4-1-14-508.pdf'],
  },
  deroplatys: {
    eats: 'Other insects, snatched from among dead leaves.',
  },
  pheropsophus: {
    eats: 'Larvae eat mole-cricket eggs; adults hunt other insects and earthworms.',
    sources: ['https://doi.org/10.3897/zookeys.14.188'],
  },
  brevisana: {
    eats: 'Xylem sap, like other cicadas: from roots as a nymph and from stems as an adult.',
  },
  micronecta: {
    eats: 'Algae and plant debris from the pond floor, like other lesser water boatmen.',
  },
  bertholdia: {
    eats: 'Larvae eat lichens, algae, moss and, later, herbaceous plants.',
    sources: ['https://www.bugguide.net/node/view/128223'],
  },
  gryllotalpa: {
    eats: 'A specific diet for this species has not been published. Other mole crickets eat plant roots and small soil animals.',
  },
  gyrinus: {
    found: 'Still and slow-moving freshwater around the world.',
    sources: ['https://en.wikipedia.org/wiki/Gyrinus'],
  },
  menacanthus: {
    found: 'Poultry yards worldwide, on chickens, turkeys and other galliform birds.',
  },
};

// Extra in-world lines, clearly marked, never mixed into the science fields.
const LORE_NOTE = {
  menacanthus: 'In the Academy it is only out in the Acid Mines on Thanksgiving Day (America/Phoenix). That is barn lore, not a natural-history fact.',
};

// The 2 or 3 strange facts on the card: indices into bugs.js `facts`, or a shortened string when a line had to be capped.
const PICK = {
  ceroplophana: [0, 3, 2],
  bocydium: [0, 1, 3],
  phrictus: [2, 0, 3],
  pyrops: [0, 1, 2],
  graphocephala: [2, 0, 3],
  umbonia: [0, 2, 3],
  trachelophorus: [0, 1, 4],
  eupholus: [1, 4, 2],
  pachyrhynchus: [0, 2, 5],
  platymeris: [2, 1, 0],
  acanthaspis: [0, 3, 5],
  helicopsyche: [0, 2, 3],
  chrysochroa: [0, 1, 2],
  lamprima: [0, 1, 2],
  onymacris: [0, 1, 4],
  brachinus: [0, 1, 2],
  phrixothrix: [0, 2, 3],
  macrodontia: [0, 1, 2],
  sagra: [0, 1, 2],
  manticora: [0, 3, 2],
  heteropteryx: [0, 3, 2],
  mantispa: [0, 1, 2],
  nemoptera: [0, 1, 2],
  pseudocreobotra: [0, 1, 2],
  deroplatys: [0, 1, 3],
  empusa: [0, 1, 2],
  polyphylla: [0, 1, 2],
  phanaeus: [0, 1, 2],
  lethocerus: [0, 1, 2],
  sphaerocoris: [0, 1, 2],
  pheropsophus: [2, 3, 6],
  melanophila: [0, 1, 2],
  solenopsis: [0, 1, 2],
  pyrrhocoris: [0, 1, 2],
  brevisana: [0, 1, 2],
  micronecta: [0, 2, 5],
  bertholdia: [0, 1, 2],
  gromphadorhina: [0, 1, 2],
  gryllotalpa: [1, 3, 4],
  dytiscus: [0, 1, 2],
  notonecta: [0, 1, 2],
  gyrinus: [0, 3, 4],
  halobates: [0, 1, 2],
  phloeodes: [0, 1, 2],
  photuris: [0, 1, 2],
  arachnocampa: [0, 1, 2],
  myrmeleon: [0, 1, 2],
  odontomachus: [0, 1, 2],
  dasymutilla: [0, 1, 2],
  peruphasma: [0, 1, 2],
  ampulex: [0, 1, 2],
  colobopsis: [0, 1, 2],
  dryococelus: [0, 1, 2],
  megachile: [0, 1, 2],
  meganeura: [0, 1, 2],
  steeze: [0, 3, 4],
  menacanthus: [2, 4, 1],
};

const KIND = { steeze: 'lore' };

function resolveFact(bug, pick) {
  if (typeof pick === 'string') return pick;
  const text = bug.facts?.[pick];
  if (!text) throw new Error(`bug-facts: ${bug.id} has no fact at index ${pick}`);
  return text;
}

export const FACTS = Object.fromEntries(BUGS.map((bug) => {
  const fill = FILL[bug.id] || {};
  const picks = PICK[bug.id];
  if (!picks) throw new Error(`bug-facts: no fact pick for ${bug.id}`);
  const facts = picks.map((p) => resolveFact(bug, p));
  const sources = [...new Set([...(bug.sources || []), ...(fill.sources || [])])];
  return [bug.id, {
    id: bug.id,
    name: bug.name,
    sci: bug.sci,
    genus: !!bug.genus,
    order: bug.order,
    kind: KIND[bug.id] || 'science',
    found: fill.found || bug.range,
    eats: fill.eats || bug.diet,
    facts,
    sources,
    lore: LORE_NOTE[bug.id] || null,
  }];
}));

export const factsFor = (id) => FACTS[id] || null;

/** Whether the post-catch fact card should open. Shown once per catch, never on a replay. */
export function shouldShowCatchFacts({ reason, replay = false, dismissed = false, tossing = false } = {}) {
  return reason === 'jarred' && !replay && !dismissed && !tossing;
}

/**
 * Pages on the card: found + eats first, then one strange fact each, then any clearly marked lore
 * (Thanksgiving note, a Stage II barn name such as Bloom Eye, a botched rebuild).
 */
export function factPages(id, { evo = 0, botched = null } = {}) {
  const f = FACTS[id];
  if (!f) return [];
  const lore = f.kind === 'lore';
  const pages = [
    {
      key: 'about',
      kind: f.kind,
      found: f.found,
      eats: f.eats,
      foundLabel: lore ? 'Where' : 'Found',
      eatsLabel: lore ? 'Eats' : 'Eats',
    },
    ...f.facts.map((text, i) => ({
      key: `fact${i}`,
      kind: f.kind,
      fact: text,
      label: lore ? 'Academy lore' : 'A strange fact',
    })),
  ];
  if (f.lore) pages.push({ key: 'note', kind: 'lore', fact: f.lore, label: 'Academy lore' });
  const stage = evo >= 1 && STAGE_II_NAME[id] && id !== 'steeze';
  if (stage) {
    const who = BUG_BY_ID[id]?.name || f.name;
    pages.push({
      key: 'stage2',
      kind: 'lore',
      fact: `In the barn, a Stage II ${who} is called ${STAGE_II_NAME[id]}. That form is Bug Center work, not a wild insect.`,
      label: 'Academy lore',
    });
  }
  if (botched) {
    pages.push({
      key: 'botched',
      kind: 'lore',
      fact: `This one came back from the Bug Center botched (${botched}): a porcelain face and an arm on the wrong side. That is a rebuild gone wrong, not natural history.`,
      label: 'Academy lore',
    });
  }
  return pages;
}
