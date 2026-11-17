// The company picnic behind the last door in the Hall of Doors: the shared map, the server's scorekeeping, and the door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND, ROCKS, SPAWNS, INTERN_RING, GUNS, PICKUPS, PICKUP_REACH, heightAt, solid, walk, shoot } from '../server/engine/picnic-map.js';
import { Picnic, PICNIC, INTERN, damage } from '../server/picnic.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HALL_DOORS } from '../client/src/mines/doorHall.js';
import { createApp } from '../server/app.js';

const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z)); // facing is (-sin yaw, -cos yaw)
const RIVET = GUNS.rivet.everyMs; // waiting this long between reports always clears the server's fire-rate check

test('the map: spawns and Gary\'s lap are clear of boulders, and nobody walks into rock or out of the quarry', () => {
  for (const s of SPAWNS) { assert.deepEqual(walk(s.x, s.z), s); assert.ok(!solid(s.x, heightAt(s.x, s.z) + 1, s.z)); }
  for (let a = 0; a < 6.3; a += 0.1) { const x = Math.cos(a) * INTERN_RING, z = Math.sin(a) * INTERN_RING; assert.deepEqual(walk(x, z), { x, z }); }
  const k = ROCKS[0], pushed = walk(k.x + 0.1, k.z);
  assert.ok(Math.hypot(pushed.x - k.x, pushed.z - k.z) >= k.r * 0.9 + GROUND.body - 1e-9);
  const edge = walk(500, 0); assert.ok(Math.abs(Math.hypot(edge.x, edge.z) - GROUND.radius) < 1e-9);
  assert.ok(heightAt(GROUND.radius + 3, 0) > 6, 'the benches stand over anyone at the edge');
  assert.equal(heightAt(0, 0), 0, 'level ground for the tables');
});

test('a shot hits the nearest miner in the open and stops at a boulder', () => {
  const eye = { x: 0, y: GROUND.eye, z: 0 }, ahead = { x: 0, y: 0, z: -1 };
  const near = { id: 'near', x: 0, y: 0, z: -4 }, far = { id: 'far', x: 0, y: 0, z: -5.5 };
  assert.equal(shoot(eye, ahead, [far, near]).id, 'near');
  assert.equal(shoot(eye, ahead, [{ ...near, x: 1 }]).id, null, 'a miss ends somewhere down range');
  assert.equal(shoot(eye, { x: 0, y: 1, z: 0 }, [near]).id, null, 'straight up');
  // someone standing right behind a boulder, on the line from the middle of the quarry through it
  const k = ROCKS[0], d = Math.hypot(k.x, k.z), dir = { x: k.x / d, y: 0, z: k.z / d };
  const hiding = { id: 'hiding', x: dir.x * (d + k.r + 1), y: heightAt(dir.x * (d + k.r + 1), dir.z * (d + k.r + 1)), z: dir.z * (d + k.r + 1) };
  const from = { x: 0, y: hiding.y + 1, z: 0 };
  const stopped = shoot(from, dir, [hiding]);
  assert.equal(stopped.id, null); assert.ok(Math.hypot(stopped.x, stopped.z) < d, 'the rivet is in the rock');
});

function setup() {
  let now = 1_000_000, pick = 0;
  const players = { a: { id: 'a', name: 'Ann' }, b: { id: 'b', name: 'Bo' } };
  const picnic = new Picnic({ store: { players }, now: () => now, randInt: () => pick });
  return { picnic, players, tick: (id, body) => picnic.tick(players[id], body), wait: (ms) => { now += ms; }, spawnAt: (i) => { pick = i; } };
}

test('arriving, walking and the speed limit', () => {
  const { tick, wait, spawnAt } = setup();
  const first = tick('a', { fresh: true });
  assert.deepEqual(first.snap, SPAWNS[0]); assert.equal(first.you.hp, PICNIC.hp); assert.equal(first.you.hat, PICNIC.hat); assert.ok(first.you.safe);
  assert.deepEqual(first.others.map((o) => o.id), [INTERN], 'Gary is always there');
  wait(100);
  const step = tick('a', { x: SPAWNS[0].x + 0.5, z: SPAWNS[0].z, yaw: 1, air: 99 });
  assert.equal(step.snap, undefined);
  wait(100);
  assert.deepEqual(tick('a', { x: 0, z: 0, air: 99 }).snap, { x: SPAWNS[0].x + 0.5, z: SPAWNS[0].z }, 'nobody walks 30 m in a tenth of a second');
  spawnAt(3);
  const b = tick('b', {});
  assert.notDeepEqual(b.snap, SPAWNS[3], 'a newcomer starts as far from the others as the quarry allows');
  assert.equal(b.others.find((o) => o.id === 'a').air, 3, 'jumps are capped');
  wait(PICNIC.staleMs + 1);
  assert.deepEqual(tick('b', {}).others.map((o) => o.id), [INTERN], 'a miner who stops reporting has gone home');
});

test('rivets: three for the hat, five for the miner, a kill in the feed, three seconds on the grass, then back with a grace period', () => {
  const { picnic, tick, wait } = setup();
  tick('a', {}); tick('b', {});
  const A = picnic.here.get('a'), B = picnic.here.get('b');
  const aim = () => ({ x: A.x, z: A.z, yaw: yawTo(A, B), shots: [{ x: B.x, y: 1, z: B.z, hit: 'b' }] });
  const whole = PICNIC.hp + PICNIC.hat, left = () => B.hp + picnic.hatOf(B, picnic.now());
  wait(100);
  tick('a', aim());
  assert.equal(left(), whole, 'just arrived: untouchable');
  wait(PICNIC.safeMs); tick('b', {}); // Bo keeps reporting, or the server would decide he had gone home
  tick('a', { ...aim(), yaw: yawTo(A, B) + Math.PI }); assert.equal(left(), whole, 'not with your back to them');
  wait(RIVET * 4); tick('b', {});
  tick('a', { ...aim(), shots: [null, 'b', { hit: 'a' }, { x: 0, y: 0, z: 0, hit: { id: 'b' } }] }); assert.equal(left(), whole, 'nonsense hits nobody, yourself included');
  wait(RIVET * 4); tick('b', {}); // still here
  const burst = tick('a', { ...aim(), shots: Array(6).fill(aim().shots[0]) });
  assert.equal(burst.you.kills, 0); assert.equal(left(), whole - 4 * 20, 'a late report carries four rivets at most');
  assert.equal(B.hp, PICNIC.hp - 20, 'the hat took the first three');
  tick('a', aim()); assert.equal(left(), whole - 4 * 20, 'and then the gun only fires so fast');
  const seen = tick('b', {});
  assert.equal(seen.you.hat, 0); assert.equal(seen.you.hp, PICNIC.hp - 20);
  assert.equal(seen.others.find((o) => o.id === 'a').shot.gun, 'rivet', 'everyone else sees each shot that left the gun');
  assert.equal(tick('a', {}).others.find((o) => o.id === 'b').hats, 0, 'bare-headed');
  for (let i = 0; i < 4; i++) { wait(RIVET); tick('a', aim()); }
  const down = tick('b', { x: 0, z: 0, shots: [{ hit: 'a' }] });
  assert.equal(down.you.hp, 0); assert.deepEqual(down.you.by, { name: 'Ann', gun: 'rivet' }); assert.equal(down.you.deaths, 1); assert.ok(down.you.backIn > 0);
  assert.equal(A.hp, PICNIC.hp, 'the dead do not shoot'); assert.equal(down.snap, undefined);
  assert.deepEqual(down.feed.map(({ killer, victim, intern, gun, own }) => ({ killer, victim, intern, gun, own })), [{ killer: 'Ann', victim: 'Bo', intern: false, gun: 'rivet', own: false }]);
  assert.equal(tick('a', aim()).you.kills, 1);
  wait(PICNIC.respawnMs);
  const back = tick('b', {});
  assert.equal(back.you.hp, PICNIC.hp); assert.equal(back.you.hat, PICNIC.hat); assert.ok(back.snap && back.you.safe);
  wait(PICNIC.feedMs);
  assert.deepEqual(tick('a', {}).feed, [], 'old news leaves the ticker');
});

test('a dented hard hat grows back if it is left alone, and the miner under it does not', () => {
  const { picnic, tick, wait } = setup();
  tick('a', {}); tick('b', {}); wait(PICNIC.safeMs);
  const A = picnic.here.get('a'), B = picnic.here.get('b');
  tick('a', { x: A.x, z: A.z, yaw: yawTo(A, B), shots: Array(4).fill({ x: B.x, y: 1, z: B.z, hit: 'b' }) });
  assert.equal(tick('b', {}).you.hat, 0); assert.equal(B.hp, PICNIC.hp - 20);
  wait(PICNIC.hatWaitMs); assert.equal(tick('b', {}).you.hat, 0, 'not yet');
  wait(PICNIC.hatFillMs / 2); assert.equal(tick('b', {}).you.hat, PICNIC.hat / 2);
  wait(PICNIC.hatFillMs); assert.equal(tick('b', {}).you.hat, PICNIC.hat); assert.equal(B.hp, PICNIC.hp - 20);
});

test('pickups: in reach, useful, one extra gun at a time (the newest), and back after a while', () => {
  const { picnic, tick, wait } = setup();
  for (const p of PICKUPS) assert.deepEqual(walk(p.x, p.z), { x: p.x, z: p.z }, `${p.id} can be stood on`);
  const at = (kind, n = 0) => PICKUPS.filter((p) => p.kind === kind)[n];
  const go = (p, extra = {}) => { Object.assign(picnic.here.get('a'), { x: p.x, z: p.z }); return tick('a', { x: p.x, z: p.z, ...extra }); };
  tick('a', {});
  assert.equal(go(at('salad')).got, undefined, 'nobody healthy eats that');
  assert.equal(go({ x: at('hat').x + PICKUP_REACH + 0.2, z: at('hat').z }).got, undefined, 'out of reach');
  const hat = go(at('hat'));
  assert.equal(hat.got, 'hat'); assert.equal(hat.you.hat, 2 * PICNIC.hat); assert.deepEqual(hat.gone, [at('hat').id]);
  assert.equal(go(at('hat')).got, undefined, 'said once, and gone');
  wait(3000); assert.equal(tick('a', {}).you.hat, 2 * PICNIC.hat, 'the second hat stays on until it is shot off');
  const gun = go(at('stapler'));
  assert.equal(gun.got, 'stapler'); assert.deepEqual(gun.you.gun, { kind: 'stapler', ammo: GUNS.stapler.ammo });
  assert.equal(go(at('stapler', 1)).got, undefined, 'that one is still loaded');
  assert.equal(go(at('surveyor')).you.gun.kind, 'surveyor', 'a different gun replaces the one you carry'); assert.equal(go(at('stapler', 1)).got, 'stapler');
  wait(1000);
  const staple = { x: 0, y: 0, z: 0, gun: 'stapler' };
  assert.equal(go(SPAWNS[0], { shots: [staple, staple] }).you.gun.ammo, GUNS.stapler.ammo - 1, 'one staple went: no faster than a stapler fires');
  for (let ms = 0; ms < PICNIC.backMs.stapler; ms += 1000) { wait(1000); tick('a', {}); } // long enough for the staplers to be back
  assert.equal(go(at('stapler', 1)).you.gun.ammo, GUNS.stapler.ammo, 'now one is worth picking up again');
  picnic.here.get('a').hp = 40;
  assert.equal(go(at('salad')).you.hp, PICNIC.hp);
  wait(PICNIC.backMs.hat);
  assert.deepEqual(tick('a', {}).gone, [], 'everything comes back');
});

test('the other guns: a stapler up close, a surveyor from anywhere, dynamite for everyone nearby, and nothing fired that is not held', () => {
  assert.equal(damage('rivet', 50), 20); assert.equal(damage('surveyor', 100), 110);
  assert.equal(damage('stapler', 3), 110); assert.ok(damage('stapler', 12) < 110 && damage('stapler', 12) > 0); assert.equal(damage('stapler', 18), 0);
  assert.equal(damage('dynamite', 0), 150); assert.equal(damage('dynamite', GUNS.dynamite.blast), 0);
  const { picnic, tick, wait } = setup();
  tick('a', {}); tick('b', {});
  const rest = (ms) => { for (; ms > 0; ms -= 1000) { wait(Math.min(1000, ms)); tick('a', {}); tick('b', {}); } }; // time passes; both keep reporting
  rest(PICNIC.safeMs);
  const A = picnic.here.get('a'), B = picnic.here.get('b');
  const fire = (gun) => { rest(2000); return tick('a', { x: A.x, z: A.z, yaw: yawTo(A, B), shots: [{ x: B.x, y: 1, z: B.z, hit: 'b', gun }] }); };
  fire('surveyor'); assert.equal(B.hp + B.hat, PICNIC.hp + PICNIC.hat - 20, 'not holding one: that was a rivet');
  A.gun = { kind: 'surveyor', ammo: 2 };
  fire('surveyor'); assert.equal(B.hp, PICNIC.hp - 70, 'through what was left of the hat and into the miner');
  const second = fire('surveyor');
  assert.equal(B.hp, 0); assert.equal(second.you.gun, null, 'empty: back to the rivet gun'); assert.equal(second.feed.at(-1).gun, 'surveyor');
  rest(PICNIC.respawnMs + PICNIC.safeMs);
  Object.assign(B, { x: A.x + 3, z: A.z }); A.gun = { kind: 'dynamite', ammo: 2 };
  rest(2000);
  tick('a', { x: A.x, z: A.z, yaw: yawTo(A, B) + Math.PI, shots: [{ x: B.x, y: 0, z: B.z, gun: 'dynamite' }] });
  assert.equal(B.hp, PICNIC.hp, 'it has to go off somewhere you could have sent it');
  rest(2000);
  const boom = tick('a', { x: A.x, z: A.z, yaw: yawTo(A, B), shots: [{ x: B.x, y: 0, z: B.z, gun: 'dynamite' }] });
  assert.equal(B.hp, PICNIC.hp + PICNIC.hat - damage('dynamite', 0), 'right on top of Bo');
  assert.equal(boom.you.hp + boom.you.hat, PICNIC.hp + PICNIC.hat - damage('dynamite', 3), 'and three metres from Ann');
  Object.assign(A, { hp: 10, hat: 0, gun: { kind: 'dynamite', ammo: 1 } }); B.x += 20;
  rest(2000);
  const oops = tick('a', { x: A.x, z: A.z, yaw: 0, shots: [{ x: A.x, y: 0, z: A.z, gun: 'dynamite' }] });
  assert.equal(oops.you.hp, 0); assert.equal(oops.you.by, null); assert.equal(oops.you.kills, 1, 'no credit for that one'); assert.ok(oops.feed.at(-1).own);
});

test('Gary can be shot, says nothing, and comes back', () => {
  const { picnic, tick, wait } = setup();
  tick('a', {}); wait(PICNIC.safeMs);
  const A = picnic.here.get('a');
  for (let i = 0; i < 8; i++) { wait(RIVET); const g = picnic.gary(picnic.now()); tick('a', { x: A.x, z: A.z, yaw: yawTo(A, g), shots: [{ x: g.x, y: 1, z: g.z, hit: INTERN }] }); }
  const view = tick('a', {});
  assert.equal(view.you.kills, 1); assert.ok(view.others[0].dead); assert.ok(view.feed[0].intern);
  wait(PICNIC.respawnMs);
  const up = tick('a', {}).others[0];
  assert.equal(up.dead, false); assert.equal(up.hats, 1);
});

test('the picnic has room for sixteen', () => {
  const { picnic, players } = setup();
  for (let i = 0; i < PICNIC.max; i++) picnic.tick({ id: `p${i}` }, {});
  assert.throws(() => picnic.tick(players.a, {}), /full/);
  picnic.forget('p0');
  assert.ok(picnic.tick(players.a, {}).snap);
});

test('the picnic is a door in the hall, and the room behind it talks to the picnic and never to the mine', () => {
  const src = (f) => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');
  assert.equal(HALL_DOORS.find((d) => d.id === 'picnic')?.open, true);
  assert.match(src('client/src/mines/DoorHall.jsx'), /inside === 'picnic'\) return <PicnicRoom elapsedMs=\{elapsedMs\} onExit=\{back\} \/>/);
  const room = src('client/src/mines/PicnicRoom.jsx');
  assert.match(room, /path: '\/picnic\/tick'/); assert.match(room, /'\/picnic\/leave'/);
  assert.doesNotMatch(room, /\/mines\//, 'nothing out here touches the shift');
  assert.doesNotMatch(src('server/mines.js'), /picnic/i, 'and the mine server knows nothing about the picnic');
  assert.doesNotMatch(src('server/picnic.js'), /accounts|bankroll|saveDoc|loadDoc/, 'no money and nothing saved');
});

test('the picnic over real HTTP: sign in first, a tick puts you in the quarry with Gary, leaving takes you out', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-picnic-'));
  const { app, shutdown } = createApp({ dataDir, env: { ...process.env } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const post = async (url, body, token) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  assert.equal((await post('/picnic/tick')).status, 401);
  const { token } = (await post('/players', { name: 'Earl' })).body;
  const v = (await post('/picnic/tick', { fresh: true }, token)).body;
  assert.equal(v.you.hp, PICNIC.hp); assert.ok(v.snap); assert.deepEqual(v.others.map((o) => o.id), [INTERN]);
  assert.deepEqual((await post('/picnic/leave', {}, token)).body, { ok: true });
});
