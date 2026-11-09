import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../server/engine/game.js';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeTable } from './helpers.js';

const endHand = (t, ctx) => {
  while (t.hand) G.act(t, t.seats[t.hand.toAct].playerId, { type: 'fold' }, ctx);
};

test('host speed options leave the current hand and player choices intact, then apply next hand', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.startGame(t, t.hostId, ctx);
  G.setAutoCheck(t, 'p2', true, ctx);
  const hand = structuredClone(t.hand); const seats = structuredClone(t.seats); const chips = G.chipsOnTable(t);
  assert.equal(G.updateSettings(t, t.hostId, { autoCheck: true, skipPreflop: true }, ctx), true);
  assert.deepEqual(t.hand, hand, 'cards, bets, turn, deadline, and per-hand auto-check stay untouched');
  assert.deepEqual(t.seats, seats); assert.equal(G.chipsOnTable(t), chips);
  assert.match(t.log.at(-1).text, /auto-check when free on; skip first betting round on.*applies next hand/);
  const logLength = t.log.length;
  assert.equal(G.updateSettings(t, t.hostId, { autoCheck: true, skipPreflop: true }, ctx), false);
  assert.equal(t.log.length, logLength, 'saving unchanged options does not duplicate the announcement');
  endHand(t, ctx);
  G.setAutoCheck(t, 'p0', false, ctx);
  ctx.now += 1000; G.tick(t, ctx);
  assert.equal(t.hand.number, 2); assert.equal(t.hand.street, 'flop'); assert.equal(t.hand.skipped, true);
  assert.equal(t.hand.players[0].autoCheck, false, 'an explicit next-hand player override wins over the new default');
  assert.equal(t.hand.players[1].autoCheck, true); assert.equal(t.hand.players[2].autoCheck, true);
  assert.equal(t.seats[0].nextAutoCheck, undefined, 'the one-hand override is consumed normally');
  G.setAutoCheck(t, 'p0', true, ctx);
  assert.equal(t.hand, null, 'the existing personal control still checks immediately when free');
  assert.equal(G.chipsOnTable(t), chips);
});

test('disabling skip-preflop does not alter the current skipped hand or its blinds', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { skipPreflop: true });
  G.startGame(t, t.hostId, ctx);
  const hand = structuredClone(t.hand);
  G.updateSettings(t, t.hostId, { skipPreflop: false }, ctx);
  assert.deepEqual(t.hand, hand);
  endHand(t, ctx); ctx.now += 1000; G.tick(t, ctx);
  assert.equal(t.hand.street, 'preflop'); assert.equal(t.hand.skipped, undefined);
  assert.equal(t.settings.skipPreflop, false);
});

test('a host default change leaves bot decisions independent', () => {
  const { t, ctx } = makeTable(['Ann', 'Bot']);
  t.seats[1].bot = true;
  G.updateSettings(t, t.hostId, { autoCheck: true }, ctx);
  G.startGame(t, t.hostId, ctx);
  assert.equal(t.hand.players[0].autoCheck, true);
  assert.equal(t.hand.players[1].autoCheck, false);
});

async function boot(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-host-options-'));
  const clock = { t: 1000 };
  const { app, service, shutdown } = createApp({ dataDir, env: {}, now: () => clock.t });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const client = (token) => {
    const call = async (method, route, body) => {
      const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { error: text }; }
      return { status: res.status, body: json };
    };
    return { get: (route) => call('GET', route), post: (route, body = {}) => call('POST', route, body) };
  };
  const anon = client();
  const player = async (name) => { const res = await anon.post('/players', { name }); assert.equal(res.status, 200); return { ...res.body, api: client(res.body.token) }; };
  return { dataDir, service, anon, player };
}

test('settings HTTP route is host-only, strictly validates patches, and persists/notifies without moving chips', async (t) => {
  const s = await boot(t); const host = await s.player('Host'); const pal = await s.player('Pal'); const outsider = await s.player('Outsider');
  const created = await host.api.post('/tables', { settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 3, turnSeconds: 60, nextHandDelaySeconds: 0 } });
  assert.equal(created.status, 200); const code = created.body.code;
  assert.equal((await pal.api.post(`/tables/${code}/join`)).status, 200);
  assert.equal((await host.api.post(`/tables/${code}/start`)).status, 200);
  const before = structuredClone(s.service.getTable(code));
  const balances = Object.fromEntries(Object.values(s.service.store.players).map((p) => [p.id, p.bankroll]));
  let notified = 0; const unsubscribe = s.service.subscribe(code, () => notified++); t.after(unsubscribe);
  assert.equal((await s.anon.post(`/tables/${code}/settings`, { autoCheck: true })).status, 401);
  for (const other of [pal, outsider]) assert.equal((await other.api.post(`/tables/${code}/settings`, { autoCheck: true })).status, 403);
  for (const patch of [{}, null, [], ['autoCheck'], true, 1, 'on', { autoCheck: 'true' }, { skipPreflop: 1 }, { autoCheck: true, bigBlind: 50 }, { buyIn: 1000 }, { maxPlayers: 9 }, { turnSeconds: 2 }, { maxRebuys: 0 }, { visibility: 'public' }]) {
    assert.equal((await host.api.post(`/tables/${code}/settings`, patch)).status, 400, JSON.stringify(patch));
    assert.deepEqual(s.service.getTable(code), before, 'a rejected patch changes no table state');
  }
  assert.equal(notified, 0);
  const changed = await host.api.post(`/tables/${code.toLowerCase()}/settings`, { autoCheck: true, skipPreflop: true });
  assert.equal(changed.status, 200); assert.equal(changed.body.settings.autoCheck, true); assert.equal(changed.body.settings.skipPreflop, true);
  const after = s.service.getTable(code);
  assert.deepEqual(after.hand, before.hand); assert.deepEqual(after.seats, before.seats); assert.deepEqual(after.ledger, before.ledger);
  assert.equal(after.settings.turnSeconds, 60); assert.equal(after.settings.buyIn, 100); assert.equal(after.settings.bigBlind, 2); assert.equal(after.settings.maxPlayers, 3);
  assert.deepEqual(Object.fromEntries(Object.values(s.service.store.players).map((p) => [p.id, p.bankroll])), balances);
  assert.equal(notified, 1, 'existing table subscribers receive the update');
  const disk = new Store(s.dataDir).getTable(code);
  assert.equal(disk.settings.autoCheck, true); assert.equal(disk.settings.skipPreflop, true); assert.deepEqual(disk.hand, before.hand);
  const announcements = after.log.filter((e) => /host changed table options/.test(e.text));
  assert.equal(announcements.length, 1);
  assert.equal((await host.api.post(`/tables/${code}/settings`, { autoCheck: true })).status, 200);
  assert.equal(s.service.getTable(code).log.filter((e) => /host changed table options/.test(e.text)).length, 1);
  assert.equal((await host.api.post(`/tables/${code}/close`)).status, 200);
  const closed = structuredClone(s.service.getTable(code));
  assert.equal((await host.api.post(`/tables/${code}/settings`, { autoCheck: false })).status, 400);
  assert.deepEqual(s.service.getTable(code), closed, 'closed games remain unchanged');
});
