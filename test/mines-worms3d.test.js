// The 3D acid worms (client/src/mines/wormMesh.js, WormLayer.js): grotesque low-poly trilobites with a phone-sized
// budget, a writhe that is a little wrong, skittering legs, eyes that follow you, shell pieces and loose legs for the
// knife, and the flat fallback when there is no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorm, wormMaterials, wormTriangles, Writhe, gaze, shellHalfWidth, SHELL_ROWS, THORAX, LEG_PAIRS, MAX_TRIS, MAX_MESHES } from '../client/src/mines/wormMesh.js';
import { createWormLayer, wormBox } from '../client/src/mines/WormLayer.js';

const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const meshes = (w) => { let n = 0; w.group.traverse((o) => { if (o.isMesh) n++; }); return n; };

test('a creature fits the phone budget: few triangles, few draw calls', () => {
  const mats = wormMaterials();
  for (let i = 1; i <= 5; i++) {
    const w = buildWorm(mats, { rand: seeded(i) });
    for (let t = 0; t < 60; t++) w.update(1 / 30, t % 2 ? { x: 0.3, y: 0.2 } : null);
    assert.ok(wormTriangles(w) <= MAX_TRIS, `${wormTriangles(w)} triangles`);
    assert.ok(meshes(w) <= MAX_MESHES, `${meshes(w)} meshes`);
    w.dispose();
  }
});

test('a trilobite: a tail shield, segmented thorax, and a wide head shield', () => {
  assert.equal(SHELL_ROWS.filter((r) => r.part === 'th' && r.front).length, THORAX);
  assert.ok(SHELL_ROWS.some((r) => r.part === 'pyg') && SHELL_ROWS.some((r) => r.genal));
  assert.ok(shellHalfWidth(0.87) > shellHalfWidth(0.5) && shellHalfWidth(0.5) > shellHalfWidth(0.05), 'head shield widest, tail narrowest');
  assert.ok(LEG_PAIRS >= 8, 'too many legs');
});

test('legs skitter on their own (and barely with reduced motion)', () => {
  const odd = new Writhe(seeded(5)), calm = new Writhe(seeded(5), { reduce: true });
  let a = 0, b = 0;
  for (let t = 0; t < 300; t++) {
    const pa = odd.leg(2, 1), pb = calm.leg(2, 1); odd.step(1 / 30); calm.step(1 / 30);
    a = Math.max(a, Math.abs(odd.leg(2, 1) - pa)); b = Math.max(b, Math.abs(calm.leg(2, 1) - pb));
  }
  assert.ok(a > 0.05, `legs move ${a}`);
  assert.ok(b < a / 3, `reduced motion is calmer (${b} vs ${a})`);
});

test('the knife cracks it into shell pieces and loose legs; the head shield keeps its face', () => {
  const w = buildWorm(wormMaterials(), { rand: seeded(3) }).update(0.4);
  const p = w.pieces(), shell = p.filter((c) => !c.leg), legs = p.filter((c) => c.leg);
  assert.equal(shell.length, 5);
  assert.ok(legs.length >= 4);
  assert.deepEqual(shell.map((c) => c.head), [false, false, false, false, true]);
  for (const c of p) assert.ok(c.geometry.attributes.position.count > 0 && Number.isFinite(c.x) && Number.isFinite(c.y));
  for (const c of p) for (const v of c.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
  const h = w.head(), last = shell[4];
  assert.ok(Math.hypot(h.x - last.x, h.y - last.y) < 0.15, 'the head piece is at the head');
});

test('it writhes wrong: stutters and twitches, but not with reduced motion', () => {
  const odd = new Writhe(seeded(11)), calm = new Writhe(seeded(11), { reduce: true });
  for (let t = 0; t < 600; t++) { odd.step(1 / 30); calm.step(1 / 30); }
  assert.ok(odd.stutters >= 3, `${odd.stutters} stutters`);
  assert.ok(odd.twitches >= 3, `${odd.twitches} twitches`);
  assert.equal(calm.stutters, 0); assert.equal(calm.twitches, 0);
});

test('its eyes follow your finger a little, and stare at you otherwise', () => {
  assert.deepEqual(gaze({ x: 0, y: 0 }, null, 0), { x: 0, y: 0 });
  for (const t of [{ x: 5, y: 0 }, { x: -3, y: 4 }, { x: 0.1, y: 0.1 }]) {
    const g = gaze({ x: 0, y: 0 }, t, 0.7);
    assert.ok(Math.hypot(g.x, g.y) <= 0.011 + 1e-9);
  }
  const right = gaze({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
  assert.ok(right.x > 0 && Math.abs(right.y) < 1e-9);
});

test('no WebGL: the layer does not start and the flat worms stand in', () => {
  const canvas = { getContext: () => null, addEventListener() {}, removeEventListener() {}, style: {}, width: 0, height: 0, clientWidth: 0, clientHeight: 0 };
  assert.equal(createWormLayer(canvas, {}), null);
  assert.equal(createWormLayer(null, {}), null);
});

test('the 3D worm fills the same box as its hit box', () => {
  assert.equal(wormBox({ size: 0.3 }, 400, 800), 240);
  assert.equal(wormBox({ size: 0.9 }, 400, 800), 368); // capped at 92vmin
});
