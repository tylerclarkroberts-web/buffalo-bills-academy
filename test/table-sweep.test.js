// Clean sweep: last player standing, punch still flags all-in losers, fake "your turn" for victims only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import * as G from '../server/engine/game.js';
import { maybeRecordSweep, markSweepSeen, sweepView, detectSweep, isSweepVictim } from '../server/engine/sweep.js';
import { listTurns, holdemSource, sweepSource, collectTurns } from '../server/turns.js';
import { PokerService } from '../server/service.js';
import { makeTable, act, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };

// 3-handed, Ann (seat 0) has aces and wins an all-in against Bob and Cat.
function sweepHand() {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { nextHandDelaySeconds: 0 });
  // deal left of button (Ann): Bob, Cat, Ann, Bob, Cat, Ann
  const deal = ['7c', '8d', 'As', '2d', '3h', 'Ah'];
  start(t, ctx, riggedDeck(deal, ['Kc', '9s', '4d', 'Jh', 'Td']));
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'allin'); act(t, 'Cat', 'allin');
  return t;
}

test('all-in losers are still flagged when the hand is also a table sweep (punch still has its data)', () => {
  const t = sweepHand();
  assert.equal(t.hand, null);
  const names = t.lastHand.allInLosers.map((x) => x.name).sort();
  assert.deepEqual(names, ['Bob', 'Cat']);
  assert.equal(t.seats[0].stack, 3000);
  assert.equal(t.seats[1].stack, 0);
  assert.equal(t.seats[2].stack, 0);
});

test('a clean sweep is recorded for the last player standing and every busted seat', () => {
  const t = sweepHand();
  assert.ok(t.sweep, 'sweep was recorded');
  assert.equal(t.sweep.winner.name, 'Ann');
  assert.equal(t.sweep.winner.playerId, 'p0');
  assert.deepEqual(t.sweep.victims.map((v) => v.name).sort(), ['Bob', 'Cat']);
  assert.deepEqual(t.sweep.seen, {});
  const forAnn = sweepView(t, 'p0');
  const forBob = sweepView(t, 'p1');
  const forStranger = sweepView(t, 'nope');
  assert.equal(forAnn.role, 'winner');
  assert.equal(forAnn.seen, false);
  assert.equal(forBob.role, 'victim');
  assert.equal(forStranger.role, 'watcher');
});

test('heads-up all-in winner also counts as a sweep; a fold that leaves chips does not', () => {
  const a = makeTable(['Ann', 'Bob']);
  start(a.t, a.ctx, riggedDeck(['7c', 'Ah', '2d', 'Ad'], ['Kc', '9s', '4d', 'Jh', 'Td']));
  act(a.t, 'Ann', 'allin'); act(a.t, 'Bob', 'call');
  assert.ok(a.t.sweep);
  assert.equal(a.t.sweep.winner.name, 'Ann');
  assert.deepEqual(a.t.sweep.victims.map((v) => v.name), ['Bob']);
  assert.ok(a.t.lastHand.allInLosers.some((l) => l.name === 'Bob'));

  const b = makeTable(['Ann', 'Bob', 'Cat']);
  start(b.t, b.ctx, riggedDeck(['As', '7c', 'Ah', '2d', 'Kc', '3h'], ['9s', '4d', 'Jh', 'Td', '8s']));
  act(b.t, 'Ann', 'allin'); act(b.t, 'Bob', 'fold'); act(b.t, 'Cat', 'fold');
  assert.equal(b.t.sweep, undefined);
  assert.ok(b.t.seats[1].stack > 0 && b.t.seats[2].stack > 0);
});

test('someone sitting out with chips blocks a sweep', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.setSittingOut(t, 'p2', true, ctx);
  start(t, ctx, riggedDeck(['7c', 'As', '2d', 'Ah'], ['Kc', '9s', '4d', 'Jh', 'Td']));
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'call');
  assert.equal(t.seats[2].stack, 1000);
  assert.equal(detectSweep(t), null);
  assert.equal(t.sweep, undefined);
});

test('sweep seen is once per player and does not change toAct or invent a hand', () => {
  const t = sweepHand();
  assert.equal(t.hand, null);
  markSweepSeen(t, 'p1');
  assert.equal(t.sweep.seen.p1, true);
  assert.equal(t.sweep.seen.p2, undefined);
  markSweepSeen(t, 'p1');
  assert.equal(t.sweep.seen.p1, true);
  markSweepSeen(t, 'stranger');
  assert.equal(t.sweep.seen.stranger, undefined);
  assert.equal(t.hand, null);
  assert.equal(sweepView(t, 'p1').seen, true);
  assert.equal(isSweepVictim(t.sweep, 'p1'), false);
  assert.equal(isSweepVictim(t.sweep, 'p2'), true);
});

test('listTurns shows a Hold\'em-looking "your turn" only for unseen victims, never the winner, and never a deadline', () => {
  const t = sweepHand();
  t.code = 'SWEEP1';
  t.name = 'Sweep table';
  const service = { store: { allTables: () => [t] } };
  const src = [holdemSource(service), sweepSource(service)];
  const bob = collectTurns({ player: { id: 'p1' }, now: 5000, sources: src });
  assert.equal(bob.length, 1);
  assert.equal(bob[0].game, 'holdem');
  assert.equal(bob[0].path, '/t/SWEEP1');
  assert.equal(bob[0].action, 'play');
  assert.equal(bob[0].deadline, null);
  assert.equal(bob[0].code, 'SWEEP1');
  assert.deepEqual(collectTurns({ player: { id: 'p0' }, now: 5000, sources: src }), [], 'winner is not up');
  markSweepSeen(t, 'p1');
  assert.deepEqual(collectTurns({ player: { id: 'p1' }, now: 5000, sources: src }), [], 'plays once');
  assert.equal(collectTurns({ player: { id: 'p2' }, now: 5000, sources: src }).length, 1);
});

test('a real pending Hold\'em turn is unchanged, and a sweep does not add a second row for the same table', () => {
  const live = {
    status: 'playing', code: 'LIVE01', name: 'Live',
    seats: [{ playerId: 'p9', sittingOut: false, leaving: false }],
    hand: { toAct: 0, deadline: 20_000, startedAt: 10_000 },
    settings: { turnSeconds: 10 },
  };
  const swept = sweepHand();
  swept.code = 'SWEEP1'; swept.name = 'Sweep table';
  // A victim who somehow also has a real action at another table still sees both, oldest first.
  const service = { store: { allTables: () => [live, swept] } };
  const src = [holdemSource(service), sweepSource(service)];
  const rows = collectTurns({ player: { id: 'p9' }, now: 16_000, sources: src });
  assert.deepEqual(rows.map((r) => r.code), ['LIVE01']);
  const mixed = { store: { allTables: () => [live, swept] } };
  const bobRows = collectTurns({ player: { id: 'p1' }, now: 16_000, sources: [holdemSource(mixed), sweepSource(mixed)] });
  assert.deepEqual(bobRows.map((r) => r.code), ['SWEEP1']);
  // Same table: if a real toAct existed for the victim, the sweep source must stand aside.
  swept.hand = { toAct: 1, deadline: 20_000, startedAt: 10_000 };
  swept.seats[1].sittingOut = false;
  swept.seats[1].leaving = false;
  const both = collectTurns({ player: { id: 'p1' }, now: 16_000, sources: [holdemSource({ store: { allTables: () => [swept] } }), sweepSource({ store: { allTables: () => [swept] } })] });
  assert.equal(both.length, 1);
  assert.equal(both[0].deadline, 20_000, 'real turn keeps its clock');
});

test('tablesFor marks an unseen victim as myTurn with no deadline; the winner is not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-sweep-'));
  const now = 1_700_000_000_000;
  const service = new PokerService({ dataDir: dir, now: () => now });
  try {
    const ann = service.createPlayer('Ann');
    const bob = service.createPlayer('Bob');
    const t = service.createTable(service.getPlayer(ann.id), { name: 'Cash', settings: { buyIn: 100, smallBlind: 5, bigBlind: 10, nextHandDelaySeconds: 0 } });
    service.join(t.code, service.getPlayer(bob.id));
    service.rigDeck(t.code, service.getPlayer(ann.id), riggedDeck(['7c', 'Ah', '2d', 'Ad'], ['Kc', '9s', '4d', 'Jh', 'Td']));
    service.start(t.code, service.getPlayer(ann.id));
    service.act(t.code, service.getPlayer(ann.id), { type: 'allin' });
    service.act(t.code, service.getPlayer(bob.id), { type: 'call' });
    const table = service.getTable(t.code);
    assert.ok(table.sweep);
    assert.ok(table.lastHand.allInLosers.some((l) => l.playerId === bob.id));
    const forBob = service.tablesFor(service.getPlayer(bob.id)).find((x) => x.code === t.code);
    const forAnn = service.tablesFor(service.getPlayer(ann.id)).find((x) => x.code === t.code);
    assert.equal(forBob.myTurn, true);
    assert.equal(forBob.deadline, null);
    assert.equal(forAnn.myTurn, false);
    const turns = listTurns({ player: service.getPlayer(bob.id), service, now });
    assert.equal(turns.length, 1);
    assert.equal(turns[0].game, 'holdem');
    assert.equal(turns[0].deadline, null);
    service.sweepSeen(t.code, service.getPlayer(bob.id), table.sweep.id);
    assert.equal(service.tablesFor(service.getPlayer(bob.id)).find((x) => x.code === t.code).myTurn, false);
    assert.equal(listTurns({ player: service.getPlayer(bob.id), service, now }).length, 0);
    assert.equal(table.hand, null, 'no invented action');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a left victim still gets the fake turn, and closed tables still carry the sweep', () => {
  const t = sweepHand();
  t.code = 'SWEEP1'; t.name = 'Sweep table';
  // Bob leaves after going broke (seat cleared, record stays).
  t.seats[1] = null;
  const src = [sweepSource({ store: { allTables: () => [t] } })];
  assert.equal(collectTurns({ player: { id: 'p1' }, now: 1, sources: src }).length, 1);
  t.status = 'closed';
  assert.equal(collectTurns({ player: { id: 'p1' }, now: 1, sources: src }).length, 1);
});

test('sweep timeline stays tight; claim is once per id', async () => {
  const { sweepPlan, claimSweep } = await import('../client/src/table/fx.js');
  const tour = sweepPlan(2);
  assert.equal(tour.visits.length, 2);
  assert.ok(tour.total >= 2500 && tour.total <= 8000, `tour ${tour.total}`);
  const close = sweepPlan(1, { closeup: true });
  assert.ok(close.total < tour.total);
  assert.ok(close.visits[0].bags >= 4);
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(claimSweep('ABC', 's1', store), true);
  assert.equal(claimSweep('ABC', 's1', store), false);
  assert.equal(claimSweep('ABC', 's2', store), true);
});
