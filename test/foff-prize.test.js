// Foff's Bachelor Party: winning it all pays $2,000 and a medal for the room, once, and the medal is not for sale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { FILM_MIN_MS, REWARDS } from '../server/foff.js';
import { QUESTS } from '../client/src/foff/quests.js';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-'));
  const clock = { t: 1_700_000_000_000 };
  const { app, shutdown } = createApp({ dataDir: dir, devLogin: true, env: {}, now: () => clock.t });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const watch = async (c) => {
    assert.equal((await call(c, 'POST', '/api/foff/watching')).status, 200);
    clock.t += FILM_MIN_MS;
    assert.equal((await call(c, 'POST', '/api/foff/watched')).status, 200);
  };
  return { call, login, watch, stop: () => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('side quests pay once each, four leave a keepsake, and the server knows every quest the game has', async () => {
  assert.deepEqual(Object.keys(REWARDS).sort(), QUESTS.map((q) => q.id).sort());
  assert.ok(Object.values(REWARDS).every((r) => r.cash > 0 && r.cash <= 60), 'pocket money');
  const s = await boot();
  try {
    assert.equal((await s.call(null, 'POST', '/api/foff/quest', { id: 'van' })).status, 401);
    const ck = await s.login('Keetch'), start = (await s.call(ck, 'GET', '/api/shop')).body.bankroll;
    assert.equal((await s.call(ck, 'POST', '/api/foff/quest', { id: 'van' })).status, 403);
    await s.watch(ck);
    assert.equal((await s.call(ck, 'POST', '/api/foff/quest', { id: 'the-moon' })).status, 404);
    const van = await s.call(ck, 'POST', '/api/foff/quest', { id: 'van' });
    assert.deepEqual([van.status, van.body.cash, van.body.item, van.body.bankroll], [200, 30, undefined, start + 30]);
    assert.equal((await s.call(ck, 'POST', '/api/foff/quest', { id: 'van' })).body.already, true);
    const banya = await s.call(ck, 'POST', '/api/foff/quest', { id: 'banya' });
    assert.deepEqual([banya.body.cash, banya.body.item, banya.body.bankroll], [40, 'A Single Wet Flip-Flop', start + 70]);
    const room = (await s.call(ck, 'GET', '/api/room')).body, shop = (await s.call(ck, 'GET', '/api/shop')).body;
    assert.ok(room.owned.includes('odd-flipflop') && !room.owned.includes('odd-drone'));
    assert.ok(shop.items.some((x) => x.id === 'odd-flipflop') && !shop.items.some((x) => x.id === 'odd-drone'), 'keepsakes stay off the shelf until earned');
    assert.equal(shop.bankroll, start + 70);
  } finally { s.stop(); }
});

test('the medal: $2,000 and a wall display once per account, hidden from the store until earned, never for sale', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call(null, 'POST', '/api/foff/claim')).status, 401);
    const ck = await s.login('Keetch'), before = (await s.call(ck, 'GET', '/api/shop')).body;
    assert.ok(!before.items.some((x) => x.id === 'odd-medal'), 'not on the shelf');
    assert.equal((await s.call(ck, 'POST', '/api/shop/buy', { id: 'odd-medal' })).status, 409);
    assert.equal((await s.call(ck, 'POST', '/api/foff/claim')).status, 403);
    await s.watch(ck);
    const won = await s.call(ck, 'POST', '/api/foff/claim');
    assert.equal(won.status, 200); assert.equal(won.body.prize, 2000); assert.equal(won.body.bankroll, before.bankroll + 2000);
    const again = await s.call(ck, 'POST', '/api/foff/claim');
    assert.equal(again.body.already, true); assert.equal(again.body.bankroll, before.bankroll + 2000);
    const after = (await s.call(ck, 'GET', '/api/shop')).body;
    assert.equal(after.own['odd-medal'], 1); assert.ok(after.items.some((x) => x.id === 'odd-medal'));
    const room = (await s.call(ck, 'GET', '/api/room')).body;
    assert.ok(room.owned.includes('odd-medal'), 'ready to hang');
  } finally { s.stop(); }
});
