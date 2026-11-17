// Royal commands: the King may order the Scum to do one purely cosmetic bit of business
// after each finished round. Nothing here touches cards, titles, turns, or money.
export const COMMANDS = [
  { id: 'jig', label: 'Do a jig', short: 'Do a jig' },
  { id: 'bow', label: 'Bow down before me', short: 'Bow down' },
  { id: 'milk', label: 'Get me a glass of milk', short: 'Fetch milk' },
  { id: 'toot', label: 'Let someone toot in your face', short: 'Toot in the face', needsTarget: true },
  { id: 'fan', label: 'Fan the King with a palm leaf', short: 'Fan me' },
  { id: 'carpet', label: 'Roll out the red carpet', short: 'Red carpet' },
  { id: 'dunce', label: 'Wear the dunce cap of shame', short: 'Dunce cap' },
  { id: 'boots', label: 'Shine the King’s boots', short: 'Shine my boots' },
  { id: 'serenade', label: 'Sing a serenade off-key', short: 'Serenade me' },
  { id: 'train', label: 'Carry the King’s train', short: 'Carry my train' },
  { id: 'sweep', label: 'Sweep the floor under the King’s feet', short: 'Sweep up' },
];

export const byId = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

export function caption(ev, names = {}) {
  const cmd = byId[ev.cmd];
  const scum = names.scum || 'Scum';
  const king = names.king || 'the King';
  const who = names.target || 'someone';
  switch (ev.cmd) {
    case 'jig': return `${scum} does a jig for ${king}.`;
    case 'bow': return `${scum} bows down before ${king}.`;
    case 'milk': return `${scum} fetches ${king} a glass of milk.`;
    case 'toot': return `${who} toots in ${scum}'s face.`;
    case 'fan': return `${scum} fans ${king} with a palm leaf.`;
    case 'carpet': return `${scum} rolls out the red carpet for ${king}.`;
    case 'dunce': return `${scum} wears the dunce cap of shame.`;
    case 'boots': return `${scum} shines ${king}'s boots.`;
    case 'serenade': return `${scum} serenades ${king}, off-key.`;
    case 'train': return `${scum} carries ${king}'s train.`;
    case 'sweep': return `${scum} sweeps under ${king}'s feet.`;
    default: return cmd ? `${scum}: ${cmd.label}.` : 'A royal command.';
  }
}

export function logText(ev, names = {}) {
  const cmd = byId[ev.cmd];
  const king = names.king || 'The King';
  const scum = names.scum || 'Scum';
  if (ev.cmd === 'toot') return `${king} commands ${scum}: let ${names.target || 'someone'} toot in their face.`;
  return `${king} commands ${scum}: ${cmd?.label || ev.cmd}.`;
}

/** Who may issue a command right now, and at whom. Pure; no I/O. */
export function court(t, playerId) {
  const finish = t.lastRound?.finish || [];
  const king = finish.find((x) => x.title === 'king');
  const scum = finish.find((x) => x.title === 'scum');
  const kingSeat = king?.seat;
  const scumSeat = scum?.seat;
  const seat = t.seats?.[kingSeat];
  const isKing = kingSeat != null && seat && !seat.bot && !seat.left && seat.id === playerId;
  const already = (t.royal || []).some((e) => e.round === t.lastRound?.no);
  const targets = (t.seats || []).map((s, i) => (s && !s.left && i !== scumSeat ? { seat: i, name: s.name, bot: !!s.bot, me: s.id === playerId } : null)).filter(Boolean);
  return {
    canCommand: !!(isKing && scum && !already && (t.status === 'playing' || t.status === 'over')),
    already, kingSeat, scumSeat, kingName: king?.name || seat?.name, scumName: scum?.name || t.seats?.[scumSeat]?.name,
    targets, round: t.lastRound?.no || 0,
  };
}

export function publicEvent(e, t) {
  const nm = (i) => (i == null ? null : t.seats[i]?.name || null);
  return {
    id: e.id, round: e.round, at: e.at, cmd: e.cmd, label: byId[e.cmd]?.label || e.cmd,
    kingSeat: e.kingSeat, scumSeat: e.scumSeat, targetSeat: e.targetSeat ?? null,
    kingName: e.kingName || nm(e.kingSeat), scumName: e.scumName || nm(e.scumSeat),
    targetName: e.targetName || nm(e.targetSeat), caption: caption(e, { king: e.kingName || nm(e.kingSeat), scum: e.scumName || nm(e.scumSeat), target: e.targetName || nm(e.targetSeat) }),
  };
}

export function pendingFor(t, playerId) {
  return (t.royal || []).find((e) => !e.seen?.[playerId]) || null;
}
