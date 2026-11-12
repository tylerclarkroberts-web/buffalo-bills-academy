// General Store catalog, part 4 (v37): tobacco. Play money only, generic names (no brands), cartoon low-poly art.
// Every item is ONE-TIME USE (hold at most one of each; lighting it up uses it up) and costs $500-$20,000 (the Grand Cigar stays at $20,000 as the late-game flex).
// At a table it plays a short cartoon moment for everyone watching: you take it out, Guntrad says "hell yeah",
// comes over and lights it, then goes back to his spot. It never touches cards, chips, turns or timers.
// `art` names the low-poly drawing the client makes (client/src/store/lowpoly.js); `emoji` is a text fallback.
export const TOBACCO_NOTICE = 'For adult players. Tobacco causes cancer and is highly addictive.';
export const TOBACCO_ITEMS = [
  ['rollie', 'Hand-Rolled Cigarette', 500, 'cig', 'Rolled by hand on a slow afternoon. A little lumpy.'],
  ['filtered', 'Filtered Cigarette', 750, 'filtered', 'One plain white cigarette with a tan filter. Just the one.'],
  ['cheroot', 'Cheroot', 1000, 'cheroot', 'A blunt-ended frontier cigar, the kind a stranger chews in a western.'],
  ['cigarillo', 'Cigarillo', 1500, 'cigarillo', 'A thin little cigar with a wooden tip.'],
  ['corncob', 'Corncob Pipe', 2000, 'corncob', 'A pipe made out of an actual corncob. Folksy.'],
  ['briar', 'Briar Pipe', 3000, 'briar', 'A polished wooden pipe for looking thoughtful about pot odds.'],
  ['cigar', 'Big Cigar', 4500, 'cigar', 'A fat cigar with a red band. Strictly for the cartoon.'],
  ['churchwarden', 'Churchwarden Pipe', 6500, 'churchwarden', 'A pipe with a stem so long Guntrad has to reach.'],
  ['meerschaum', 'Carved Meerschaum Pipe', 10000, 'meerschaum', 'A white carved pipe with a little face on the bowl. It looks smug.'],
  ['grand', 'Gold-Banded Grand Cigar', 20000, 'grand', 'The biggest, silliest cigar in the shop, with a gold band. One puff and it\'s gone.'],
].map(([id, name, price, art, desc]) => ({
  id: `tob-${id}`, name, price, art, desc: `${desc} One-time use.`, emoji: '🚬',
  kind: 'tobacco', cat: 'tobacco', slot: null, once: true, adult: true,
}));
