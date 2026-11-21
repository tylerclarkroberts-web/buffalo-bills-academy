// Tips are play-money transfers from a player to the human house, not bets.
// They go through the bankroll ledger with an idempotency key and never touch chip stacks,
// the house bank, or canBet.
import { GameError } from '../engine/game.js';
import { cents } from '../accounts.js';
import { log } from './game.js';

export const TIP_AMOUNTS = [1, 5, 25];
export const BIG_TIP = 25;
const TIP_SHOW_MS = 4000;

export function canTip(t, viewerId) {
  return !!(t && t.status === 'playing' && t.house?.mode === 'player' && t.house.id && viewerId && viewerId !== t.house.id);
}

/** Move `amount` from `from` to the human house. `id` is the client's idempotency key. */
export function tip(t, { from, accounts, getPlayer, amount, id, now }) {
  if (!t || t.house?.mode !== 'player' || !t.house.id) throw new GameError('No one is dealing.', 409);
  if (t.status !== 'playing') throw new GameError('The table is not in play.', 409);
  if (!from?.id) throw new GameError('Sign in to tip.', 401);
  if (from.id === t.house.id) throw new GameError("You can't tip yourself.", 409);
  const amt = Number(amount);
  if (!TIP_AMOUNTS.includes(amt)) throw new GameError(`Tips are $${TIP_AMOUNTS.join(', $')}.`, 400);
  const key = String(id || '').trim();
  if (!key || key.length > 80) throw new GameError('Missing tip id.', 400);
  t.tipLedger ||= {};
  const prev = t.tipLedger[key];
  if (prev) {
    if (prev.from !== from.id || prev.amount !== amt) throw new GameError('That tip was already recorded.', 409);
    return { ...prev, replay: true };
  }
  const house = getPlayer(t.house.id);
  if (!house) throw new GameError('No one is dealing.', 409);
  accounts.requireFunds(from, amt, 'that tip');
  const rec = { id: key, from: from.id, fromName: from.name, to: t.house.id, toName: t.house.name, amount: amt, at: now };
  t.tipLedger[key] = rec;
  accounts.change(from, -amt, 'bj-tip', `Tip $${amt} to ${t.house.name} (${t.code})`, { save: false });
  accounts.change(house, amt, 'bj-tip', `Tip $${amt} from ${from.name} (${t.code})`, { save: false });
  accounts.save();
  t.lastTip = { ...rec, until: now + TIP_SHOW_MS, thanks: `Thanks for the tip` };
  log(t, now, `${from.name} tips ${t.house.name} $${amt}.`, { k: 'tip', from: from.id, amount: amt, id: key });
  return rec;
}

export function tipView(t, now) {
  const last = t.lastTip;
  if (last && now <= last.until) return { from: last.from, name: last.fromName, amount: last.amount, at: last.at, thanks: last.thanks, big: last.amount >= BIG_TIP };
  return null;
}
export { cents };
