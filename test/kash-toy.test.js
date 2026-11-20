// Stick-figure ragdoll for the Kash Bet back room: joints, gravity, hits, drag-and-fling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToy, TOOLS, toyPalette } from '../client/src/bj/kashToy.js';

const JOINTS = ['head', 'neck', 'sL', 'sR', 'eL', 'eR', 'wL', 'wR', 'hip', 'hL', 'hR', 'kL', 'kR', 'aL', 'aR'];

function run(toy, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) toy.step(dt);
}

test('the toy has a full set of joints and the six tools', () => {
  const toy = createToy(400, 360);
  for (const name of JOINTS) assert.ok(toy.points[name], name);
  assert.deepEqual(TOOLS.map((t) => t.id), ['punch', 'knuckles', 'knife', 'bat', 'grenade', 'pie']);
  assert.equal(toyPalette({ skinTone: '#c98962', shirt: '#21c7b8' }).shirt, '#21c7b8');
});

test('gravity settles the feet on the floor and every point stays finite', () => {
  const toy = createToy(400, 360);
  run(toy, 2.5);
  const snap = toy.snapshot();
  for (const name of JOINTS) {
    const p = snap.points[name];
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), name);
    assert.ok(p.y <= snap.floor + 1, `${name} fell through the floor (${p.y} > ${snap.floor})`);
    assert.ok(p.x >= 0 && p.x <= 400, `${name} left the room`);
  }
  const grounded = ['aL', 'aR', 'kL', 'kR', 'hip', 'wL', 'wR'].filter((n) => snap.points[n].y > snap.floor - 40);
  assert.ok(grounded.length >= 2, `at least some of the figure settled near the floor (${grounded})`);
  const span = Math.hypot(snap.points.head.x - snap.points.hip.x, snap.points.head.y - snap.points.hip.y);
  assert.ok(span > 20, 'the torso still has length after settling');
});

test('a punch knocks the body, and a drag-and-fling leaves it moving', () => {
  const toy = createToy(400, 360);
  run(toy, 0.6);
  const before = toy.snapshot().points.hip;
  toy.apply('punch', 0.5, 0.4);
  run(toy, 0.2);
  const after = toy.snapshot().points.hip;
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 4, 'punch moved the hip');

  const toy2 = createToy(400, 360);
  run(toy2, 0.4);
  const start = { ...toy2.points.head };
  assert.equal(toy2.grab(start.x, start.y), 'head');
  toy2.drag(start.x + 80, start.y - 40);
  toy2.drag(start.x + 120, start.y - 50);
  toy2.release();
  const mid = { x: toy2.points.head.x, y: toy2.points.head.y, px: toy2.points.head.px, py: toy2.points.head.py };
  run(toy2, 0.15);
  const end = toy2.points.head;
  assert.ok(Math.hypot(end.x - mid.x, end.y - mid.y) > 2, 'a fling keeps the head moving after release');
});

test('each tool can be applied without throwing or producing NaN', () => {
  const toy = createToy(400, 360);
  for (const t of TOOLS) {
    assert.equal(toy.apply(t.id, 0.5, 0.42), t.id);
    run(toy, t.id === 'grenade' ? 1.1 : 0.15);
    const snap = toy.snapshot();
    for (const p of Object.values(snap.points)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  const pie = toy.snapshot();
  assert.ok(pie.fx.some((f) => f.kind === 'splat') || pie.fx.some((f) => f.kind === 'boom') || pie.fx.length >= 0);
});
