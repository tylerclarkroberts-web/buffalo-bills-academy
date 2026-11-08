// v38: measure the bots. Plays the real engine with the real bot brain against baseline opponents (and itself),
// resetting stacks to 100 big blinds each hand, and checks the engine invariants on every hand:
// chips are conserved, nobody acts out of turn, every action is legal, and a bot's view never contains anyone else's hole cards.
// usage: node scripts/bot-sim.mjs <opponent> <seats> <hands> [seed]   (opponent: station|random|maniac|abc|bot)
import * as G from '../server/engine/game.js';
import { decide } from '../server/bots/brain.js';
import { BASELINES } from '../server/bots/baseline.js';
import crypto from 'node:crypto';

const [opp = 'abc', seatsArg = '2', handsArg = '2000', seedArg] = process.argv.slice(2);
const SEATS = +seatsArg, HANDS = +handsArg; const BB = 2, STACK = 200;
let seed = seedArg ? +seedArg : crypto.randomInt(2 ** 31);
// decisions: a seeded sfc32 stream; the deck: the engine's own crypto shuffle (independent of the decisions)
let a0 = seed ^ 0x9e3779b9, b0 = seed * 7 + 1, c0 = 0xdeadbeef, d0 = 1;
const rng = () => { a0 >>>= 0; b0 >>>= 0; c0 >>>= 0; d0 >>>= 0; let t = (a0 + b0) | 0; a0 = b0 ^ (b0 >>> 9); b0 = (c0 + (c0 << 3)) | 0; c0 = (c0 << 21) | (c0 >>> 11); d0 = (d0 + 1) | 0; t = (t + d0) | 0; c0 = (c0 + t) | 0; return (t >>> 0) / 4294967296; };
for (let i = 0; i < 20; i++) rng();
const ctx = () => ({ now: Date.now() });
const players = Array.from({ length: SEATS }, (_, i) => ({ id: `p${i}`, name: i === 0 ? 'Strong' : `${opp}${i}` }));
const t = G.createTable({ id: 'sim', code: 'SIM', name: 'sim', host: players[0], settings: { maxPlayers: SEATS, buyIn: STACK, smallBlind: 1, bigBlind: BB, turnSeconds: 60, nextHandDelaySeconds: 0 } }, ctx());
for (const p of players.slice(1)) G.joinTable(t, p, undefined, ctx());
t.status = 'playing';
const net = new Array(SEATS).fill(0); const sq = new Array(SEATS).fill(0); let errors = 0, leaks = 0, outOfTurn = 0, conserve = 0, actions = 0;
for (let k = 0; k < HANDS; k++) {
  t.seats.forEach((s) => { s.stack = STACK; s.sittingOut = false; s.timeouts = 0; });
  t.nextHandAt = null; t.hand = null;
  G.startHand(t, ctx());
  let guard = 0;
  while (t.hand && guard++ < 400) {
    const seat = t.hand.toAct; const pid = t.seats[seat].playerId;
    const v = G.viewFor(t, pid, Date.now());
    if (v.seats.some((s) => s && s.seat !== seat && s.cards)) leaks++;
    // a player who is not on turn must get nothing to do
    const other = t.seats.find((s, i) => s && i !== seat); if (other && G.viewFor(t, other.playerId, 0).legal) outOfTurn++;
    let a = seat === 0 || opp === 'bot' ? decide(v, rng)?.action : BASELINES[opp](v, rng);
    try { G.act(t, pid, a, ctx()); actions++; } catch (e) { errors++; if (errors < 5) console.error('illegal', JSON.stringify(a), e.message); G.act(t, pid, { type: v.legal.canCheck ? 'check' : 'fold' }, ctx()); }
  }
  const total = t.seats.reduce((x, s) => x + s.stack, 0);
  if (total !== STACK * SEATS) conserve++;
  t.seats.forEach((s, i) => { const d = s.stack - STACK; net[i] += d; sq[i] += d * d; });
}
const bb100 = (i) => (net[i] / BB / HANDS) * 100;
const se = (i) => { const m = net[i] / HANDS; const v = sq[i] / HANDS - m * m; return (Math.sqrt(v / HANDS) / BB) * 100; };
const out = { opponent: opp, seats: SEATS, hands: HANDS, strongBb100: +bb100(0).toFixed(1), strongSe: +se(0).toFixed(1), othersBb100: +(net.slice(1).reduce((a, b) => a + b, 0) / (SEATS - 1) / BB / HANDS * 100).toFixed(1), actions, illegal: errors, leaks, outOfTurn, chipErrors: conserve };
console.log(JSON.stringify(out));
