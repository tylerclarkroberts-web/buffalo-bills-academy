// The Whole Set. Cryptic lines scattered around the Academy hinting that whoever keeps every bug in the Bugdex gets
// the ultimate power, the ultimate prize, and everyone bowing at their feet. Nothing is actually awarded (yet):
// it is texture. Shared by the server (Foreman) and the client (Barn, Bugdex, mine walls, the trading post).
// Keep them short, odd and unexplained; never a how-to. Nobody in-world agrees on who started the rumour.

export const LORE = [
  'Every bug in the book. Then the ground opens, and it is yours.',
  'They say the last empty square in the Bugdex is a door.',
  'Collect them all and all will bow. Even Earl. Especially Earl.',
  'The one who holds every bug holds everything else too.',
  'Somewhere under the Badlands is a chair. It is waiting for whoever finishes the book.',
  'Fifty-five bugs, one prize. Nobody has seen the prize. Everybody has seen the chair.',
  'When the Bugdex is full, the barn doors will kneel.',
  'A complete set hums. Hold it to your ear.',
  'The bugs know. Ask one about the full set and watch its antennae.',
  'Whoever fills the last page: every knee in this county, bent.',
  'The ultimate power smells faintly of hay.',
  'Old miners call it The Whole Set. They lower their voices when they do.',
];

/** Scratched into the tunnel walls: the mine flavour lines are all caps. */
export const MINE_LORE = [
  'SOMEONE SCRATCHED "ALL OF THEM, THEN ALL WILL BOW" INTO THE ROCK. FRESH SCRATCHES.',
  'A CARVING: FIFTY-FIVE LITTLE BUGS AROUND ONE BIG CROWN. NO EXPLANATION.',
  'THE WALL SAYS: "COLLECT EVERY ONE. THE PRIZE IS AT THE BOTTOM." THE BOTTOM OF WHAT.',
  'TALLY MARKS. FIFTY-FOUR OF THEM. THE LAST SPACE IS SCORCHED.',
];

/** The Foreman has heard it too. He does not like it. */
export const FOREMAN_LORE = [
  'And don\'t gimme that "collect every bug and the whole county bows" hogwash! Nobody\'s bowin\' to a man with a DRY bucket!',
  'You think you\'re gonna fill that whole bug book and have folks kneelin\'? Fill a BUCKET first!',
];

/** Muttered in the trading post. */
export const TRADE_LORE = [
  'Every trade is a page closer. To what, nobody says out loud.',
  'Old Gus traded his last bug for a pickle and never finished the book. He does not talk about the chair.',
  'They say the full set trades for nothing. Because nothing is left to want.',
];

/** A stable pick from a list: the same `seed` gives the same line, so a page does not flicker on re-render. */
export function loreLine(seed = Math.random() * 1e9, list = LORE) {
  const s = String(seed); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return list[(h >>> 0) % list.length];
}
