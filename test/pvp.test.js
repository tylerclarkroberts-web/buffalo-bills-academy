// The shared daily mine: presence, ambushes, bug battles and the spoils. Everything is decided on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp, PVP } from '../server/pvp.js';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { sees, behind, touching, lineOfSight, bearing, onTunnel, TOUCH_TILES, SIGHT_TILES } from '../server/engine/pvp-geometry.js';
import { createApp } from '../server/app.js';

const V = { rulesVersion: 2 };
const EAST = -Math.PI / 2, WEST = Math.PI / 2; // facing +x / -x in tile coordinates

test('geometry: view cone, line of sight through tunnels only, touch range, and what "behind" means', () => {
  const grid = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  const a = { x: 1, y: 1, yaw: EAST };
  assert.ok(sees(grid, a, { x: 4, y: 1 }));
  assert.ok(!sees(grid, { ...a, yaw: WEST }, { x: 4, y: 1 }), 'facing away');
  assert.ok(!sees(grid, a, { x: 1, y: 3 }), 'behind rock');
  assert.ok(!lineOfSight(grid, { x: 1, y: 1 }, { x: 1, y: 3 }));
  assert.ok(!sees(grid, { x: 1, y: 1, yaw: EAST }, { x: 1 + SIGHT_TILES + 0.5, y: 1 }), 'too far');
  assert.ok(Math.abs(bearing(a, { x: 3, y: 1 })) < 1e-9);
  assert.ok(Math.abs(bearing(a, { x: 0, y: 1 }) - Math.PI) < 1e-9);
  const victim = { x: 3, y: 1, yaw: EAST };
  assert.ok(behind(victim, { x: 2.4, y: 1 }));
  assert.ok(!behind(victim, { x: 3.6, y: 1 }));
  assert.ok(touching(victim, { x: 3 - TOUCH_TILES, y: 1 }));
  assert.ok(!touching(victim, { x: 3 - TOUCH_TILES - 0.01, y: 1 }));
  assert.ok(onTunnel(grid, { x: 1.3, y: 1.2 })); assert.ok(!onTunnel(grid, { x: 1, y: 2 }));
});

function fixture(t, { rand = (n) => Math.floor(n / 2) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pvp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-12T19:00:00Z') };
  const f = { dir, clock, rand };
  const now = () => clock.now;
  f.boot = () => {
    f.store = new Store(dir);
    f.accounts = new Accounts({ store: f.store, now });
    f.barn = new Barn({ store: f.store, accounts: f.accounts, now });
    f.shop = new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now });
    f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000 });
    f.mines.owned = (id) => f.shop.doc.inv[id]?.own;
    f.pvp = new Pvp({ store: f.store, accounts: f.accounts, mines: f.mines, shop: f.shop, barn: f.barn, avatars: null, now, randInt: (n) => f.rand(n) });
  };
  f.boot();
  f.player = (id, extra = {}) => {
    const p = f.store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3, ...extra };
    f.accounts.ensure(p); p.mining.shifts = 10; f.store.savePlayers();
    return p;
  };
  f.ann = f.player('ann'); f.bob = f.player('bob');
  f.clockIn = (p) => f.mines.start(p, V);
  f.tick = (p, s, pos, extra = {}) => f.pvp.tick(p, { ...V, shiftId: s.shiftId, ...pos, ...extra });
  // A straight east-west corridor at least 3 tiles from the elevator: somewhere to meet.
  f.spot = (s) => {
    const m = makeMaze(s.seed, s.cells, FIRST_POOL_STEPS[s.cells]), g = m.grid;
    for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 2; x++) {
      if (!g[y][x] && !g[y][x + 1] && Math.hypot(x - 1, y - 1) > 4) return { x, y, grid: g };
    }
    throw new Error('no corridor');
  };
  // Both clocked in, past the grace period, standing in the corridor: ann behind bob, both facing east.
  f.setup = ({ bobFacing = EAST, gap = 0.6 } = {}) => {
    const a = f.clockIn(f.ann), b = f.clockIn(f.bob);
    f.tick(f.ann, a, { x: 1, y: 1, yaw: 0, fresh: true }); f.tick(f.bob, b, { x: 1, y: 1, yaw: 0, fresh: true });
    clock.now += 60000;
    const at = f.spot(a);
    f.tick(f.bob, b, { x: at.x + gap, y: at.y, yaw: bobFacing });
    const view = f.tick(f.ann, a, { x: at.x, y: at.y, yaw: EAST });
    return { a, b, at, view };
  };
  f.collect = (p, s, units) => { // put acid in a miner's bucket directly (the bucket rules are tested elsewhere)
    const cur = f.mines.doc.active[p.id]; f.mines.commit(p.id, { ...cur, collected: units * 1000 });
  };
  return f;
}

test('everyone on shift today shares the tunnels and sees each other; a different day is a different mine', (t) => {
  const f = fixture(t);
  const { view } = f.setup();
  assert.equal(view.others.length, 1);
  assert.equal(view.others[0].id, 'bob'); assert.equal(view.others[0].name, 'BOB');
  assert.equal(view.shield, null);
  // A stale miner (no report for a while) drops out of view.
  f.clock.now += PVP.staleMs + 1;
  const a2 = f.mines.doc.active.ann;
  assert.equal(f.tick(f.ann, { shiftId: a2.id }, { x: f.pvp.presence.get('ann').x, y: f.pvp.presence.get('ann').y, yaw: EAST }).others.length, 0);
});

test('positions are checked: no walking through rock, no teleporting, but a reload restarts at the elevator', (t) => {
  const f = fixture(t);
  const a = f.clockIn(f.ann);
  f.tick(f.ann, a, { x: 1, y: 1, yaw: 0, fresh: true });
  const at = f.spot(a);
  const jump = f.tick(f.ann, a, { x: at.x, y: at.y, yaw: 0 }); // far, immediately
  assert.deepEqual(jump.snap, { x: 1, y: 1 });
  f.clock.now += 250;
  const wall = at.grid.findIndex((row) => row[0] === 1);
  const rock = f.tick(f.ann, a, { x: 0, y: wall, yaw: 0 });
  assert.ok(rock.snap);
  f.clock.now += 60000;
  assert.equal(f.tick(f.ann, a, { x: at.x, y: at.y, yaw: 0 }).snap, undefined);
  assert.equal(f.tick(f.ann, a, { x: 1, y: 1, yaw: 0, fresh: true }).snap, undefined, 'back at the elevator after a reload');
});

test('an ambush from behind: victim\'s shift ends, attacker takes all their acid and $20-$100, logged on both sides', (t) => {
  const f = fixture(t, { rand: (n) => (n === 81 ? 43 : 0) }); // $20 + 43 = $63
  const { a, b, view } = f.setup();
  f.collect(f.bob, b, 30); f.collect(f.ann, a, 10);
  assert.deepEqual(view.ambush, { id: 'bob', name: 'BOB' });
  const annBefore = f.ann.bankroll, bobBefore = f.bob.bankroll;
  const r = f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' });
  assert.equal(r.raid.won, true); assert.equal(r.raid.cash, 63); assert.equal(r.raid.acid, 30); assert.equal(r.raid.gained, 30);
  assert.equal(r.collected, 40, 'the stolen acid is in the attacker\'s bucket');
  assert.equal(f.ann.bankroll, annBefore + 63); assert.equal(f.bob.bankroll, bobBefore - 63);
  assert.deepEqual(f.ann.txns.at(-1), { t: f.clock.now, type: 'pvp', amount: 63, note: 'Acid Mines: ambushed BOB', balance: f.ann.bankroll });
  assert.deepEqual(f.bob.txns.at(-1), { t: f.clock.now, type: 'pvp', amount: -63, note: 'Acid Mines: ambushed by ANN', balance: f.bob.bankroll });
  // Saved to disk together.
  const disk = JSON.parse(fs.readFileSync(path.join(f.dir, 'players.json'), 'utf8'));
  assert.equal(disk.ann.bankroll, f.ann.bankroll); assert.equal(disk.bob.bankroll, f.bob.bankroll);
  assert.ok(disk.ann.pvp.raids.includes(r.raid.id) && disk.bob.pvp.raids.includes(r.raid.id));
  // Bob's shift is over: his next report gets the receipt, and so does clocking in again (once).
  assert.equal(f.mines.doc.active.bob, undefined);
  const told = f.tick(f.bob, b, { x: 3, y: 1, yaw: 0 });
  assert.equal(told.ended, true); assert.equal(told.result.outcome, 'ambushed');
  assert.equal(told.result.amount, 0); assert.equal(told.result.pvp.cash, 63); assert.equal(told.result.pvp.by, 'ANN');
  assert.equal(f.mines.start(f.bob, V).result.outcome, 'ambushed');
  assert.ok(f.mines.start(f.bob, { ...V, afterShiftId: b.shiftId }).shiftId, 'then a fresh shift');
  assert.equal(f.bob.mining.shifts, 10, 'an ambush is not a finished shift');
});

test('cash is clamped to what the victim has (never below zero); stolen acid is capped by the attacker\'s bucket', (t) => {
  const f = fixture(t, { rand: (n) => n - 1 }); // roll $100
  const { a, b } = f.setup();
  f.accounts.change(f.bob, 35 - f.bob.bankroll, 'dev', 'set');
  f.collect(f.bob, b, 70); f.collect(f.ann, a, 50);
  const r = f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' });
  assert.equal(r.raid.cash, 35); assert.equal(f.bob.bankroll, 0);
  assert.equal(r.raid.gained, 50); assert.equal(r.raid.spilled, 20);
  assert.ok(r.result, 'a full bucket ends the attacker\'s shift and pays as usual');
  assert.equal(r.result.collected, 100);
  // A broke victim loses acid but no money, and nothing goes negative.
  const g = fixture(t, { rand: (n) => n - 1 });
  const s = g.setup();
  g.accounts.change(g.bob, -g.bob.bankroll, 'dev', 'broke');
  const z = g.pvp.ambush(g.ann, { shiftId: s.a.shiftId, target: 'bob' });
  assert.equal(z.raid.cash, 0); assert.equal(g.bob.bankroll, 0);
  assert.ok(!g.bob.txns.some((x) => x.type === 'pvp'), 'no zero-dollar ledger lines');
});

test('no ambush when the victim has seen you, is facing you, is shielded, or you are the victim', (t) => {
  const f = fixture(t);
  const { a } = f.setup({ bobFacing: WEST }); // bob looking straight at ann: that is a battle, not an ambush
  assert.throws(() => f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' }), /Too late/);
  assert.throws(() => f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'ann' }), /yourself/);
  // Bob looked back a moment ago and turned away again: he knows ann is there, so closing in is a battle, not an ambush.
  const meet = (wait) => {
    const g = fixture(t);
    const s = g.setup({ bobFacing: WEST, gap: 2 }); // they see each other from two tiles apart
    g.clock.now += 250; g.tick(g.bob, s.b, { x: s.at.x + 2, y: s.at.y, yaw: EAST }); // bob turns his back
    g.clock.now += wait; g.tick(g.bob, s.b, { x: s.at.x + 2, y: s.at.y, yaw: EAST });
    g.clock.now += 1000; return g.tick(g.ann, s.a, { x: s.at.x + 1.4, y: s.at.y, yaw: EAST });
  };
  const soon = meet(500);
  assert.equal(soon.ambush, null); assert.ok(soon.battle, 'he saw her a second ago: bugs out');
  const later = meet(PVP.awareMs + 500);
  assert.deepEqual(later.ambush, { id: 'bob', name: 'BOB' }, 'after a few seconds he forgets she was there');
  assert.equal(later.battle, undefined);
});

test('greenhorns, guests and the elevator landing are off limits (both ways)', (t) => {
  const f = fixture(t);
  f.bob.mining.shifts = 1;
  const { a, view } = f.setup();
  assert.equal(view.ambush, null); assert.equal(view.others[0].shield, 'greenhorn');
  assert.throws(() => f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' }), /Too late/);
  const g = fixture(t);
  g.bob.createdAt = g.clock.now - 3600e3; // an hour-old account (an alt)
  assert.equal(g.setup().view.others[0].shield, 'greenhorn');
  const h = fixture(t);
  h.bob.kind = 'guest'; delete h.bob.login;
  assert.equal(h.setup().view.others[0].shield, 'greenhorn');
  // Fresh off the elevator: protected for the grace period even away from the landing.
  const e = fixture(t);
  const a2 = e.clockIn(e.ann), b2 = e.clockIn(e.bob);
  e.tick(e.ann, a2, { x: 1, y: 1, yaw: 0, fresh: true }); e.tick(e.bob, b2, { x: 1, y: 1, yaw: 0, fresh: true });
  const v = e.tick(e.ann, a2, { x: 1, y: 1, yaw: 0 });
  assert.equal(v.shield, 'elevator'); assert.equal(v.others[0].shield, 'elevator');
});

test('the same two miners can only rob each other once every two hours; three cash losses a day at most', (t) => {
  const f = fixture(t);
  const { a } = f.setup();
  f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' });
  const b2 = f.clockIn(f.bob); f.mines.start(f.bob, { ...V, afterShiftId: f.mines.doc.completed.bob.shiftId });
  const b3 = f.mines.doc.active.bob;
  f.tick(f.bob, { shiftId: b3.id }, { x: 1, y: 1, yaw: 0, fresh: true });
  f.clock.now += 60000;
  const at = f.spot(a);
  f.tick(f.bob, { shiftId: b3.id }, { x: at.x + 0.6, y: at.y, yaw: EAST });
  const v = f.tick(f.ann, a, { x: at.x, y: at.y, yaw: EAST });
  assert.equal(v.ambush, null); assert.equal(v.others[0].cooling, true);
  assert.ok(b2);
  // Cash cap: a victim who has already lost money three times today still loses acid, but no more cash.
  const g = fixture(t);
  g.pvp.doc.losses.bob = { day: '2026-11-12', n: PVP.maxCashLossesPerDay };
  const s = g.setup(); g.collect(g.bob, s.b, 20);
  const before = g.bob.bankroll;
  const r = g.pvp.ambush(g.ann, { shiftId: s.a.shiftId, target: 'bob' });
  assert.equal(r.raid.cash, 0); assert.equal(r.raid.cashCapped, true); assert.equal(r.raid.acid, 20);
  assert.equal(g.bob.bankroll, before);
});

test('face to face and touching: a bug battle starts; mining waits; turns resolve on the server', (t) => {
  const f = fixture(t);
  f.barn.doc.pens.ann = { stage: 'creature', species: 'manticora', name: 'Manticora I', xp: 40 * 16, bornAt: f.clock.now, fedAt: f.clock.now, stats: { hunger: { v: 80, at: f.clock.now }, mood: { v: 80, at: f.clock.now }, clean: { v: 80, at: f.clock.now } }, cool: {} };
  const { a, b, at, view } = f.setup({ bobFacing: WEST });
  assert.ok(view.battle, 'the battle starts on the report that closes the gap');
  const id = view.battle.id;
  assert.equal(view.battle.you.name, 'Manticora I'); assert.equal(view.battle.you.level, 5); assert.equal(view.battle.you.moves.length, 4);
  assert.equal(view.battle.foe.name, 'Gerald (on loan)', 'a miner with no bug borrows the Foreman\'s'); assert.equal(view.battle.foe.moves, undefined);
  assert.throws(() => f.mines.extract(f.ann, a.shiftId, { ...V, action: 'start', poolId: 'p0' }), /./);
  // Frozen in place while fighting.
  f.clock.now += 250; f.tick(f.ann, a, { x: at.x - 0.8, y: at.y, yaw: EAST });
  assert.equal(f.pvp.presence.get('ann').x, at.x);
  assert.throws(() => f.pvp.move(f.ann, { battleId: id, move: 9 }), /does not know/);
  f.pvp.move(f.ann, { battleId: id, move: 0 });
  assert.throws(() => f.pvp.move(f.ann, { battleId: id, move: 1 }), /already/);
  const r = f.pvp.move(f.bob, { battleId: id, move: 0 });
  assert.equal(r.battle.turns.length, 1); assert.equal(r.battle.turn, 2);
  assert.ok(r.battle.turns[0].events.some((e) => /USED/.test(e.s)));
  assert.ok(b);
});

test('the battle winner takes acid, $20-$100 and every tobacco product; duplicates get smoked', (t) => {
  const f = fixture(t, { rand: (n) => (n === 81 ? 10 : 0) });
  f.shop.inv('bob').own = { 'tob-cigar': 1, 'tob-rollie': 1, 'hat-cowboy': 1 };
  f.shop.inv('ann').own = { 'tob-rollie': 1 };
  const { a, b, view } = f.setup({ bobFacing: WEST });
  f.collect(f.bob, b, 25);
  const battle = f.pvp.battles.get(view.battle.id);
  battle.state.sides[battle.a === 'ann' ? 'b' : 'a'].hp = 1; // bob's bug is on its last legs
  const before = { ann: f.ann.bankroll, bob: f.bob.bankroll };
  f.pvp.move(f.ann, { battleId: battle.id, move: 0 });
  const end = f.pvp.move(f.bob, { battleId: battle.id, move: 0 });
  assert.equal(end.battle.over.won, false);
  const raid = end.battle.over.raid;
  assert.equal(raid.cash, 30); assert.equal(raid.acid, 25);
  assert.deepEqual(raid.tobacco, ['Big Cigar']); assert.deepEqual(raid.smoked, ['Hand-Rolled Cigarette']);
  assert.deepEqual(f.shop.doc.inv.bob.own, { 'hat-cowboy': 1 }, 'only the tobacco goes');
  assert.deepEqual(f.shop.doc.inv.ann.own, { 'tob-rollie': 1, 'tob-cigar': 1 });
  assert.equal(f.ann.bankroll, before.ann + 30); assert.equal(f.bob.bankroll, before.bob - 30);
  assert.equal(f.mines.doc.active.ann.collected, 25000);
  assert.equal(f.mines.doc.completed.bob.result.outcome, 'defeated');
  assert.deepEqual(f.mines.doc.completed.bob.result.pvp.tobacco.sort(), ['Big Cigar', 'Hand-Rolled Cigarette']);
  const bobSees = f.tick(f.bob, b, { x: 1, y: 1, yaw: 0 });
  assert.equal(bobSees.battle.over.won, false); assert.equal(bobSees.result.outcome, 'defeated');
  const annSees = f.tick(f.ann, a, { x: f.pvp.presence.get('ann').x, y: f.pvp.presence.get('ann').y, yaw: EAST });
  assert.equal(annSees.battle.over.won, true); assert.equal(annSees.notice.won, true);
  assert.equal(annSees.shift.collected, 25);
});

test('turn timer: a side that does not choose gets a random legal move; a disconnect forfeits', (t) => {
  const f = fixture(t);
  const { a, b, view } = f.setup({ bobFacing: WEST });
  const id = view.battle.id;
  f.pvp.move(f.ann, { battleId: id, move: 0 });
  f.clock.now += PVP.introMs; f.tick(f.bob, b, { x: 0, y: 0, yaw: 0 }); f.tick(f.ann, a, { x: 0, y: 0, yaw: 0 }); // the first turn's clock also covers the intro (v75)
  f.clock.now += PVP.turnMs / 2; f.tick(f.bob, b, { x: 0, y: 0, yaw: 0 }); f.tick(f.ann, a, { x: 0, y: 0, yaw: 0 }); // both still here...
  f.clock.now += PVP.turnMs / 2 + 1; f.tick(f.bob, b, { x: 0, y: 0, yaw: 0 }); // ...and bob never picks: the timer does
  assert.equal(f.pvp.battles.get(id).state.turn, 2);
  // Bob stops reporting: after the disconnect window he forfeits and loses the spoils.
  for (let i = 0; i < 4; i++) { f.clock.now += 5000; f.tick(f.ann, a, { x: 0, y: 0, yaw: 0 }); }
  const battle = f.pvp.battles.get(id);
  assert.equal(battle.over.reason, 'disconnect');
  assert.equal(battle.over.winner, battle.a === 'ann' ? 'a' : 'b');
  assert.equal(f.mines.doc.active.bob, undefined);
});

test('clocking out mid-battle is a forfeit', (t) => {
  const f = fixture(t);
  const { b, view } = f.setup({ bobFacing: WEST });
  const out = f.pvp.forfeit('bob');
  assert.equal(out.over.reason, 'forfeit');
  const r = f.mines.quit(f.bob, b.shiftId, V);
  assert.equal(r.result.outcome, 'defeated');
  assert.ok(view);
});

test('a crash in the middle of a raid finishes on restart without paying twice', (t) => {
  const f = fixture(t, { rand: (n) => (n === 81 ? 30 : 0) });
  const { a, b } = f.setup();
  f.collect(f.bob, b, 40);
  // Crash right after the money moved: the raid record is on disk without its last steps.
  const realShop = f.pvp.shop; let crashed = false;
  f.pvp.save = function save() { this.store.saveDoc('pvp', this.doc); if (this.doc.raids && Object.values(this.doc.raids).some((r) => r.steps.money && !r.steps.shop) && !crashed) { crashed = true; throw new Error('power cut'); } };
  assert.throws(() => f.pvp.ambush(f.ann, { shiftId: a.shiftId, target: 'bob' }), /power cut/);
  assert.ok(realShop);
  const annMoney = f.ann.bankroll, bobMoney = f.bob.bankroll;
  f.boot(); // restart: everything reloads from disk and recover() runs
  const raid = Object.values(f.pvp.doc.raids)[0];
  assert.equal(raid.done, true);
  assert.equal(f.store.players.ann.bankroll, annMoney); assert.equal(f.store.players.bob.bankroll, bobMoney);
  assert.equal(f.store.players.ann.bankroll - 1000, 50); // paid once: $20 + 30
  assert.equal(f.mines.doc.active.ann.collected, 40000);
  // Replaying the whole raid again changes nothing.
  raid.steps = {}; raid.done = false; f.pvp.apply(raid);
  assert.equal(f.store.players.ann.bankroll, annMoney); assert.equal(f.mines.doc.active.ann.collected, 40000);
});

test('HTTP: tick, ambush and move are signed-in only and validate their input', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pvp-http-'));
  const { app, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = await new Promise((res) => { const x = app.listen(0, () => res(x)); });
  const root = `http://127.0.0.1:${server.address().port}`, base = `${root}/api`;
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/mines/pvp/tick`, { method: 'POST' })).status, 401);
  const login = await fetch(root + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann@x.test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const s = (await post('/mines/start', V)).body;
  const tick = await post('/mines/pvp/tick', { ...V, shiftId: s.shiftId, x: 1, y: 1, yaw: 0, fresh: true });
  assert.equal(tick.status, 200); assert.deepEqual(tick.body.others, []); assert.equal(tick.body.shield, 'greenhorn');
  assert.equal((await post('/mines/pvp/tick', { shiftId: s.shiftId })).body.code, 'mine_reload');
  assert.equal((await post('/mines/pvp/ambush', { shiftId: s.shiftId, target: 'nobody' })).status, 409);
  assert.equal((await post('/mines/pvp/move', { battleId: 'x', move: 0 })).status, 409);
  assert.equal((await post('/mines/pvp/forfeit', {})).body.battle, null);
});
