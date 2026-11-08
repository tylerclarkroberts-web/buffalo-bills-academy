// Over real HTTP with a 2-second clock: a heads-up player who never acts is moved out after 3 missed turns,
// gets their chips back in their bankroll, sees the notice, and can rejoin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(base, token) {
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

test('AFK player is moved out over HTTP and can rejoin', { timeout: 60000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-afk-'));
  const { app, service } = createApp({ dataDir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const anon = client(base);
  const mk = async (name) => { const r = await anon.post('/players', { name }); return { ...r.body, api: client(base, r.body.token) }; };
  const host = await mk('Tyler'); const bob = await mk('Bob');
  const code = (await host.api.post('/tables', { name: 'Afk', settings: { turnSeconds: 2, nextHandDelaySeconds: 0, maxPlayers: 3, buyIn: 500, smallBlind: 5, bigBlind: 10 } })).body.code;
  const bobStart = (await bob.api.get('/me')).body.bankroll;
  assert.equal((await bob.api.post(`/tables/${code}/join`)).status, 200);
  assert.equal((await host.api.post(`/tables/${code}/start`)).status, 200);

  let v;
  for (let n = 0; n < 120; n++) { // the host plays; Bob never acts
    v = (await host.api.get(`/tables/${code}`)).body;
    if (!v.seats.some((s) => s && s.playerId === bob.id)) break;
    if (v.hand?.toActPlayerId === host.id) {
      assert.equal((await host.api.post(`/tables/${code}/action`, { type: v.legal.canCheck ? 'check' : 'call' })).status, 200);
    }
    await sleep(250);
  }
  assert.ok(!v.seats.some((s) => s && s.playerId === bob.id), 'Bob was moved out');
  assert.ok(v.log.some((l) => /Bob was away for 3 turns and left the table/.test(l.text)));
  assert.ok(!v.log.some((l) => /Tyler .*ran out of time/.test(l.text)), 'only Bob missed turns');

  const mine = (await bob.api.get('/my-tables')).body;
  const row = (mine.tables || mine).find((x) => x.code === code);
  assert.ok(row?.afkMoved, '/my-tables carries the notice');
  assert.equal(row.afkMoved.turns, 3);
  const bv = (await bob.api.get(`/tables/${code}`)).body;
  assert.equal(bv.me.afkMoved.turns, 3);
  const bobNow = (await bob.api.get('/me')).body.bankroll;
  assert.equal(bobNow, bobStart - 500 + row.afkMoved.chips, 'remaining chips went back to the bankroll');

  assert.equal((await bob.api.post(`/tables/${code}/join`)).status, 200, 'no ban: rejoin works');
  const after = (await bob.api.get(`/tables/${code}`)).body;
  assert.ok(after.seats.some((s) => s && s.playerId === bob.id));
  assert.ok(!after.me.afkMoved);
});
