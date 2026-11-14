// Hatched Barn bug shown beside a seated player at Hold'em and blackjack.
// Living creatures only; eggs, graves and bots have nothing to hang out.
export function tableBugOf(barn, playerId) {
  if (!barn || playerId == null) return null;
  try {
    const pen = barn.view(playerId)?.pen;
    if (!pen || pen.stage !== 'creature') return null;
    const bug = {
      species: pen.species,
      name: pen.name,
      speciesName: pen.speciesName || pen.species,
      level: pen.level ?? null,
    };
    if (pen.style) bug.style = pen.style;
    if (pen.fainted) bug.fainted = true; // v75: lost a mine battle; swirly eyes until the Bug Center
    return bug;
  } catch {
    return null;
  }
}

/** Hang a public `bug` on each seated human who has a living hatched bug, so everyone at the table can see it. */
export function attachSeatBugs(seats, barn, idOf = (s) => s?.playerId) {
  if (!Array.isArray(seats) || !barn) return seats;
  for (const seat of seats) {
    if (!seat || seat.bot) continue;
    const bug = tableBugOf(barn, idOf(seat));
    if (bug) seat.bug = bug;
  }
  return seats;
}
