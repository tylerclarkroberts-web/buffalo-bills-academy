// Bug variety: what makes one Stage II bug look like itself and not its stall-mate (Stage I and III are drawn as
// they always were; the client only draws this on an evolved, Stage II bug). Purely cosmetic: nothing
// here is read by a fight, the gym or the mines. Each bug gets its set once, from its own id (stable), and keeps it
// on its pen (`pen.variety`), so a later change to these lists never redraws a bug anyone already has.
//   base:    what its Stage II body gets about on instead of legs: wheels, a rotor it hovers on, tank tracks or a slug's foot
//   ail:     one or two ailments, bodily or of the mind, each with its own little visual: cartoon, never cruel
//   fruit:   a very faint fruit or vegetable touch, a few pixels you would only notice up close
//   hue, tone, morph: its colouring: anywhere round the colour wheel, and sometimes two-tone, inverted, dark, pale or vivid
//   pat:     a bold shell pattern: stripes, spots, chevrons, camo, checker, bands or freckles (or none)
//   metal:   what its machine body is plated in: iron, brass, copper, gunmetal, or painted
export const VARIETY_VERSION = 2;

export const BASES = {
  wheels: { name: 'Wheels', line: 'Rolls everywhere. Hates stairs.' },
  rotor: { name: 'Hover Rotor', line: 'Hovers an inch off the straw on a little rotor.' },
  tracks: { name: 'Tank Tracks', line: 'Treads over anything. Slowly. Loudly.' },
  slug: { name: 'Slug Foot', line: 'One big foot and a shiny trail.' },
};
const BASE_ODDS = [['wheels', 25], ['rotor', 25], ['tracks', 25], ['slug', 25]];

/** `mind`: a quirk of temperament; otherwise something it caught. `spot`: where its visual sits, so two never clash. */
export const AILMENTS = {
  pox: { name: 'Bug Pox', line: 'Spotty, itchy, and weirdly proud of it.', spot: 'shell' },
  warts: { name: 'Warty Wobbles', line: 'Kissed a toad once. Regrets nothing.', spot: 'shell' },
  rash: { name: 'Itchy Rash', line: "Can't stop scratching. Won't stop scratching.", spot: 'patch' },
  bandaged: { name: 'Banged Up', line: 'Walked into a jar lid. Twice.', spot: 'patch' },
  sniffles: { name: 'The Sniffles', line: 'Drippy nose, brave heart.', spot: 'face' },
  fever: { name: 'Hot Head', line: 'Running a little warm today.', spot: 'cheeks' },
  twitch: { name: 'Eye Twitch', line: 'One eye is having a very busy day.', mind: true, spot: 'eye' },
  sideeye: { name: 'Side-Eye', line: 'Pretty sure the dung beetle is watching.', mind: true, spot: 'eye' },
  sweats: { name: 'Nervous Sweats', line: 'Stage fright, ring fright, all the frights.', mind: true, spot: 'face' },
  grin: { name: 'Big Grin', line: 'Way, way too excited about everything.', mind: true, spot: 'mouth' },
  cloud: { name: 'Little Rain Cloud', line: 'Carries its own weather around. Hugs help.', mind: true, spot: 'sky' },
  tidy: { name: 'Neat Freak', line: 'Bowtie straight, stall spotless, or else.', mind: true, spot: 'neck' },
  nightowl: { name: 'Night Owl', line: "Hasn't slept since the last egg hatched.", mind: true, spot: 'cheeks' },
  dizzy: { name: 'Dizzy Spells', line: 'Sees stars. Sometimes real ones.', mind: true, spot: 'sky' },
};

export const FRUITS = {
  sprig: { name: 'leaf sprig' }, seeds: { name: 'strawberry seeds' }, stem: { name: 'cherry stem' }, pea: { name: 'pea pod' },
  peel: { name: 'lemon peel' }, tuft: { name: 'carrot top' }, rib: { name: 'pumpkin rib' }, grape: { name: 'grape cluster' },
};
export const PATTERNS = ['plain', 'freckles', 'banded', 'stripes', 'spots', 'chevrons', 'camo', 'checker'];
export const MORPHS = ['none', 'twotone', 'inverted', 'melanic', 'pale', 'vivid'];
export const METALS = ['iron', 'brass', 'copper', 'gunmetal', 'red', 'teal', 'olive', 'cream', 'gold'];
const MORPH_ODDS = [['none', 34], ['twotone', 18], ['inverted', 10], ['melanic', 12], ['pale', 12], ['vivid', 14]];
const PAT_ODDS = [['plain', 6], ['freckles', 12], ['banded', 14], ['stripes', 14], ['spots', 14], ['chevrons', 14], ['camo', 13], ['checker', 13]];

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (R, list) => list[Math.floor(R() * list.length) % list.length];
const weighted = (R, odds) => { let roll = R() * odds.reduce((n, [, w]) => n + w, 0); for (const [k, w] of odds) { if (roll < w) return k; roll -= w; } return odds[0][0]; };

/** A bug's variety, from its id (a pen's eggAt/bornAt) and species: the same inputs always give the same bug. */
export function varietyFor(id, species = '') {
  const seed = hash(`${id}|${species}|variety`), R = rng(seed);
  let roll = R() * 100, base = 'wheels';
  for (const [k, w] of BASE_ODDS) { if (roll < w) { base = k; break; } roll -= w; }
  const ids = Object.keys(AILMENTS), first = pick(R, ids), ail = [first];
  if (R() < 0.3) { // a second one, somewhere the first is not
    const rest = ids.filter((k) => AILMENTS[k].spot !== AILMENTS[first].spot);
    ail.push(pick(R, rest));
  }
  const fruit = pick(R, Object.keys(FRUITS));
  // colouring: about a third stay near their species' colours, the rest go anywhere on the wheel; most get a morph on top
  const turn = R() * 2 - 1, hue = Math.round(R() < 0.35 ? turn * 40 : turn * 180), tone = Math.round((R() * 2 - 1) * 14);
  const morph = weighted(R, MORPH_ODDS), pat = weighted(R, PAT_ODDS), metal = pick(R, METALS);
  return { v: VARIETY_VERSION, seed, base, ail, fruit, hue, tone, pat, morph, metal };
}

const int = (n, lo, hi) => Number.isFinite(Number(n)) ? Math.max(lo, Math.min(hi, Math.round(Number(n)))) : 0;
/** Only known values, so a stored or sent variety can never draw something unexpected. Null if it is not one. */
export function cleanVariety(v) {
  if (!v || typeof v !== 'object' || !(BASES[v.base] || v.base === 'legs')) return null;
  const base = BASES[v.base] ? v.base : Object.keys(BASES)[int(v.seed, 0, 0xffffffff) % 4]; // an early 'legs' gets a base: every Stage II bug has one
  const ail = (Array.isArray(v.ail) ? v.ail : []).filter((k, i, all) => AILMENTS[k] && all.indexOf(k) === i).slice(0, 2);
  return { v: int(v.v, 1, 99) || VARIETY_VERSION, seed: int(v.seed, 0, 0xffffffff), base, ail,
    fruit: FRUITS[v.fruit] ? v.fruit : null, hue: int(v.hue, -180, 180), tone: int(v.tone, -14, 14), pat: PATTERNS.includes(v.pat) ? v.pat : 'plain',
    morph: MORPHS.includes(v.morph) ? v.morph : 'none', metal: METALS.includes(v.metal) ? v.metal : 'iron' };
}
/** For a card: the base and each ailment, with their names and one-line flavour. */
export function varietyLabels(v) {
  const c = cleanVariety(v); if (!c) return null;
  return { base: { id: c.base, ...BASES[c.base] }, ail: c.ail.map((id) => ({ id, ...AILMENTS[id] })), fruit: c.fruit ? { id: c.fruit, ...FRUITS[c.fruit] } : null };
}
/** A short key for caching a drawing. */
export const varietyKey = (v) => (v ? `${v.base}.${(v.ail || []).join('+')}.${v.fruit || ''}.${v.hue}.${v.tone}.${v.pat}.${v.morph || ''}.${v.metal || ''}.${(v.seed || 0) % 9973}` : '');
