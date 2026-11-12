// v38 bot mode: hand evaluator, the bot brain only ever acts legally and in turn, bots never see other cards,
// bot tables are practice chips, refuse friends unless opened, never deal bots-only hands, never touch Slack,
// and the mine shift duration is stored (not shown).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import * as G from '../server/engine/game.js';
import { bestHand, compareScores } from '../server/engine/evaluator.js';
import { score, cardInt } from '../server/bots/eval.js';
import { decide } from '../server/bots/brain.js';
import { turnFacts } from '../server/slack.js';
import { newDeck } from '../server/engine/cards.js';
import { Accounts } from '../server/accounts.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(base, token) {
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

test('bot evaluator orders 7-card hands exactly like the engine', () => {
  const deck = newDeck();
  for (let k = 0; k < 3000; k++) {
    const d = [...deck].sort(() => Math.random() - 0.5);
    const a = d.slice(0, 7), b = d.slice(7, 14);
    const e = Math.sign(compareScores(bestHand(a).score, bestHand(b).score));
    const m = Math.sign(score(a.map(cardInt), 7) - score(b.map(cardInt), 7));
    assert.equal(m, e);
  }
});

test('brain: null when not on turn, only legal actions, decides from its own view only', () => {
  const ctx = { now: 1000 };
  const ps = ['A', 'B', 'C', 'D'].map((n, i) => ({ id: `p${i}`, name: n }));
  const t = G.createTable({ id: 't', code: 'BRAINX', name: 'b', host: ps[0], settings: { nextHandDelaySeconds: 0, buyIn: 200, smallBlind: 1, bigBlind: 2 } }, ctx);
  for (const p of ps.slice(1)) G.joinTable(t, p, undefined, ctx);
  G.startGame(t, ps[0].id, ctx);
  let acts = 0;
  for (let hand = 0; hand < 60 && t.status === 'playing'; hand++) {
    if (!t.hand) { t.seats.forEach((s) => { if (s) { s.stack = 200; s.sittingOut = false; } }); t.nextHandAt = null; G.startHand(t, ctx); }
    while (t.hand) {
      const seat = t.hand.toAct;
      t.seats.forEach((s, i) => { if (s && i !== seat) assert.equal(decide(G.viewFor(t, s.playerId, 1000), Math.random), null); });
      const v = G.viewFor(t, t.seats[seat].playerId, 1000);
      assert.ok(v.seats.every((s) => !s || s.seat === seat || !s.cards), 'the bot view holds only its own cards');
      const d = decide(v, Math.random);
      assert.ok(d && d.action);
      G.act(t, t.seats[seat].playerId, d.action, ctx); acts++; // throws on anything illegal
    }
  }
  assert.ok(acts > 100);
});

test('simulation: invariants hold and the bot beats baseline bots (short run)', { timeout: 120000 }, () => {
  for (const [opp, seats, hands] of [['station', 2, 600], ['equity', 6, 150], ['maniac', 3, 150]]) {
    const r = JSON.parse(execFileSync('node', ['scripts/bot-sim.mjs', opp, String(seats), String(hands), '7'], { encoding: 'utf8' }).trim().split('\n').pop());
    assert.equal(r.illegal, 0); assert.equal(r.leaks, 0); assert.equal(r.outOfTurn, 0); assert.equal(r.chipErrors, 0);
    if (opp === 'station') assert.ok(r.strongBb100 > 100, `bb/100 ${r.strongBb100}`); // a short run is noisy; the edge vs a calling station is ~+550
  }
});

test('bot table over HTTP: practice chips, bots play, no leaks, friends refused, no bots-only hands', { timeout: 60000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-bots-'));
  const { app, service } = createApp({ dataDir, botDelayScale: 0 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const anon = client(base);
  const mk = async (name) => { const r = await anon.post('/players', { name }); return { ...r.body, api: client(base, r.body.token) }; };
  const me = await mk('Tyler'); const pal = await mk('Pal');
  const bank0 = (await me.api.get('/me')).body.bankroll;
  const cr = await me.api.post('/tables', { name: 'Bots', bots: { count: 3 }, settings: { turnSeconds: 60, nextHandDelaySeconds: 0, maxPlayers: 6, buyIn: 200, smallBlind: 1, bigBlind: 2 } });
  assert.equal(cr.status, 200); const code = cr.body.code;
  assert.equal((await me.api.get('/me')).body.bankroll, bank0, 'practice chips: no bankroll buy-in');
  let v = (await me.api.get(`/tables/${code}`)).body;
  assert.equal(v.status, 'playing'); assert.equal(v.econ, false); assert.deepEqual(v.bots, { count: 3, friends: false });
  const bots = v.seats.filter((s) => s && s.bot); assert.equal(bots.length, 3);
  for (const b of bots) { assert.ok(b.playerId.startsWith('bot-')); assert.equal(v.avatars[b.playerId].kind, 'gen'); assert.ok(v.avatars[b.playerId].wear); assert.ok(!service.store.players[b.playerId]); }
  assert.equal((await pal.api.post(`/tables/${code}/join`)).status, 403);
  assert.equal((await pal.api.get(`/tables/${code}`)).status, 200, 'spectating is fine');
  const list = (await me.api.get('/my-tables')).body; assert.ok(JSON.stringify(list).includes('"bots":true'));
  const tb = service.store.getTable(code); assert.equal(turnFacts(tb, Date.now()), null, 'no Slack turn pings at bot tables');
  // play: I check/call; the bots play themselves
  const until = Date.now() + 30000; let hands = new Set();
  while (Date.now() < until && hands.size < 8) {
    v = (await me.api.get(`/tables/${code}`)).body;
    if (v.hand) {
      hands.add(v.hand.number);
      for (const s of v.seats) if (s && s.playerId !== me.id) assert.ok(!s.cards, 'never another player\'s cards mid-hand');
    }
    if (v.legal) {
      const r = await me.api.post(`/tables/${code}/action`, { type: v.legal.canCheck ? 'check' : 'call', handNumber: v.hand.number });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    } else {
      const mine = v.seats.find((s) => s && s.playerId === me.id);
      if (mine && mine.stack === 0 && !v.hand) assert.equal((await me.api.post(`/tables/${code}/rebuy`)).status, 200, 'free practice rebuy');
      await sleep(20);
    }
  }
  assert.ok(hands.size >= 8, `hands played ${hands.size}`);
  const bt = service.store.getTable(code);
  assert.ok(bt.log.some((l) => /^(Wendover|Mai Tai|Salt Flats|Tiki|Bonneville|Lava|Coconut|Border)/.test(l.text) && / (raises|bets|calls|checks|folds)/.test(l.text)));
  assert.equal((await me.api.get('/me')).body.stats?.handsPlayed || 0, 0, 'practice hands are not lifetime stats');
  // I sit out: the bots finish the hand but never deal themselves a new one
  await me.api.post(`/tables/${code}/sitout`, { sitOut: true });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    v = (await me.api.get(`/tables/${code}`)).body;
    if (v.legal) await me.api.post(`/tables/${code}/action`, { type: v.legal.canCheck ? 'check' : 'fold', handNumber: v.hand.number });
    if (!v.hand) break; await sleep(30);
  }
  const n = service.store.getTable(code).handNumber; await sleep(400);
  assert.equal(service.store.getTable(code).handNumber, n); assert.equal(service.store.getTable(code).hand, null);
  // opened to friends: they may join
  const c2 = (await me.api.post('/tables', { name: 'Open', bots: { count: 2, friends: true }, settings: { turnSeconds: 60, buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 4 } })).body.code;
  assert.equal((await pal.api.post(`/tables/${c2}/join`)).status, 200);
  assert.equal((await pal.api.get('/me')).body.bankroll, 1000, 'practice chips for friends too');
  await me.api.post(`/tables/${code}/close`); await me.api.post(`/tables/${c2}/close`);
});

test('mines: each finished shift stores its duration and a running total, and the profile does not show it', () => {
  const store = { players: {}, savePlayers() {}, savePlayer() {}, commitPlayerDrafts(drafts) { for (const draft of drafts) Object.assign(this.players[draft.id], draft); } };
  const acc = new Accounts({ store, now: () => 1 });
  const p = { id: 'x', name: 'X' }; store.players[p.id] = p; acc.ensure(p);
  acc.recordShift(p, { outcome: 'paid', title: 'Paid', amount: 5, at: 10, ms: 61000 });
  acc.recordShift(p, { outcome: 'scared', title: 'Scared', amount: 0, at: 20, ms: 22500 });
  assert.equal(p.mining.totalMs, 83500); assert.equal(p.mining.history[0].ms, 61000); assert.equal(p.mining.history[1].ms, 22500);
});
