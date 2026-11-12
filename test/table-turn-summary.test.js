import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../server/engine/game.js';
import { createApp } from '../server/app.js';
import { makeTable, act } from './helpers.js';

const start = (t, ctx) => G.startGame(t, t.hostId, ctx);
const summary = (t, id) => G.turnSummary(t, id);
const noTurn = { actorName: null, deadline: null, ahead: null, state: null };

test('turn summary counts pending players clockwise across empty seats without changing the game', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { maxPlayers: 6 });
  G.joinTable(t, { id: 'p3', name: 'Dan' }, 5, ctx);
  start(t, ctx);
  const before = structuredClone(t);
  for (const [id, ahead] of [['p3', 0], ['p0', 1], ['p1', 2], ['p2', 3]]) {
    assert.deepEqual(summary(t, id), { actorName: 'Dan', deadline: t.hand.deadline, ahead, state: 'pending' });
  }
  assert.deepEqual(t, before, 'summaries preserve cards, money, log, turn and deadline');
});

test('heads-up summary follows preflop and flop order and preserves the big blind option', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx);
  assert.equal(summary(t, 'p0').ahead, 0);
  assert.equal(summary(t, 'p1').ahead, 1);
  act(t, 'Ann', 'call');
  assert.equal(summary(t, 'p1').ahead, 0, 'the big blind still has an action');
  assert.equal(summary(t, 'p0').state, 'acted');
  assert.equal(summary(t, 'p0').ahead, null, 'do not predict the next betting round');
  act(t, 'Bob', 'check');
  assert.equal(t.hand.street, 'flop');
  assert.equal(summary(t, 'p0').actorName, 'Bob');
  assert.equal(summary(t, 'p0').ahead, 1);
  assert.equal(summary(t, 'p1').ahead, 0);
});

test('skip-preflop summary starts with the actual flop actor', () => {
  for (const names of [['Ann', 'Bob'], ['Ann', 'Bob', 'Cat', 'Dan']]) {
    const { t, ctx } = makeTable(names, { skipPreflop: true });
    start(t, ctx);
    assert.equal(t.hand.street, 'flop');
    assert.equal(summary(t, 'p0').actorName, 'Bob');
    assert.equal(summary(t, 'p0').ahead, names.length - 1);
  }
});

test('a full raise puts players who already matched the bet back in this round queue', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan']);
  start(t, ctx);
  act(t, 'Dan', 'call'); act(t, 'Ann', 'call');
  assert.equal(summary(t, 'p3').state, 'acted');
  assert.equal(summary(t, 'p3').ahead, null);
  act(t, 'Bob', 'raise', 60);
  assert.equal(summary(t, 'p3').state, 'pending');
  assert.equal(summary(t, 'p3').ahead, 1);
  assert.equal(summary(t, 'p0').ahead, 2);
});

test('a short all-in still queues calls even when raising rights do not reopen', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  t.seats[2].stack = 130; t.ledger.p2.buyIn = 130;
  start(t, ctx);
  act(t, 'Ann', 'raise', 100); act(t, 'Bob', 'call'); act(t, 'Cat', 'allin');
  assert.equal(G.legalActions(t, 0).canRaise, false);
  assert.equal(summary(t, 'p0').ahead, 0);
  assert.equal(summary(t, 'p1').ahead, 1);
  assert.equal(summary(t, 'p2').state, 'all-in');
  assert.equal(summary(t, 'p2').ahead, null);
});

test('folded and all-in players are omitted from the pending count', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan', 'Ed', 'Fox']);
  t.seats[4].stack = 40; t.ledger.p4.buyIn = 40;
  start(t, ctx);
  act(t, 'Dan', 'fold'); act(t, 'Ed', 'allin'); act(t, 'Fox', 'call'); act(t, 'Ann', 'raise', 100);
  assert.equal(summary(t, 'p5').ahead, 2, 'only Bob and Cat are before Fox');
  assert.equal(summary(t, 'p3').state, 'folded');
  assert.equal(summary(t, 'p3').ahead, null);
  assert.equal(summary(t, 'p4').state, 'all-in');
  assert.equal(summary(t, 'p4').ahead, null);
});

test('sitting out and leaving override viewer counts and are omitted ahead of other viewers', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan', 'Ed']);
  start(t, ctx);
  G.setSittingOut(t, 'p4', true, ctx);
  G.leaveTable(t, 'p1', ctx);
  G.setSittingOut(t, 'p1', true, ctx);
  assert.equal(summary(t, 'p2').ahead, 2, 'Dan and Ann act; Ed and Bob are automatically skipped');
  assert.equal(summary(t, 'p4').state, 'sitting-out');
  assert.equal(summary(t, 'p4').ahead, null);
  assert.equal(summary(t, 'p1').state, 'leaving', 'leaving takes precedence over sitting out');
  assert.equal(summary(t, 'p1').ahead, null);
});

test('joining next hand and unseated viewers get the current actor without a queue position', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  G.joinTable(t, { id: 'new', name: 'New' }, undefined, ctx);
  assert.deepEqual(summary(t, 'new'), { actorName: 'Ann', deadline: t.hand.deadline, ahead: null, state: 'next-hand' });
  assert.deepEqual(summary(t, 'outsider'), { actorName: 'Ann', deadline: t.hand.deadline, ahead: null, state: 'not-seated' });
});

test('lobby, closed, between-hand, out-of-chips and invalid actor states do not invent a turn', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  assert.deepEqual(summary(t, 'p0'), noTurn);
  start(t, ctx);
  for (const toAct of [null, undefined, -1, t.seats.length, 0.5, '0', 2]) {
    const missingActor = structuredClone(t);
    missingActor.hand.toAct = toAct;
    assert.deepEqual(summary(missingActor, 'p0'), { ...noTurn, state: 'pending' });
  }
  for (const [label, invalidate] of [
    ['folded', (game) => { game.hand.players[0].folded = true; }],
    ['all-in', (game) => { game.hand.players[0].allIn = true; }],
    ['sitting out', (game) => { game.seats[0].sittingOut = true; }],
    ['leaving', (game) => { game.seats[0].leaving = true; }],
    ['already acted and matched', (game) => { game.hand.players[0].acted = true; game.hand.players[0].bet = game.hand.currentBet; }],
    ['not in this hand', (game) => { game.hand.players[0] = null; }],
  ]) {
    const staleActor = structuredClone(t);
    invalidate(staleActor);
    for (const player of ['p0', 'p1']) {
      const { actorName, deadline, ahead } = summary(staleActor, player);
      assert.deepEqual({ actorName, deadline, ahead }, { actorName: null, deadline: null, ahead: null }, label);
    }
  }
  act(t, 'Ann', 'fold');
  assert.equal(t.hand, null);
  assert.deepEqual(summary(t, 'p0'), { ...noTurn, state: 'between-hands' });
  const busted = structuredClone(t); busted.seats[0].stack = 0;
  assert.deepEqual(summary(busted, 'p0'), { ...noTurn, state: 'out-of-chips' });
  G.closeTable(t, t.hostId, ctx);
  assert.deepEqual(summary(t, 'p0'), noTurn);
});

test('another player private auto-check choice never changes the summary', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan'], { skipPreflop: true });
  start(t, ctx);
  const before = summary(t, 'p0');
  G.setAutoCheck(t, 'p2', true, ctx);
  assert.equal(t.hand.players[2].autoCheck, true);
  assert.deepEqual(summary(t, 'p0'), before, 'Cat still counts until the engine performs the private automatic action');
});

test('/my-tables adds private-safe per-viewer turn summaries without changing existing fields or access', async (testCtx) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-turn-summary-'));
  const { app, service, shutdown } = createApp({ dataDir, env: {}, now: () => 1000 });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  testCtx.after(async () => {
    shutdown(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (method, route, player, body) => {
    const res = await fetch(base + route, {
      method, headers: { 'content-type': 'application/json', ...(player ? { authorization: `Bearer ${player.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const players = [];
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan', 'Outsider']) {
    const res = await request('POST', '/players', null, { name });
    assert.equal(res.status, 200); players.push(res.body);
  }
  const created = await request('POST', '/tables', players[0], { name: 'Private game', settings: { maxPlayers: 6, buyIn: 100, smallBlind: 1, bigBlind: 2 } });
  assert.equal(created.status, 200); const code = created.body.code;
  for (const player of players.slice(1, 4)) assert.equal((await request('POST', `/tables/${code}/join`, player, {})).status, 200);
  assert.equal((await request('POST', `/tables/${code}/start`, players[0], {})).status, 200);
  const table = service.getTable(code);
  delete table.visibility;
  const before = structuredClone(table);
  const balances = players.map((p) => service.getPlayer(p.id).bankroll);
  assert.equal((await request('GET', '/my-tables')).status, 401);
  assert.deepEqual((await request('GET', '/my-tables', players[4])).body, []);
  assert.deepEqual((await request('GET', '/public-tables', players[4])).body, [], 'legacy visibility stays private');
  for (const [index, ahead] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
    const res = await request('GET', '/my-tables', players[index]);
    assert.equal(res.status, 200); assert.equal(res.body.length, 1);
    const row = res.body[0];
    assert.deepEqual(row.turn, { actorName: 'Dan', deadline: table.hand.deadline, ahead, state: 'pending' });
    assert.equal(row.myTurn, index === 3);
    assert.equal(row.deadline, index === 3 ? table.hand.deadline : null);
    assert.equal(row.visibility, 'private'); assert.equal(row.seated, true); assert.equal(row.handNumber, 1);
    assert.equal(row.code, code); assert.equal(row.players, 4); assert.equal(row.isHost, index === 0);
    const json = JSON.stringify(row);
    assert.doesNotMatch(json, /"(?:cards|hole|deck|autoCheck|playersAhead)":/);
    for (const p of table.hand.players.filter(Boolean)) for (const card of p.hole) assert.ok(!json.includes(JSON.stringify(card)), 'no unrevealed card values');
  }
  assert.deepEqual(table, before, 'GET summaries do not mutate saved game state');
  assert.deepEqual(players.map((p) => service.getPlayer(p.id).bankroll), balances);
  assert.ok(!Object.hasOwn(JSON.parse(fs.readFileSync(path.join(dataDir, 'tables', `${code}.json`), 'utf8')), 'turn'), 'summary is not persisted');
});
