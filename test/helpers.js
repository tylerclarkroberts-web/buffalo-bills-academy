import { newDeck } from '../server/engine/cards.js';
import * as G from '../server/engine/game.js';

/** Build a deck so cards come out in this order: hole cards (deal order), burn, flop x3, burn, turn, burn, river. */
export function riggedDeck(dealOrder, board = []) {
  const used = new Set([...dealOrder, ...board]);
  const rest = newDeck().filter((c) => !used.has(c));
  const burns = rest.splice(0, 3);
  const seq = [...dealOrder];
  if (board.length) seq.push(burns[0], board[0], board[1], board[2], burns[1], board[3], burns[2], board[4]);
  return [...rest, ...seq.reverse()]; // engine pops from the end
}

export function makeTable(names, settings = {}, now = 1000) {
  const ctx = { now };
  const players = names.map((name, i) => ({ id: `p${i}`, name }));
  const t = G.createTable({ id: 't1', code: 'ABCDEF', name: 'Test', host: players[0], settings: { nextHandDelaySeconds: 0, ...settings } }, ctx);
  for (const p of players.slice(1)) G.joinTable(t, p, undefined, ctx);
  return { t, players, ctx };
}

export const seatName = (t, i) => t.seats[i].name;
export const toActName = (t) => t.seats[t.hand.toAct].name;
export function act(t, name, type, amount, now = 2000) {
  const s = t.seats.find((x) => x && x.name === name);
  G.act(t, s.playerId, { type, amount }, { now });
}
