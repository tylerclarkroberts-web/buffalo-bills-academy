import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from 'three';
import { ROOM_FLOOR_SCALE } from '../server/catalog/room.js';
import { makeRoomCamera } from '../client/src/room/scene-model.js';
import { homesteadLandscape } from '../client/src/room/landscape.js';

test('the desert surrounds the house without putting scenery through furnished rooms or the yard door', () => {
  const landscape = homesteadLandscape(), down = new Vector3(0, -1, 0);
  landscape.updateMatrixWorld(true);
  for (const [x, z] of [[0, 0], [-3, 5], [1.5, 5.7], [4.5, 1.5], [6.5, 4], [8.9, 1.6]]) {
    const ray = new Raycaster(new Vector3(x * ROOM_FLOOR_SCALE, 12, z * ROOM_FLOOR_SCALE), down);
    const hits = ray.intersectObject(landscape, true);
    assert.ok(hits.length && hits.every(hit => hit.point.y < 0), 'clear ground beneath the occupied lot and exit');
  }
  const sandstone = new Raycaster(new Vector3(-6.55 * ROOM_FLOOR_SCALE, 12, -7.55 * ROOM_FLOOR_SCALE), down);
  assert.ok(sandstone.intersectObject(landscape, true)[0].point.y > 3, 'a physical mesa rises beyond the lot');
  assert.ok(landscape.children.every(mesh => !mesh.castShadow), 'distant scenery stays out of the shadow pass');
});

test('the panorama stays behind the whole furnished lot as the overhead camera turns or focuses', () => {
  const horizon = homesteadLandscape().getObjectByName('ranch-horizon');
  const point = new Vector3(), S = ROOM_FLOOR_SCALE;
  for (const aspect of [0.7, 2]) for (const rotation of [0, 65, 180, -95]) {
    const camera = makeRoomCamera(aspect, { rotation });
    horizon.onBeforeRender(null, null, camera);
    const frame = horizon.material.uniforms.frame.value;
    for (const [x, z] of [[-4.2,-3.1], [8.4,-3], [8.4,4.8], [2.5,6.4], [-4.2,6.4]]) {
      const ground = point.set(x * S, 0, z * S).project(camera);
      assert.ok(frame.w > ground.z, 'the real lot is closer than the panorama depth');
    }
  }
  const bathroom = makeRoomCamera(1.5, { area: 'bathroom', zoom: 2 });
  horizon.onBeforeRender(null, null, bathroom);
  assert.ok(horizon.material.uniforms.frame.value.z > 1, 'the horizon retreats out of a close interior view');
});
