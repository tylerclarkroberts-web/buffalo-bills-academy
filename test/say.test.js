// Speech bubbles: one short message per seated player, shown until their next turn begins; server-enforced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../server/engine/game.js';
import { createApp } from '../server/app.js';
import { makeTable, act, toActName } from './helpers.js';

const sayOf = (t, id) => G.viewFor(t, 'watcher', 5000).seats.find((s) => s && s.playerId === id).say;

test('set, edit and clear your own bubble; everyone (even spectators) sees it', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.setSay(t, 'p1', '  nice   hand,\n Ann  ', ctx);
  assert.deepEqual(sayOf(t, 'p1'), { text: 'nice hand, Ann', at: 1000 });
  G.setSay(t, 'p1', 'actually, not that nice', { now: 1500 });
  assert.deepEqual(sayOf(t, 'p1'), { text: 'actually, not that nice', at: 1500 });
  G.setSay(t, 'p1', '   ', { now: 1600 });
  assert.equal(sayOf(t, 'p1'), null);
  assert.equal(sayOf(t, 'p0'), null);
});

test('a bubble stays through other turns and clears when its owner\'s next turn starts', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.startGame(t, t.hostId, ctx);
  assert.equal(toActName(t), 'Ann'); // UTG with 3 players
  G.setSay(t, 'p0', 'I am all in on this one', ctx); // said during my own turn
  G.setSay(t, 'p2', 'bring it', ctx);
  act(t, 'Ann', 'call');
  assert.equal(sayOf(t, 'p0').text, 'I am all in on this one', 'stays after acting');
  assert.equal(toActName(t), 'Bob');
  act(t, 'Bob', 'call');
  assert.equal(toActName(t), 'Cat');
  assert.equal(sayOf(t, 'p2'), null, 'Cat\'s turn started: Cat\'s bubble cleared');
  assert.equal(sayOf(t, 'p0').text, 'I am all in on this one', 'Ann\'s still showing during Cat\'s turn');
  act(t, 'Cat', 'check'); // flop: first to act after the button (Bob, SB)
  assert.equal(toActName(t), 'Bob');
  act(t, 'Bob', 'check');
  assert.equal(toActName(t), 'Cat');
  act(t, 'Cat', 'check');
  assert.equal(toActName(t), 'Ann');
  assert.equal(sayOf(t, 'p0'), null, 'Ann\'s next turn began: cleared');
});

test('only seated players, only their own seat; length limit; HTML and control characters stripped', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  assert.throws(() => G.setSay(t, 'watcher', 'hi', ctx), (e) => e.status === 403);
  assert.throws(() => G.setSay(t, 'p0', 'x'.repeat(81), ctx), /80 characters/);
  G.setSay(t, 'p0', 'x'.repeat(80), ctx);
  assert.equal(sayOf(t, 'p0').text.length, 80);
  G.setSay(t, 'p0', '🂡'.repeat(80), ctx); // counted as characters, not UTF-16 units
  G.setSay(t, 'p0', '<img src=x onerror=alert(1)>hi <script>alert(2)</script> <b>there</b>', ctx);
  const txt = sayOf(t, 'p0').text;
  assert.equal(/[<>]/.test(txt), false);
  assert.equal(txt, 'hi alert(2) there');
  G.setSay(t, 'p0', 'a\u0000b\u202ec\u200bd <<x', ctx);
  assert.equal(sayOf(t, 'p0').text, 'a b c d x');
  assert.equal(G.viewFor(t, 'p1', 1).seats[0].say.text, 'a b c d x');
  G.leaveTable(t, 'p0', ctx);
  assert.throws(() => G.setSay(t, 'p0', 'hi', ctx), (e) => e.status === 403);
});

test('over HTTP: seated only, sign-in required, rate limited to 10 a minute, others see it', { timeout: 20000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-say-'));
  let clock = 1_800_000_000_000;
  const { app, service } = createApp({ dataDir, now: () => clock });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const call = async (token, method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const mk = async (name) => (await call(null, 'POST', '/players', { name })).body.token;
  const [ann, bob, eve] = [await mk('Ann'), await mk('Bob'), await mk('Eve')];
  const code = (await call(ann, 'POST', '/tables', { name: 'Chat', settings: { maxPlayers: 4 } })).body.code;
  await call(bob, 'POST', `/tables/${code}/join`);
  assert.equal((await call(null, 'POST', `/tables/${code}/say`, { text: 'hi' })).status, 401);
  assert.equal((await call(eve, 'POST', `/tables/${code}/say`, { text: 'hi' })).status, 403, 'spectator cannot post');
  assert.equal((await call(bob, 'POST', `/tables/${code}/say`, { text: 'y'.repeat(81) })).status, 400);
  const r = await call(bob, 'POST', `/tables/${code}/say`, { text: '<b>howdy</b> folks' });
  assert.equal(r.status, 200);
  assert.equal(r.body.seats[1].say.text, 'howdy folks');
  const seen = await call(eve, 'GET', `/tables/${code}`);
  assert.equal(seen.body.seats[1].say.text, 'howdy folks', 'spectators see bubbles');
  const secret = await call(bob, 'POST', `/tables/${code}/say`, { text: '  Practice FIGHT ' });
  assert.equal(secret.status, 200); assert.equal(secret.body.seats[1].say.text, 'howdy folks', 'the practice-fight phrase is never posted as a bubble');
  assert.equal((await call(bob, 'POST', `/tables/${code}/say`, { text: { evil: 1 } })).body.seats[1].say, null, 'non-string clears');
  for (let i = 0; i < 8; i++) assert.equal((await call(bob, 'POST', `/tables/${code}/say`, { text: `n${i}` })).status, 200);
  const limited = await call(bob, 'POST', `/tables/${code}/say`, { text: 'one too many' });
  assert.equal(limited.status, 429);
  assert.equal((await call(ann, 'POST', `/tables/${code}/say`, { text: 'mine still works' })).status, 200, 'limit is per player');
  clock += 61000;
  assert.equal((await call(bob, 'POST', `/tables/${code}/say`, { text: 'back again' })).status, 200, 'limit resets after a minute');
});
