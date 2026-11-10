import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coveredWagon } from '../client/src/room/wagon.js';

test('the covered wagon stays inside its yard footprint with four grounded spoked wheels', () => {
  const wagon = coveredWagon(), bounds = new THREE.Box3().setFromObject(wagon);
  assert.ok(bounds.min.x >= -0.82 && bounds.max.x <= 0.82);
  assert.ok(bounds.min.z >= -0.53 && bounds.max.z <= 0.53);
  assert.ok(bounds.min.y >= -1e-6 && bounds.max.y <= 1.35);
  const wheels = wagon.children.filter(child => child.name === 'wagon-wheel');
  assert.equal(wheels.length, 4);
  assert.equal(new Set(wheels.map(wheel => `${wheel.position.x},${wheel.position.z}`)).size, 4);
  for (const wheel of wheels) {
    const wheelBounds = new THREE.Box3().setFromObject(wheel);
    assert.ok(Math.abs(wheelBounds.min.y) < 1e-6, 'all four tires meet the ground');
    const ray = new THREE.Raycaster(new THREE.Vector3(wheel.position.x + 0.07, wheel.position.y + 0.15, 1), new THREE.Vector3(0, 0, -1));
    assert.equal(ray.intersectObject(wheel, true).length, 0, 'there is open space between the spokes');
  }
  wagon.scale.setScalar(1.65); wagon.rotation.y = -0.16; wagon.position.set(5.75, 0.02, -0.3);
  const placed = new THREE.Box3().setFromObject(wagon);
  assert.ok(placed.min.x > 4.25 && placed.max.x < 7.4, 'the actual scaled and rotated model stays outside the cabin');
});

test('the canopy is open at both ends, shaded on both sides, and bounded in rendering cost', () => {
  const wagon = coveredWagon(); wagon.updateMatrixWorld(true);
  const cover = wagon.getObjectByName('wagon-canopy');
  for (const direction of [-1, 1]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(-direction * 2, 1.02, 0), new THREE.Vector3(direction, 0, 0));
    assert.equal(ray.intersectObject(cover, true).length, 0, 'the interior sightline crosses both open ends');
  }
  const overhead = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
  const hit = overhead.intersectObject(cover, true)[0];
  assert.ok(hit && hit.point.y > 1.2, 'canvas covers the top of the wagon');
  assert.equal(hit.object.material.side, THREE.DoubleSide);
  let meshes = 0, triangles = 0;
  wagon.traverse(object => { if (object.isMesh) { meshes++; triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3; } });
  assert.ok(meshes <= 75 && triangles <= 7000, `bounded model: ${meshes} meshes, ${triangles} triangles`);
});
