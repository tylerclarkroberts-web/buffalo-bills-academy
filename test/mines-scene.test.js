import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MineScene } from '../client/src/mines/scene.js';

function fixture() {
  const scene = new THREE.Scene(), poolTex = new THREE.Texture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(33, 33), new THREE.MeshLambertMaterial({ map: new THREE.Texture() }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(15.4, 0, 15.4);
  const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ map: poolTex }));
  const poolLight = new THREE.PointLight(); scene.add(floor, poolMesh, poolLight);
  return Object.assign(Object.create(MineScene.prototype), {
    scene, maze: { size: 15, pool: { x: 3, y: 3 } }, floor, poolTex, poolMesh, poolLight,
    wallMaterial: new THREE.MeshLambertMaterial({ map: new THREE.Texture() }),
    crystals: [], puddleGlints: [], poolPos: new THREE.Vector3(), pos: new THREE.Vector2(),
    stalker: { pool: null }, renderer: { dispose() {} },
  });
}
const pool = (id, x, quantity, remaining = quantity) => ({ id, x, y: 3, quantity, remaining });

test('deposit basins grow with quantity and cut real openings in the floor', () => {
  const mine = fixture();
  mine.setDeposits([pool('small', 3, 20), pool('medium', 5, 35), pool('large', 7, 60), pool('reserve', 9, 100)], 'small');
  mine.scene.updateMatrixWorld(true);
  let lastRadius = 0, lastDepth = 0;
  for (const deposit of mine.deposits.values()) {
    assert.ok(deposit.radius > lastRadius); assert.ok(deposit.depth > lastDepth);
    assert.ok(deposit.radius * 1.08 < 1.1, 'rim fits its tunnel tile');
    assert.ok(deposit.liquid.position.y < 0 && deposit.liquid.position.y > -deposit.depth);
    const center = deposit.group.position;
    const ray = new THREE.Raycaster(new THREE.Vector3(center.x, 2, center.z), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(mine.floor).length, 0, 'opaque floor cannot cover the basin');
    assert.ok(ray.intersectObject(deposit.liquid).length > 0, 'liquid is visible through the opening');
    ray.ray.origin.x += 1.09;
    assert.ok(ray.intersectObject(mine.floor).length > 0, 'floor survives beside the opening');
    lastRadius = deposit.radius; lastDepth = deposit.depth;
  }
});

test('confirmed extraction lowers and shrinks the liquid without allocating geometry', () => {
  const mine = fixture();
  mine.setDeposits([pool('a', 3, 60)], 'a');
  const deposit = mine.deposits.get('a'), floorGeometry = mine.floor.geometry;
  const geometry = deposit.liquid.geometry, material = deposit.liquid.material;
  const top = deposit.liquid.position.y, radius = deposit.liquid.scale.x;
  mine.setDeposits([pool('a', 3, 60, 30)], 'a');
  assert.equal(mine.floor.geometry, floorGeometry);
  assert.equal(deposit.liquid.geometry, geometry); assert.equal(deposit.liquid.material, material);
  assert.ok(deposit.liquid.position.y < top); assert.ok(deposit.liquid.scale.x < radius);
  mine.setDeposits([pool('a', 3, 60, 0)], null);
  assert.equal(deposit.liquid.visible, false);
  assert.equal(deposit.group.visible, true, 'drained basin remains');
  assert.equal(mine.poolLight.visible, false); assert.equal(mine.distanceToPool(), 99);
});

test('unresolved future pools stay hidden while guidance follows the current deposit', () => {
  const mine = fixture();
  mine.setDeposits([pool('a', 3, null), pool('b', 5, null)], 'a');
  assert.equal(mine.deposits.size, 1); assert.ok(mine.deposits.has('a'));
  assert.equal(mine.poolMesh.visible, false, 'legacy pool is hidden in bucket shifts');
  const floorGeometry = mine.floor.geometry; let disposed = 0;
  floorGeometry.addEventListener('dispose', () => disposed++);
  mine.setDeposits([pool('a', 3, 0), pool('b', 5, null)], 'b');
  assert.equal(mine.deposits.size, 2); assert.equal(mine.deposits.get('a').liquid.visible, false);
  assert.deepEqual(mine.poolPos.toArray(), [5 * 2.2, 0, 3 * 2.2]);
  assert.deepEqual(mine.stalker.pool, { x: 5, y: 3 });
  assert.equal(disposed, 1, 'replaced floor geometry is released');
  mine.setDeposits([pool('a', 3, 0), pool('b', 5, null)], 'b');
  assert.equal(disposed, 1, 'repeating state does not rebuild the floor');
});

test('geiger direction follows target changes and clears when no deposit remains', () => {
  const mine = fixture();
  mine.maze.grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => y === 3 && x > 0 && x < 6 ? 0 : 1));
  mine.pos.set(3 * 2.2, 3 * 2.2); mine.yaw = -Math.PI / 2;
  mine.setDeposits([pool('east', 5, 20), pool('west', 1, null)], 'east');
  assert.equal(mine.pathToPool(), 2); assert.equal(mine.facingToPool(), 1);
  const firstDistances = mine.poolDist;
  mine.yaw += Math.PI;
  assert.equal(mine.pathToPool(), 2); assert.equal(mine.facingToPool(), -1);
  assert.equal(mine.poolDist, firstDistances, 'turning reuses the distance map');
  mine.setDeposits([pool('east', 5, 20, 0), pool('west', 1, 20)], 'west');
  assert.equal(mine.pathToPool(), 2); assert.equal(mine.facingToPool(), 1);
  assert.notEqual(mine.poolDist, firstDistances, 'new target refreshes the distance map');
  mine.setDeposits([pool('east', 5, 20, 0), pool('west', 1, 20, 0)], null);
  assert.equal(mine.pathToPool(), 99); assert.equal(mine.facingToPool(), 0);
});

test('scene disposal releases shared deposit textures and materials once', t => {
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel; });
  const mine = fixture();
  mine.setDeposits([pool('a', 3, 20), pool('b', 5, 35)], 'b');
  const counts = new Map();
  const watch = resource => { if (!resource || counts.has(resource)) return; counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); };
  mine.scene.traverse(object => {
    watch(object.geometry);
    for (const material of [].concat(object.material || [])) { watch(material); watch(material.map); }
  });
  mine.dispose();
  assert.equal(counts.get(mine.poolTex), 1);
  for (const count of counts.values()) assert.equal(count, 1);
});

test('acid you can see is always minable: an unfilled pool shows no liquid until the server fills it', () => {
  const mine = fixture();
  // current pool the server has not filled in yet (quantity null): basin only, no liquid
  mine.setDeposits([pool('a', 3, null)], 'a');
  const deposit = mine.deposits.get('a');
  assert.ok(deposit, 'the basin of the current pool is drawn');
  assert.equal(deposit.liquid.visible, false, 'no acid before the pool is ready to mine');
  // once the server fills it, the acid appears
  mine.setDeposits([pool('a', 3, 40)], 'a');
  assert.equal(deposit.liquid.visible, true, 'filled pool shows its acid');
  // and disappears once it is drained
  mine.setDeposits([pool('a', 3, 40, 0)], 'a');
  assert.equal(deposit.liquid.visible, false, 'drained pool shows no acid');
});
