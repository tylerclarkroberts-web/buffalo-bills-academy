// End-to-end over real HTTP: 3 players create/join a table, play hands, let turns time out (2-second limit),
// and the server survives a restart with overdue timers handled from the stored deadlines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

function boot(dataDir) {
  const { app, service } = createApp({ dataDir });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, service, base: `http://127.0.0.1:${server.address().port}/api` }));
  });
}
async function stop(s) { if (s.stopped) return; s.stopped = true; s.service.shutdown(); s.server.closeAllConnections?.(); await new Promise((r) => s.server.close(r)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(base, token) {
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    return { status: r.status, body: j };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

test('three players play over HTTP with a 2-second turn limit, timeouts fire, restart recovers', { timeout: 60000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-e2e-'));
  let srv = await boot(dataDir);
  t.after(async () => { await stop(srv); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const anon = client(srv.base);
  assert.equal((await anon.get('/health')).body.ok, true);
  assert.equal((await anon.post('/players', { name: '' })).status, 400);

  const names = ['Tyler', 'Mack', 'Dad'];
  const players = [];
  for (const name of names) {
    const r = await anon.post('/players', { name });
    assert.equal(r.status, 200);
    players.push({ name, ...r.body, api: client(srv.base, r.body.token) });
  }
  const [host, p2, p3] = players;
  const created = await host.api.post('/tables', { name: 'Friday', settings: { turnSeconds: 2, nextHandDelaySeconds: 0, maxPlayers: 3, buyIn: 500, smallBlind: 5, bigBlind: 10 } });
  assert.equal(created.status, 200);
  const code = created.body.code;
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal((await p2.api.post(`/tables/${code}/start`)).status, 403, 'non-seated player cannot start');
  assert.equal((await host.api.post(`/tables/${code}/start`)).status, 400, 'need 2 players');
  assert.equal((await p2.api.post(`/tables/${code.toLowerCase()}/join`)).status, 200, 'codes are case-insensitive');
  assert.equal((await p3.api.post(`/tables/${code}/join`)).status, 200);
  const outsider = client(srv.base, (await anon.post('/players', { name: 'Late' })).body.token);
  assert.match((await outsider.post(`/tables/${code}/join`)).body.error, /full/);
  assert.equal((await anon.get('/tables/NOPE99')).status, 404);

  assert.equal((await host.api.post(`/tables/${code}/start`)).status, 200);

  // Each player sees only their own hole cards.
  for (const p of players) {
    const v = (await p.api.get(`/tables/${code}`)).body;
    const mine = v.seats.find((s) => s && s.playerId === p.id);
    assert.equal(mine.cards.length, 2);
    for (const s of v.seats) if (s && s.playerId !== p.id) assert.equal(s.cards, null);
  }

  // Acting out of turn is rejected.
  {
    const v = (await host.api.get(`/tables/${code}`)).body;
    const other = players.find((x) => x.id !== v.hand.toActPlayerId);
    const bad = await other.api.post(`/tables/${code}/action`, { type: 'check' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /not your turn/);
  }

  // Play by acting via HTTP for a few hands (call/check), then stop acting and let timeouts take over.
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  let actions = 0; const seenHands = new Set();
  const deadlineAt = Date.now() + 15000;
  while (Date.now() < deadlineAt) {
    const v = (await host.api.get(`/tables/${code}`)).body;
    if (v.handNumber > 0) seenHands.add(v.handNumber);
    if (v.handNumber >= 4) break;
    if (v.hand && v.hand.toActPlayerId) {
      const p = byId[v.hand.toActPlayerId];
      const mine = (await p.api.get(`/tables/${code}`)).body;
      if (mine.legal) {
        const type = mine.legal.canCheck ? 'check' : 'call';
        const r = await p.api.post(`/tables/${code}/action`, { type, handNumber: mine.hand.number });
        if (r.status === 200) actions++;
      }
    } else await sleep(50);
  }
  assert.ok(actions >= 8, `played actions: ${actions}`);
  const afterPlay = (await host.api.get(`/tables/${code}`)).body;
  assert.ok(afterPlay.handNumber >= 4, `hands played: ${afterPlay.handNumber}`);
  const total = (v) => v.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0) + (v.hand ? v.hand.pot : 0);
  assert.equal(total(afterPlay), 1500, 'chips conserved over HTTP');

  // Now nobody acts: turns time out after 2 seconds each.
  const handAtIdle = afterPlay.handNumber;
  await sleep(6500);
  const idle = (await host.api.get(`/tables/${code}`)).body;
  assert.ok(idle.log.some((l) => /ran out of time/.test(l.text)), 'timeouts happened');
  assert.ok(idle.log.some((l) => /sitting out/.test(l.text)), 'players who keep timing out are sat out');
  assert.ok(idle.handNumber >= handAtIdle);
  assert.equal(total(idle), 1500);

  // Bring everyone back, get a hand going, then restart the server while a turn is pending.
  for (const p of players) await p.api.post(`/tables/${code}/sitout`, { sitOut: false });
  let v = (await host.api.get(`/tables/${code}`)).body;
  for (let i = 0; i < 40 && !(v.hand && v.hand.toActPlayerId); i++) { await sleep(100); v = (await host.api.get(`/tables/${code}`)).body; }
  assert.ok(v.hand && v.hand.toActPlayerId, 'a hand is running');
  const pendingHand = v.hand.number; const pendingActor = v.hand.toActPlayerId; const logLen = v.log.length;
  await stop(srv);
  await sleep(2600); // the deadline passes while the server is down
  srv = await boot(dataDir);
  await sleep(300);
  const after = (await client(srv.base, host.token).get(`/tables/${code}`)).body;
  const actorName = byId[pendingActor].name;
  assert.ok(after.log.slice(logLen - 1).some((l) => l.text.startsWith(actorName) && /ran out of time/.test(l.text)) || after.hand?.number !== pendingHand,
    'the overdue turn was auto-acted after the restart');
  assert.equal(total(after), 1500);

  // Players list their tables; rebuy validation; host closes the table.
  const mine = (await client(srv.base, p2.token).get('/my-tables')).body;
  assert.equal(mine[0].code, code);
  assert.equal((await client(srv.base, p2.token).post(`/tables/${code}/close`)).status, 403);
  const closed = await client(srv.base, host.token).post(`/tables/${code}/close`);
  assert.equal(closed.body.status, 'closed');
  const sumNet = closed.body.standings.reduce((a, s) => a + s.net, 0);
  assert.equal(sumNet, 0, 'net results add up to zero');
});
