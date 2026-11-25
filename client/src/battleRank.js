// Bug battle board ordering, kept apart from the JSX so tests can import it.
export const RANK_MIN = 3; // fewer decided fights than this and a perfect record would top the board: they rank after

/** Rank by win %, once a player has enough decided fights; ties go to more wins, then more fights. `kind` is 'all' or a fight type. */
export function rankBattles(rows, kind = 'all') {
  const rec = (r) => (kind === 'all' ? r.total : r.by[kind]);
  return rows.filter((r) => rec(r)?.n > 0).toSorted((a, b) => {
    const A = rec(a), B = rec(b), qa = A.w + A.l >= RANK_MIN, qb = B.w + B.l >= RANK_MIN;
    return (qb - qa) || ((B.pct ?? -1) - (A.pct ?? -1)) || (B.w - A.w) || (B.n - A.n) || a.name.localeCompare(b.name);
  });
}
