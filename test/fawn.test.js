// v51 daily faun: once-a-day claim, odds roughly match the brief, no double-dip, cig goes to inventory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Shop } from '../server/shop.js';

async function boot(now) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fawn-'));
  const clock = { t: now };
  const { app, service, shutdown } = createApp({ dataDir: dir, devLogin: true, now: () => clock.t, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const stop = () => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { clock, call, login, stop, service };
}

test('status: available once, claimed after; second claim same day is a no-op', async () => {
  const s = await boot(Date.UTC(2026, 10, 6, 12));
  try {
    const ck = await s.login('Ann');
    const a = await s.call(ck, 'GET', '/api/fawn');
    assert.equal(a.status, 200); assert.equal(a.body.available, true);
    const c = await s.call(ck, 'POST', '/api/fawn/claim');
    assert.equal(c.status, 200); assert.ok(c.body.gift); assert.ok(['cash', 'cig', 'moon'].includes(c.body.gift.kind));
    const again = await s.call(ck, 'POST', '/api/fawn/claim');
    assert.equal(again.body.already, true);
    assert.deepEqual(again.body.gift.kind, c.body.gift.kind);
    const st = await s.call(ck, 'GET', '/api/fawn');
    assert.equal(st.body.available, false); assert.equal(st.body.claimed, true);
  } finally { s.stop(); }
});

test('odds across many players roughly match the brief (cash ~50%, cig ~10%, moon ~38%, jackpots rare)', async () => {
  const s = await boot(Date.UTC(2026, 10, 6, 18));
  try {
    const tallies = { cash: 0, cig: 0, moon: 0, jackpot: 0, rare: 0, common: 0 };
    for (let i = 0; i < 400; i++) {
      const ck = await s.login(`P${i}`);
      const c = await s.call(ck, 'POST', '/api/fawn/claim');
      tallies[c.body.gift.kind]++;
      if (c.body.gift.rarity === 'jackpot') tallies.jackpot++;
      if (c.body.gift.rarity === 'rare') tallies.rare++;
      if (c.body.gift.rarity === 'common') tallies.common++;
      if (c.body.gift.kind === 'cash') {
        assert.ok([1000, 500].includes(c.body.gift.amount) || (c.body.gift.amount >= 35 && c.body.gift.amount <= 62));
      }
    }
    assert.ok(tallies.cash > 160 && tallies.cash < 240, `cash ${tallies.cash}`);
    assert.ok(tallies.cig > 20 && tallies.cig < 70, `cig ${tallies.cig}`);
    assert.ok(tallies.moon > 100 && tallies.moon < 200, `moon ${tallies.moon}`);
    assert.ok(tallies.jackpot + tallies.rare < 30, `rares ${tallies.jackpot}+${tallies.rare}`);
  } finally { s.stop(); }
});

test('the cigarette lands in the Smoke Shop stash as a real, usable catalog item', async () => {
  const s = await boot(Date.UTC(2026, 10, 6, 12));
  try {
    let ck;
    for (let i = 0; i < 200 && !ck; i++) { const c = await s.login(`C${i}`); if ((await s.call(c, 'POST', '/api/fawn/claim')).body.gift.kind === 'cig') ck = c; }
    assert.ok(ck, 'no cigarette in 200 claims');
    const shop = (await s.call(ck, 'GET', '/api/shop')).body;
    const held = shop.items.filter((x) => x.kind === 'tobacco' && shop.own[x.id]).map((x) => x.id);
    assert.deepEqual(held, ['tob-filtered']);
    assert.equal(shop.own.filtered, undefined);
  } finally { s.stop(); }
});

test('old faun cigarettes stored as "filtered" are repaired on load, capped at one', async () => {
  const s = await boot(Date.UTC(2026, 10, 6, 12));
  try {
    s.service.store.saveDoc('shop', { inv: { a: { own: { filtered: 1 } }, b: { own: { filtered: 1, 'tob-filtered': 1 } } } });
    const { inv } = new Shop({ store: s.service.store }).doc;
    for (const id of ['a', 'b']) assert.deepEqual(inv[id].own, { 'tob-filtered': 1 });
  } finally { s.stop(); }
});

test('new UTC day unlocks again', async () => {
  const s = await boot(Date.UTC(2026, 10, 6, 23, 30));
  try {
    const ck = await s.login('Bob');
    await s.call(ck, 'POST', '/api/fawn/claim');
    s.clock.t = Date.UTC(2026, 10, 7, 0, 5);
    const st = await s.call(ck, 'GET', '/api/fawn');
    assert.equal(st.body.available, true);
  } finally { s.stop(); }
});
