import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Foreman } from '../server/foreman.js';
import { Mines, MAX_SHIFT_MS, poolQuantity, poolTravelMs } from '../server/mines.js';
import { createApp } from '../server/app.js';

const version = { rulesVersion: 2 };
function fixture(t, { payout = 20000, pool = 99999, veinMs = 60000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-buckets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const f = { dir, clock, rolls: 0 };
  f.reload = () => {
    f.store = new Store(dir);
    f.accounts = new Accounts({ store: f.store, now: () => clock.now });
    f.foreman = new Foreman({ store: f.store, accounts: f.accounts, now: () => clock.now, randInt: () => 0 });
    f.mines = new Mines({ store: f.store, accounts: f.accounts, foreman: f.foreman, now: () => clock.now,
      randInt: n => { f.rolls++; return n === 100000 ? payout : 0; },
      scareInt: n => n - 1, poolInt: () => pool, vein: () => ({ veinMs, cells: 7 }) });
    f.player = f.store.players.miner;
  };
  f.reload();
  f.player = f.store.players.miner = { id: 'miner', name: 'Miner' };
  f.accounts.ensure(f.player);
  f.start = extra => f.mines.start(f.player, { ...version, ...extra });
  f.probe = s => f.mines.probe(f.player, s.shiftId, { ...version, poolId: s.currentPoolId });
  f.pulse = (s, action, elapsed = 0) => {
    clock.now += elapsed;
    return f.mines.extract(f.player, s.shiftId, { ...version, poolId: s.currentPoolId, action });
  };
  f.wet = () => {
    let s = f.start();
    while (s.pools.find(p => p.id === s.currentPoolId).quantity === null) {
      clock.now = Math.max(clock.now, s.readyAt); s = f.probe(s);
    }
    return s;
  };
  f.collect = (s, units) => {
    const target = s;
    f.pulse(s, 'start');
    for (let i = 0; i < units / 2.5; i++) s = f.pulse(s, 'continue', 500);
    return f.pulse(target, 'stop');
  };
  return f;
}

test('deposit maturation uses the fixed early/mature weights and bounded travel floors', () => {
  for (const [elapsed, expected] of [[0, [60000, 30000, 8000, 2000]], [50000, [32500, 22500, 24000, 21000]], [100000, [5000, 15000, 40000, 40000]]]) {
    const counts = [0, 0, 0, 0];
    for (let roll = 0; roll < 100000; roll++) counts[[0, 20, 35, 60].indexOf(poolQuantity(elapsed, 100000, roll))]++;
    assert.deepEqual(counts, expected);
  }
  assert.equal(poolQuantity(1e9, 20000, 99999), 60);
  assert.equal(poolTravelMs(0), 0);
  assert.ok(poolTravelMs(26, true) > poolTravelMs(26));
  assert.ok(poolTravelMs(26) < 26 * 2.2 / 3.6 * 1000);
});

test('new clients handshake; probes respect travel and never reveal hidden rolls or reroll pools', t => {
  const f = fixture(t, { pool: 0 });
  assert.throws(() => f.mines.start(f.player), e => e.code === 'mine_reload');
  let s = f.start();
  assert.ok(s.readyAt >= s.startedAt + 20000);
  assert.equal(s.capacity, 100); assert.equal(s.extractionRate, 5);
  assert.doesNotMatch(JSON.stringify(s), /veinMs|outcome|"roll"|"steps"/);
  assert.equal(f.probe(s).pools[0].quantity, null);
  assert.throws(() => f.mines.probe(f.player, s.shiftId, { ...version, poolId: 'p1' }), e => e.status === 409);
  f.clock.now = s.readyAt;
  const original = s;
  s = f.probe(s);
  assert.equal(s.pools[0].quantity, 0); assert.equal(s.currentPoolId, 'p1');
  assert.deepEqual(f.probe(original), s, 'a duplicate old probe does not skip another target');
  assert.equal(f.probe(s).pools[1].quantity, null, 'arrival at the next pool is still required');
  const rolls = f.rolls;
  f.reload();
  assert.deepEqual(f.start(), s); assert.equal(f.rolls, rolls);
});

test('server pulses preserve partial work, reject skipped pools, and never credit idle time', t => {
  const f = fixture(t);
  let s = f.wet();
  assert.throws(() => f.mines.extract(f.player, s.shiftId, { ...version, poolId: 'p1', action: 'start' }), e => e.status === 409);
  assert.throws(() => f.mines.finish(f.player, s.shiftId, version), e => e.status === 409);
  f.pulse(s, 'start');
  s = f.pulse(s, 'continue', 500); assert.equal(s.collected, 2.5);
  s = f.pulse(s, 'continue'); assert.equal(s.collected, 2.5);
  s = f.pulse(s, 'stop', 250); assert.equal(s.collected, 3.75);
  const disarmed = elapsed => assert.throws(() => f.pulse(s, 'continue', elapsed), e => e.status === 409 && /Hold Mine again/.test(e.message));
  disarmed(10000); disarmed(500);
  s = f.pulse(s, 'stop'); assert.equal(s.collected, 3.75, 'an inactive stop is idempotent');
  disarmed(500);
  f.pulse(s, 'start');
  s = f.pulse(s, 'continue', 500); assert.equal(s.collected, 6.25);
  s = f.start();
  disarmed(500); disarmed(500);
  f.pulse(s, 'start');
  f.reload();
  s = f.start();
  disarmed(500); disarmed(500);
  f.pulse(s, 'start');
  disarmed(1001); disarmed(500);
  s = f.pulse(s, 'stop'); assert.equal(s.collected, 6.25, 'expired and restarted holds never credit idle time');
  f.pulse(s, 'start');
  const before = structuredClone(f.mines.doc);
  const save = f.store.saveDoc.bind(f.store);
  f.store.saveDoc = () => { throw new Error('disk full'); };
  assert.throws(() => f.pulse(s, 'continue', 500), /disk full/);
  assert.deepEqual(f.mines.doc, before, 'failed progress writes are not published');
  f.store.saveDoc = save;
  s = f.pulse(s, 'continue'); assert.equal(s.collected, 8.75);
  assert.equal(f.player.bankroll, 1000);
});

test('every dry chain has one finite final deposit and a full bucket automatically pays exactly once', t => {
  const f = fixture(t, { pool: 0 });
  let s = f.wet();
  assert.equal(s.currentPoolId, s.pools.at(-1).id);
  assert.equal(s.pools.at(-1).quantity, 100);
  const lastId = s.currentPoolId, shiftId = s.shiftId;
  f.pulse(s, 'start');
  for (let i = 0; i < 39; i++) s = f.pulse(s, 'continue', 500);
  assert.equal(s.collected, 97.5);
  const end = f.pulse(s, 'continue', 1000);
  assert.equal(end.result.collected, 100); assert.equal(end.result.amount, 80);
  assert.equal(f.player.bankroll, 1080); assert.equal(f.player.mining.shifts, 1);
  assert.deepEqual(f.mines.extract(f.player, shiftId, { ...version, poolId: lastId, action: 'stop' }), end);
  assert.deepEqual(f.mines.quit(f.player, shiftId, version), end);
  assert.deepEqual(f.start(), end, 'reload recovers a lost paid result');
  const next = f.start({ afterShiftId: shiftId });
  assert.notEqual(next.shiftId, shiftId);
  assert.deepEqual(f.mines.quit(f.player, shiftId, version), end, 'an old receipt never closes the new shift');
  assert.equal(f.mines.doc.active.miner.id, next.shiftId);
});

test('a drained target advances once, and a late stop cannot mine or skip the next target', t => {
  const f = fixture(t);
  const first = f.wet();
  let s = f.collect(first, 60);
  assert.equal(s.collected, 60); assert.equal(s.currentPoolId, 'p1');
  assert.equal(s.pools[0].remaining, 0);
  const late = f.mines.extract(f.player, s.shiftId, { ...version, poolId: first.currentPoolId, action: 'stop' });
  assert.deepEqual(late, s);
  assert.equal(f.probe(first).pools[0].remaining, 0, 'a drained pool never refills');
  f.clock.now = s.readyAt; s = f.probe(s);
  f.pulse(s, 'start');
  for (let i = 0; i < 15; i++) s = f.pulse(s, 'continue', 500);
  const result = f.pulse(s, 'continue', 1000).result;
  assert.equal(result.collected, 100); assert.equal(result.amount, 80);
});

for (const [payout, outcome, full] of [[0, 'motherlode', 10000], [50, 'aliens', 10000], [100, 'diamonds', 10000], [150, 'dud', 10], [20000, 'normal', 80]]) {
  test(`partial ${outcome} payout is proportional and its hidden roll survives resume`, t => {
    const f = fixture(t, { payout });
    let s = f.collect(f.wet(), 20);
    const rolls = f.rolls; f.reload(); s = f.start();
    const end = f.mines.quit(f.player, s.shiftId, version);
    assert.equal(end.result.outcome, outcome); assert.equal(end.result.amount, full * 0.2);
    assert.equal(end.result.collected, 20); assert.equal(f.rolls, rolls);
    assert.equal(f.player.bankroll, 1000 + full * 0.2);
    assert.equal(f.player.mining.jackpots, full === 10000 ? 1 : 0);
    assert.equal(end.result.foreman?.reason, outcome === 'dud' ? 'mud' : undefined);
  });
}

test('prepared settlement and atomic player receipt recover after failed payment without rerolling', t => {
  const f = fixture(t);
  const s = f.collect(f.wet(), 20);
  const before = structuredClone(f.player), rolls = f.rolls;
  const commit = f.store.commitPlayerDrafts.bind(f.store);
  f.store.commitPlayerDrafts = () => { throw new Error('ledger failure'); };
  assert.throws(() => f.mines.quit(f.player, s.shiftId, version), /ledger failure/);
  assert.deepEqual(f.player, before);
  assert.ok(f.mines.doc.active.miner.settlement);
  f.store.commitPlayerDrafts = commit;
  f.reload();
  const result = f.start().result;
  assert.equal(result.amount, 16); assert.equal(f.player.bankroll, 1016);
  assert.equal(f.player.mining.shifts, 1); assert.equal(f.rolls, rolls);
  f.reload(); assert.equal(f.start().result.amount, 16); assert.equal(f.player.bankroll, 1016);
});

test('settlement preparation failure leaves a payable active shift and unchanged wallet', t => {
  const f = fixture(t);
  const s = f.collect(f.wet(), 20), before = structuredClone(f.mines.doc);
  const save = f.store.saveDoc.bind(f.store);
  f.store.saveDoc = () => { throw new Error('prepare failure'); };
  assert.throws(() => f.mines.quit(f.player, s.shiftId, version), /prepare failure/);
  assert.deepEqual(f.mines.doc, before); assert.equal(f.player.bankroll, 1000);
  f.store.saveDoc = save;
  assert.equal(f.mines.quit(f.player, s.shiftId, version).result.amount, 16);
});

test('Foreman and cleanup failures recover without a second payment or a second answered lecture', t => {
  const f = fixture(t, { payout: 150 });
  const s = f.collect(f.wet(), 20);
  const save = f.store.saveDoc.bind(f.store);
  f.store.saveDoc = (name, doc) => { if (name === 'foreman') throw new Error('lecture failure'); return save(name, doc); };
  assert.throws(() => f.mines.quit(f.player, s.shiftId, version), /lecture failure/);
  assert.equal(f.player.bankroll, 1002); assert.equal(f.foreman.pending('miner'), null);
  f.store.saveDoc = (name, doc) => { if (name === 'mines' && !doc.active.miner) throw new Error('cleanup failure'); return save(name, doc); };
  assert.throws(() => f.start(), /cleanup failure/);
  const lecture = f.foreman.pending('miner');
  assert.equal(lecture.reason, 'mud');
  f.foreman.answer(f.player, lecture.id, String(lecture.problem.answer));
  assert.equal(f.foreman.pending('miner'), null);
  f.store.saveDoc = save; f.reload();
  assert.equal(f.start().result.amount, 2);
  assert.equal(f.foreman.pending('miner'), null, 'an answered lecture is not issued again');
  assert.equal(f.player.mining.shifts, 1);
  assert.equal(f.player.bankroll, 1007, 'one mud payment and the existing first-answer bonus');
});

test('expiry pays saved partial work; empty expiry keeps the lecture and permits a new shift after answering', t => {
  const f = fixture(t);
  let s = f.collect(f.wet(), 20);
  f.clock.now = s.startedAt + MAX_SHIFT_MS;
  assert.equal(f.start().result.amount, 16);
  s = f.start({ afterShiftId: s.shiftId });
  f.clock.now = s.startedAt + MAX_SHIFT_MS;
  const empty = f.start(); assert.equal(empty.pending.reason, 'quit');
  assert.equal(f.player.mining.shifts, 1);
  const p = f.foreman.pending('miner'); f.foreman.answer(f.player, p.id, String(p.problem.answer));
  assert.ok(f.start().shiftId);
});

test('existing legacy shifts keep their original probe and finish contract; v2 cannot use that path', t => {
  const f = fixture(t);
  const legacy = { id: 'legacy', seed: 123, startedAt: f.clock.now, veinMs: 21000, cells: 7, egg: true };
  f.mines.commit('miner', legacy);
  assert.equal(f.mines.start(f.player).shiftId, legacy.id);
  assert.equal(f.mines.probe(f.player, legacy.id).flowing, false);
  f.clock.now += 21000;
  assert.equal(f.mines.finish(f.player, legacy.id).amount, 80);
  const s = f.start();
  assert.throws(() => f.mines.finish(f.player, s.shiftId), e => e.code === 'mine_reload');
  assert.equal(f.player.bankroll, 1080);
});

test('real HTTP boundary authenticates, rejects stale/skipped requests, and deduplicates concurrent cash-outs', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-buckets-api-'));
  const clock = { now: 1_800_000_000_000 };
  const app = createApp({ dataDir: dir, now: () => clock.now, devLogin: true, env: {},
    vein: () => ({ veinMs: 20000, cells: 7 }), poolInt: () => 99999,
    randInt: n => n === 100000 ? 20000 : 0, scareInt: n => n - 1, eggInt: n => n - 1 });
  const server = await new Promise(resolve => { const s = app.app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { app.shutdown(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const post = async (url, body, authenticated = true) => {
    const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated && cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  assert.equal((await post('/api/mines/extract', version, false)).status, 401);
  const user = await post('/auth/dev', { name: 'Miner', email: 'buckets@example.test' });
  cookie = user.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/mines/start', {})).body.code, 'mine_reload');
  const s = (await post('/api/mines/start', version)).body;
  const body = { ...version, shiftId: s.shiftId, poolId: s.currentPoolId };
  assert.equal((await post('/api/mines/probe', { ...body, shiftId: 'someone-else' })).status, 409);
  assert.equal((await post('/api/mines/probe', { ...body, poolId: 'p1' })).status, 409);
  assert.equal((await post('/api/mines/finish', { shiftId: s.shiftId })).body.code, 'mine_reload');
  clock.now = s.readyAt;
  await post('/api/mines/probe', body);
  assert.equal((await post('/api/mines/extract', { ...body, action: 'fake' })).status, 400);
  await post('/api/mines/extract', { ...body, action: 'start' });
  clock.now += 500;
  const progress = await post('/api/mines/extract', { ...body, action: 'continue', amount: 100, elapsed: 1e9 });
  assert.equal(progress.body.collected, 2.5, 'the server ignores supplied amount and duration');
  const [one, two] = await Promise.all([post('/api/mines/quit', body), post('/api/mines/quit', body)]);
  assert.equal(one.status, 200); assert.deepEqual(one.body, two.body); assert.equal(one.body.result.amount, 2);
  const p = app.service.store.players[user.body.id];
  assert.equal(p.bankroll, 1002); assert.equal(p.mining.shifts, 1);
  assert.equal(p.txns.filter(tx => tx.type === 'mine').length, 1);
});
