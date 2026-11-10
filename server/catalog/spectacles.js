// General Store catalog, part 5 (v52): spectacles. Big, silly, one-time-use shows the whole table watches for a few
// seconds: balloons, fireworks, a blimp with your name on it, a buffalo stampede. They are the late-game money sink:
// $2,500-$50,000 each, gone the moment they play. Cartoon only: they never touch cards, chips, turns or timers.
// They ride the gag switches (the host's per-table switch and each player's opt-out) and play through table replay.
// `fx` names the overlay the client draws (client/src/table/Spectacle.jsx, styles `.show-<fx>`); `line` finishes the
// sentence "<name> ..." in the table history.
export const SPECTACLE_ITEMS = [
  ['balloons', 'Balloon Release', 2500, '🎈', 'let go of a hundred balloons', 'A hundred balloons float up past every seat and out of the saloon roof. Somebody will have to fetch them.'],
  ['fireworks', 'Fireworks Show', 6000, '🎆', 'set off a fireworks show', 'Rockets burst over the felt in red, gold and green. The dealer flinches every single time.'],
  ['blimp', 'Blimp Flyover', 12000, '🛩️', 'hired a blimp to fly over the table', 'A blimp drifts across the table towing a banner with your name on it, in letters taller than the dealer.'],
  ['stampede', 'Buffalo Stampede', 20000, '🦬', 'started a buffalo stampede', 'A herd of buffalo thunders straight through the card room. The chips do not move. The players might.'],
  ['ufo', 'Close Encounter', 35000, '🛸', 'called the saucer down from the Acid Mines', 'The saucer from the mines hovers over the felt, beams up one cow, thinks better of it and puts the cow back.'],
  ['goldrush', 'Gold Rush', 50000, '💰', 'made it rain gold nuggets', 'Gold nuggets pour from the ceiling and the whole table glows. They are cartoon nuggets. You cannot keep them.'],
].map(([fx, name, price, emoji, line, desc]) => ({
  id: `show-${fx}`, name, price, emoji, fx, line,
  desc: `${desc} One-time use: everyone at the table sees it once, for a few seconds.`,
  kind: 'spectacle', cat: 'spectacles', slot: null, once: true,
}));
