// Pure helpers for the dealer POV. Presentation only: they read the existing table view.
// Gestures come from the table log; avatar identity is the seat's player (or bot) id; empty seats stay empty.

/** Avatar the dealer should draw for a seat: the same record the oval felt / top bar uses. */
export function seatAvatar(seat) {
  if (!seat || seat.left) return null;
  if (seat.avatar) return seat.avatar;
  if (seat.bot) return { kind: 'gen', seed: `bjbot:${seat.name}`, bot: true };
  if (seat.id) return { kind: 'gen', seed: seat.id };
  return null;
}

/**
 * Seats in table order, including empty slots. Never invents a player for a hole.
 * `maxSeats` keeps trailing empties so layout can leave a gap.
 */
export function seatsInOrder(seats = [], maxSeats) {
  const src = seats || [];
  const n = Math.max(maxSeats || 0, src.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = src[i];
    out.push(s && !s.left ? { ...s, i: s.i ?? i } : null);
  }
  return out;
}

export function occupiedSeats(seats = [], maxSeats) {
  return seatsInOrder(seats, maxSeats).filter(Boolean);
}

/** Hidden / stale tab, or an explicit away flag from the house view. Bots and empty seats are never away. */
export function isAway(seat, { watchers, now = 0, staleMs = 8000 } = {}) {
  if (!seat || seat.left || seat.bot) return false;
  if (seat.away === true) return true;
  if (!watchers || !seat.id) return false;
  const seen = watchers[seat.id];
  if (!seen) return false;
  return now - seen >= staleMs;
}

/** Key used to bind a 3D figure to a real occupant — player id, or a stable bot seat key. */
export function seatFigureKey(seat) {
  if (!seat || seat.left) return null;
  if (seat.bot) return `bot:${seat.name}:${seat.i ?? 0}`;
  return seat.id || null;
}
