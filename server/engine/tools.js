// Every species carries its own mining tool in one hand (claw, tarsus, whatever it has): fixed by species, so a
// Golden Stag Beetle always has its pickaxe. Some are everyday, some are the old hardrock and placer tools miners
// used before machines, each with a line so players learn what it was for. Cosmetic only: no fight or shift reads it.
export const TOOLS = {
  pickaxe: { name: 'Pickaxe', line: 'The classic: a point for breaking, a blade for prying.' },
  shovel: { name: 'Shovel', line: 'Moves whatever the pick broke loose.' },
  handdrill: { name: 'Breast Drill', line: 'A hand-cranked drill you lean your chest on.' },
  jackhammer: { name: 'Jackhammer', line: 'Loud, shaky and very persuasive.' },
  sledge: { name: 'Sledgehammer', line: 'For rocks that will not listen to reason.' },
  chisel: { name: 'Cold Chisel', line: 'Splits rock along a line, one tap at a time.' },
  goldpan: { name: 'Gold Pan', line: 'Swirl, tilt, wash the gravel away, hope.' },
  plunger: { name: 'Blasting Plunger', line: 'Push the handle down and stand well back.' },
  orehook: { name: 'Ore-Cart Hook', line: 'Hauls a loaded ore cart by its coupling.' },
  spoon: { name: "Miner's Spoon", line: 'A long scraper for cleaning dust out of a blast hole.' },
  gad: { name: 'Gad', line: 'A short steel wedge driven into cracks to pry rock loose.' },
  moil: { name: 'Moil Point', line: 'A hardened spike for picking at a seam of ore.' },
  singlejack: { name: 'Single Jack', line: 'A four-pound hammer swung one-handed to drive drill steel.' },
  doublejack: { name: 'Double Jack', line: 'The long-handled big hammer; two miners took turns.' },
  tamper: { name: 'Tamping Bar', line: 'A wooden rod for packing a charge. Never iron: sparks.' },
  canary: { name: 'Canary Cage', line: 'The bird went quiet before the bad air reached you.' },
  carbide: { name: 'Carbide Lamp', line: 'Water drips on carbide, makes gas, makes light.' },
  scaling: { name: 'Scaling Bar', line: 'Pries loose rock off the roof before it falls on you.' },
  dolly: { name: 'Dolly Bar', line: 'A bent bar for nudging rails and timbers into line.' },
  pollpick: { name: 'Poll Pick', line: 'A pick with a hammer face on the back end.' },
  davy: { name: 'Davy Lamp', line: 'A flame behind wire gauze, so firedamp cannot catch.' },
  riffle: { name: 'Sluice Riffle', line: 'The ridges in a sluice box that trap heavy gold.' },
  rocker: { name: 'Rocker Box', line: 'A cradle you rock to wash gold out of gravel.' },
  drillsteel: { name: 'Drill Steel', line: 'The long bit the hammer drives into the rock face.' },
};
/** Species to tool: picked to suit where something suits (lamps for the lit-up bugs, a spoon for the spoon-wing). */
export const SPECIES_TOOL = {
  ceroplophana: 'pollpick', bocydium: 'canary', phrictus: 'carbide', pyrops: 'davy', graphocephala: 'tamper', umbonia: 'moil',
  trachelophorus: 'scaling', eupholus: 'drillsteel', pachyrhynchus: 'goldpan', platymeris: 'gad', acanthaspis: 'handdrill',
  helicopsyche: 'rocker', chrysochroa: 'riffle', lamprima: 'pickaxe', onymacris: 'shovel', brachinus: 'plunger',
  phrixothrix: 'orehook', macrodontia: 'doublejack', sagra: 'singlejack', manticora: 'jackhammer', heteropteryx: 'dolly',
  mantispa: 'chisel', nemoptera: 'spoon', pseudocreobotra: 'sledge', deroplatys: 'rocker', empusa: 'moil', polyphylla: 'shovel',
  phanaeus: 'goldpan', lethocerus: 'orehook', sphaerocoris: 'chisel', pheropsophus: 'plunger', melanophila: 'carbide',
  solenopsis: 'pickaxe', pyrrhocoris: 'singlejack', brevisana: 'jackhammer', micronecta: 'riffle', bertholdia: 'davy',
  gromphadorhina: 'sledge', gryllotalpa: 'shovel', dytiscus: 'gad', notonecta: 'spoon', gyrinus: 'handdrill', halobates: 'goldpan',
  phloeodes: 'doublejack', photuris: 'canary', arachnocampa: 'carbide', myrmeleon: 'scaling', odontomachus: 'pollpick',
  dasymutilla: 'tamper', peruphasma: 'drillsteel', ampulex: 'dolly', colobopsis: 'plunger', dryococelus: 'pickaxe',
  megachile: 'sledge', meganeura: 'drillsteel',
};
/** The tool a species carries, or null (a photo bug, or one added without one yet). */
export const toolFor = (species) => (TOOLS[SPECIES_TOOL[species]] ? { id: SPECIES_TOOL[species], ...TOOLS[SPECIES_TOOL[species]] } : null);
