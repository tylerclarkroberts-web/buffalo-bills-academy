import * as THREE from 'three';
import { ROOM_BOUNDS, ROOM_FLOOR_SCALE } from './scene-model.js';

const SHADOW_INTERVAL = 120, LAMP_INTENSITY = 6;

/** One bounded shadow map covers the cabin and yard; the lamp needs no cube map. */
export function setupRoomLighting(scene, renderer) {
  const ambient = new THREE.HemisphereLight('#ffe8c5', '#503740', 2);
  const sun = new THREE.DirectionalLight('#ffe0a6', 2.25);
  const lamp = new THREE.PointLight('#ffd18b', LAMP_INTENSITY, 7 * ROOM_FLOOR_SCALE, 2);
  lamp.position.set(-3.45 * ROOM_FLOOR_SCALE, 2.7, 1.9 * ROOM_FLOOR_SCALE);
  sun.target.position.set((ROOM_BOUNDS.min[0] + ROOM_BOUNDS.max[0]) / 2, 0, 0);
  sun.position.copy(sun.target.position).add(new THREE.Vector3(2, 10, 6));
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.intensity = 0.48;
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.025;
  sun.shadow.autoUpdate = false;
  scene.add(ambient, sun, sun.target, lamp);

  const camera = sun.shadow.camera, extent = new THREE.Box3();
  camera.position.copy(sun.position); camera.lookAt(sun.target.position); camera.updateMatrixWorld();
  for (const x of [ROOM_BOUNDS.min[0], ROOM_BOUNDS.max[0]]) for (const y of [ROOM_BOUNDS.min[1], ROOM_BOUNDS.max[1]]) for (const z of [ROOM_BOUNDS.min[2], ROOM_BOUNDS.max[2]]) {
    extent.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  Object.assign(camera, { left: extent.min.x - 0.5, right: extent.max.x + 0.5, bottom: extent.min.y - 0.5, top: extent.max.y + 0.5, near: Math.max(0.1, -extent.max.z - 0.5), far: -extent.min.z + 0.5 });
  camera.updateProjectionMatrix();
  // Current Three uses filtered PCF; PCFSoftShadowMap has been removed.
  Object.assign(renderer.shadowMap, { enabled: true, type: THREE.PCFShadowMap, autoUpdate: false });
  const lighting = {
    ambient, sun, lamp, shadowAt: -Infinity, active: false, disposed: false,
    invalidate() {
      if (lighting.disposed) return;
      renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
    },
    dispose() {
      if (lighting.disposed) return;
      lighting.disposed = true;
      scene.remove(ambient, sun, sun.target, lamp);
      sun.shadow.dispose();
      renderer.shadowMap.enabled = false;
    },
  };
  lighting.invalidate();
  return lighting;
}

/** Invisible picks, glass, sprites and unlit artwork never enter the shadow pass. */
export function configureShadowObjects(root) {
  const size = new THREE.Vector3();
  root?.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const opaque = materials.every(material => material.visible && !material.transparent && material.opacity === 1 &&
      (material.isMeshLambertMaterial || material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial));
    object.receiveShadow = opaque;
    object.castShadow = false;
    if (!opaque) return;
    object.geometry.computeBoundingBox(); object.geometry.boundingBox.getSize(size);
    // Tiny facial details and flat trim cannot improve a 1024px shadow silhouette.
    object.castShadow = Math.max(size.x, size.y, size.z) >= 0.09 && Math.min(size.x, size.y, size.z) > 0.03;
  });
}

/** Time is in milliseconds of visible activity, not wall-clock time. */
export function animateRoomLighting(lighting, time, active) {
  if (lighting.disposed) return;
  lighting.lamp.intensity = LAMP_INTENSITY * (active ? 1 + 0.035 * Math.sin(time * 0.0007) + 0.015 * Math.sin(time * 0.0011) : 1);
  if (active !== lighting.active || (active && (time - lighting.shadowAt >= SHADOW_INTERVAL || time < lighting.shadowAt))) {
    lighting.invalidate(); lighting.shadowAt = time;
  }
  lighting.active = active;
}
