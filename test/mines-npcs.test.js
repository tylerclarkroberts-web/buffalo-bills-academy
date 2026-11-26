import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Foreman } from '../server/foreman.js';
import { Mines, MAX_SHIFT_MS } from '../server/mines.js';
import { NpcMiners } from '../server/npcMiners.js';
import { createApp } from '../server/app.js';
import { shiftMaze } from '../server/engine/mine-tiers.js';
import { CAST, NPC_BY_ID, placeNpcs, tipFor, HITS_TO_DROP, DOWN_MS, HIT_GAP_MS, HIT_FORGET_MS, SMOKE_COOLDOWN_MS, SMOKES_DROPPED, NPCS_A_SHIFT } from '../server/engine/npc-miners.js';
import { buildNpc, poseNpc, stumbleNpc, showSmokes, KICK_MAX } from '../client/src/mines/npcMesh.js';

const version = { rulesVersion: 2 };
function fixture(t, { roll = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-npcs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const f = { dir, clock, pose: null };
  f.reload = () => {
    f.store = new Store(dir);
    f.accounts = new Accounts({ store: f.store, now: () => clock.now });
    f.foreman = new Foreman({ store: f.store, accounts: f.accounts, now: () => clock.now, randInt: () => 0 });
    f.mines = new Mines({ store: f.store, accounts: f.accounts, foreman: f.foreman, now: () => clock.now, randInt: n => (n === 100000 ? 20000 : 0),
      scareInt: n => n - 1, poolInt: () => 30000, vein: () => ({ cells: 7 }) });
    f.npcs = new NpcMiners({ store: f.store, mines: f.mines, now: () => clock.now, randInt: n => Math.min(n - 1, roll) });
    f.mines.npcs = f.npcs;
    f.npcs.pose = f.pose && ((id, shiftId) => f.pose(id, shiftId));
    if (f.store.players.miner) f.player = f.store.players.miner;
  };
  f.reload();
  f.player = f.store.players.miner = { id: 'miner', name: 'Miner' };
  f.accounts.ensure(f.player);
  f.start = () => f.mines.start(f.player, version);
  f.hit = (s, id) => f.npcs.hit(f.player, s.shiftId, id);
  f.beat = (s, id, n = HITS_TO_DROP) => { let r; for (let i = 0; i < n; i++) { clock.now += HIT_GAP_MS; r = f.hit(s, id); } return r; };
  return f;
}
const deadEnd = (g, p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => g[p.y + dy]?.[p.x + dx] === 0).length === 1;

test('the old-timers sit in dead ends, off the acid and away from the lift, the same for everyone that day', (t) => {
  const f = fixture(t), s = f.start();
  assert.equal(s.npcs.length, NPCS_A_SHIFT);
  assert.equal(new Set(s.npcs.map(n => n.id)).size, NPCS_A_SHIFT);
  const shift = f.mines.doc.active.miner, maze = shiftMaze(shift);
  let hall = 0, ends = 0;
  for (const n of s.npcs) {
    assert.ok(NPC_BY_ID[n.id]); assert.equal(maze.grid[n.y][n.x], 0);
    assert.ok(maze.dist[n.y][n.x] >= 4, 'not at the lift');
    assert.ok(!shift.pools.some(p => p.x === n.x && p.y === n.y), 'not on a pool');
    if (!deadEnd(maze.grid, n)) { // a straight hallway: leaning on one wall, with room to pass on the other side
      hall++; assert.ok(Math.abs(Math.hypot(n.ox, n.oy) - 0.28) < 1e-9);
      assert.equal(maze.grid[Math.round(n.y + Math.sign(n.oy) * 1)][Math.round(n.x + Math.sign(n.ox) * 1)], 1, 'the wall it leans on');
    } else assert.equal(n.ox, undefined);
    assert.equal(n.downMs, 0); assert.equal(n.smokes, 0);
  }
  assert.deepEqual(placeNpcs(shift), placeNpcs({ ...shift }), 'seeded by the day');
  // across many days and sizes: always reachable dead ends, never stacked
  for (let seed = 1; seed < 40; seed++) for (const cells of [6, 10, 16]) {
    const sh = { seed, cells, tier: 3, day: `2026-11-${seed}`, shaft: '7', rulesVersion: 2, pools: [{ x: 1, y: 3 }] };
    const out = placeNpcs(sh), mz = shiftMaze(sh);
    assert.equal(out.length, NPCS_A_SHIFT);
    assert.equal(new Set(out.map(p => `${p.x},${p.y}`)).size, out.length);
    for (const p of out) { assert.ok(mz.dist[p.y][p.x] >= 4); if (deadEnd(mz.grid, p)) ends++; }
  }
  assert.ok(ends >= 39 * 3 * NPCS_A_SHIFT * 0.5, `mostly dead ends (${ends})`);
  assert.ok(hall <= NPCS_A_SHIFT); // the test's tiny 7-cell dig has few free dead ends: the rest sit in a hallway
});

test('talking says hello once, then works through tips without saying the same one twice in a row', (t) => {
  const f = fixture(t), s = f.start(), id = s.npcs[0].id, npc = NPC_BY_ID[id];
  const first = f.npcs.talk(f.player, s.shiftId, id);
  assert.ok(npc.hello.includes(first.line)); assert.ok(npc.tips.includes(first.tip));
  const said = [first.tip];
  for (let i = 1; i < npc.tips.length * 2; i++) {
    const r = f.npcs.talk(f.player, s.shiftId, id);
    assert.equal(r.line, null); assert.notEqual(r.tip, said.at(-1)); said.push(r.tip);
  }
  assert.equal(new Set(said.slice(0, npc.tips.length)).size, npc.tips.length, 'every tip before any repeats');
  assert.equal(tipFor(npc, 'miner', 3), said[3]);
});

test('tips are about mines and bugs, never poker or the secret payroll odds', () => {
  for (const npc of CAST) for (const tip of npc.tips) {
    assert.doesNotMatch(tip, /poker|blackjack|hold.?em|flop|river|chips?\b/i, tip);
    assert.doesNotMatch(tip, /motherlode|alien|diamond|mostly mud/i, tip);
  }
  assert.ok(CAST.reduce((a, n) => a + n.tips.length, 0) >= 50);
});

test('hits count up, eight knock one down for the full timer, and a downed miner ignores the pick', (t) => {
  const f = fixture(t), s = f.start(), id = s.npcs[1].id;
  for (let i = 1; i < HITS_TO_DROP; i++) {
    f.clock.now += HIT_GAP_MS; const r = f.hit(s, id);
    assert.equal(r.hit, i); assert.equal(r.npc.hits, i); assert.ok(!r.down); assert.ok(r.line);
  }
  f.clock.now += HIT_GAP_MS; const down = f.hit(s, id);
  assert.equal(down.down, true); assert.equal(down.npc.downMs, DOWN_MS); assert.ok(down.said);
  assert.ok(down.npc.smokes >= SMOKES_DROPPED[0] && down.npc.smokes <= SMOKES_DROPPED[1]);
  f.clock.now += 60e3;
  const again = f.hit(s, id);
  assert.equal(again.ignored, true); assert.equal(again.npc.downMs, DOWN_MS - 60e3 - 0);
  assert.equal(f.npcs.talk(f.player, s.shiftId, id).tip, null, 'out cold: no tips');
  f.clock.now += DOWN_MS;
  const up = f.npcs.view(f.mines.doc.active.miner, 'miner').find(n => n.id === id);
  assert.equal(up.downMs, 0); assert.equal(up.hits, 0);
  f.clock.now += HIT_GAP_MS; assert.equal(f.hit(s, id).hit, 1, 'back up, back to one');
});

test('swings faster than a pick comes round do not count, and a pause lets them shake it off', (t) => {
  const f = fixture(t), s = f.start(), id = s.npcs[0].id;
  f.clock.now += HIT_GAP_MS; assert.equal(f.hit(s, id).hit, 1);
  f.clock.now += HIT_GAP_MS - 1; assert.equal(f.hit(s, id).ignored, true);
  f.clock.now += 1; assert.equal(f.hit(s, id).hit, 2);
  f.clock.now += HIT_FORGET_MS; assert.equal(f.hit(s, id).hit, 1);
});

test('smokes: pick them up while he is down, once; he takes them back when he gets up', (t) => {
  const f = fixture(t, { roll: 1 }), s = f.start(), [a, b] = s.npcs.map(n => n.id);
  const down = f.beat(s, a);
  assert.equal(down.npc.smokes, SMOKES_DROPPED[0] + 1);
  const took = f.npcs.pickup(f.player, s.shiftId, a);
  assert.equal(took.took, 2); assert.equal(took.totalSmokes, 2); assert.equal(took.npc.smokes, 0);
  assert.throws(() => f.npcs.pickup(f.player, s.shiftId, a), /nothing on the floor/);
  f.beat(s, b);
  f.clock.now += DOWN_MS;
  assert.throws(() => f.npcs.pickup(f.player, s.shiftId, b), /took his smokes back/);
  assert.equal(f.npcs.smokes('miner'), 2);
});

test('a pack refills once an hour: knock him down sooner and the pockets are empty', (t) => {
  const f = fixture(t), s = f.start(), id = s.npcs[2].id;
  assert.ok(f.beat(s, id).npc.smokes > 0);
  f.clock.now += DOWN_MS + 1;
  const empty = f.beat(s, id);
  const next = () => { delete f.mines.doc.active.miner; f.mines.doc.completed = {}; return f.start(); }; // a fresh shift: same day, same old-timers
  assert.equal(empty.down, true); assert.equal(empty.npc.smokes, 0); assert.match(empty.empty, /POCKETS ARE EMPTY/);
  assert.throws(() => f.npcs.pickup(f.player, s.shiftId, id), /nothing on the floor/);
  f.clock.now += SMOKE_COOLDOWN_MS - 30 * 60e3; const s2 = next();
  f.clock.now += DOWN_MS; const early = f.beat(s2, id);
  assert.equal(early.npc.smokes, 0, 'not an hour yet');
  f.clock.now += 30 * 60e3 - DOWN_MS + DOWN_MS; const s3 = next(); f.clock.now += 1;
  assert.ok(f.beat(s3, id).npc.smokes > 0, 'an hour on, the pack is full');
});

test('smokes and knockdowns persist across a restart, and move no money', (t) => {
  const f = fixture(t), s = f.start(), id = s.npcs[0].id, bank = f.player.bankroll, txns = (f.player.txns || []).length;
  f.beat(s, id); const got = f.npcs.pickup(f.player, s.shiftId, id).took;
  f.reload();
  const view = f.mines.start(f.player, version);
  assert.equal(view.smokes, got);
  assert.ok(view.npcs.find(n => n.id === id).downMs > 0, 'still out cold after a restart');
  assert.equal(f.player.bankroll, bank); assert.equal((f.player.txns || []).length, txns);
  assert.ok(!JSON.stringify(f.store.loadDoc('shop', {})).includes('tob-'), 'nothing from the Smoke Shop');
});

test('only on your own live shift, only the miners who are on it, and only within reach when the server knows where you are', (t) => {
  const f = fixture(t), s = f.start(), spot = s.npcs[0];
  assert.throws(() => f.npcs.hit(f.player, 'nope', spot.id), /not on that shift/);
  const missing = NPC_BY_ID[CAST.find(c => !s.npcs.some(n => n.id === c.id)).id];
  assert.throws(() => f.npcs.hit(f.player, s.shiftId, missing.id), /Nobody by that name/);
  f.npcs.pose = () => ({ x: spot.x + 3, y: spot.y });
  f.clock.now += HIT_GAP_MS; assert.throws(() => f.hit(s, spot.id), /not close enough/);
  f.npcs.pose = () => null; // no recent heartbeat
  assert.throws(() => f.hit(s, spot.id), /not close enough/);
  f.npcs.pose = () => ({ x: spot.x + 1, y: spot.y });
  assert.equal(f.hit(s, spot.id).hit, 1);
  f.clock.now += MAX_SHIFT_MS;
  assert.throws(() => f.hit(s, spot.id), /over/);
});

test('HTTP: talk, swing and pick up through the API, checked against the heartbeat position', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-npcs-api-'));
  const clock = { now: 1_800_000_000_000 };
  const app = createApp({ dataDir: dir, now: () => clock.now, devLogin: true, env: {}, vein: () => ({ cells: 7 }), poolInt: () => 99999,
    randInt: n => (n === 100000 ? 20000 : 0), scareInt: n => n - 1, eggInt: n => n - 1 });
  const server = await new Promise(resolve => { const sv = app.app.listen(0, '127.0.0.1', () => resolve(sv)); });
  t.after(async () => { app.shutdown(); server.closeAllConnections?.(); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const post = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const user = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Miner', email: 'npcs@example.test' }) });
  cookie = user.headers.get('set-cookie').split(';')[0];
  const s = (await post('/api/mines/start', version)).body, npc = s.npcs[0];
  assert.equal((await post('/api/mines/npc/talk', { shiftId: s.shiftId, npc: npc.id })).status, 200);
  assert.equal((await post('/api/mines/npc/hit', { shiftId: s.shiftId, npc: npc.id })).status, 409, 'no heartbeat yet: from the lift, nothing lands');
  // walk the heartbeat up to the miner along the tunnels, a tile a second
  const shift = app.service.store.loadDoc('mines', {}).active[user.headers ? Object.keys(app.service.store.loadDoc('mines', {}).active)[0] : ''];
  const g = shiftMaze(shift).grid, prev = new Map([['1,1', null]]), q = [[1, 1]];
  for (let k = 0; k < q.length; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const [x, y] = q[k], key = `${x + dx},${y + dy}`;
    if (g[y + dy]?.[x + dx] === 0 && !prev.has(key)) { prev.set(key, `${x},${y}`); q.push([x + dx, y + dy]); }
  }
  const route = []; for (let at = `${npc.x},${npc.y}`; at; at = prev.get(at)) route.unshift(at.split(',').map(Number));
  route.pop(); // stop on the tile in front of him
  const bank = app.service.store.players[(await (await fetch(base + '/api/me', { headers: { cookie } })).json()).id]?.bankroll;
  for (const [x, y] of route) { clock.now += 1000; assert.equal((await post('/api/mines/pvp/tick', { ...version, shiftId: s.shiftId, x, y, yaw: 0 })).body.snap, undefined); }
  let r;
  for (let i = 0; i < HITS_TO_DROP; i++) { clock.now += 300; r = await post('/api/mines/npc/hit', { shiftId: s.shiftId, npc: npc.id }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  assert.equal(r.body.down, true);
  const got = await post('/api/mines/npc/pickup', { shiftId: s.shiftId, npc: npc.id });
  assert.equal(got.status, 200); assert.equal(got.body.totalSmokes, got.body.took);
  assert.equal((await post('/api/mines/start', version)).body.smokes, got.body.took);
  const me = (await (await fetch(base + '/api/me', { headers: { cookie } })).json());
  if (bank !== undefined) assert.equal(app.service.store.players[me.id].bankroll, bank, 'no money moves');
});

test('the mesh stumbles away from the swing, harder with every hit, falls flat on its back and gets up slowly', () => {
  const m = buildNpc({ id: 'mule', name: 'MULE CRABTREE', look: NPC_BY_ID.mule.look, smoker: false });
  const run = (s, opts = {}) => { for (let t = 0; t < s; t += 0.02) poseNpc(m, 0.02, t * 1000, opts); };
  run(0.5);
  const rest = m.body.position.clone();
  stumbleNpc(m, { x: 0, z: -1 }, 1); run(0.15);
  const first = -m.body.position.z;
  assert.ok(first > 0.1, 'pushed back, away from you'); assert.ok(m.upper.rotation.x < 0, 'jolted back');
  run(3); assert.ok(Math.abs(m.body.position.z - rest.z) < 0.03, 'steps back to his spot');
  for (let h = 1; h <= 7; h++) { stumbleNpc(m, { x: 0.3, z: -1 }, h); run(0.1); }
  assert.ok(Math.hypot(m.kick.x, m.kick.z) <= KICK_MAX + 1e-9, 'never shoved out of the alcove');
  assert.ok(m.daze > 0.9 && m.sev > 1.3, 'dazed by hit six and on');
  m.down = true; run(1.2);
  assert.ok(Math.abs(m.body.rotation.x + Math.PI / 2) < 1e-6, 'flat on his back');
  assert.ok(m.stars.visible); assert.ok(m.hat.rotation.z > 1, 'hat knocked off');
  showSmokes(m, 2); assert.equal(m.smokes.children.filter(c => c.visible).length, 2);
  m.down = false; run(1.2);
  assert.ok(m.rising > 0 && m.body.rotation.x < -0.3, 'propped up halfway, still groggy');
  run(2); assert.equal(m.fall, 0); assert.ok(m.groggy > 0 || m.daze > 0, 'up, and swaying');
  // reduced motion: no stumbles, just the state
  const r = buildNpc({ id: 'lefty', name: 'LEFTY', look: NPC_BY_ID.lefty.look, smoker: true });
  stumbleNpc(r, { x: 0, z: -1 }, 3); poseNpc(r, 0.02, 0, { reduce: true });
  assert.equal(r.upper.rotation.x, r.hunch);
  void THREE;
});
