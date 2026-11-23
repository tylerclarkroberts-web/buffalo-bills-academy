// SCUM speech bubbles: one short message per seated player, shown until their next turn begins; server-enforced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Scum } from '../server/scum/index.js';

function svc(extra = {}) {
  const clock = { t: 1_800_000_000_000 };
  const docs = {}; const players = { a: { id: 'a', name: 'Ann' }, b: { id: 'b', name: 'Bob' }, c: { id: 'c', name: 'Cat' }, d: { id: 'd', name: 'Dee' } };
  const store = { loadDoc: (n, d) => (docs[n] ||= d), saveDoc: (n, d) => { docs[n] = JSON.parse(JSON.stringify(d)); } };
  let k = 42; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
  const s = new Scum({ store, getPlayer: (id) => players[id], now: () => clock.t, rng, tickMs: 0, botMs: 1000, ...extra });
  return { s, clock, docs, P: players };
}
function rig(t, hands, order, turn = order[0]) {
  Object.assign(t.round, { phase: 'play', order, hands, pile: null, owner: null, turn, finished: [], gone: [], exchange: null, passed: [], playOn: false, skipped: null });
}
const sayOf = (v, id) => v.seats.find((s) => s && s.id === id)?.say;

test('set, edit and clear your own bubble; everyone (even spectators) sees it', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code);
  s.say(P.b, v.code, '  nice   hand,\n Ann  ');
  assert.deepEqual(sayOf(s.view(P.a, v.code), 'b'), { text: 'nice hand, Ann', at: 1_800_000_000_000 });
  s.say(P.b, v.code, 'actually, not that nice');
  assert.deepEqual(sayOf(s.view(P.a, v.code), 'b'), { text: 'actually, not that nice', at: 1_800_000_000_000 });
  s.say(P.b, v.code, '   ');
  assert.equal(sayOf(s.view(P.a, v.code), 'b'), null);
  assert.equal(sayOf(s.view(P.a, v.code), 'a'), null);
  const ev = s.view(P.c, v.code); // Cat is not seated: still a spectator view
  assert.equal(sayOf(s.view(P.a, v.code), 'b'), null);
  assert.ok(ev);
});

test("a bubble stays through other turns and clears when its owner's next turn starts", () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['3h', 'Kd'], 1: ['4c', 'Qd'], 2: ['5d', 'Jd'] }, [0, 1, 2], 0);
  s.say(P.a, v.code, 'I am going first');
  s.say(P.c, v.code, 'bring it');
  assert.equal(sayOf(s.view(P.b, v.code), 'a').text, 'I am going first');
  s.play(P.a, v.code, ['3h']);
  assert.equal(sayOf(s.view(P.b, v.code), 'a').text, 'I am going first', 'stays after acting');
  assert.equal(s.view(P.a, v.code).round.turn, 1);
  s.play(P.b, v.code, ['4c']);
  assert.equal(s.view(P.a, v.code).round.turn, 2);
  assert.equal(sayOf(s.view(P.b, v.code), 'c'), null, "Cat's turn started: Cat's bubble cleared");
  assert.equal(sayOf(s.view(P.b, v.code), 'a').text, 'I am going first', "Ann's still showing during Cat's turn");
  s.play(P.c, v.code, ['5d']);
  assert.equal(s.view(P.a, v.code).round.turn, 0);
  assert.equal(sayOf(s.view(P.b, v.code), 'a'), null, "Ann's next turn began: cleared");
});

test('only seated players, only their own seat; length limit; HTML and control characters stripped', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code);
  assert.throws(() => s.say(P.c, v.code, 'hi'), (e) => e.status === 403);
  assert.throws(() => s.say(P.a, v.code, 'x'.repeat(81)), /80 characters/);
  s.say(P.a, v.code, 'x'.repeat(80));
  assert.equal(sayOf(s.view(P.b, v.code), 'a').text.length, 80);
  s.say(P.a, v.code, '🂡'.repeat(80));
  s.say(P.a, v.code, '<img src=x onerror=alert(1)>hi <script>alert(2)</script> <b>there</b>');
  const txt = sayOf(s.view(P.b, v.code), 'a').text;
  assert.equal(/[<>]/.test(txt), false);
  assert.equal(txt, 'hi alert(2) there');
  s.say(P.a, v.code, 'a\u0000b\u202ec\u200bd <<x');
  assert.equal(sayOf(s.view(P.b, v.code), 'a').text, 'a b c d x');
  s.leave(P.a, v.code);
  assert.throws(() => s.say(P.a, v.code, 'hi'), (e) => e.status === 403);
});

test('leaving mid-game clears your bubble; a deal starting a turn clears the leader\'s', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code);
  s.say(P.b, v.code, 'lobby chat');
  assert.equal(sayOf(s.view(P.a, v.code), 'b').text, 'lobby chat');
  s.start(P.a, v.code);
  const after = s.view(P.a, v.code);
  const leader = after.round.turn;
  const leaderId = after.seats[leader].id;
  // whoever leads had their bubble cleared when the first turn began
  if (leaderId === 'b') assert.equal(sayOf(after, 'b'), null);
  else assert.equal(sayOf(after, 'b')?.text, 'lobby chat');
  s.say(P.c, v.code, 'later');
  s.leave(P.c, v.code);
  const gone = s.view(P.a, v.code).seats.find((x) => x && x.name === 'Cat');
  assert.ok(!gone || gone.left);
  if (gone) assert.equal(gone.say, null);
});

test('over HTTP: seated only, sign-in required, rate limited to 10 a minute, others see it', { timeout: 20000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-say-'));
  let clock = 1_800_000_000_000;
  const { app, shutdown } = createApp({ dataDir, devLogin: true, now: () => clock, env: { SCUM_TICK_MS: '0', SCUM_BOT_MS: '0', BJ_TICK_MS: '0' } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const call = async (cookie, method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  const ann = (await call(null, 'POST', '/auth/dev', { name: 'Ann', email: 'ann-say@x.test' })).cookie;
  const bob = (await call(null, 'POST', '/auth/dev', { name: 'Bob', email: 'bob-say@x.test' })).cookie;
  const eve = (await call(null, 'POST', '/auth/dev', { name: 'Eve', email: 'eve-say@x.test' })).cookie;
  const c = await call(ann, 'POST', '/api/scum/tables', { name: 'Chat', settings: { bots: 0 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const code = c.body.code;
  await call(bob, 'POST', `/api/scum/tables/${code}/join`);
  assert.equal((await call(null, 'POST', `/api/scum/tables/${code}/say`, { text: 'hi' })).status, 401);
  assert.equal((await call(eve, 'POST', `/api/scum/tables/${code}/say`, { text: 'hi' })).status, 403, 'spectator cannot post');
  assert.equal((await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: 'y'.repeat(81) })).status, 400);
  const r = await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: '<b>howdy</b> folks' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const bobSeat = r.body.seats.find((s) => s && s.name === 'Bob');
  assert.equal(bobSeat.say.text, 'howdy folks');
  const seen = await call(eve, 'GET', `/api/scum/tables/${code}`);
  const evSeat = seen.body.seats.find((s) => s && s.name === 'Bob');
  assert.equal(evSeat.say.text, 'howdy folks', 'spectators see bubbles');
  assert.equal((await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: { evil: 1 } })).body.seats.find((s) => s && s.name === 'Bob').say, null, 'non-string clears');
  for (let i = 0; i < 8; i++) assert.equal((await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: `n${i}` })).status, 200);
  const limited = await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: 'one too many' });
  assert.equal(limited.status, 429);
  assert.equal((await call(ann, 'POST', `/api/scum/tables/${code}/say`, { text: 'mine still works' })).status, 200, 'limit is per player');
  clock += 61000;
  assert.equal((await call(bob, 'POST', `/api/scum/tables/${code}/say`, { text: 'back again' })).status, 200, 'limit resets after a minute');
});
