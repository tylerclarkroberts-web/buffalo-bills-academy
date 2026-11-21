// Pure helpers for the dealer POV. Presentation only: they read the existing table view.
// Gestures come from the table log; avatar identity is the seat's player (or bot) id; empty seats stay empty.

/** Far half-moon arc, in radians. 120° keeps end seats across the table (not at the dealer's elbows) while neighboring hands still have their own circles. */
export const ARC = (120 * Math.PI) / 180;
export const SEAT_R = 2.08;
export const CARD_R = 1.26;
export const CHIP_R = 1.10;
/** World width of one fanned two-card hand, used to prove adjacent seats do not overlap. */
export const HAND_SPAN = 0.34;

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

export function seatYaw(n, i) {
  const count = Math.max(1, n);
  if (count === 1) return 0;
  return ((i / (count - 1)) - 0.5) * ARC;
}

/** Layout for seat index `i` of `n` maxSeats around the far half-moon. */
export function seatLayout(n, i) {
  const yaw = seatYaw(n, i);
  const at = (r) => ({ x: Math.sin(yaw) * r, z: Math.cos(yaw) * r });
  const seat = at(SEAT_R), card = at(CARD_R), chip = at(CHIP_R);
  return { x: seat.x, z: seat.z, y: 0, yaw, cardX: card.x, cardZ: card.z, chipX: chip.x, chipZ: chip.z };
}

/** Distance between adjacent betting-circle centers. */
export function seatSpacing(n, r = CARD_R) {
  const count = Math.max(2, n);
  return 2 * r * Math.sin(ARC / (2 * (count - 1)));
}

/** True when two neighboring two-card hands, plus a small gutter, still fit in their own circles. */
export function seatsClear(n, handSpan = HAND_SPAN, gutter = 0.08) {
  return seatSpacing(n) >= handSpan + gutter;
}
