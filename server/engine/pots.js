// Main pot / side pot construction from each player's total contribution to the hand.
// contributions: [{ seat, amount, folded }]. Returns [{ amount, eligible: [seat,...] }] (main pot first).
// Folded players' chips go into the pots but they are never eligible to win.
// A pot with exactly one eligible player is an uncalled bet being returned.
export function buildPots(contributions) {
  const levels = [...new Set(contributions.filter((c) => !c.folded && c.amount > 0).map((c) => c.amount))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contributions) amount += Math.max(0, Math.min(c.amount, level) - prev);
    const eligible = contributions.filter((c) => !c.folded && c.amount >= level).map((c) => c.seat);
    if (amount > 0) {
      // merge with previous pot if same eligible set (e.g. folded chips create no new real pot)
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length && last.eligible.every((s, i) => s === eligible[i])) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  // chips from folded players above the highest live contribution (cannot normally happen) go to the last pot
  let leftover = 0;
  for (const c of contributions) leftover += Math.max(0, c.amount - prev);
  if (leftover > 0 && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

/**
 * Split `amount` among winners. Odd chips go one at a time to winners in seat order starting
 * from the first seat to the left of the button (standard casino rule).
 */
export function splitPot(amount, winners, buttonSeat, numSeats) {
  const order = winners.slice().sort((a, b) => ((a - buttonSeat - 1 + numSeats) % numSeats) - ((b - buttonSeat - 1 + numSeats) % numSeats));
  const share = Math.floor(amount / winners.length);
  let rem = amount - share * winners.length;
  const out = {};
  for (const s of order) { out[s] = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  return out;
}
