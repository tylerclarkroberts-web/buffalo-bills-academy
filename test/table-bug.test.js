import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createApp } from '../server/app.js';
import { tableBugOf, attachSeatBugs } from '../server/tableBug.js';
import {
  showTableBug, canStartMassage, nextMassageDelay, initialMassageDelay,
  MASSAGE_MIN_MS, MASSAGE_MAX_MS,
} from '../client/src/table/tableBug.js';

function hatch(barn, playerId, { species, name } = {}) {
  barn.layEgg(playerId);
  barn.doc.pens[playerId].hatchAt = barn.now() - 1;
  if (species) barn.doc.pens[playerId].species = species;
  const view = barn.view(playerId);
  if (name) { barn.doc.pens[playerId].name = name; barn.save(); }
  return barn.view(playerId).pen || view.pen;
}

async function boot(t) {
  const prefix = path.join(os.tmpdir(), 'bba-table-bug-');
  const dataDir = fs.mkdtempSync(prefix);
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: { BJ_TICK_MS: '0' } });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = (token) => {
    const call = async (method, url, body) => {
      const r = await fetch(base + '/api' + url, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: await r.json() };
    };
    return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b ?? {}) };
  };
  const player = async (name) => {
    const r = await client().post('/players', { name });
    assert.equal(r.status, 200);
    return { name, id: r.body.id, token: r.body.token, api: client(r.body.token) };
  };
  return { service, player };
}

test('tableBugOf is empty without a living hatched bug', () => {
  assert.equal(tableBugOf(null, 'p1'), null);
  assert.equal(tableBugOf({ view: () => ({}) }, 'p1'), null);
  assert.equal(tableBugOf({ view: () => ({ pen: { stage: 'egg' } }) }, 'p1'), null);
  assert.equal(tableBugOf({ view: () => ({ pen: { stage: 'dead', species: 'ceroplophana' } }) }, 'p1'), null);
  assert.equal(tableBugOf({ view: () => { throw new Error('corrupt'); } }, 'p1'), null);
});

test('tableBugOf returns the public look of a living hatched bug', () => {
  const barn = {
    view: (id) => id === 'p1' ? {
      pen: { stage: 'creature', species: 'ceroplophana', speciesName: 'Modigliani\'s Horned Chafer', name: 'Gus', level: 4, style: { bughat: { id: 'bughat-tophat', shape: 'tophat' } } },
    } : { pen: null },
  };
  assert.deepEqual(tableBugOf(barn, 'p1'), {
    species: 'ceroplophana',
    speciesName: 'Modigliani\'s Horned Chafer',
    name: 'Gus',
    level: 4,
    style: { bughat: { id: 'bughat-tophat', shape: 'tophat' } },
  });
  assert.equal(tableBugOf(barn, 'p2'), null);
});

test('showTableBug and massage timing helpers', () => {
  assert.equal(showTableBug(null), false);
  assert.equal(showTableBug({}), false);
  assert.equal(showTableBug({ species: 'ceroplophana' }), true);
  assert.equal(canStartMassage({}), true);
  assert.equal(canStartMassage({ reduced: true }), false);
  assert.equal(canStartMassage({ myAction: true }), false);
  assert.equal(canStartMassage({ busy: true }), false);
  assert.equal(canStartMassage({ reduced: true, myAction: true, busy: true }), false);
  for (const u of [0, 0.5, 1]) {
    const ms = nextMassageDelay(() => u);
    assert.ok(ms >= MASSAGE_MIN_MS && ms <= MASSAGE_MAX_MS, ms);
  }
  const a = initialMassageDelay('alice');
  const b = initialMassageDelay('bob');
  assert.ok(a >= MASSAGE_MIN_MS && a <= MASSAGE_MAX_MS);
  assert.ok(b >= MASSAGE_MIN_MS && b <= MASSAGE_MAX_MS);
  assert.notEqual(a, b, 'neighbouring seats should not share a first delay');
});

test('attachSeatBugs hangs a bug only on humans who hatched one, and skips bots', () => {
  const barn = {
    view: (id) => id === 'p1' ? { pen: { stage: 'creature', species: 'phrictus', speciesName: 'Dragon-headed Bug', name: 'Dot', level: 2 } } : { pen: null },
  };
  const seats = [
    { playerId: 'p1', name: 'Ann' },
    { playerId: 'p2', name: 'Bea' },
    { playerId: 'bot-1', name: 'Bot', bot: true },
    null,
  ];
  attachSeatBugs(seats, barn);
  assert.equal(seats[0].bug.species, 'phrictus');
  assert.equal(seats[0].bug.name, 'Dot');
  assert.equal(seats[1].bug, undefined);
  assert.equal(seats[2].bug, undefined);
  assert.equal(seats[3], null);
});

test('Hold\'em table views show every seated player\'s hatched bug and omit everyone else', async (t) => {
  const { service, player } = await boot(t);
  const host = await player('Tyler');
  const pal = await player('Mack');
  const pen = hatch(service.barn, host.id, { species: 'ceroplophana', name: 'Gus' });
  assert.equal(pen.stage, 'creature');
  const created = await host.api.post('/tables', { name: 'Porch', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 4 } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const code = created.body.code;
  assert.equal((await pal.api.post(`/tables/${code}/join`)).status, 200);
  const hostView = (await host.api.get(`/tables/${code}`)).body;
  const palView = (await pal.api.get(`/tables/${code}`)).body;
  const hostSeat = hostView.seats.find((s) => s?.playerId === host.id);
  const palSeat = palView.seats.find((s) => s?.playerId === pal.id);
  const hostAsSeenByPal = palView.seats.find((s) => s?.playerId === host.id);
  assert.ok(hostSeat.bug, 'the hatched player sees their own bug');
  assert.equal(hostSeat.bug.species, 'ceroplophana');
  assert.equal(hostSeat.bug.name, 'Gus');
  assert.ok(hostAsSeenByPal.bug, 'the other player can see that bug too');
  assert.equal(hostAsSeenByPal.bug.species, hostSeat.bug.species);
  assert.equal(palSeat.bug, undefined, 'no bug until the egg hatches');
  assert.ok(hostView.seats.every((s) => !s || s.playerId === host.id || !s.bug));
});

test('Blackjack views include hatched bugs on seats the same way', async (t) => {
  const { service, player } = await boot(t);
  const host = await player('Ann');
  const pal = await player('Bea');
  hatch(service.barn, pal.id, { species: 'phrictus', name: 'Dot' });
  const created = await host.api.post('/bj/tables', { name: 'Porch 21', settings: { buyIn: 200, bots: 0, minBet: 5 } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const code = created.body.code;
  const joined = await pal.api.post(`/bj/tables/${code}/join`, { ack: true });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const view = (await host.api.get(`/bj/tables/${code}`)).body;
  const hostSeat = view.seats.find((s) => s && s.me);
  const palSeat = view.seats.find((s) => s && !s.me && !s.bot);
  assert.equal(hostSeat.bug, undefined);
  assert.ok(palSeat.bug, 'host can see the pal\'s hatched bug');
  assert.equal(palSeat.bug.species, 'phrictus');
  assert.equal(palSeat.bug.name, 'Dot');
});
