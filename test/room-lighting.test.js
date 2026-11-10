import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupRoomLighting, configureShadowObjects, animateRoomLighting } from '../client/src/room/lighting.js';
import { ROOM_BOUNDS } from '../client/src/room/scene-model.js';

function fixture() {
  const scene = new THREE.Scene(), renderer = { shadowMap: {} };
  return { scene, renderer, lighting: setupRoomLighting(scene, renderer) };
}

test('one filtered shadow map covers the full cabin and yard in a tight frustum', () => {
  const { scene, renderer, lighting } = fixture();
  const { sun, lamp } = lighting;
  assert.equal(scene.children.filter(object => object.isLight && object.castShadow).length, 1);
  assert.equal(lamp.castShadow, false, 'the point lamp never allocates six shadow faces');
  assert.deepEqual(sun.shadow.mapSize.toArray(), [1024, 1024]);
  assert.equal(renderer.shadowMap.type, THREE.PCFShadowMap);
  assert.equal(renderer.shadowMap.autoUpdate, false);
  assert.equal(sun.shadow.autoUpdate, false);
  assert.ok(sun.shadow.intensity > 0 && sun.shadow.intensity < 0.6);
  scene.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
  const camera = sun.shadow.camera;
  assert.ok(camera.right - camera.left < 22 && camera.top - camera.bottom < 16 && camera.far < 25);
  for (const x of [ROOM_BOUNDS.min[0], ROOM_BOUNDS.max[0]]) for (const y of [ROOM_BOUNDS.min[1], ROOM_BOUNDS.max[1]]) for (const z of [ROOM_BOUNDS.min[2], ROOM_BOUNDS.max[2]]) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    assert.ok([point.x, point.y, point.z].every(value => Math.abs(value) <= 1), `room corner ${x}, ${y}, ${z} stays inside the shadow map`);
  }
  lighting.dispose();
});

test('only substantial opaque lit geometry casts shadows, including initially hidden visitors', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(1, 1, 1), opaque = new THREE.MeshLambertMaterial();
  const fixture = new THREE.Mesh(geometry, opaque), hidden = fixture.clone(), glass = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.13 }));
  const pick = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  const detail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), opaque);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(8, 0.02, 0.02), opaque);
  const mixed = new THREE.Mesh(geometry, [opaque, glass.material]);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 6), opaque);
  hidden.visible = false; fixture.userData.selection = { kind: 'finish' };
  root.add(fixture, hidden, glass, pick, art, detail, trim, mixed, floor);
  configureShadowObjects(root);
  for (const object of [fixture, hidden, floor]) assert.ok(object.castShadow && object.receiveShadow);
  for (const object of [glass, pick, art, mixed]) assert.ok(!object.castShadow && !object.receiveShadow);
  for (const object of [detail, trim]) assert.ok(!object.castShadow && object.receiveShadow);
  fixture.material = glass.material; configureShadowObjects(root);
  assert.ok(!fixture.castShadow && !fixture.receiveShadow, 'reconfiguration removes stale flags after a material change');
  const geometries = new Set(), materials = new Set();
  root.traverse(object => { if (object.isMesh) { geometries.add(object.geometry); for (const material of [object.material].flat()) materials.add(material); } });
  for (const resource of [...geometries, ...materials, opaque]) resource.dispose();
});

test('shadows update at most every 120ms while breathing stays gentle and pause stays still', () => {
  const { renderer, lighting } = fixture();
  const consumed = () => { renderer.shadowMap.needsUpdate = false; lighting.sun.shadow.needsUpdate = false; };
  animateRoomLighting(lighting, 0, true); consumed();
  for (const time of [41, 83, 119]) {
    animateRoomLighting(lighting, time, true);
    assert.equal(renderer.shadowMap.needsUpdate, false);
    assert.equal(lighting.sun.shadow.needsUpdate, false);
  }
  animateRoomLighting(lighting, 125, true);
  assert.equal(renderer.shadowMap.needsUpdate, true); assert.equal(lighting.sun.shadow.needsUpdate, true); consumed();
  let previous = lighting.lamp.intensity;
  for (let time = 166; time < 60_000; time += 42) {
    animateRoomLighting(lighting, time, true);
    assert.ok(lighting.lamp.intensity >= 5.7 && lighting.lamp.intensity <= 6.3);
    assert.ok(Math.abs(lighting.lamp.intensity - previous) < 0.02, 'no rapid flicker or flashes');
    previous = lighting.lamp.intensity;
  }
  consumed();
  animateRoomLighting(lighting, 60_000, false);
  assert.equal(renderer.shadowMap.needsUpdate, true, 'pausing refreshes the resident reset pose once'); consumed();
  for (const time of [60_500, 61_000, 65_000]) {
    animateRoomLighting(lighting, time, false);
    assert.equal(lighting.lamp.intensity, 6);
    assert.equal(renderer.shadowMap.needsUpdate, false, 'paused/reduced-motion frames do not schedule shadow redraws');
  }
  lighting.invalidate();
  assert.equal(renderer.shadowMap.needsUpdate, true, 'edits and cutaways still update shadows while paused'); consumed();
  animateRoomLighting(lighting, 65_000, true);
  assert.equal(renderer.shadowMap.needsUpdate, true, 'resuming immediately refreshes the resident shadow');
  lighting.dispose();
});

test('lighting cleanup removes its lights and disposes an allocated shadow target exactly once', () => {
  const { scene, renderer, lighting } = fixture();
  const unrelated = new THREE.Group(); scene.add(unrelated);
  let disposed = 0;
  lighting.sun.shadow.map = new THREE.WebGLRenderTarget(1024, 1024);
  lighting.sun.shadow.map.addEventListener('dispose', () => disposed++);
  lighting.dispose(); lighting.dispose();
  assert.equal(disposed, 1);
  assert.deepEqual(scene.children, [unrelated]);
  assert.equal(renderer.shadowMap.enabled, false);
  renderer.shadowMap.needsUpdate = false;
  lighting.invalidate(); animateRoomLighting(lighting, 2000, true);
  assert.equal(renderer.shadowMap.needsUpdate, false);
});
