// Async Scum service + HTTP: invite links, bots, hidden hands, the skip event, the exchange (begs stay private),
// the next round's seating, the clock, presence dots and Slack turn DMs. Nothing touches a bankroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Scum } from '../server/scum/index.js';
import * as R from '../server/scum/rules.js';
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
  Object.assign(t.round, { phase: 'play', order, hands, pile: null, owner: null, turn, finished: [], gone: [], exchange: null, passed: [], playOn: false, skipped: null });
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
  assert.equal(s.list(P.d)[0].turnLabel, 'Send tribute');
  assert.equal(s.list(P.d)[0].myTurn, true);
  assert.equal(s.list(P.d)[0].deadline, dee.round.exchange.pairs.find((p) => p.from === 3).due);
  assert.equal(s.list(P.a)[0].turnLabel, 'Waiting for cards');
  assert.equal(s.list(P.a)[0].myTurn, false);
  assert.throws(() => s.give(P.a, v.code, v2.round.hand.slice(0, 2)), /Wait for their cards/);
  s.tribute(P.d, v.code, 'spare a two, your highness');
  const ann = s.view(P.a, v.code);
  const pair = ann.round.exchange.pairs.find((p) => p.to === 0);
  const annRow = s.list(P.a)[0];
  assert.equal(annRow.turnLabel, 'Return cards'); assert.equal(annRow.myTurn, true);
  assert.equal(annRow.actorName, 'Ann'); assert.equal(annRow.deadline, pair.due);
  assert.equal(annRow.title, 'king');
  assert.doesNotMatch(JSON.stringify(annRow), /spare a two|tribute|gift|hands|exchange/);
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
  // Auto-organize: every hand reads low to high (aces last) after cards changed hands.
  for (const p of [P.a, P.b, P.c, P.d]) {
    const h = s.view(p, v.code).round.hand;
    assert.deepEqual(h, R.sortHand(h), 'hand sorted low to high');
    assert.ok(h.every((c, k) => !k || R.rank(h[k - 1]) <= R.rank(c)));
  }
  assert.equal(done.seats.reduce((n, x) => n + (x?.count || 0), 0), 52);
});

test('auto-organize: your hand is always shown low to high, aces last, suits in a fixed order', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  rig(s.table(v.code), { 0: ['As', 'Kd', '2h', 'Tc', '2c', '9s'], 1: ['4c', 'Td'], 2: ['3h', '5h'] }, [0, 1, 2]);
  assert.deepEqual(s.view(P.a, v.code).round.hand, ['2c', '2h', '9s', 'Tc', 'Kd', 'As']);
});

test('the clock: miss your turn and your bug plays your HIGHEST card for you (and passes when nothing is legal)', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', '2c', 'Kd'], 1: ['4c', 'Td'], 2: ['3h', '5h'] }, [0, 1, 2]); s.clock(t);
  clock.t += 31_000; s.tick();
  assert.deepEqual(t.round.pile.cards, ['Kd'], 'leading: the bug plays Ann’s highest single');
  const e = t.log.findLast((x) => x.ev?.k === 'play');
  assert.deepEqual(e.ev.bug, { name: 'a stray bug', generic: true }, 'no hatched bug: a stray one covers');
  assert.match(e.text, /missed their turn; a stray bug plays their highest/);
  clock.t += 31_000; s.tick();
  const p = t.log.findLast((x) => x.ev?.k === 'pass');
  assert.equal(p.ev.seat, 1); assert.ok(p.ev.bug, 'Bob had nothing over a K: his bug passes');
  const v2 = s.view(P.c, v.code);
  assert.ok(v2.log.some((x) => x.ev?.bug), 'bug plays are in the log everyone replays');
});

test('a hatched Barn bug is named when it covers your turn', () => {
  const barn = { view: (id) => (id === 'a' ? { pen: { stage: 'creature', species: 'beetle', name: 'Gus', speciesName: 'Beetle', level: 2 } } : { pen: null }) };
  const { s, P, clock } = svc({ barn });
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', '9d', 'As'], 1: ['4c', 'Td'], 2: ['3h', '5h'] }, [0, 1, 2]); s.clock(t);
  clock.t += 31_000; s.tick();
  const e = t.log.findLast((x) => x.ev?.k === 'play');
  assert.deepEqual(e.ev.cards, ['As']); assert.equal(e.ev.bug.name, 'Gus'); assert.equal(e.ev.bug.species, 'beetle');
  assert.match(e.text, /their bug Gus plays their highest: an ace/);
});

test('the clock settles the exchange: best cards go over, the King gives his lowest, then he leads', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['3h'], 1: ['Kh', '2c'], 2: ['5d', '7d'] }, [0, 1, 2]); s.clock(t);
  s.play(P.a, v.code, ['3h']); s.play(P.b, v.code, ['Kh']); s.pass(P.c, v.code); s.pass(P.b, v.code); s.play(P.b, v.code, ['2c']);
  assert.equal(t.round.phase, 'exchange');
  assert.deepEqual(t.lastRound.finish.map((x) => x.title), ['king', 'commoner', 'scum']);
  const best = t.round.hands[2].slice().sort((x, y) => 'x23456789TJQKA'.indexOf(x[0]) - 'x23456789TJQKA'.indexOf(y[0])).slice(-2);
  clock.t += 31_000; s.tick();
  assert.ok(best.every((c) => t.round.hands[0].includes(c)), 'Scum’s best went to the King');
  clock.t += 31_000; s.tick();
  assert.equal(t.round.phase, 'play'); assert.equal(t.round.turn, 0);
  assert.equal(Object.values(t.round.hands).flat().length, 52);
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
  s.pass(P.c, v.code); s.play(P.c, v.code, ['3h']);
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
  assert.equal(s.list(P.b)[0].turnLabel, 'Joining next round');
  assert.equal(s.list(P.b)[0].myTurn, false);
});

test('lobby summaries include only memberships and public turn details through game end', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { name: 'Porch', settings: { bots: 0 } });
  let row = s.list(P.a)[0];
  assert.equal(row.isHost, true); assert.equal(row.seated, true);
  assert.equal(row.turnLabel, 'Not dealt'); assert.equal(row.deadline, null); assert.equal(row.actorName, null);
  assert.deepEqual(s.list(P.d), []);
  s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', '2c'], 1: ['Tc', '4d'], 2: ['3h', 'Jh'] }, [0, 1, 2]); s.clock(t);
  row = s.list(P.a)[0];
  assert.equal(row.turnLabel, 'Your turn'); assert.equal(row.myTurn, true);
  assert.equal(row.actorName, 'Ann'); assert.equal(row.deadline, t.round.deadline);
  assert.equal(row.round, 1); assert.equal(row.players, 3); assert.equal(row.maxSeats, 6);
  const bob = s.list(P.b)[0];
  assert.equal(bob.isHost, false); assert.equal(bob.seated, true); assert.equal(bob.myTurn, false);
  assert.equal(bob.actorName, 'Ann'); assert.equal(bob.deadline, t.round.deadline);
  assert.doesNotMatch(JSON.stringify(bob), /9h|2c|Tc|4d|3h|Jh|hands|deck|log/);
  t.round.finished.push(1);
  assert.equal(s.list(P.b)[0].turnLabel, 'Finished this round');
  t.seats[1].broke = true;
  assert.equal(s.list(P.b)[0].turnLabel, 'Sitting out');
  t.hold = { order: [0, 1, 2], titles: null }; t.round = null;
  assert.equal(s.list(P.a)[0].turnLabel, 'Waiting on the Acid Mines');
  assert.equal(s.list(P.a)[0].round, 1); assert.equal(s.list(P.a)[0].deadline, null);
  s.endGame(t, 'Test complete');
  assert.equal(s.list(P.a)[0].turnLabel, 'Over'); assert.equal(s.list(P.a)[0].myTurn, false);
  assert.equal(s.list(P.a)[0].actorName, null);
  t.seats[1].left = true;
  assert.deepEqual(s.list(P.b), []);
  s.close(P.a, v.code);
  assert.deepEqual(s.list(P.a), []);
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
  const ann = (await call(null, 'POST', '/auth/dev', { name: 'Ann', email: 'ann@x.test' })).cookie;
  const bob = (await call(null, 'POST', '/auth/dev', { name: 'Bob', email: 'bob@x.test' })).cookie;
  const c = await call(ann, 'POST', '/api/scum/tables', { name: 'Saloon', settings: { bots: 1 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const j = await call(bob, 'POST', `/api/scum/tables/${c.body.code}/join`); assert.equal(j.status, 200, JSON.stringify(j.body));
  const st = await call(ann, 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(st.status, 200, JSON.stringify(st.body)); assert.equal(st.body.status, 'playing');
  const lst = await call(bob, 'GET', '/api/scum');
  assert.equal(lst.body.tables[0].code, c.body.code); assert.ok(lst.body.limits.turnSecs.includes(86400));
  assert.equal(lst.body.tables[0].seated, true); assert.equal(lst.body.tables[0].isHost, false);
  assert.equal(typeof lst.body.tables[0].actorName, 'string');
  assert.equal(typeof lst.body.tables[0].deadline, 'number');
  const bad = await call(bob, 'POST', `/api/scum/tables/${c.body.code}/play`, { cards: ['Zz'] });
  assert.equal(bad.status, 409);
  assert.equal((await call(ann, 'GET', '/api/scum/tables/NOPE99')).status, 404);
  assert.ok(fs.existsSync(path.join(dir, 'scum.json')));
});

test('play on: the view and log say who can keep playing; their pass clears the pile; the bug clears on a timeout', () => {
  const { s, P, clock } = svc();
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['9h', 'Jc', '2c'], 1: ['4c', '4d'], 2: ['3h', '5h'] }, [0, 1, 2]); s.clock(t);
  s.play(P.a, v.code, ['9h']); s.pass(P.b, v.code); const after = s.pass(P.c, v.code);
  assert.equal(after.round.turn, 0); assert.deepEqual(after.round.pile.cards, ['9h']);
  const ann = s.view(P.a, v.code); assert.equal(ann.round.playOn, true); assert.equal(ann.round.myTurn, true); assert.equal(ann.round.leading, false);
  assert.match(t.log.findLast((e) => e.ev?.k === 'playon').text, /Ann can keep playing on it or pass to clear/);
  s.play(P.a, v.code, ['Jc']); s.pass(P.b, v.code); s.pass(P.c, v.code);
  clock.t += 31_000; s.tick(); // Ann's clock runs out while playing on: her bug passes, the pile clears
  const p = t.log.findLast((e) => e.ev?.k === 'pass'); assert.equal(p.ev.own, true); assert.ok(p.ev.bug); assert.match(p.text, /passes and clears the pile/);
  assert.equal(t.round.pile, null); assert.equal(t.round.turn, 0, 'she leads fresh');
  assert.equal(s.view(P.b, v.code).round.playOn, false);
  // Others only ever see counts, never cards.
  const bob = s.view(P.b, v.code);
  assert.equal(bob.seats[0].count, 1); assert.ok(!JSON.stringify(bob.seats).includes('2c'));
  assert.ok(!('hands' in bob.round));
});

test('skip then pass: the skipped player still gets the live pile; if they pass, the skipper leads', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0, turnSec: 30 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  // Cat is already out: two left. Ann plays a 7, Bob matches (skips Ann), Bob passes, Ann may still play.
  rig(t, { 0: ['7h', '9c', '2c'], 1: ['7c', '3d', '8s'], 2: [] }, [0, 1, 2]);
  t.round.finished = [2];
  s.play(P.a, v.code, ['7h']);
  const sk = s.play(P.b, v.code, ['7c']);
  assert.equal(sk.round.playOn, true); assert.equal(sk.round.turn, 1); assert.equal(sk.seats[0].skipped, true);
  const after = s.pass(P.b, v.code);
  assert.equal(after.round.pile.cards[0], '7c', 'pile stays live');
  assert.equal(after.round.turn, 0); assert.equal(after.round.playOn, false);
  assert.equal(after.round.myTurn, false, "Bob's view: not his turn");
  assert.equal(after.seats[1].passed, true); assert.equal(after.seats[0].passed, false);
  assert.deepEqual(after.round.passed, [1]);
  assert.match(t.log.findLast((e) => e.ev?.k === 'stillin').text, /Ann was skipped, not passed/);
  const ann = s.view(P.a, v.code);
  assert.equal(ann.round.myTurn, true); assert.equal(ann.seats[0].turn, true);
  s.pass(P.a, v.code);
  assert.equal(t.round.pile, null); assert.equal(t.round.turn, 1, 'Bob played last, so Bob leads');
});

test('HTTP: create with no bots opens a lobby, friends join by code, host deals at 3', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-scum-nobots-'));
  const { app, shutdown } = createApp({ dataDir: dir, devLogin: true, env: { SCUM_TICK_MS: '0', SCUM_BOT_MS: '0', BJ_TICK_MS: '0' } });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const ann = (await call(null, 'POST', '/auth/dev', { name: 'Ann', email: 'ann0@x.test' })).cookie;
  const bob = (await call(null, 'POST', '/auth/dev', { name: 'Bob', email: 'bob0@x.test' })).cookie;
  const cat = (await call(null, 'POST', '/auth/dev', { name: 'Cat', email: 'cat0@x.test' })).cookie;
  const c = await call(ann, 'POST', '/api/scum/tables', { name: "Ann's scum table", settings: { bots: 0, maxSeats: 6, turnSec: 86400 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.status, 'lobby');
  assert.equal(c.body.bots, 0);
  assert.match(c.body.code, /^[A-Z2-9]{6}$/);
  assert.equal(c.body.seats.filter(Boolean).length, 1);
  assert.equal(c.body.isHost, true);
  const early = await call(ann, 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(early.status, 409);
  assert.match(early.body.error || early.body.message || JSON.stringify(early.body), /needs 3 players/i);
  const j1 = await call(bob, 'POST', `/api/scum/tables/${c.body.code}/join`);
  assert.equal(j1.status, 200, JSON.stringify(j1.body));
  const still = await call(ann, 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(still.status, 409);
  const j2 = await call(cat, 'POST', `/api/scum/tables/${c.body.code}/join`);
  assert.equal(j2.status, 200, JSON.stringify(j2.body));
  assert.equal(j2.body.seats.filter(Boolean).length, 3);
  const st = await call(ann, 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(st.status, 200, JSON.stringify(st.body));
  assert.equal(st.body.status, 'playing');
  assert.equal(st.body.seats.filter((s) => s && s.bot).length, 0);
});

test('HTTP: a 5-human table with no bots deals when the host hits Deal (regression: Z5G38Q)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-scum-five-'));
  const { app, shutdown } = createApp({ dataDir: dir, devLogin: true, env: { SCUM_TICK_MS: '0', SCUM_BOT_MS: '0', BJ_TICK_MS: '0' } });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const names = ['Tyler', 'Joe', 'Geoffrey', 'Keetch', 'Gunnar'];
  const cookies = [];
  for (const [i, n] of names.entries()) cookies.push((await call(null, 'POST', '/auth/dev', { name: n, email: `five${i}@x.test` })).cookie);
  const c = await call(cookies[0], 'POST', '/api/scum/tables', { name: "Tyler's scum table", settings: { bots: 0, maxSeats: 6, turnSec: 86400 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.bots, 0);
  for (const ck of cookies.slice(1)) assert.equal((await call(ck, 'POST', `/api/scum/tables/${c.body.code}/join`)).status, 200);
  const lobby = await call(cookies[0], 'GET', `/api/scum/tables/${c.body.code}`);
  assert.equal(lobby.body.status, 'lobby');
  assert.equal(lobby.body.seats.filter(Boolean).length, 5);
  const st = await call(cookies[0], 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.equal(st.status, 200, JSON.stringify(st.body));
  assert.equal(st.body.status, 'playing');
  assert.equal(st.body.seats.filter((s) => s && s.bot).length, 0);
  assert.equal(st.body.round.order.length, 5);
  assert.equal(st.body.seats.reduce((n, x) => n + (x?.count || 0), 0), 52, 'all 52 cards dealt across 5 players');
  // A non-host can't deal, and gets a readable reason rather than nothing.
  const again = await call(cookies[1], 'POST', `/api/scum/tables/${c.body.code}/start`);
  assert.ok(again.status >= 400 && typeof again.body?.error === 'string' && again.body.error.length > 0);
});
