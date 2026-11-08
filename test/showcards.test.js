// "Show my cards" after winning without a showdown: optional, winner-only, server-enforced, never leaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../server/engine/game.js';
import { createApp } from '../server/app.js';
import { makeTable, act } from './helpers.js';

const start = (t, ctx) => G.startGame(t, t.hostId, ctx);
const leaks = (view, cards) => cards.some((c) => JSON.stringify(view).includes(`"${c}"`));

test('uncontested winner: cards hidden by default, never sent to anyone else', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const hole = Object.fromEntries(t.hand.players.map((p, i) => [i, p?.hole.slice()]));
  // UTG Ann folds, Bob (SB) folds: Cat (BB) wins without a showdown
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');
  assert.equal(t.hand, null);
  const cat = hole[2];
  assert.deepEqual(t.lastHand.shown, {}, 'default unchanged: nothing shown');
  for (const id of ['p0', 'p1', 'watcher']) {
    const v = G.viewFor(t, id, 3000);
    assert.equal(leaks(v, cat), false, `${id} must not see the winner's cards`);
    assert.equal(v.me.canShow, null);
  }
  const mine = G.viewFor(t, 'p2', 3000).me.canShow;
  assert.deepEqual(mine.cards, cat, 'the winner sees their own option');
  assert.throws(() => G.showCards(t, 'p0', 'both', { now: 3100 }), /Only the winner/);
  assert.throws(() => G.showCards(t, 'p2', 7, { now: 3100 }), /Choose which card/);
});

test('show one card, then the other; everyone sees exactly what was shown', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const cat = t.hand.players[2].hole.slice();
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');
  G.showCards(t, 'p2', 1, { now: 3100 });
  let v = G.viewFor(t, 'watcher', 3200);
  assert.deepEqual(v.lastHand.shown[2].cards, [cat[1]]);
  assert.equal(JSON.stringify(v).includes(`"${cat[0]}"`), false, 'the other card stays hidden');
  assert.match(t.log.at(-1).text, /Cat shows .* \(didn't have to\)/);
  G.showCards(t, 'p2', 'both', { now: 3300 });
  v = G.viewFor(t, 'p0', 3400);
  assert.deepEqual(v.lastHand.shown[2].cards, cat);
  assert.equal(G.viewFor(t, 'p2', 3400).me.canShow, null, 'nothing left to show');
  assert.throws(() => G.showCards(t, 'p2', 'both', { now: 3500 }), /no cards to show/);
});

test('cannot show during the hand, after a showdown, or once the next hand has ended', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx);
  assert.throws(() => G.showCards(t, 'p0', 'both', { now: 2000 }), /no cards to show/, 'mid-hand: nothing');
  act(t, 'Ann', 'fold'); // Bob wins uncontested
  G.tick(t, { now: 5000 }); // next hand starts: Bob may still show last hand's cards
  assert.ok(t.hand);
  assert.ok(G.viewFor(t, 'p1', 5000).me.canShow);
  // next hand goes to showdown: the old option disappears and nothing is revealed for it
  act(t, t.seats[t.hand.toAct].name, 'call', undefined, 5100);
  while (t.hand) act(t, t.seats[t.hand.toAct].name, 'check', undefined, 5200);
  assert.equal(t.muck, null);
  assert.throws(() => G.showCards(t, 'p1', 'both', { now: 6000 }), /no cards to show/);
});

test('API: POST /tables/:code/show is winner-only and visible to the table', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-show-'));
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name) => { const r = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name}@example.com` }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const call = (c, m, p, b) => fetch(base + '/api' + p, { method: m, headers: { cookie: c, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const a = await login('Ann'), b = await login('Bob');
  const created = await call(a, 'POST', '/tables', { name: 'Show test', settings: { buyIn: 100, nextHandDelaySeconds: 3600 } });
  const code = created.body.code || created.body.table?.code;
  assert.ok(code, JSON.stringify(created.body).slice(0, 200));
  assert.equal((await call(b, 'POST', `/tables/${code}/join`, {})).status, 200);
  assert.equal((await call(a, 'POST', `/tables/${code}/start`, {})).status, 200);
  const tb = service.getTable(code);
  const toAct = tb.seats[tb.hand.toAct].playerId;
  const [folder, winner] = toAct === tb.seats[0].playerId ? [a, b] : [b, a];
  const winSeat = toAct === tb.seats[0].playerId ? 1 : 0;
  const hole = tb.hand.players[winSeat].hole.slice();
  const f = await call(folder, 'POST', `/tables/${code}/action`, { type: 'fold' });
  assert.equal(f.status, 200);
  assert.equal(JSON.stringify(f.body).includes(`"${hole[0]}"`) || JSON.stringify(f.body).includes(`"${hole[1]}"`), false);
  assert.equal((await call(folder, 'POST', `/tables/${code}/show`, { which: 'both' })).status, 400);
  const s = await call(winner, 'POST', `/tables/${code}/show`, { which: 'both' });
  assert.equal(s.status, 200);
  const seen = await call(folder, 'GET', `/tables/${code}`);
  assert.deepEqual(seen.body.lastHand.shown[winSeat].cards, hole);
});
