// The ring's start-a-bout flow as plain data, so it can be tested without a browser: who you could fight, what it
// would cost each side, and why a button is off. The server still decides every stake, line and result; this only
// arranges what GET /api/barn already sent.
import { riskFor } from '../../../server/engine/bug-combat.js';
import { edge, typeOf } from '../../../server/engine/bug-types.js';
import { money } from '../util.js';

/** Stakes offered as one-tap chips before "Other". Every one is a multiple of the $10 stake step. */
export const STAKE_PRESETS = [0, 10, 50, 100, 250, 500];

export const pct = (p) => Math.round(p * 100);

/** Your bugs that can step into the ring (hatched), in stall order. */
export const fightersOf = (b) => (b?.stable?.bugs || []).filter((bug) => bug.stage === 'creature');

/** The bug you fight with: the one you picked, else the first standing, else the first. */
export const pickMine = (fighters, withId) => fighters.find((bug) => bug.id === withId) || fighters.find((bug) => !bug.fainted) || fighters[0] || null;

/** The most you can put on a bout right now. */
export const stakeCap = (b) => Math.max(0, Math.min(b?.maxStake ?? 0, b?.bankroll ?? 0));

/** A stake box opens on $100, or the most this owner can cover, in steps. */
export const openingStake = (b) => { const step = b?.stakeStep || 10; return Math.max(0, Math.min(100, Math.floor(stakeCap(b) / step) * step)); };

/** The chips that fit this wallet. Free is always there. */
export const stakeChips = (b) => { const step = b?.stakeStep || 10, cap = stakeCap(b); return STAKE_PRESETS.filter((v) => v === 0 || (v <= cap && v % step === 0)); };

/** A typed stake as the server will take it: a whole number of steps, within what you can cover; null if it is not one. */
export function cleanStake(raw, b) {
  const step = b?.stakeStep || 10, n = Number(raw);
  if (raw === '' || raw === null || !Number.isFinite(n) || n < 0) return null;
  if (n % step !== 0) return null;
  return n;
}

/** Which way the type edge goes, in words; '' when neither has it. The line already counts it. */
export function edgeNote(mineSpecies, theirSpecies) {
  const e = edge(typeOf(mineSpecies), typeOf(theirSpecies));
  return e > 0 ? 'Your type has the edge' : e < 0 ? 'Their type has the edge' : '';
}

/**
 * Everyone you could fight, as rows. Open bouts come first (they start the moment you join), then every other
 * player's bug you can call out. A bug already posted in an open bout is listed once, as the bout.
 */
export function opponents({ b, meId, mine }) {
  const rows = [], posted = new Set();
  for (const entry of b?.bouts || []) {
    if (entry.hostId === meId) continue;
    const t = mine && entry.terms?.[mine.id];
    posted.add(`${entry.hostId}|${entry.fighter.name}|${entry.fighter.species}`);
    rows.push({ key: `bout:${entry.id}`, kind: 'bout', id: entry.id, ownerId: entry.hostId, owner: entry.hostName, bug: entry.fighter,
      win: t ? t.win : null, risk: t ? t.risk : entry.stake, stake: entry.stake, expiresAt: entry.expiresAt, can: true, why: '' });
  }
  const outgoing = b?.challenges?.outgoing || [];
  const calls = [];
  for (const bug of b?.roster || []) {
    if (bug.ownerId === meId || posted.has(`${bug.ownerId}|${bug.name}|${bug.species}`)) continue;
    const sent = outgoing.find((c) => c.to === bug.ownerId && c.toBug === bug.id) || null;
    const why = bug.heesheeHeld ? 'lost to the Heeshee' : !bug.fights ? 'too young' : bug.fainted ? 'fainted' : '';
    calls.push({ key: `call:${bug.ownerId}:${bug.id}`, kind: 'call', ownerId: bug.ownerId, owner: bug.owner, bug,
      win: mine && bug.line?.[mine.id] != null ? bug.line[mine.id] : null, sent, can: !why, why, busy: !!bug.inRing });
  }
  calls.sort((x, y) => Number(y.can) - Number(x.can)); // stable: the server's level order holds within each group
  return [...rows, ...calls];
}

/** Incoming challenges, from your corner: your chance is the other side of the challenger's line. */
export const incoming = (b) => (b?.challenges?.incoming || []).map((c) => ({ ...c, win: c.line != null ? 1 - c.line : null, risk: c.risk ?? c.stake }));

/**
 * What each corner puts up. `kind`: 'bout' (joining an open bout), 'accept', 'call' (you name the stake) or 'post'.
 * Returns { you, them } in dollars; `them` is null when nobody knows yet (a posted bout's joiner pays by the line).
 */
export function termsFor(kind, { stake = 0, risk = 0, win = null } = {}) {
  if (kind === 'bout' || kind === 'accept') return { you: risk, them: stake };
  if (kind === 'call') return { you: stake, them: stake > 0 && win ? riskFor(stake, win) : stake };
  return { you: stake, them: null };
}

/** Why the big button is off, in a few words; '' when it can go. Checked in the order a person would fix them. */
export function blocker({ mine, b, unsaved = false, kind, row = null, call = null, stake = 0 }) {
  if (!mine) return 'You need a hatched bug to fight.';
  if ((b?.stable?.bugs || []).some((bug) => bug.heesheeHeld)) return "You can't battle a bug, your bug is lost.";
  if (unsaved) return 'Save or discard your Combat changes first.';
  if (kind !== 'accept' && mine.fainted) return `${mine.name} fainted. The Bug Center can fix that.`;
  if (kind !== 'accept' && !mine.arena) return `Bouts unlock at level ${mine.arenaLevel}.`;
  if (kind === 'accept') {
    if (call?.wait) return call.wait;
    if (b?.openBout) return 'Cancel your open bout to accept.';
    const called = fightersOf(b).find((bug) => bug.id === call?.toBug);
    if (!called) return 'That bug is not in your barn any more.';
    if (called.fainted) return `${called.name} fainted. The Bug Center can fix that.`;
  }
  if (kind === 'bout' && b?.openBout) return 'Cancel your open bout to join another.';
  if (kind === 'post' && b?.openBout) return 'You already have a bout posted.';
  if (row && !row.can) return `${row.bug.name} is ${row.why}.`;
  if (kind === 'bout' && row?.expiresAt != null && b?.serverNow != null && row.expiresAt <= b.serverNow) return 'That bout has closed.';
  const you = kind === 'bout' ? row?.risk : kind === 'accept' ? call?.risk : stake;
  if (you > (b?.bankroll ?? 0)) return `You need ${money(you)} for this one.`;
  return '';
}
