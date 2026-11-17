import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFaun, trotFaun } from '../client/src/mines/faunMesh.js';
import { MineScene } from '../client/src/mines/scene.js';

const pose = model => [model.group, model.upper, model.hips, model.head, model.tail, model.scarfTail, model.leftLeg, model.rightLeg, model.leftArm, model.rightArm, model.umbrella]
  .flatMap(part => [...part.position.toArray(), part.rotation.x, part.rotation.y, part.rotation.z, ...part.scale.toArray()]);

test('the faun retains his articulated identity within a small mesh and triangle budget', () => {
  const model = buildFaun();
  for (const key of ['head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'parcels', 'umbrella', 'scarfTail', 'tail']) assert.ok(model[key]?.isGroup, key);
  assert.equal(model.group.visible, false); assert.equal(model.moon.visible, false);
  let meshes = 0, triangles = 0;
  const used = new Set();
  model.group.traverse(part => {
    if (!part.isMesh) return;
    meshes++; used.add(part.material);
    triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    for (const attribute of ['position', 'normal']) assert.ok([...part.geometry.attributes[attribute].array].every(Number.isFinite));
  });
  assert.ok(meshes <= 32, `${meshes} meshes`); assert.ok(triangles < 3000, `${triangles} triangles`);
  assert.equal(used.size, model.mats.length, 'the advertised materials are all owned by visible model parts');
});

test('each goat foot has two solid hoof toes with a real gap between them', () => {
  const model = buildFaun(); model.group.updateMatrixWorld(true);
  for (const leg of [model.leftLeg, model.rightLeg]) {
    const hoof = leg.children.find(part => part.material === model.mats[5]);
    for (const [x, hits] of [[-.04, true], [0, false], [.04, true]]) {
      const origin = leg.localToWorld(new THREE.Vector3(x, -.885, .5));
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1));
      assert.equal(ray.intersectObject(hoof).length > 0, hits);
    }
  }
});

test('mooning reveals only the rear gag, restores the normal pose, and leaves follower facing alone', () => {
  const model = buildFaun(); model.group.rotation.y = 1.234; model.group.position.set(4, 0, 7);
  trotFaun(model, 1000, false, false, 0); const normal = pose(model);
  trotFaun(model, 1000, false, false, .4); assert.equal(model.moon.visible, false, 'fur stays covered while turning');
  trotFaun(model, 1000, false, false, 1);
  assert.equal(model.moon.visible, true); assert.ok(model.upper.rotation.x > .5);
  assert.ok(model.moon.position.z < 0, 'cartoon cheeks are on the back only');
  assert.equal(model.group.rotation.y, 1.234); assert.equal(model.group.position.x, 4); assert.equal(model.group.position.z, 7);
  trotFaun(model, 1000, false, false, 0);
  assert.equal(model.moon.visible, false); assert.deepEqual(pose(model), normal, 'ending or cancelling the gag restores every changed joint');
  for (const invalid of [NaN, Infinity, -1]) { trotFaun(model, 1000, false, false, invalid); assert.equal(model.moon.visible, false); }
});

test('walking keeps opposite hoof phases; reduced-motion walking and mooning stay still', () => {
  const model = buildFaun(); trotFaun(model, 400, true);
  assert.notEqual(model.leftLeg.rotation.x, 0);
  assert.equal(model.leftLeg.rotation.x, -model.rightLeg.rotation.x);
  trotFaun(model, 500, false); assert.equal(model.leftLeg.rotation.x, 0); assert.equal(model.group.position.y, 0);
  trotFaun(model, 500, true, true); const quiet = pose(model);
  trotFaun(model, 2300, true, true); assert.deepEqual(pose(model), quiet);
  trotFaun(model, 500, false, true, .1); const moon = pose(model); assert.equal(model.moon.visible, true);
  trotFaun(model, 2300, false, true, .8); assert.deepEqual(pose(model), moon);
  trotFaun(model, 2400, false, true, 0); assert.equal(model.moon.visible, false); assert.deepEqual(pose(model), quiet);
});

test('scene disposal frees the improved faun geometry and shared materials exactly once', t => {
  const previousCancel = globalThis.cancelAnimationFrame; globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel; });
  const model = buildFaun(), scene = new THREE.Scene(), counts = new Map(); scene.add(model.group);
  model.group.traverse(part => {
    for (const resource of [part.geometry, part.material]) {
      if (!resource || counts.has(resource)) continue;
      counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
    }
  });
  Object.assign(Object.create(MineScene.prototype), { scene, renderer: { dispose() {} } }).dispose();
  for (const count of counts.values()) assert.equal(count, 1);
});
