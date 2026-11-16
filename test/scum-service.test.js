// Async Scum service + HTTP: invite links, bots, hidden hands, the skip event, the exchange (begs stay private),
// the next round's seating, the clock, presence dots and Slack turn DMs. Nothing touches a bankroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Scum } from '../server/scum/index.js';
import { scumTurns, scumMessage } from '../server/slack.js';

function svc(extra = {}) {
  const clock = { t: 1_800_000_000_000 };
  const docs = {}; const players = { a: { id: 'a', name: 'Ann' }, b: { id: 'b', name: 'Bob' }, c: { id: 'c', name: 'Cat' }, d: { id: 'd', name: 'Dee' } };
  const store = { loadDoc: (n, d) => (docs[n] ||= d), saveDoc: (n, d) => { docs[n] = JSON.parse(JSON.stringify(d)); } };
  let k = 42; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
  const s = new Scum({ store, getPlayer: (id) => players[id], now: () => clock.t, rng, tickMs: 0, botMs: 1000, ...extra });
  return { s, clock, docs, P: players };
}
/** Rig the live round: fixed hands, turn order and turn. */
function rig(t, hands, order, turn = order[0]) {
  Object.assign(t.round, { phase: 'play', order, hands, pile: null, owner: null, turn, finished: [], gone: [], exchange: null });
}

test('create, join by invite code, deal: three humans, each sees only their own hand', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { name: 'Porch', settings: { bots: 0 } });
  assert.match(v.code, /^[A-Z2-9]{6}$/);
  s.join(P.b, v.code); s.join(P.c, v.code);
  assert.throws(() => s.start(P.b, v.code), /Only the host/);
  const a = s.start(P.a, v.code);
  assert.equal(a.status, 'playing'); assert.equal(a.round.hand.length, a.seats[0].count);
  const b = s.view(P.b, v.code);
  assert.notDeepEqual(b.round.hand, a.round.hand);
  assert.ok(!JSON.stringify(b).includes(JSON.stringify(a.round.hand)), "Bob's view never carries Ann's hand");
  assert.equal(a.seats.reduce((n, x) => n + (x?.count || 0), 0), 52);
  assert.ok(a.seats.filter(Boolean).every((x) => x.avatar), 'every seat has an avatar');
});

test('needs three players: bots fill in, and bots get generated avatars', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } });
  assert.throws(() => s.start(P.a, v.code), /needs 3 players/);
  const v2 = s.create(P.a, { settings: { bots: 2 } });
  const w = s.start(P.a, v2.code);
  assert.equal(w.seats.filter((x) => x?.bot).length, 2);
  assert.equal(w.seats.find((x) => x?.bot).avatar.kind, 'gen');
  assert.equal(w.seats.find((x) => x?.bot).id, null, 'bot ids are not exposed');
});

test('same rank skips the next player: the log carries a skip event for everyone (and replay)', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.join(P.d, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['5h', 'Kd'], 1: ['5c', 'Qd'], 2: ['9c', 'Jd'], 3: ['6s', 'Td'] }, [0, 1, 2, 3]);
  s.play(P.a, v.code, ['5h']);
  const after = s.play(P.b, v.code, ['5c']);
  const e = after.log.at(-1);
  assert.equal(e.ev.k, 'play'); assert.equal(e.ev.skip, 2); assert.match(e.text, /Cat is SKIPPED/);
  assert.equal(after.round.turn, 3);
  const cat = s.view(P.c, v.code);
  assert.equal(cat.log.filter((x) => x.ev?.skip === 2).length, 1, 'the skipped player sees it');
  assert.equal(cat.seats[2].stats.skipped, 1); assert.equal(cat.seats[1].stats.skips, 1);
  assert.throws(() => s.play(P.c, v.code, ['9c']), /Not your turn/);
});

test('full round to titles, then the exchange with private begs, then the King leads and Scum goes last', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.join(P.d, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['3h'], 1: ['Kh'], 2: ['4c', '6c'], 3: ['5d', '7d'] }, [0, 1, 2, 3]);
  s.play(P.a, v.code, ['3h']); // Ann out first
  s.play(P.b, v.code, ['Kh']); // Bob out second
  s.pass(P.c, v.code); s.pass(P.d, v.code); // clears, Cat leads
  s.play(P.c, v.code, ['4c']); s.play(P.d, v.code, ['5d']); s.play(P.c, v.code, ['6c']); // Cat out third, Dee is Scum
  const v2 = s.view(P.a, v.code);
  assert.deepEqual(v2.lastRound.finish.map((x) => x.title), ['king', 'queen', 'babyScum', 'scum']);
  assert.equal(v2.round.no, 2); assert.equal(v2.round.phase, 'exchange');
  assert.deepEqual(v2.round.order, [0, 1, 2, 3], 'King first, Scum last');
  const dee = s.view(P.d, v.code);
  const owe = dee.round.exchange.pairs.find((p) => p.from === 3).owe;
  assert.equal(owe.length, 2);
  assert.throws(() => s.give(P.a, v.code, v2.round.hand.slice(0, 2)), /Wait for their cards/);
  s.tribute(P.d, v.code, 'spare a two, your highness');
  const ann = s.view(P.a, v.code);
  const pair = ann.round.exchange.pairs.find((p) => p.to === 0);
  assert.equal(pair.beg, 'spare a two, your highness'); assert.deepEqual(pair.tribute, owe);
  assert.ok(owe.every((c) => ann.round.hand.includes(c)));
  const bob = s.view(P.b, v.code);
  assert.equal(bob.round.exchange.pairs.find((p) => p.to === 0).beg, undefined, 'the Queen does not read Scum’s beg');
  assert.ok(!bob.log.some((e) => e.ev?.k === 'beg'), 'nor in the log');
  assert.ok(ann.log.some((e) => e.ev?.k === 'beg'));
  s.give(P.a, v.code, ann.round.hand.slice(0, 2));
  s.tribute(P.c, v.code, '');
  const q = s.view(P.b, v.code);
  const done = s.give(P.b, v.code, [q.round.hand[0]]);
  assert.equal(done.round.phase, 'play'); assert.equal(done.round.turn, 0, 'the King leads');
  assert.equal(done.seats.reduce((n, x) => n + (x?.count || 0), 0), 52);
});

test('the clock: no move passes for you; leading plays your lowest card; exchange settles itself', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', '2c'], 1: ['4c', 'Td'], 2: ['3h', '5h'] }, [0, 1, 2]); s.clock(t);
  clock.t += 31_000; s.tick();
  assert.deepEqual(t.round.pile.cards, ['2c'], 'lowest single led for Ann');
  clock.t += 31_000; s.tick();
  assert.equal(t.round.lastPlay.seat, 0); assert.ok(t.log.at(-1).text.match(/clock/));
});

test('bots play on their own after a beat', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 3 } }); s.start(P.a, v.code);
  const t = s.table(v.code);
  for (let i = 0; i < 300 && t.round.no === 1; i++) {
    if (t.round.turn === 0) { const m = (t.round.pile ? { pass: true } : { play: [t.round.hands[0][0]] }); if (m.pass) s.pass(P.a, v.code); else s.play(P.a, v.code, m.play); }
    clock.t += 1500; s.tick();
  }
  assert.ok(t.round.no >= 2, 'the round finished with three bots and a human');
  assert.ok(t.lastRound.finish.length === 4);
});

test('leaving: a walk-out drops the cards; under three players the game ends; nobody’s bankroll is touched', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', '2c'], 1: ['Tc', '4d'], 2: ['3h', 'Jh'] }, [0, 1, 2]); s.clock(t);
  s.leave(P.b, v.code);
  assert.equal(t.round.gone.includes(1), true);
  s.play(P.a, v.code, ['9h']); s.play(P.c, v.code, ['Jh']); s.pass(P.a, v.code);
  s.play(P.c, v.code, ['3h']);
  assert.equal(t.status, 'over');
  assert.ok(!('bankroll' in P.a));
});

test('joining mid-game waits for the next deal; presence dots; list shows whose turn it is', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 2 } }); s.start(P.a, v.code);
  const w = s.join(P.b, v.code);
  assert.equal(w.seats[w.mySeat].waiting, true); assert.equal(w.round.hand.length, 0);
  s.view(P.a, v.code);
  assert.deepEqual(s.view(P.b, v.code, { away: true }).here, ['a']);
  clock.t += 7000;
  assert.deepEqual(s.view(P.b, v.code, { away: true }).here, []);
  const row = s.list(P.a)[0];
  assert.equal(row.code, v.code); assert.equal(typeof row.myTurn, 'boolean');
});

test('slack: scum turns are public facts with a per-turn key; messages link the table', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { name: 'Porch <x>', settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  const f = scumTurns(t, t.round.turnAt)[0];
  assert.equal(f.phase, 'lead'); assert.equal(f.playerId, t.seats[t.round.turn].id);
  const m = scumMessage({ ...f, left: 3 * 3600000 }, { publicUrl: 'https://buffalobillsacademy.com' });
  assert.match(m.text, new RegExp(`/scum/${v.code}`)); assert.match(JSON.stringify(m.blocks), /Porch &lt;x&gt;/);
  assert.ok(!JSON.stringify(m).match(/\b[2-9TJQKA][shdc]\b/), 'no cards in a DM');
});

test('HTTP: routes, auth, and an app with old data and no scum.json still boots', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-scum-'));
  fs.writeFileSync(path.join(dir, 'blackjack.json'), JSON.stringify({ tables: {} }));
  const { app, shutdown } = createApp({ dataDir: dir, devLogin: true, env: { SCUM_TICK_MS: '0', SCUM_BOT_MS: '0', BJ_TICK_MS: '0' } });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  assert.equal((await call(null, 'GET', '/api/scum')).status, 401);
  const ann = (await call(null, 'POST', '/auth/dev', { name: 'Ann' })).cookie;
  const bob = (await call(null, 'POST', '/auth/dev', { name: 'Bob' })).cookie;
  const c = await call(ann, 'POST', '/api/scum/tables', { name: 'Saloon', settings: { bots: 1 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal((await call(bob, 'POST', `/api/scum/tables/${c.body.code}/join`)).status, 200);
  const st = await call(ann, 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(st.status, 200); assert.equal(st.body.status, 'playing');
  const lst = await call(bob, 'GET', '/api/scum');
  assert.equal(lst.body.tables[0].code, c.body.code); assert.ok(lst.body.limits.turnSecs.includes(86400));
  const bad = await call(bob, 'POST', `/api/scum/tables/${c.body.code}/play`, { cards: ['Zz'] });
  assert.equal(bad.status, 409);
  assert.equal((await call(ann, 'GET', '/api/scum/tables/NOPE99')).status, 404);
  assert.ok(fs.existsSync(path.join(dir, 'scum.json')));
});
