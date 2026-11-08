// Monte Carlo of the real engine: one basic-strategy bot seat against Guntrad, flat $10 bets.
import { newTable } from './table.js';
import { startRound } from './game.js';
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function simulate({ rounds = 100000, seed = 1, rules = {}, seats = 1 } = {}) {
  const f = mulberry(seed); const rng = (n) => Math.floor(f() * n);
  const t = newTable({ code: 'SIM', name: 'sim', host: { id: 'h', name: 'h' }, settings: { house: 'guntrad', rules, minBet: 10, maxBetX: 50, buyIn: 2000, turnSec: 30, maxSeats: 6 } });
  for (let i = 0; i < seats; i++) t.seats[i] = { id: 'bot' + i, name: 'Bot', bot: true, chips: 1e12, startChips: 1e12, stats: { rounds: 0, wagered: 0, won: 0, bj: 0, biggest: 0, lost: 0 } };
  let wagered = 0, net = 0;
  for (let n = 0; n < rounds; n++) {
    t.log = []; // keep it fast
    const before = t.seats.slice(0, seats).reduce((a, s) => a + s.chips, 0);
    startRound(t, 0, rng);
    const after = t.seats.slice(0, seats).reduce((a, s) => a + s.chips, 0);
    net += after - before; wagered += 10 * seats; // initial bets (house edge convention: per initial wager)
  }
  return { rounds, wagered, net, edge: -net / wagered, shuffles: t.shuffles };
}
