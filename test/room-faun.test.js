import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roomFaun } from '../client/src/room/faun.js';

test('the faun has grounded goat legs, signature props and bounded asset-free geometry', () => {
  const faun = roomFaun(), bounds = new THREE.Box3().setFromObject(faun);
  assert.ok(Math.abs(bounds.min.y) < 1e-6, 'hooves meet the ground');
  assert.ok(bounds.max.y > 1.9 && bounds.max.y < 2.5);
  assert.ok(bounds.max.x - bounds.min.x < 1.65 && bounds.max.z - bounds.min.z < 1);
  const legs = faun.children.filter(child => child.name === 'faun-goat-leg');
  assert.equal(legs.length, 2);
  for (const leg of legs) {
    assert.equal(leg.position.y, 1.02, 'steps rotate at the hip instead of at the floor');
    assert.ok(Math.abs(new THREE.Box3().setFromObject(leg).min.y) < 1e-6);
    assert.equal(leg.children.filter(child => child.name === 'faun-hoof').length, 2, 'each hoof is split');
  }
  for (const part of ['head', 'scarf', 'parcel', 'umbrella']) assert.ok(faun.getObjectByName(`faun-${part}`));
  assert.ok(new THREE.Box3().setFromObject(faun.getObjectByName('faun-scarf')).min.y < 0.5, 'the scarf hangs to the knees');
  const geometry = new Set(), materials = new Set();
  let meshes = 0, triangles = 0;
  faun.traverse(object => {
    assert.ok(object.isGroup || object.isMesh);
    if (!object.isMesh) return;
    meshes++;
    const positions = object.geometry.attributes.position;
    assert.ok(Array.from(positions.array).every(Number.isFinite));
    triangles += (object.geometry.index?.count || positions.count) / 3;
    assert.equal(object.material.flatShading, true);
    assert.equal(object.material.map, null, 'no photo, texture download or browser canvas needed');
    geometry.add(object.geometry); materials.add(object.material);
  });
  assert.ok(meshes <= 90 && triangles < 4500, `bounded model: ${meshes} meshes and ${triangles} triangles`);
  let disposed = 0;
  for (const resource of [...geometry, ...materials]) { resource.addEventListener('dispose', () => disposed++); resource.dispose(); }
  assert.equal(disposed, geometry.size + materials.size);
});
