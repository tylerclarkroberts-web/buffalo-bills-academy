// "Broke" = you can't afford a seat anywhere, even after selling your investments,
// and you have no chips left on any table. That's when the host points you to the Acid Mines.
const n = (x) => (Number.isFinite(+x) ? +x : 0);

/** Cheapest buy-in among open, money tables (never more than $100, so new players always have somewhere to sit). */
export function cheapestBuyIn(tables, cap = 100) {
  const buyIns = (tables || []).filter((t) => t && t.econ && t.status !== 'closed').map((t) => n(t.settings?.buyIn)).filter((v) => v > 0);
  return Math.min(cap, ...buyIns);
}

/** Overall: can this player still afford to play somewhere? */
export function isBroke({ bankroll, holdings = 0, chipsInPlay = 0, minBuyIn }) {
  if (n(chipsInPlay) > 0) return false; // still has chips on a table: keep playing
  return n(bankroll) + n(holdings) < n(minBuyIn);
}

/** At one table: out of chips here, can't buy back in, and nothing anywhere else. */
export function bustedAndBroke({ busted, econ, bankroll, holdings = 0, buyIn, otherChips = 0 }) {
  if (!busted || !econ) return false; // practice tables rebuy for free
  if (n(otherChips) > 0) return false;
  return n(bankroll) + n(holdings) < n(buyIn);
}
