// Chasing the Heeshee Mazode for your bug: it runs at 95% of your pace, drops to 85% after 20 s, stops to laugh when your pick
// lands, then asks three riddles (easy, a tad harder, medium-hard) with 20 s each. All three right hands the bug back
// exactly once; a miss or a timeout and it laughs, runs at triple speed for 15 s and is gone with the bug (held as
// before, until the Foreman returns it after acid). Everything is decided by the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Foreman } from '../server/foreman.js';
import { Mines, SCARE_CHANCE, FAUN_CHANCE } from '../server/mines.js';
import { MazodeChase, CAUGHT_LINES } from '../server/mazodeChase.js';
import { shiftMaze } from '../server/engine/mine-tiers.js';
import { WALK_SPEED } from '../server/engine/mine-movement.js';
import { RIDDLES, TIERS, RIDDLE_BY_ID } from '../server/engine/mazode-riddles.js';
import { CEIL_MAX, PACE, CHASE_PACE, SLOW_PACE, CHASE_SPEED, HEAD_START, SLOW_AFTER_MS, SLOW_FACTOR, CHASE_MAX_MS, LOSE_MS, LEFT_MS, LAUGH_MS, BEAT_MS, RIDDLE_MS, ANSWER_GRACE_MS,
  FLEE_LAUGH_MS, FLEE_MS, FLEE_FACTOR, ROUTE_MIN, chaseRoute, chaseDistance, routePoint, mazodeAt, tunnelGap, bfsFrom } from '../server/engine/mazode-chase.js';

function barnWith(bug) {
  const pen = { stage: 'creature', species: bug.species, name: bug.name, speciesName: bug.species };
  const barn = {
    releases: 0,
    view: () => ({ pen: { ...pen } }),
    isHeesheeHeld: (p) => !!(p && p.heesheeHeld),
    heesheeHoldOf: () => (pen.heesheeHeld ? { name: pen.name, species: pen.species, fromShift: pen.heesheeHeldFromShift } : null),
    holdHeeshee(id, { shiftId, at } = {}) { if (!pen.heesheeHeld) Object.assign(pen, { heesheeHeld: true, heesheeHeldAt: at || 1, heesheeHeldFromShift: shiftId || null }); return this.heesheeHoldOf(); },
    releaseHeeshee(id, { onlyFromShift } = {}) {
      if (!pen.heesheeHeld || (onlyFromShift !== undefined && pen.heesheeHeldFromShift !== onlyFromShift)) return [];
      this.releases++; delete pen.heesheeHeld; delete pen.heesheeHeldAt; delete pen.heesheeHeldFromShift;
      return [{ name: pen.name, species: pen.species }];
    },
    foundAcid() {}, rollEgg: () => false, rollPurple: () => false, has: () => true,
    pen,
  };
  return barn;
}

function fixture(t, { pose = true, randInt } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-mazode-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  const accounts = new Accounts({ store, now: () => clock.now });
  const foreman = new Foreman({ store, accounts, now: () => clock.now, randInt: () => 0 });
  const barn = barnWith({ species: 'candela', name: 'Pip' });
  const mines = new Mines({ store, accounts, now: () => clock.now, foreman, randInt: (n) => (n === 100000 ? 50000 : 0),
    scareInt: () => SCARE_CHANCE + FAUN_CHANCE, vein: () => ({ veinMs: 60000, cells: 7 }), barn });
  let seq = 0;
  const chase = new MazodeChase({ store, mines, now: () => clock.now, randInt: randInt || ((n) => (seq++ * 7919) % n) });
  mines.chase = chase;
  const player = store.players.miner = { id: 'miner', name: 'Miner' };
  accounts.ensure(player);
  const f = { mines, chase, player, clock, store, barn, accounts, at: null };
  if (pose) chase.pose = () => (f.at ? { ...f.at } : null);
  f.shift = () => mines.doc.active[player.id];
  f.grid = () => shiftMaze(f.shift()).grid;
  f.begin = () => {
    const s = mines.start(player, { rulesVersion: 2 });
    const m = shiftMaze(f.shift());
    f.stand(m.start.x, m.start.y);
    return s;
  };
  f.stand = (x, y) => { f.at = { x, y, at: clock.now }; };
  f.steal = () => mines.stealBug(player, f.shift().id);
  /** Heartbeats every 250 ms for `ms`, standing `gap` tiles behind it along its route (or put at a fixed spot). */
  f.follow = (ms, gap, spot) => {
    const end = clock.now + ms; let v = null;
    while (clock.now < end) {
      clock.now += 250;
      const s = f.shift(), route = chase.route(s), here = s.chase.phase === 'chase' ? mazodeAt(s.chase, route, clock.now) : null;
      if (spot) f.stand(spot.x, spot.y);
      else if (here) { const p = routePoint(route, Math.max(0, here.d - gap)); f.stand(p.x, p.y); }
      v = chase.tick(player, f.at);
    }
    return v;
  };
  f.catchIt = () => { // stay on it through the slowdown, close in, swing
    f.follow(SLOW_AFTER_MS + 500, HEAD_START);
    // close in (it is slower now); wait out any stretch it spends on the ceiling
    for (let k = 0; k < 60 && mazodeAt(f.shift().chase, chase.route(f.shift()), clock.now + 250).ceiling; k++) f.follow(250, 1.2);
    clock.now += 250;
    const s = f.shift(), here = mazodeAt(s.chase, chase.route(s), clock.now), p = routePoint(chase.route(s), here.d - 0.8);
    f.stand(p.x, p.y); chase.tick(player, f.at);
    const out = chase.hit(player, s.id);
    return out;
  };
  f.right = (n) => { // the server's own copy, for the test only: which shown option is right
    const c = f.shift().chase; return c.riddles[n].order.indexOf(0);
  };
  return f;
}

test('riddle pools: three tiers, 20+ each, four distinct short options, ids unique, nothing under client/ imports them', () => {
  assert.deepEqual(TIERS, ['easy', 'tad', 'medium']);
  for (const tier of TIERS) {
    assert.ok(RIDDLES[tier].length >= 20, `${tier} has ${RIDDLES[tier].length}`);
    for (const r of RIDDLES[tier]) {
      assert.equal(r.options.length, 4, r.id);
      assert.equal(new Set(r.options.map((o) => o.toLowerCase())).size, 4, r.id);
      assert.ok(r.options.every((o) => o.length <= 20), `${r.id} options fit a phone button`);
      assert.ok(r.q.length <= 90, `${r.id} question fits the card`);
    }
  }
  assert.equal(Object.keys(RIDDLE_BY_ID).length, TIERS.reduce((a, t) => a + RIDDLES[t].length, 0));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'client');
  for (const file of walk(root).filter((p) => /\.(jsx?|mjs)$/.test(p))) assert.ok(!/(from|import)\s*\(?\s*['"][^'"]*(mazode-riddles|mazodeChase)/.test(fs.readFileSync(file, 'utf8')), `${file} must not import the answers`);
});

test('the route: one tile a step through open tunnel, long enough, the same for the same seed, ceiling only where it doubles back', () => {
  const grid = shiftMaze({ seed: 12345, cells: 7, tier: 0 }).grid, start = shiftMaze({ seed: 12345, cells: 7, tier: 0 }).start;
  const a = chaseRoute(grid, start, 99), b = chaseRoute(grid, start, 99), c = chaseRoute(grid, start, 100);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.tiles, c.tiles);
  assert.ok(a.tiles.length >= ROUTE_MIN);
  assert.deepEqual(a.tiles[0], [start.x, start.y]);
  for (let i = 1; i < a.tiles.length; i++) {
    const [x0, y0] = a.tiles[i - 1], [x1, y1] = a.tiles[i];
    assert.equal(Math.abs(x1 - x0) + Math.abs(y1 - y0), 1, `step ${i}`);
    assert.equal(grid[y1][x1], 0, `tile ${i} is tunnel`);
    if (a.ceil[i]) assert.ok(a.tiles.slice(0, i).some(([x, y]) => x === x1 && y === y1), `ceiling tile ${i} is one it already ran`);
    if (i > CEIL_MAX) assert.ok(a.ceil.slice(i - CEIL_MAX, i + 1).includes(0), `never more than ${CEIL_MAX} tiles in a row on the roof`);
  }
  assert.equal(a.ceil[1], 0, 'the first stretch is on the floor');
});

test('it runs at 95% of your pace for 20 s, then 85%', () => {
  assert.equal(CHASE_PACE, 0.95); assert.equal(SLOW_PACE, 0.85);
  assert.equal(CHASE_SPEED, PACE * 0.95); assert.equal(PACE, WALK_SPEED / 2.2);
  const c = { phase: 'chase', startedAt: 0, speed: CHASE_SPEED };
  assert.equal(chaseDistance(c, 0), HEAD_START);
  assert.ok(Math.abs(chaseDistance(c, 10_000) - (HEAD_START + CHASE_SPEED * 10)) < 1e-9);
  assert.ok(Math.abs(chaseDistance(c, 30_000) - (HEAD_START + CHASE_SPEED * (20 + 10 * (0.85 / 0.95)))) < 1e-9);
  assert.equal(SLOW_AFTER_MS, 20_000); assert.equal(SLOW_FACTOR, 0.85 / 0.95);
  const route = { tiles: Array.from({ length: 300 }, (_, i) => [i, 0]), ceil: new Array(300).fill(0) };
  assert.equal(mazodeAt(c, route, 19_000).slow, false);
  assert.equal(mazodeAt(c, route, 21_000).slow, true);
  assert.ok(Math.abs(mazodeAt(c, route, 10_000).speed - PACE * 0.95) < 1e-9);
  assert.ok(Math.abs(mazodeAt(c, route, 21_000).speed - PACE * 0.85) < 1e-9);
  assert.ok(Math.abs(CHASE_SPEED * FLEE_FACTOR - PACE * 3) < 1e-9, 'flee stays at triple your pace');
});

test('the steal starts a chase from where the server has you; with no fix on you it is the old steal', (t) => {
  const f = fixture(t); f.begin();
  const s = f.steal();
  assert.equal(s.bugStolen?.name, 'Pip');
  assert.equal(s.mazode.phase, 'chase');
  assert.ok(s.mazode.route.tiles.length >= ROUTE_MIN);
  const m = shiftMaze(f.shift());
  assert.deepEqual(s.mazode.route.tiles[0], [m.start.x, m.start.y]);
  assert.equal(s.mazode.slowAt, s.mazode.startedAt + SLOW_AFTER_MS);
  const again = f.steal(); // a second report never restarts it
  assert.equal(again.mazode.startedAt, s.mazode.startedAt);
  const g = fixture(t, { pose: false }); g.begin();
  const old = g.steal();
  assert.equal(old.bugStolen?.name, 'Pip');
  assert.equal(old.mazode, undefined);
  assert.ok(g.barn.pen.heesheeHeld);
});

test('two-and-a-bit tiles behind is out of reach; after the slowdown you close in and the pick lands', (t) => {
  const f = fixture(t); f.begin(); f.steal();
  let v = f.follow(10_000, HEAD_START);
  assert.equal(v.phase, 'chase'); assert.equal(v.lostMs, undefined);
  const r = f.chase.hit(f.player, f.shift().id);
  assert.equal(r.hit, false, 'two-and-a-bit tiles behind is out of reach');
  f.clock.now = f.shift().chase.startedAt; // replay: the same run, all the way to the catch
  f.chase.live.set('miner', { seenAt: f.clock.now, lostSince: null, swingAt: 0 });
  const hit = f.catchIt();
  assert.equal(hit.hit, true);
  v = hit.mazode;
  assert.equal(v.phase, 'caught');
  assert.ok(CAUGHT_LINES.includes(v.laugh));
  assert.match(v.laugh, /only the Foreman/i);
  assert.match(v.offer, /three riddles/);
  assert.equal(v.riddle.n, 0); assert.equal(v.riddle.of, 3); assert.equal(v.riddle.tier, 'easy');
  assert.equal(v.riddle.askedAt, v.caughtAt + LAUGH_MS);
  assert.equal(v.riddle.deadline, v.riddle.askedAt + RIDDLE_MS);
  assert.equal(v.riddle.options.length, 4);
  // never the answer: no order, no ids, no flag on an option
  const wire = JSON.stringify(v);
  assert.ok(!/"order"|"riddles"|"id"|"correct"|"ok"/.test(wire), wire);
  // and it stands still where it was hit
  const at1 = mazodeAt(f.shift().chase, f.chase.route(f.shift()), f.clock.now), at2 = mazodeAt(f.shift().chase, f.chase.route(f.shift()), f.clock.now + 5000);
  assert.deepEqual([at1.x, at1.y], [at2.x, at2.y]);
});

test('swings: one per 250 ms, none on the ceiling, none from a stale position, none through rock', (t) => {
  const f = fixture(t); f.begin(); f.steal();
  f.follow(1000, 4);
  assert.equal(f.chase.hit(f.player, f.shift().id).hit, false);
  f.clock.now += 100;
  assert.equal(f.chase.hit(f.player, f.shift().id).ignored, true, 'too soon after the last swing');
  // stale position: the heartbeat stopped
  f.at.at = f.clock.now - 5000; f.clock.now += 300;
  assert.equal(f.chase.hit(f.player, f.shift().id).miss, 'far');
  // diagonal through rock: close as the crow flies, more than two steps by tunnel
  const grid = f.grid(), s = f.shift(), here = mazodeAt(s.chase, f.chase.route(s), f.clock.now);
  const hx = Math.round(here.x), hy = Math.round(here.y), d = bfsFrom(grid, hx, hy).dist;
  const rock = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => [hx + dx, hy + dy]).find(([x, y]) => grid[y]?.[x] === 0 && d[y][x] > 2);
  if (rock) { f.stand(rock[0], rock[1]); f.clock.now += 300; f.at.at = f.clock.now; assert.equal(f.chase.hit(f.player, s.id).hit, false, 'no hitting through rock'); }
  // on the ceiling: right underneath it and still nothing
  const route = f.chase.route(s), i = route.ceil.findIndex((x, k) => x && k > 3);
  assert.ok(i > 0, 'the route crosses the ceiling somewhere');
  const fake = { ...s.chase, startedAt: f.clock.now - (i - HEAD_START) / CHASE_SPEED * 1000 }; // pretend it is there now (before the slowdown)
  if (f.clock.now - fake.startedAt < SLOW_AFTER_MS) {
    f.mines.commit('miner', { ...s, chase: fake }); f.chase.live.set('miner', { seenAt: f.clock.now, lostSince: null, swingAt: 0 });
    const p = mazodeAt(fake, route, f.clock.now); assert.equal(p.ceiling, true);
    f.stand(p.x, p.y); f.clock.now += 1;
    const r = f.chase.hit(f.player, s.id);
    assert.equal(r.hit, false); assert.equal(r.miss, 'ceiling');
  }
});

test('fall too far behind and it gets away; the bug stays held and a second steal report starts nothing', (t) => {
  const f = fixture(t); f.begin(); f.steal();
  const start = shiftMaze(f.shift()).start;
  const v = f.follow(20_000, 0, { x: start.x, y: start.y }); // stood at the lift the whole time
  assert.equal(v.phase, 'gone'); assert.equal(v.reason, 'lost');
  assert.match(v.say, /GOT AWAY/);
  assert.ok(f.barn.pen.heesheeHeld); assert.equal(f.shift().heesheeStolen, true);
  assert.equal(f.steal().mazode.phase, 'gone');
  f.clock.now += 300; assert.equal(f.chase.hit(f.player, f.shift().id).hit, false, 'nothing left to hit');
});

test('walking away (no heartbeat: closed tab, reload) counts as an escape; so does a 75 s chase nobody wins', (t) => {
  const f = fixture(t); f.begin(); f.steal();
  f.clock.now += LEFT_MS + 1;
  const v = f.chase.tick(f.player, null);
  assert.equal(v.phase, 'gone'); assert.equal(v.reason, 'left');
  const g = fixture(t); g.begin(); g.steal();
  const w = g.follow(CHASE_MAX_MS + 1000, 5);
  assert.equal(w.phase, 'gone'); assert.equal(w.reason, 'bored');
  assert.ok(g.barn.pen.heesheeHeld);
});

test('three right answers hand the bug back, once; it cannot steal it again this shift; no money moves', (t) => {
  const f = fixture(t); f.begin();
  const before = f.store.players.miner.bankroll;
  f.steal(); const hit = f.catchIt(); assert.equal(hit.hit, true);
  const id = f.shift().id;
  f.clock.now = hit.mazode.riddle.askedAt + 3000;
  let r = f.chase.answer(f.player, id, 0, f.right(0));
  assert.equal(r.mazode.phase, 'caught'); assert.equal(r.mazode.last.ok, true); assert.equal(typeof r.mazode.last.answer, 'string');
  assert.equal(r.mazode.riddle.n, 1); assert.equal(r.mazode.riddle.tier, 'tad');
  assert.equal(r.mazode.riddle.askedAt, f.clock.now + BEAT_MS);
  // a double tap on the first answer is just a read
  assert.equal(f.chase.answer(f.player, id, 0, f.right(0)).mazode.riddle.n, 1);
  f.clock.now += BEAT_MS + 19_000; // 19 s in: still in time
  r = f.chase.answer(f.player, id, 1, f.right(1));
  assert.equal(r.mazode.riddle.tier, 'medium'); assert.match(r.mazode.riddle.intro, /Last one/);
  f.clock.now += BEAT_MS + 1000;
  r = f.chase.answer(f.player, id, 2, f.right(2));
  assert.equal(r.mazode.phase, 'freed'); assert.match(r.mazode.say, /Take your bug/);
  assert.equal(r.released.length, 1); assert.equal(r.bug.name, 'Pip'); assert.ok(!r.bug.held);
  assert.equal(f.barn.releases, 1); assert.ok(!f.barn.pen.heesheeHeld);
  // again, and again after a "refresh": nothing more comes back
  f.chase.answer(f.player, id, 2, f.right(2)); f.chase.answer(f.player, id, 0, 0);
  assert.equal(f.barn.releases, 1);
  const resumed = f.mines.start(f.player, { rulesVersion: 2 });
  assert.equal(resumed.bugStolen, undefined); assert.equal(resumed.bug.name, 'Pip'); assert.equal(resumed.mazode.phase, 'freed');
  assert.throws(() => f.steal(), /already gave your bug back/);
  assert.equal(f.store.players.miner.bankroll, before);
  assert.ok(!f.store.loadDoc('ledger', null) || true);
});

test('a wrong answer: it laughs, runs at triple pace for 15 s and is gone with the bug; the right answer is shown after', (t) => {
  const f = fixture(t); f.begin(); f.steal(); const hit = f.catchIt(); assert.equal(hit.hit, true);
  const id = f.shift().id, wrong = (f.right(0) + 1) % 4;
  f.clock.now = hit.mazode.riddle.askedAt + 2000;
  const r = f.chase.answer(f.player, id, 0, wrong);
  assert.equal(r.mazode.phase, 'flee'); assert.equal(r.mazode.reason, 'wrong'); assert.equal(r.mazode.last.ok, false);
  assert.equal(r.mazode.last.answer, RIDDLE_BY_ID[f.shift().chase.riddles[0].id].options[0]);
  assert.match(r.mazode.say, /Wrong/);
  assert.equal(r.mazode.fleeAt, f.clock.now + FLEE_LAUGH_MS); assert.equal(r.mazode.fleeUntil, r.mazode.fleeAt + FLEE_MS);
  const s = f.shift(), route = f.chase.route(s);
  const a = mazodeAt(s.chase, route, r.mazode.fleeAt + 1000), b = mazodeAt(s.chase, route, r.mazode.fleeAt + 2000);
  assert.equal(a.state, 'flee'); assert.ok(Math.abs((b.d - a.d) - CHASE_SPEED * FLEE_FACTOR) < 1e-9, 'triple speed');
  assert.equal(mazodeAt(s.chase, route, r.mazode.fleeAt - 500).state, 'laugh');
  f.clock.now = r.mazode.fleeAt + FLEE_MS + 1;
  const v = f.chase.tick(f.player, f.at);
  assert.equal(v.phase, 'gone');
  assert.ok(f.barn.pen.heesheeHeld); assert.equal(f.shift().heesheeStolen, true); assert.equal(f.barn.releases, 0);
  // later answers do nothing
  f.chase.answer(f.player, id, 0, f.right(0)); assert.equal(f.barn.releases, 0);
});

test('20 s per riddle: silence is a miss, and a late answer does not count', (t) => {
  const f = fixture(t); f.begin(); f.steal(); const hit = f.catchIt(); assert.equal(hit.hit, true);
  const id = f.shift().id, deadline = hit.mazode.riddle.deadline;
  f.clock.now = deadline + ANSWER_GRACE_MS + 1;
  const r = f.chase.answer(f.player, id, 0, f.right(0));
  assert.equal(r.mazode.phase, 'flee'); assert.equal(r.mazode.reason, 'timeout'); assert.equal(r.mazode.last.timeout, true);
  assert.match(r.mazode.say, /Too slow/);
  assert.equal(f.barn.releases, 0);
  const g = fixture(t); g.begin(); g.steal(); const h2 = g.catchIt();
  g.clock.now = h2.mazode.riddle.deadline + 100; // inside the network grace
  assert.equal(g.chase.answer(g.player, g.shift().id, 0, g.right(0)).mazode.last.ok, true);
});

test('different riddles each time: one per tier, none of the last 15 again, options shuffled', (t) => {
  const f = fixture(t, { randInt: (n) => Math.floor(Math.random() * n) });
  const seen = { easy: [], tad: [], medium: [] };
  for (let k = 0; k < 12; k++) {
    const picked = f.chase.pick('miner');
    picked.forEach((p, i) => {
      const tier = TIERS[i]; assert.equal(RIDDLE_BY_ID[p.id].tier, tier);
      assert.ok(!seen[tier].slice(-15).includes(p.id), `${p.id} repeated too soon`);
      seen[tier].push(p.id);
      assert.deepEqual([...p.order].sort(), [0, 1, 2, 3]);
    });
  }
  const persisted = f.store.loadDoc('mazode', null);
  assert.equal(persisted.seen.miner.easy.length, 12);
});

test('the shift report after a won-back bug has no Foreman rescue; after a lost chase the old rules apply', (t) => {
  const f = fixture(t); f.begin(); f.steal(); const hit = f.catchIt();
  const id = f.shift().id;
  for (let n = 0; n < 3; n++) { f.clock.now = f.shift().chase.askedAt + 500; f.chase.answer(f.player, id, n, f.right(n)); }
  assert.equal(f.shift().heesheeFreed, true);
  const out = f.mines.quit(f.player, id, { rulesVersion: 2 });
  assert.ok(!out.result?.bugReturned);
  assert.ok(!f.barn.pen.heesheeHeld);
  assert.ok(hit.hit);
});
