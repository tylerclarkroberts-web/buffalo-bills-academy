import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';

async function boot(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-public-'));
  const { app, service, shutdown } = createApp({ dataDir, env: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve));
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
  const anon = client();
  const player = async (name) => { const { body } = await anon.post('/players', { name }); return { ...body, api: client(body.token) }; };
  return { dataDir, service, anon, player };
}
const settings = { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 3 };
async function table(host, name, extra = {}) {
  const res = await host.api.post('/tables', { name, settings, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.code;
}

test('visibility defaults private, rejects invalid choices, and persists without publishing legacy tables', async (t) => {
  const s = await boot(t); const host = await s.player('Host'); const viewer = await s.player('Viewer');
  const hidden = await table(host, 'Invite only');
  const listed = await table(host, 'Open room', { visibility: 'public' });
  const legacy = await table(host, 'Older room');
  delete s.service.getTable(legacy).visibility;
  s.service.store.saveTable(s.service.getTable(legacy));
  const before = s.service.store.allTables().length;
  const bank = (await host.api.get('/me')).body.bankroll;
  for (const visibility of [null, '', 'PUBLIC', true, {}, ['public']]) {
    assert.equal((await host.api.post('/tables', { settings, visibility })).status, 400);
  }
  assert.equal((await host.api.post('/tables', { settings, visibility: 'public', bots: { count: 1 } })).status, 400);
  assert.equal(s.service.store.allTables().length, before, 'invalid creation writes no tables');
  assert.equal((await host.api.get('/me')).body.bankroll, bank, 'invalid creation charges no buy-in');
  const disk = new Store(s.dataDir);
  assert.equal(disk.getTable(hidden).visibility, 'private');
  assert.equal(disk.getTable(listed).visibility, 'public');
  assert.equal(disk.getTable(legacy).visibility, undefined);
  assert.equal((await s.anon.get(`/tables/${legacy}`)).body.visibility, 'private');
  assert.deepEqual((await viewer.api.get('/public-tables')).body.map((x) => x.code), [listed]);
  assert.equal((await host.api.get('/my-tables')).body.find((x) => x.code === hidden).visibility, 'private');
  assert.equal((await host.api.get(`/tables/${listed}`)).body.visibility, 'public');
  assert.equal((await viewer.api.post(`/tables/${hidden}/join`)).status, 200, 'private tables still accept invite-link joins');
});

test('public directory is an authenticated safe summary of joinable human tables', async (t) => {
  const s = await boot(t); const host = await s.player('Tyler'); const pal = await s.player('Pal'); const viewer = await s.player('Viewer');
  const open = await table(host, 'Friday Night', { visibility: 'public', settings: { ...settings, maxPlayers: 2 } });
  const playing = await table(host, 'In progress', { visibility: 'public' });
  await pal.api.post(`/tables/${playing}/join`); await host.api.post(`/tables/${playing}/start`);
  await table(host, 'Hidden room');
  const full = await table(host, 'Full room', { visibility: 'public', settings: { ...settings, maxPlayers: 2 } });
  await pal.api.post(`/tables/${full}/join`);
  const closed = await table(host, 'Closed room', { visibility: 'public' });
  await host.api.post(`/tables/${closed}/close`);
  const bot = await table(host, 'Practice', { bots: { count: 1 } });
  assert.equal(s.service.getTable(bot).visibility, 'private');
  s.service.getTable(bot).visibility = 'public'; // Even an old/malformed bot record cannot enter discovery.
  const departed = await s.player('Departed');
  const abandoned = await table(departed, 'Abandoned lobby', { visibility: 'public' });
  assert.equal((await departed.api.post(`/tables/${abandoned}/leave`)).status, 200);
  s.service.forgetPlayer(departed.id);
  assert.equal((await s.anon.get('/public-tables')).status, 401);
  const rows = (await viewer.api.get('/public-tables')).body;
  assert.ok(!rows.some((x) => x.code === abandoned), 'a lobby with a deleted host cannot be started');
  assert.deepEqual(rows.map((x) => x.code).sort(), [open, playing].sort());
  const row = rows.find((x) => x.code === open);
  assert.deepEqual(Object.keys(row).sort(), ['code', 'name', 'hostName', 'players', 'maxPlayers', 'buyIn', 'smallBlind', 'bigBlind', 'turnSeconds', 'status', 'createdAt'].sort());
  assert.equal(row.hostName, 'Tyler'); assert.equal(row.players, 1); assert.equal(row.maxPlayers, 2); assert.equal(row.buyIn, 100);
  assert.equal(rows.find((x) => x.code === playing).status, 'playing');
  assert.deepEqual((await host.api.get('/public-tables')).body, [], 'already seated tables stay under Your tables');
  const joined = await viewer.api.post(`/tables/${playing}/join`);
  assert.equal(joined.status, 200);
  assert.equal(joined.body.seats.find((x) => x?.playerId === viewer.id).waiting, true, 'joiners wait for the next hand');
  assert.deepEqual((await viewer.api.get('/public-tables')).body.map((x) => x.code), [open]);
  assert.equal((await viewer.api.post(`/tables/${open}/join`)).status, 200);
  const raced = await pal.api.post(`/tables/${open}/join`);
  assert.equal(raced.status, 400); assert.match(raced.body.error, /full/i, 'capacity is checked again at join');
});

test('other profiles hide private names and links but retain lifetime totals and game counts', async (t) => {
  const s = await boot(t); const host = await s.player('Host'); const pal = await s.player('Pal');
  const hidden = await table(host, 'Secret Saturday', { settings: { ...settings, maxPlayers: 2 } });
  const listed = await table(host, 'Public Friday', { visibility: 'public' });
  const legacy = await table(host, 'Legacy secret');
  delete s.service.getTable(legacy).visibility;
  await pal.api.post(`/tables/${hidden}/join`); await host.api.post(`/tables/${hidden}/start`);
  const tb = s.service.getTable(hidden);
  const actor = tb.seats[tb.hand.toAct].playerId === host.id ? host : pal;
  assert.equal((await actor.api.post(`/tables/${hidden}/action`, { type: 'fold', handNumber: tb.hand.number })).status, 200);
  const self = (await host.api.get('/profile')).body;
  assert.equal(self.poker.games.length, 3); assert.equal(self.poker.gamesPlayed, 3);
  assert.notEqual(self.poker.lifetimeNet, 0, 'a private game contributes to lifetime net');
  assert.equal((await host.api.get(`/players/${host.id}/profile`)).body.poker.games.length, 3);
  for (const reader of [s.anon, pal.api]) {
    const profile = (await reader.get(`/players/${host.id}/profile`)).body;
    assert.deepEqual(profile.poker.games.map((x) => x.code), [listed]);
    assert.equal(profile.poker.gamesPlayed, 3);
    assert.equal(profile.poker.lifetimeNet, self.poker.lifetimeNet);
    const serialized = JSON.stringify(profile);
    for (const privateValue of [hidden, legacy, 'Secret Saturday', 'Legacy secret']) assert.ok(!serialized.includes(privateValue), privateValue);
  }
});
