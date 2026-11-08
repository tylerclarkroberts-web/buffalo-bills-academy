// v5: the "you're broke, try the Acid Mines" prompt logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { cheapestBuyIn, isBroke, bustedAndBroke } from '../server/broke.js';

test('cheapestBuyIn: open money tables only, capped at $100', () => {
  assert.equal(cheapestBuyIn([]), 100);
  assert.equal(cheapestBuyIn([{ econ: {}, status: 'lobby', settings: { buyIn: 1000 } }]), 100);
  assert.equal(cheapestBuyIn([{ econ: {}, status: 'playing', settings: { buyIn: 50 } }, { econ: {}, status: 'closed', settings: { buyIn: 10 } }, { status: 'playing', settings: { buyIn: 5 } }]), 50);
});

test('isBroke: bankroll plus sellable investments must cover the cheapest buy-in; chips on a table mean not broke', () => {
  assert.equal(isBroke({ bankroll: 1000, minBuyIn: 100 }), false);
  assert.equal(isBroke({ bankroll: 99.99, minBuyIn: 100 }), true);
  assert.equal(isBroke({ bankroll: 100, minBuyIn: 100 }), false, 'exactly enough is enough');
  assert.equal(isBroke({ bankroll: 40, holdings: 60, minBuyIn: 100 }), false, 'can sell investments');
  assert.equal(isBroke({ bankroll: 40, holdings: 59, minBuyIn: 100 }), true);
  assert.equal(isBroke({ bankroll: 0, chipsInPlay: 5, minBuyIn: 100 }), false, 'still playing somewhere');
  assert.equal(isBroke({ bankroll: 0, minBuyIn: 100 }), true);
  assert.equal(isBroke({ bankroll: undefined, holdings: NaN, minBuyIn: 100 }), true, 'bad numbers count as zero');
});

test('bustedAndBroke: only when out of chips here, cannot rebuy, and nothing anywhere else', () => {
  const base = { busted: true, econ: true, bankroll: 10, holdings: 0, buyIn: 200, otherChips: 0 };
  assert.equal(bustedAndBroke(base), true);
  assert.equal(bustedAndBroke({ ...base, busted: false }), false, 'still has chips');
  assert.equal(bustedAndBroke({ ...base, econ: false }), false, 'practice tables are free');
  assert.equal(bustedAndBroke({ ...base, bankroll: 200 }), false, 'can afford a rebuy');
  assert.equal(bustedAndBroke({ ...base, holdings: 190 }), false, 'could sell investments to rebuy');
  assert.equal(bustedAndBroke({ ...base, otherChips: 30 }), false, 'has chips at another table');
});

async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-v5-'));
  const clock = { t: 1_700_000_000_000 };
  const { app, service, shutdown } = createApp({ dataDir, now: () => clock.t, devLogin: true, env: {} });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, service, stop: async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); } };
}
async function login(base, email, name) {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('='));
    if (sc.length) cookie = sc.join('; ');
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = text; }
    return { status: r.status, body: j };
  };
  assert.equal((await call('POST', '/auth/dev', { email, name })).status, 200);
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

test('API: /me reports broke, join is refused with 402, and a busted broke player is flagged at the table', async (t) => {
  const { base, service, stop } = await boot();
  t.after(stop);
  const host = await login(base, 'host@example.com', 'Host');
  const bob = await login(base, 'bob@example.com', 'Bob');
  const { body: code } = await host.post('/api/tables', { name: 'Broke Test', settings: { buyIn: 200, maxPlayers: 4 } });
  assert.equal((await host.post(`/api/tables/${code.code}/join`)).status, 200);

  const bobMe = (await bob.get('/api/me')).body;
  assert.equal(bobMe.broke, false, 'new players start with $1,000');
  const bobP = service.store.players[bobMe.id];

  // Bob joins, then goes bust at the table with only $10 left in his bankroll.
  assert.equal((await bob.post(`/api/tables/${code.code}/join`)).status, 200);
  assert.equal((await bob.get('/api/me')).body.broke, false);
  bobP.bankroll = 10;
  assert.equal((await bob.get('/api/me')).body.broke, false, 'chips on the table: not broke');
  let v = (await bob.get(`/api/tables/${code.code}`)).body;
  assert.equal(v.me.broke, false);
  const tbl = service.getTable(code.code);
  tbl.seats[v.me.seat].stack = 0;
  v = (await bob.get(`/api/tables/${code.code}`)).body;
  assert.equal(v.me.broke, true, 'busted, cannot rebuy, nothing elsewhere');
  assert.equal((await bob.get('/api/me')).body.broke, true);
  assert.equal((await host.get(`/api/tables/${code.code}`)).body.me.broke, false, 'the host is fine');

  // A broke player trying to sit at another table gets a 402, which the app turns into the mines prompt.
  const { body: c2 } = await host.post('/api/tables', { name: 'Second', settings: { buyIn: 100 } });
  const r = await bob.post(`/api/tables/${c2.code}/join`);
  assert.equal(r.status, 402);
  assert.match(r.body.error, /Acid Mines/);
});
