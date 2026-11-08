// v39 slots: math invariants, crypto RNG, server-authoritative payouts, bet caps, rate limit, sessions, breaks, delete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { M, CFG, spin, evaluate, build, HOUSES, SQUATCH, WILD } from '../server/slots/math.js';
import { Slots, maxBetFor, BETS, SLOTS, cryptoRng, PLAY_MONEY_NOTE } from '../server/slots/index.js';

async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-slots-'));
  const clock = { t: 1_700_000_000_000 };
  const r = createApp({ dataDir, now: () => clock.t, devLogin: true, env });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); };
  return { base, clock, stop, service: r.service, dataDir };
}
async function login(base, email, name = 'Spinner') {
  const r = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const req = async (m, u, b) => { const x = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); return { status: x.status, body: await x.json() }; };
  const api = { post: (u, b) => req('POST', u, b || {}), get: (u) => req('GET', u), del: (u, b) => req('DELETE', u, b) };
  api.id = (await api.get('/api/me')).body.id; return api;
}
function seeded(seed) { let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162; const n = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; }; for (let i = 0; i < 20; i++) n(); return (k) => Math.floor(n() * k); }

test('math: 200k seeded spins land near 95% RTP, every feature appears, nothing above the cap, grids are valid', () => {
  const rng = seeded(7); let tot = 0, hits = 0; const seen = { toot: 0, stash: 0, free: 0 };
  for (let i = 0; i < 200000; i++) {
    const r = spin(rng); tot += r.x; if (r.x > 0) hits++;
    assert.equal(r.grid.length, 15); assert.ok(r.x >= 0 && r.x <= CFG.maxWin);
    for (const f of Object.keys(seen)) if (r[f]) seen[f]++;
    if (r.toot) { assert.equal(r.stash, null); assert.equal(r.free, null); for (const i2 of r.toot.blown) assert.ok(SQUATCH.includes(r.toot.grid[i2])); assert.ok(!r.toot.grid.some((s) => HOUSES.includes(s))); }
    if (r.free) for (const s of r.free.spins) assert.ok(!s.grid.includes('S') && !s.grid.includes('G'));
  }
  const rtp = tot / 200000; assert.ok(rtp > 0.88 && rtp < 1.02, `rtp ${rtp}`);
  assert.ok(hits / 200000 > 0.2 && hits / 200000 < 0.35);
  for (const [f, n] of Object.entries(seen)) assert.ok(n > 300, `${f} ${n}`);
});

test('math: 243-ways evaluation pays ways, wilds substitute, all-wild ways once', () => {
  const g = ['pip', 'x', 'x', 'pip', 'pip', 'x', 'pip', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x'];
  const e = evaluate(g); assert.equal(e.wins.length, 1); assert.equal(e.wins[0].ways, 2); assert.equal(e.wins[0].n, 3); assert.equal(e.total, M.pays.pip[0] * 2);
  const w = ['pip', 'x', 'x', WILD, 'x', 'x', WILD, 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x'];
  assert.equal(evaluate(w).wins.find((x) => x.sym === 'pip').ways, 1);
  assert.equal(evaluate(['x', 'x', 'x', 'pip', 'pip', 'pip', 'pip', 'x', 'x', 'pip', 'x', 'x', 'x', 'x', 'x']).total, 0); // must start on reel 1
  assert.ok(build({ ...CFG, payScale: 2 * CFG.payScale }).pays.pip[0] === 2 * M.pays.pip[0]);
});

test('bet caps: $1..$100, never more than a tenth of the balance, nothing under $1', () => {
  assert.equal(maxBetFor(1000), 100); assert.equal(maxBetFor(5000), 100); assert.equal(maxBetFor(260), 25); assert.equal(maxBetFor(55), 5);
  assert.equal(maxBetFor(9.99), 1); assert.equal(maxBetFor(1), 1); assert.equal(maxBetFor(0.99), 0);
  assert.deepEqual(BETS, [1, 2, 5, 10, 25, 50, 100]);
});

test('the live server draws with crypto.randomInt', () => {
  const s = new Slots({ store: { loadDoc: (_n, f) => f, saveDoc() {} }, accounts: {}, now: Date.now });
  assert.equal(s.rng, cryptoRng);
  const orig = crypto.randomInt; let calls = 0; crypto.randomInt = (n) => { calls++; return orig(n); };
  try { for (let i = 0; i < 20; i++) cryptoRng(10); } finally { crypto.randomInt = orig; }
  assert.equal(calls, 20);
});

test('HTTP: spin debits the bet and credits exactly the result, one statement line, limits, sessions, breaks, delete', async () => {
  const s = await boot(); try {
    const a = await login(s.base, 'spin@example.com');
    let v = await a.get('/api/slots'); assert.equal(v.status, 200);
    assert.equal(v.body.note, PLAY_MONEY_NOTE); assert.equal(v.body.maxBet, 100); assert.equal(v.body.bankroll, 1000);
    assert.equal((await a.post('/api/slots/spin', { bet: 7 })).status, 400);
    assert.equal((await a.post('/api/slots/spin', { bet: 100 })).status, 200);
    assert.equal((await a.post('/api/slots/spin', { bet: 1 })).status, 429); // too fast
    let bal = (await a.get('/api/slots')).body.bankroll;
    for (let i = 0; i < 25; i++) {
      s.clock.t += SLOTS.minGapMs;
      const r = await a.post('/api/slots/spin', { bet: 1 }); assert.equal(r.status, 200);
      assert.equal(r.body.win, Math.round(r.body.result.x * 100) / 100);
      assert.equal(r.body.bankroll, Math.round((bal - 1 + r.body.win) * 100) / 100); bal = r.body.bankroll;
    }
    const me = s.service.store.players[a.id];
    assert.equal(me.txns.filter((x) => x.type === 'slots').length, 1);
    assert.equal(me.txns.at(-1).note, 'Slots: 26 spins'); assert.equal(me.txns.at(-1).balance, bal);
    v = (await a.get('/api/slots')).body; assert.equal(v.session.spins, 26); assert.equal(v.session.wagered, 125);
    // cap against balance
    me.bankroll = 40; s.clock.t += 1000;
    assert.equal((await a.post('/api/slots/spin', { bet: 5 })).status, 402);
    s.clock.t += 1000; assert.equal((await a.post('/api/slots/spin', { bet: 2 })).status, 200);
    me.bankroll = 0.5; s.clock.t += 1000; assert.equal((await a.post('/api/slots/spin', { bet: 1 })).status, 402);
    me.bankroll = 100000;
    // end session -> summary
    const end = await a.post('/api/slots/end'); assert.equal(end.body.summary.spins, 27); assert.equal((await a.get('/api/slots')).body.session, null);
    // reality check every 100, forced break at 300
    let reality = 0, broke = null;
    for (let i = 0; i < 300; i++) { s.clock.t += SLOTS.minGapMs; const r = await a.post('/api/slots/spin', { bet: 1 }); assert.equal(r.status, 200); if (r.body.reality) reality++; if (r.body.breakUntil) broke = r.body; }
    assert.equal(reality, 3); assert.ok(broke && broke.breakUntil === s.clock.t + SLOTS.breakMs);
    s.clock.t += 60e3; assert.equal((await a.post('/api/slots/spin', { bet: 1 })).status, 429);
    s.clock.t += SLOTS.breakMs; assert.equal((await a.post('/api/slots/spin', { bet: 1 })).status, 200);
    // 45 minutes ends a session too
    for (let i = 0; i < 4; i++) { s.clock.t += 14 * 60e3; const r = await a.post('/api/slots/spin', { bet: 1 }); if (i === 3) assert.ok(r.body.breakUntil > 0); }
    // delete forgets the slots record
    assert.ok(s.service.slots.doc.players[a.id]);
    await a.post('/api/slots/end');
    const del = await a.del('/api/me', { confirm: 'DELETE' }); assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(s.service.slots.doc.players[a.id], undefined);
  } finally { await s.stop(); }
});

test('the forced-feature hook exists only with dev login, and forced spins still pay from the engine', async () => {
  const s = await boot({ SLOTS_TEST_FORCE: 'toot' }); try {
    const a = await login(s.base, 'toot@example.com');
    const r = await a.post('/api/slots/spin', { bet: 10 }); assert.equal(r.status, 200);
    assert.ok(r.body.result.toot && r.body.result.x >= 10); assert.equal(r.body.win, Math.round(r.body.result.x * 1000) / 100);
  } finally { await s.stop(); }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-slots-prod-'));
  const r = createApp({ dataDir, devLogin: false, env: { SLOTS_TEST_FORCE: 'toot' } });
  try { assert.equal(r.service.slots.force, null); } finally { r.shutdown(); }
});
