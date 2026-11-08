// Which of Guntrad's six fatalities plays after he knocks someone out. Cosmetic only: it never touches the result
// or the money. Picked from the fight's seed, and never the same one twice in a row at a table, so the fighter and
// everyone watching see the same ending.
export const FATALITIES = ['limbs', 'spine', 'heart', 'halves', 'uppercut', 'drain'];
export const FATALITY_NAMES = { limbs: 'Limb from limb', spine: 'Spine of the house', heart: 'Heart of the house', halves: 'Cut the deck', uppercut: 'Into the cheap seats', drain: 'Last call' };
const mix32 = (x) => { x = (x >>> 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
/** Index into FATALITIES for this seed, avoiding `prev` (the last index shown at this table, or -1). */
export function pickFatality(seed, prev = -1) {
  const h = mix32(seed); let i = h % FATALITIES.length;
  if (i === prev) i = (i + 1 + ((h >>> 8) % (FATALITIES.length - 1))) % FATALITIES.length;
  return i;
}

// v29: the player's hidden finisher after a genuine, server-checked win. Cosmetic only: picked from the fight's
// seed (salted so it doesn't track the fatality pick), never the same twice running at a table, so the fighter and
// everyone watching see the same gag. It never touches the result or the money.
export const GAGS = ['show', 'hammer', 'balloon'];
export const GAG_NAMES = { show: 'The Guntrad Show', hammer: 'House rules: bonk', balloon: 'Full of hot air' };
/** How long after the win the fighter may trigger it (server side; the client prompt is shorter). */
export const FINALE_MS = 12000;
export function pickGag(seed, prev = -1) {
  const h = mix32((seed ^ 0x5bd1e995) >>> 0); let i = h % GAGS.length;
  if (i === prev) i = (i + 1 + ((h >>> 8) % (GAGS.length - 1))) % GAGS.length;
  return i;
}
