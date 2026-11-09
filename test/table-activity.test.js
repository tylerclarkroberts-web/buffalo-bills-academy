import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import * as G from '../server/engine/game.js';
import { makeTable } from './helpers.js';

async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-activity-'));
  const clock = { now: Date.UTC(2026, 10, 9, 12) };
  let server, shutdown, service, base;
  const stop = async () => {
    shutdown(); server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  };
  const start = async () => {
    const app = createApp({ dataDir, env: {}, now: () => clock.now });
    service = app.service; shutdown = app.shutdown;
    server = await new Promise((resolve) => { const s = app.app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  };
  await start();
  t.after(async () => { await stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const call = async (player, method, route, body) => {
    const res = await fetch(base + route, {
      method, headers: { 'content-type': 'application/json', ...(player ? { authorization: `Bearer ${player.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const post = async (player, route, body = {}) => {
    const result = await call(player, 'POST', route, body);
    assert.equal(result.status, 200, `${route}: ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const player = async (name) => {
    const p = await post(null, '/players', { name });
    service.accounts.change(service.getPlayer(p.id), 30000, 'test', 'Synthetic test funds');
    return p;
  };
  const host = await player('Ann'), pal = await player('Bob');
  const { code } = await post(host, '/tables', { name: 'Async', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, turnSeconds: 7 * 24 * 3600 } });
  await post(pal, `/tables/${code}/join`);
  return { host, pal, code, clock, call, post, player, get service() { return service; }, restart: async () => { await stop(); await start(); } };
}

test('public actions, gags, smokes and speech share a persisted sequence across absence and restart', async (t) => {
  const s = await fixture(t); const { host, pal, code } = s; const route = `/tables/${code}`;
  for (const id of ['gag-confetti', 'tob-rollie', 'tob-filtered']) await s.post(host, '/shop/buy', { id, confirm: true });
  await s.post(host, `${route}/start`);
  await s.post(host, `${route}/action`, { type: 'call' });
  const before = structuredClone(s.service.getTable(code));
  const notifications = []; const unsub = s.service.subscribe(code, (version, extra) => notifications.push({ version, ...extra }));
  const gag = (await s.post(host, `${route}/gag`, { item: 'gag-confetti', target: pal.id })).gag;
  const smoke = (await s.post(host, `${route}/smoke`, { item: 'tob-rollie' })).smoke;
  const queued = (await s.post(host, `${route}/smoke`, { item: 'tob-filtered' })).smoke;
  await s.post(pal, `${route}/say`, { text: ' <b>nice</b>   hand! ' });
  unsub();
  const after = s.service.getTable(code);
  assert.deepEqual(after.hand, before.hand, 'cosmetics and speech never change cards, bets, turns or deadlines');
  assert.deepEqual(after.ledger, before.ledger);
  const events = after.log.filter((e) => e.seq > before.seq);
  assert.deepEqual(events.map((e) => e.ev.k), ['gag', 'smoke', 'smoke', 'say']);
  assert.deepEqual(events.map((e) => e.seq), [before.seq + 1, before.seq + 2, before.seq + 3, before.seq + 4]);
  assert.equal(events[0].ev.id, gag.id); assert.equal(events[0].ev.toName, 'Bob');
  assert.equal(events[0].text, 'Ann used Confetti Popper on Bob');
  assert.equal(events[1].ev.id, smoke.id); assert.equal(events[1].text, 'Ann lit up a Hand-Rolled Cigarette');
  assert.ok(queued.at > queued.made, 'legacy full-length animation queue remains spaced');
  assert.equal(events[2].t, queued.made, 'the recap records the use, without delaying later actions');
  assert.equal(events[2].ev.at, queued.at);
  assert.equal(events[3].text, 'Bob: nice hand!'); assert.equal(events[3].ev.text, 'nice hand!');
  assert.ok(notifications.some((e) => e.gag?.id === gag.id));
  assert.ok(notifications.some((e) => e.smoke?.id === smoke.id));
  assert.ok(notifications.some((e) => e.version > before.version));
  const own = (await s.call(host, 'GET', '/shop')).body.own;
  assert.equal(own['gag-confetti'], undefined); assert.equal(own['tob-rollie'], undefined);
  const publicJson = JSON.stringify(events.map((e) => e.ev));
  for (const p of after.hand.players.filter(Boolean)) for (const card of p.hole) assert.ok(!publicJson.includes(`"${card}"`));
  for (const key of ['hole', 'cards', 'own', 'token', 'bankroll']) assert.ok(!publicJson.includes(`"${key}"`));

  s.clock.now += 7000;
  let view = (await s.call(null, 'GET', route)).body;
  assert.deepEqual(view.gags, []); assert.ok(view.log.some((e) => e.ev?.id === gag.id));
  s.clock.now += 25 * 3600e3;
  view = (await s.call(null, 'GET', route)).body;
  assert.deepEqual(view.smokes, []); assert.ok(view.log.some((e) => e.ev?.id === smoke.id));
  assert.ok(view.seats.filter(Boolean).every((seat) => seat.cards === null), 'spectator replay does not reveal hole cards');
  const savedLog = view.log;
  await s.restart();
  view = (await s.call(null, 'GET', route)).body;
  assert.deepEqual(view.log, savedLog, 'all public activity survives a process restart');
});

test('refused gags and smokes neither consume items nor append replay entries', async (t) => {
  const s = await fixture(t); const { host, pal, code } = s; const route = `/tables/${code}`;
  for (const id of ['gag-pie', 'tob-rollie']) await s.post(host, '/shop/buy', { id, confirm: true });
  const before = structuredClone(s.service.getTable(code).log);
  await s.post(host, `${route}/gags`, { off: true });
  assert.equal((await s.call(host, 'POST', `${route}/gag`, { item: 'gag-pie', target: pal.id })).status, 403);
  await s.post(host, `${route}/gags`, { off: false });
  await s.post(pal, '/me/gags', { optOut: true });
  assert.equal((await s.call(host, 'POST', `${route}/gag`, { item: 'gag-pie', target: pal.id })).status, 403);
  await s.post(pal, '/me/gags', { optOut: false });
  assert.equal((await s.call(host, 'POST', `${route}/gag`, { item: 'gag-pie', target: host.id })).status, 400);
  assert.equal((await s.call(null, 'POST', `${route}/gag`, { item: 'gag-pie', target: pal.id })).status, 401);
  await s.post(host, `${route}/tobacco`, { off: true });
  assert.equal((await s.call(host, 'POST', `${route}/smoke`, { item: 'tob-rollie' })).status, 403);
  assert.deepEqual(s.service.getTable(code).log, before);
  const own = (await s.call(host, 'GET', '/shop')).body.own;
  assert.equal(own['gag-pie'], 1); assert.equal(own['tob-rollie'], 1);
});

test('cosmetic log uses a public whitelist, keeps the existing 300-entry bound and accepts old tables', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  delete t.seq; for (const e of t.log) delete e.seq;
  const moment = { id: 's1', from: 'p0', fromName: 'Ann', item: 'tob-cigar', name: 'Big Cigar', emoji: '🚬', art: 'cigar', at: ctx.now,
    hole: ['As', 'Ad'], inventory: { private: 1 }, token: 'private', bankroll: 100 };
  for (let i = 0; i < 305; i++) G.recordTableMoment(t, 'smoke', { ...moment, id: `s${i}` }, ctx);
  assert.equal(t.log.length, 300); assert.equal(G.viewFor(t, null, ctx.now).log.length, 300);
  assert.ok(t.log.every((e, i) => i === 0 || e.seq === t.log[i - 1].seq + 1));
  assert.deepEqual(Object.keys(t.log.at(-1).ev).sort(), ['k', 'id', 'from', 'fromName', 'seat', 'item', 'name', 'emoji', 'art', 'at'].sort());
  const before = structuredClone(t);
  assert.throws(() => G.recordTableMoment(t, 'unknown', moment, ctx), /Unknown table moment/);
  assert.deepEqual(t, before);
});

test('public speech is sanitized and logged on change, without duplicate or empty entries', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']); const before = t.log.length;
  G.setSay(t, 'p1', '<b>Howdy</b>\n friends', ctx);
  G.setSay(t, 'p1', '  Howdy friends ', ctx);
  G.setSay(t, 'p1', '', ctx);
  assert.equal(t.log.length, before + 1);
  assert.equal(t.log.at(-1).text, 'Bob: Howdy friends');
  assert.deepEqual(t.log.at(-1).ev, { k: 'say', from: 'p1', fromName: 'Bob', seat: 1, text: 'Howdy friends' });
  assert.equal(t.seats[1].say, undefined, 'clearing the bubble still works');
  assert.throws(() => G.setSay(t, 'watcher', 'hello', ctx), /Take a seat/);
  assert.throws(() => G.setSay(t, 'p0', 'x'.repeat(81), ctx), /80 characters/);
  assert.equal(t.log.length, before + 1);
});
