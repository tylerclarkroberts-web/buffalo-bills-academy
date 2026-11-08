// Simulated games: random bots play thousands of hands through the engine.
// Proves the game always progresses and chips are conserved (only buy-ins/rebuys add chips).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';

function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function checkInvariants(t) {
  const onTable = G.chipsOnTable(t);
  assert.equal(onTable, G.totalBoughtIn(t) - G.totalCashedOut(t), 'chip conservation');
  for (const s of t.seats) if (s) assert.ok(s.stack >= 0 && Number.isInteger(s.stack), 'stack is a non-negative integer');
  if (t.hand) {
    const h = t.hand;
    assert.ok(h.board.length <= 5);
    const cards = h.players.filter(Boolean).flatMap((p) => p.hole).concat(h.board);
    assert.equal(new Set(cards).size, cards.length, 'no duplicate cards');
    if (h.toAct !== null) {
      const p = h.players[h.toAct];
      assert.ok(p && !p.folded && !p.allIn, 'player to act is live and has chips');
    }
  }
}

function runGame(seed, numPlayers, hands, settings = {}) {
  const rand = mulberry32(seed);
  const rng = (k) => Math.floor(rand() * k);
  let now = 1_000_000;
  const ctx = () => ({ now, rng });
  const players = Array.from({ length: numPlayers }, (_, i) => ({ id: `p${i}`, name: `Bot${i}` }));
  const t = G.createTable({ id: 't', code: 'SIMSIM', name: 'Sim', host: players[0], settings: { maxPlayers: 9, nextHandDelaySeconds: 0, turnSeconds: 60, ...settings } }, ctx());
  for (const p of players.slice(1)) G.joinTable(t, p, undefined, ctx());
  G.startGame(t, 'p0', ctx());
  let played = 0; let showdowns = 0; let sidePots = 0; let timeouts = 0; let lastHand = 0; let guard = 0;
  const buttons = new Set();
  while (played < hands && guard++ < hands * 200) {
    checkInvariants(t);
    if (!t.hand) {
      // between hands: busted bots rebuy, away bots come back
      for (const s of t.seats) {
        if (!s) continue;
        if (s.stack === 0 && rand() < 0.7) { try { G.rebuy(t, s.playerId, ctx()); } catch { /* limit reached */ } }
        if (s.sittingOut && rand() < 0.5) G.setSittingOut(t, s.playerId, false, ctx());
      }
      now += 1000;
      if (!G.tick(t, ctx())) {
        // nobody can play: force everyone to rebuy if allowed, else stop
        let any = false;
        for (const s of t.seats) if (s && s.stack === 0) { try { G.rebuy(t, s.playerId, ctx()); any = true; } catch { /* */ } }
        for (const s of t.seats) if (s && s.sittingOut) { G.setSittingOut(t, s.playerId, false, ctx()); any = true; }
        if (!any) break;
      }
      continue;
    }
    const h = t.hand;
    if (h.number !== lastHand) { lastHand = h.number; played++; buttons.add(h.buttonSeat); }
    const seat = h.toAct;
    const L = G.legalActions(t, seat);
    const r = rand();
    if (r < 0.04) { now = h.deadline; G.tick(t, ctx()); timeouts++; continue; }
    let action;
    if (r < 0.2) action = { type: 'fold' };
    else if (r < 0.6) action = { type: L.canCheck ? 'check' : 'call' };
    else if (L.canRaise && r < 0.9) {
      const span = L.maxRaiseTo - L.minRaiseTo;
      action = { type: 'raise', amount: L.minRaiseTo + Math.floor(rand() * rand() * (span + 1)) };
    } else if (L.canRaise) action = { type: 'allin' };
    else action = { type: L.canCheck ? 'check' : 'call' };
    const before = t.handNumber;
    G.act(t, t.seats[seat].playerId, action, ctx());
    if (!t.hand || t.handNumber !== before) {
      const lh = t.lastHand;
      if (Object.keys(lh.shown).length) showdowns++;
      if (lh.pots.filter((p) => !p.uncalled).length > 1) sidePots++;
    }
  }
  checkInvariants(t);
  return { t, played, showdowns, sidePots, timeouts, buttons };
}

test('simulated 9-player game: 1500 hands, chips conserved, side pots and showdowns happen', () => {
  const r = runGame(42, 9, 1500);
  assert.equal(r.played, 1500);
  assert.ok(r.showdowns > 100, `showdowns ${r.showdowns}`);
  assert.ok(r.sidePots > 10, `side pots ${r.sidePots}`);
  assert.ok(r.timeouts > 10);
  assert.ok(r.buttons.size >= 8, 'button moves around the table');
});

test('simulated heads-up game: 1000 hands', () => {
  const r = runGame(7, 2, 1000);
  assert.equal(r.played, 1000);
});

test('many random table sizes and seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const size = 2 + (seed % 8);
    const r = runGame(seed * 977, size, 120, { maxRebuys: seed % 3 === 0 ? 2 : -1, buyIn: 200 + seed * 10, smallBlind: 5, bigBlind: 10 });
    assert.ok(r.played > 0);
  }
});
