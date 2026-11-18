import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Raycaster, Vector3 } from 'three';
import { roomFinishes, ROOM_FLOOR_SCALE } from '../server/catalog/room.js';
import { RoomScene } from '../client/src/room/scene.js';
import { makeRoomCamera, ROOM_WALL_HEIGHT } from '../client/src/room/scene-model.js';
import { homesteadLandscape } from '../client/src/room/landscape.js';

test('every paddock finish keeps the Moon post and wagon footprint on a single editable fence', () => {
  const scene = Object.create(RoomScene.prototype), down = new Vector3(0, -1, 0);
  scene.structure = new Group(); scene.structure.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE);
  const ray = new Raycaster(), profiles = new Set();
  for (const typeId of ['splitrail', 'picket', 'wire']) {
    scene.furnishings(roomFinishes({ fence: { typeId, colorId: 'walnut' } }));
    const fence = scene.yardFence;
    scene.structure.updateMatrixWorld(true);
    assert.deepEqual(fence.userData.selection, { kind: 'surface', surface: 'fence' });
    ray.set(new Vector3(6.35 * ROOM_FLOOR_SCALE, 2, -2.9 * ROOM_FLOOR_SCALE), down);
    assert.ok(Math.abs(ray.intersectObject(fence)[0].point.y - .78) < 1e-6, 'the Moon still ties to the middle post');
    ray.set(new Vector3(7 * ROOM_FLOOR_SCALE, 2, 0), down);
    assert.equal(ray.intersectObject(fence).length, 0, 'no rails cross the saved wagon pad');
    profiles.add(fence.geometry.attributes.position.count);
    const firstPaint = fence.geometry.attributes.color.getX(0);
    let released = false;
    fence.geometry.addEventListener('dispose', () => { released = true; });
    scene.furnishings(roomFinishes({ fence: { typeId, colorId: 'walnut' } }));
    assert.equal(scene.yardFence, fence, 'a room update reuses its existing finish');
    scene.furnishings(roomFinishes({ fence: { typeId, colorId: 'whitewash' } }));
    assert.notEqual(scene.yardFence.geometry.attributes.color.getX(0), firstPaint);
    assert.ok(released);
    assert.deepEqual(scene.structure.children, [scene.yardFence]);
  }
  assert.equal(profiles.size, 3, 'rail, picket and wire each has a distinct silhouette');
});

test('the desert surrounds the house without putting scenery through furnished rooms or the yard door', () => {
  const landscape = homesteadLandscape(), down = new Vector3(0, -1, 0);
  landscape.updateMatrixWorld(true);
  for (const [x, z] of [[0, 0], [-3, 7.03], [3.15, 7.08], [-3.95, -6.96], [2.23, -4.0], [-2.5, -3.85], [-1.5, -6.3], [4.2, 1.5], [8.4, 2.6], [8.9, 2.6]]) {
    const ray = new Raycaster(new Vector3(x * ROOM_FLOOR_SCALE, 12, z * ROOM_FLOOR_SCALE), down);
    const hits = ray.intersectObject(landscape, true);
    assert.ok(hits.length && hits.every(hit => hit.point.y < 0), 'clear ground beneath the occupied lot and exit');
  }
  const scenery = landscape.getObjectByName('red-rock-country');
  const stairs = new Raycaster(new Vector3(8.80 * ROOM_FLOOR_SCALE, 12, 2.6 * ROOM_FLOOR_SCALE), down);
  assert.ok(stairs.intersectObject(scenery).length > 0, 'the dirt footpath begins against the front step');
  const across = new Vector3(1, 0, 0), S = ROOM_FLOOR_SCALE;
  for (const z of [-3, -.68, .34, 1.84, 2.34, 2.65, 2.96, 3.49, 4.35, 5.45]) {
    const approach = new Raycaster(new Vector3(8.79 * S, 0.83, z * S), across, 0, 1.6 * S);
    assert.equal(approach.intersectObject(scenery).length, 0, 'open ground from the porch to the road has no second fence');
  }
  const deck = new Raycaster(new Vector3(8.38 * ROOM_FLOOR_SCALE, 12, 1.65 * ROOM_FLOOR_SCALE), down);
  assert.equal(deck.intersectObject(scenery).length, 0, 'there is no old yard trail buried beneath the deck');
  const sandstone = new Raycaster(new Vector3(-9.75 * ROOM_FLOOR_SCALE, 12, -8.35 * ROOM_FLOOR_SCALE), down);
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
    for (const [x, z] of [[-4.1, -7.14], [3.63, -7.14], [7.7, -5.1], [8.78, 2.60], [6.35, -2.9], [8.5, 4.8], [5.5, 7.3], [3.34, 7.24], [-2.44, 7.24], [-4.1, 3.35]]) {
      for (const y of [0, ROOM_WALL_HEIGHT + 0.1]) {
        point.set(x * S, y, z * S).project(camera);
        const backdropDepth = frame.w + (point.y - frame.z) * horizon.material.uniforms.depthSlope.value;
        assert.ok(backdropDepth > point.z, 'floors, roofs and posts stand in front of the vertical panorama');
      }
    }
  }
  const bathroom = makeRoomCamera(1.5, { area: 'bathroom', zoom: 2 });
  horizon.onBeforeRender(null, null, bathroom);
  assert.ok(horizon.material.uniforms.frame.value.z > 1, 'the horizon retreats out of a close interior view');
});

test('no rock formation screens the bedroom, bathroom or porch on a full turn', () => {
  const landscape = homesteadLandscape(), country = landscape.getObjectByName('red-rock-country');
  landscape.updateMatrixWorld(true);
  const S = ROOM_FLOOR_SCALE, ray = new Raycaster();
  for (let angle = 0; angle < 360; angle += 15) {
    const direction = makeRoomCamera(2, { rotation: angle }).getWorldDirection(new Vector3()).negate();
    for (const [x, z] of [[-4, -7.05], [3.55, -7.05], [-2.35, 7.15], [3.25, 7.15], [8.5, 1.47], [8.5, 4.8]]) {
      ray.set(new Vector3(x * S, 0.65, z * S), direction);
      assert.equal(ray.intersectObject(country).length, 0, 'the rooms remain visible with landscape in the foreground');
    }
  }
});

test('one graded lawn supports saved wagon placements and continues across the kitchen frontage', () => {
  const landscape = homesteadLandscape(), ground = landscape.getObjectByName('ranch-ground');
  landscape.updateMatrixWorld(true);
  const S = ROOM_FLOOR_SCALE, down = new Vector3(0, -1, 0), colors = ground.geometry.getAttribute('color');
  const sample = (x, z) => new Raycaster(new Vector3(x * S, 12, z * S), down).intersectObject(ground)[0];
  for (const x of [4.3, 8.4]) for (const z of [-2.8, 1.4]) {
    assert.ok(sample(x, z).point.y > -0.035, 'wheels remain supported at each corner of the original pad');
  }
  const warmth = (x, z) => {
    const { a } = sample(x, z).face;
    return colors.getX(a) / colors.getY(a);
  };
  const bath = warmth(6.5, 5.75), wagon = warmth(6, 0), windmill = warmth(5.15, -5.75), dust = warmth(12.5, 4.35);
  assert.ok(bath < windmill && wagon < windmill && windmill < dust, 'sage grass turns to a dry side lawn, then to desert');
  assert.ok(warmth(9.5, 2.65) > windmill, 'the dirt footpath continues from the front steps to the road');
});
