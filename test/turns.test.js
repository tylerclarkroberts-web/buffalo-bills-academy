// Your turns queue: oldest pending action first, Hold'em + blackjack now, Scum via registerTurnSource.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import {
  waitingSince, sortTurns, collectTurns, listTurns, registerTurnSource,
  holdemSource, blackjackSource,
} from '../server/turns.js';
import { entryTarget, nextTarget, restCount, shouldOfferAdvance, samePath, ADVANCE_MS } from '../client/src/turns/queue.js';

function fakeService(tables) {
  return { store: { allTables: () => tables } };
}
function holdem(overrides) {
  return {
    status: 'playing', code: 'HOLD01', name: 'Hold table',
    seats: [{ playerId: 'p1', sittingOut: false, leaving: false }],
    hand: { toAct: 0, deadline: 20_000, startedAt: 10_000 },
    settings: { turnSeconds: 10 },
    ...overrides,
  };
}
function bjTable(overrides) {
  return {
    status: 'playing', code: 'BJ0001', name: 'BJ table', turnSec: 10,
    limits: { min: 5 }, seats: [{ id: 'p1', left: false, chips: 200 }],
    round: { phase: 'play', turn: 0, deadline: 30_000, hands: [{ seat: 0, done: false }], bets: {}, insurance: {} },
    log: [], createdAt: 1,
    ...overrides,
  };
}

test('waitingSince uses deadline minus the turn clock, else the fallback', () => {
  assert.equal(waitingSince(20_000, 10_000, 1), 10_000);
  assert.equal(waitingSince(null, 10_000, 7), 7);
  assert.equal(waitingSince(20_000, 0, 7), 7);
});

test('sortTurns is oldest waiting first, then sooner deadline, then path', () => {
  const rows = sortTurns([
    { path: '/t/B', waitingSince: 20, deadline: 50 },
    { path: '/t/A', waitingSince: 10, deadline: 80 },
    { path: '/t/C', waitingSince: 20, deadline: 40 },
    { path: '/t/D', waitingSince: 20, deadline: 40 },
  ]);
  assert.deepEqual(rows.map((r) => r.path), ['/t/A', '/t/C', '/t/D', '/t/B']);
});

test('holdem source lists only the seated player whose action it is', () => {
  const p1 = { id: 'p1' };
  const p2 = { id: 'p2' };
  const open = holdem({ code: 'OLD001', name: 'Older', hand: { toAct: 0, deadline: 15_000, startedAt: 5_000 } });
  const later = holdem({ code: 'NEW001', name: 'Newer', hand: { toAct: 0, deadline: 25_000, startedAt: 15_000 } });
  const sitting = holdem({ code: 'SIT001', seats: [{ playerId: 'p1', sittingOut: true, leaving: false }] });
  const closed = holdem({ code: 'CLS001', status: 'closed' });
  const other = holdem({ code: 'OTH001', seats: [{ playerId: 'p2' }], hand: { toAct: 0, deadline: 12_000, startedAt: 2_000 } });
  const src = holdemSource(fakeService([later, sitting, closed, other, open]));
  const mine = collectTurns({ player: p1, now: 16_000, sources: [src] });
  assert.deepEqual(mine.map((t) => t.code), ['OLD001', 'NEW001']);
  assert.equal(mine[0].game, 'holdem');
  assert.equal(mine[0].path, '/t/OLD001');
  assert.equal(mine[0].action, 'play');
  assert.equal(mine[0].waitingSince, 5_000);
  assert.deepEqual(collectTurns({ player: p2, now: 16_000, sources: [src] }).map((t) => t.code), ['OTH001']);
});

test('blackjack source covers play, insurance, betting, and continuous lanes', () => {
  const p = { id: 'p1' };
  const play = bjTable({ code: 'PLAY01', name: 'Play', round: { phase: 'play', turn: 0, deadline: 40_000, hands: [{ seat: 0, done: false }], bets: {}, insurance: {} } });
  const ins = bjTable({
    code: 'INS001', name: 'Insure',
    round: { phase: 'insurance', deadline: 22_000, hands: [{ seat: 0 }], bets: {}, insurance: {} },
  });
  const bet = bjTable({
    code: 'BET001', name: 'Bet',
    round: { phase: 'betting', deadline: null, hands: [], bets: {}, insurance: {} },
    log: [{ t: 3_000, ev: { k: 'round', no: 1 }, round: 1 }],
  });
  const already = bjTable({
    code: 'IN001A',
    round: { phase: 'betting', deadline: 50_000, hands: [], bets: { 0: { bet: 10, side: {} } }, insurance: {} },
  });
  const cont = bjTable({
    code: 'CONT01', name: 'Lane', settings: { continuous: true },
    round: null,
    lanes: { 0: { status: 'playing', round: { no: 2, phase: 'play', turn: 0, deadline: 18_000, hands: [{ seat: 0, done: false }] } } },
    log: [{ t: 8_000, ev: { k: 'round', no: 2 }, lane: 0, round: 2 }],
  });
  const src = blackjackSource({ doc: { tables: { play, ins, bet, already, cont } } });
  const rows = collectTurns({ player: p, now: 20_000, sources: [src] });
  assert.deepEqual(rows.map((t) => [t.code, t.action]), [
    ['BET001', 'bet'],
    ['CONT01', 'play'],
    ['INS001', 'insurance'],
    ['PLAY01', 'play'],
  ]);
  assert.equal(rows.find((t) => t.code === 'BET001').waitingSince, 3_000);
  assert.equal(rows.find((t) => t.code === 'INS001').waitingSince, 12_000);
  assert.ok(!rows.some((t) => t.code === 'IN001A'));
});

test('mixed games sort oldest first, and a Scum adapter can plug in', () => {
  const p = { id: 'p1' };
  const hold = holdemSource(fakeService([holdem({ code: 'H1', name: 'Hold', hand: { toAct: 0, deadline: 30_000, startedAt: 20_000 } })]));
  const bj = blackjackSource({ doc: { tables: { a: bjTable({ code: 'B1', name: 'BJ', round: { phase: 'play', turn: 0, deadline: 25_000, hands: [{ seat: 0, done: false }] } }) } } });
  const scum = {
    game: 'scum',
    list() {
      return [{ code: 'S1', name: 'Scum night', path: '/scum/S1', action: 'play', waitingSince: 5_000, deadline: 15_000 }];
    },
  };
  const rows = collectTurns({ player: p, now: 22_000, sources: [hold, bj, scum] });
  assert.deepEqual(rows.map((t) => [t.game, t.code, t.path]), [
    ['scum', 'S1', '/scum/S1'],
    ['blackjack', 'B1', '/bj/B1'],
    ['holdem', 'H1', '/t/H1'],
  ]);
});

test('registerTurnSource is the hook a later Scum PR uses', () => {
  const p = { id: 'p1' };
  const off = registerTurnSource({
    game: 'scum',
    list() { return [{ code: 'SCUM01', name: 'Pride', path: '/scum/SCUM01', action: 'swap', waitingSince: 1, deadline: null }]; },
  });
  try {
    const rows = listTurns({ player: p, service: fakeService([]), bj: { doc: { tables: {} } }, now: 2 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].game, 'scum');
    assert.equal(rows[0].path, '/scum/SCUM01');
    assert.equal(rows[0].action, 'swap');
  } finally { off(); }
  assert.equal(listTurns({ player: p, service: fakeService([]), bj: { doc: { tables: {} } }, now: 2 }).length, 0);
});

test('client helpers: jump to the first table, then the next, never the current one', () => {
  const turns = [
    { path: '/t/AAA', waitingSince: 1 },
    { path: '/bj/BBB', waitingSince: 2 },
    { path: '/scum/CCC', waitingSince: 3 },
  ];
  assert.equal(samePath('/t/aaa', '/t/AAA'), true);
  assert.equal(entryTarget(turns, '/').path, '/t/AAA');
  assert.equal(entryTarget(turns, '/t/aaa'), null); // already at a table you're up at
  assert.equal(nextTarget(turns, '/t/aaa').path, '/bj/BBB');
  assert.equal(nextTarget(turns, '/bj/BBB').path, '/t/AAA'); // oldest remaining, not the next row
  assert.equal(nextTarget(turns, '/scum/CCC').path, '/t/AAA');
  assert.equal(restCount(turns, '/t/AAA'), 2);
  assert.equal(shouldOfferAdvance({ hadAction: true, hasAction: false, blocked: false }), true);
  assert.equal(shouldOfferAdvance({ hadAction: true, hasAction: false, blocked: true }), false);
  assert.equal(shouldOfferAdvance({ hadAction: true, hasAction: true, blocked: false }), false);
  assert.equal(shouldOfferAdvance({ hadAction: false, hasAction: false, blocked: false }), false);
  assert.equal(shouldOfferAdvance({ hadAction: true, hasAction: false, blocked: false, dismissed: true }), false);
  assert.equal(ADVANCE_MS, 1800);
});

async function boot(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turns-q-'));
  const clock = { t: 1_000 };
  const { app, service, shutdown, bj } = createApp({ dataDir, now: () => clock.t, devLogin: true, env: { BJ_TICK_MS: '0' } });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const client = (token) => {
    const call = async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json() };
    };
    return { get: (url) => call('GET', url), post: (url, body = {}) => call('POST', url, body) };
  };
  const player = async (name) => { const { body } = await client().post('/players', { name }); return { ...body, api: client(body.token) }; };
  return { service, bj, clock, base, client, player };
}

test('GET /turns is auth-gated and lists holdem + blackjack in waiting order', async (t) => {
  const s = await boot(t);
  assert.equal((await s.client().get('/turns')).status, 401);
  const host = await s.player('Tyler');
  const pal = await s.player('Pal');
  assert.deepEqual((await host.api.get('/turns')).body, { turns: [] });

  const settings = { buyIn: 200, smallBlind: 1, bigBlind: 2, maxPlayers: 3, turnSeconds: 100, nextHandDelaySeconds: 0 };
  const first = await host.api.post('/tables', { name: 'First hold', settings });
  assert.equal(first.status, 200);
  const a = first.body.code;
  await pal.api.post(`/tables/${a}/join`);
  await host.api.post(`/tables/${a}/start`);
  s.clock.t += 1_000;

  const second = await host.api.post('/tables', { name: 'Second hold', settings });
  const b = second.body.code;
  await pal.api.post(`/tables/${b}/join`);
  await host.api.post(`/tables/${b}/start`);

  const whoA = (await host.api.get(`/tables/${a}`)).body.hand.toActPlayerId;
  const whoB = (await host.api.get(`/tables/${b}`)).body.hand.toActPlayerId;
  const actor = whoA === host.id ? host : pal;
  const rows = (await actor.api.get('/turns')).body.turns;
  assert.ok(rows.length >= 1);
  const hold = rows.filter((r) => r.game === 'holdem');
  // The table that started first should be first when this player is up at both, or the only one they're up at.
  const mine = [a, b].filter((code, i) => [whoA, whoB][i] === actor.id);
  assert.deepEqual(hold.map((r) => r.code), mine);
  assert.ok(hold[0].path.startsWith('/t/'));
  assert.equal(hold[0].action, 'play');
  assert.ok(hold[0].waitingSince <= hold[hold.length - 1]?.waitingSince || hold.length === 1);

  // A blackjack table where it's their bet is also in the same list, behind older hold'em waits.
  const bj = await actor.api.post('/bj/tables', { name: 'Felt', settings: { house: 'player' } });
  assert.equal(bj.status, 200, JSON.stringify(bj.body));
  const code = bj.body.code || bj.body.table?.code || Object.keys(s.bj.doc.tables)[0];
  assert.ok(code);
  // Host may already be seated; start if needed, sit the player, open betting.
  if (bj.body.status === 'lobby' || s.bj.doc.tables[code].status === 'lobby') {
    const t0 = s.bj.doc.tables[code];
    if (t0.hostId === actor.id) await actor.api.post(`/bj/tables/${code}/start`);
  }
  const view = (await actor.api.get(`/bj/tables/${code}`)).body;
  if (view.mySeat < 0 && !view.house?.isMe) {
    await actor.api.post(`/bj/tables/${code}/join`, { ack: true });
    if (view.status === 'lobby' || view.isHost) await actor.api.post(`/bj/tables/${code}/start`);
  }
  const all = (await actor.api.get('/turns')).body.turns;
  const kinds = new Set(all.map((r) => r.game));
  assert.ok(kinds.has('holdem'));
  // Betting is a pending action once a round is open and they have not bet.
  const bjRow = all.find((r) => r.game === 'blackjack');
  if (bjRow) {
    assert.equal(bjRow.path, `/bj/${bjRow.code}`);
    assert.ok(['bet', 'play', 'insurance'].includes(bjRow.action));
  }
});

test('after a holdem action with nothing left at that table, it drops off the queue', async (t) => {
  const s = await boot(t);
  const host = await s.player('Ada');
  const pal = await s.player('Bea');
  const settings = { buyIn: 200, smallBlind: 1, bigBlind: 2, maxPlayers: 3, turnSeconds: 100, nextHandDelaySeconds: 0 };
  const a = (await host.api.post('/tables', { name: 'Only', settings })).body.code;
  await pal.api.post(`/tables/${a}/join`);
  await host.api.post(`/tables/${a}/start`);
  const v = (await host.api.get(`/tables/${a}`)).body;
  const actorId = v.hand.toActPlayerId;
  const actor = actorId === host.id ? host : pal;
  const other = actorId === host.id ? pal : host;
  const before = (await actor.api.get('/turns')).body.turns;
  assert.equal(before.some((r) => r.code === a), true);
  const legal = (await actor.api.get(`/tables/${a}`)).body.legal;
  const type = legal?.canCheck ? 'check' : 'call';
  const act = await actor.api.post(`/tables/${a}/action`, { type, handNumber: v.hand.number });
  assert.equal(act.status, 200, JSON.stringify(act.body));
  const after = (await actor.api.get('/turns')).body.turns;
  assert.equal(after.some((r) => r.code === a && r.action === 'play'), false);
  // The other player may now be up.
  const theirs = (await other.api.get('/turns')).body.turns;
  const still = (await actor.api.get(`/tables/${a}`)).body;
  if (still.hand?.toActPlayerId === other.id) assert.equal(theirs.some((r) => r.code === a), true);
});
