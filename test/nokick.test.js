// v21: kicking players was removed. Nobody (host included) can remove another player; leaving is voluntary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

test('API: no kick endpoint; the target stays seated; leave still cashes out; an old saved ban list is ignored', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-nokick-'));
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name) => { const r = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name}@example.com` }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const call = (c, m, p, b) => fetch(base + '/api' + p, { method: m, headers: { cookie: c, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, text: await r.text() }));
  const a = await login('Ann'), b = await login('Bob');
  const created = JSON.parse((await call(a, 'POST', '/tables', { name: 'No kick', settings: { buyIn: 100, nextHandDelaySeconds: 3600 } })).text);
  const code = created.code || created.table?.code;
  assert.equal((await call(b, 'POST', `/tables/${code}/join`, {})).status, 200);
  const tb = service.getTable(code);
  const bobId = tb.seats.find((s) => s && s.playerId !== tb.hostId).playerId;
  const k = await call(a, 'POST', `/tables/${code}/kick`, { playerId: bobId });
  assert.ok(k.status === 404, `kick should be gone, got ${k.status}`);
  assert.ok(service.getTable(code).seats.some((s) => s?.playerId === bobId), 'Bob is still seated');
  const view = JSON.parse((await call(b, 'GET', `/tables/${code}`)).text);
  assert.equal('banned' in view.me, false);
  // Leaving is still the player's own call and cashes out their chips.
  assert.equal((await call(b, 'POST', `/tables/${code}/leave`, {})).status, 200);
  const after = service.getTable(code);
  assert.equal(after.ledger[bobId].cashOut, 100);
  // A table saved before v21 may still carry a ban list: it no longer locks anyone out.
  after.banned = [bobId];
  assert.equal((await call(b, 'POST', `/tables/${code}/join`, {})).status, 200);
});
