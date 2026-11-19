// Clean-sweep celebration: when one player has all the chips and everyone else at
// the table is busted. Pure helpers. The client plays a huge-avatar "sit-down"
// tour; busted players get a once-only fake "your turn" so they open a close-up.
// Never touches hand.toAct or Slack / push turn alerts.

export function seatedPlayers(t) {
  return t.seats.map((s, seat) => (s ? { seat, playerId: s.playerId, name: s.name, stack: s.stack, leaving: !!s.leaving } : null)).filter(Boolean);
}

/** After a hand's stacks are settled, before leavers are removed from seats. */
export function detectSweep(t) {
  const seated = seatedPlayers(t);
  const rich = seated.filter((s) => s.stack > 0);
  const busted = seated.filter((s) => s.stack === 0);
  if (rich.length !== 1 || busted.length < 1) return null;
  const winner = rich[0];
  return {
    winner: { seat: winner.seat, playerId: winner.playerId, name: winner.name },
    victims: busted.map((s) => ({ seat: s.seat, playerId: s.playerId, name: s.name })),
  };
}

export function recordSweep(t, ctx, found) {
  if (!found?.winner || !found.victims?.length) return null;
  const handNumber = t.lastHand?.number || t.handNumber || 0;
  t.sweep = {
    id: `${t.code || 'T'}:${handNumber}:${ctx?.now || 0}`,
    handNumber,
    at: ctx?.now || 0,
    winner: found.winner,
    victims: found.victims,
    seen: {},
  };
  return t.sweep;
}

export function maybeRecordSweep(t, ctx) {
  const found = detectSweep(t);
  if (!found) return null;
  return recordSweep(t, ctx, found);
}

export function markSweepSeen(t, playerId) {
  if (!t?.sweep || !playerId) return t;
  const s = t.sweep;
  const mine = s.winner.playerId === playerId || s.victims.some((v) => v.playerId === playerId);
  if (!mine) return t;
  s.seen = { ...s.seen, [playerId]: true };
  return t;
}

export function isSweepVictim(sweep, playerId) {
  return !!sweep && sweep.victims.some((v) => v.playerId === playerId) && !sweep.seen?.[playerId];
}

export function isSweepWinner(sweep, playerId) {
  return !!sweep && sweep.winner.playerId === playerId;
}

/** What one player may see. `seen` is only their own flag. */
export function sweepView(t, playerId) {
  const s = t?.sweep;
  if (!s) return null;
  const role = s.winner.playerId === playerId ? 'winner'
    : s.victims.some((v) => v.playerId === playerId) ? 'victim' : 'watcher';
  return {
    id: s.id,
    handNumber: s.handNumber,
    at: s.at,
    winner: { ...s.winner },
    victims: s.victims.map((v) => ({ ...v })),
    role,
    seen: !!s.seen?.[playerId],
  };
}
