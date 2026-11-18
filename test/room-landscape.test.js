import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Raycaster, Vector3 } from 'three';
import { roomFinishes, ROOM_FLOOR_SCALE, ROOM_YARD } from '../server/catalog/room.js';
import { RoomScene } from '../client/src/room/scene.js';
import { makeRoomCamera, ROOM_WALL_HEIGHT, ROOM_GRADE } from '../client/src/room/scene-model.js';
import { homesteadLandscape, groundLevel } from '../client/src/room/landscape.js';

test('every yard fence finish keeps the Moon post, the wagon pad and the gate on a single editable fence', () => {
  const scene = Object.create(RoomScene.prototype), down = new Vector3(0, -1, 0);
  scene.structure = new Group(); scene.structure.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE);
  const ray = new Raycaster(), profiles = new Set();
  for (const typeId of ['splitrail', 'picket', 'wire']) {
    scene.furnishings(roomFinishes({ fence: { typeId, colorId: 'walnut' } }));
    const fence = scene.yardFence;
    scene.structure.updateMatrixWorld(true);
    assert.deepEqual(fence.userData.selection, { kind: 'surface', surface: 'fence' });
    ray.set(new Vector3(8.7 * ROOM_FLOOR_SCALE, 2, -7.25 * ROOM_FLOOR_SCALE), down);
    assert.ok(Math.abs(ray.intersectObject(fence)[0].point.y - groundLevel(8.7, -7.25) - .78) < 1e-6, 'the Moon ties to the far corner post');
    for (const [x, z] of [[3.4, 7.25], [3.7, -7.25], [8.7, 7.25], [8.7, 3.33], [8.7, 2.33]]) {
      ray.set(new Vector3(x * ROOM_FLOOR_SCALE, 2, z * ROOM_FLOOR_SCALE), down);
      assert.ok(ray.intersectObject(fence).length, 'posts stand at both house corners, the front corner and the gate');
    }
    for (const z of [5.5, 0, -5]) {
      ray.set(new Vector3(8.72 * ROOM_FLOOR_SCALE, 2, z * ROOM_FLOOR_SCALE), down);
      assert.ok(ray.intersectObject(fence).length, 'rails run along the road');
    }
    ray.set(new Vector3(8.72 * ROOM_FLOOR_SCALE, 2, 2.83 * ROOM_FLOOR_SCALE), down);
    assert.equal(ray.intersectObject(fence).length, 0, 'the footpath leaves through a gap');
    for (const x of [ROOM_YARD[0], ROOM_YARD[2]]) for (const z of [ROOM_YARD[1], ROOM_YARD[3]]) {
      ray.set(new Vector3(x, 2, z), down);
      assert.equal(ray.intersectObject(fence).length, 0, 'no rails cross the wagon pad');
    }
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
  const gate = new Raycaster(new Vector3(8.80 * ROOM_FLOOR_SCALE, 12, 2.83 * ROOM_FLOOR_SCALE), down);
  assert.ok(gate.intersectObject(scenery).length > 0, 'the dirt footpath begins at the yard gate');
  const across = new Vector3(1, 0, 0), S = ROOM_FLOOR_SCALE;
  for (const z of [-3, -.68, .34, 1.84, 2.34, 2.65, 2.96, 3.49, 4.35, 5.45]) {
    const approach = new Raycaster(new Vector3(8.79 * S, 0.83, z * S), across, 0, 1.6 * S);
    assert.equal(approach.intersectObject(scenery).length, 0, 'open ground from the fence to the road has no second fence');
  }
  for (const [x, z] of [[5.1, 0], [5.1, 2.83], [6.3, 2.83], [7.5, -0.6]]) {
    const under = new Raycaster(new Vector3(x * ROOM_FLOOR_SCALE, 12, z * ROOM_FLOOR_SCALE), down);
    assert.equal(under.intersectObject(scenery).length, 0, 'nothing grows through the porch, its steps or the wagon pad');
  }
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
    for (const [x, z] of [[-4.1, -7.14], [3.63, -7.14], [7.7, -5.1], [8.7, -7.25], [8.7, 2.83], [9.25, 4.2], [8.7, 7.25], [6.1, 3.42], [3.34, 7.24], [-2.44, 7.24], [-4.1, 3.35]]) {
      for (const y of [ROOM_GRADE - 0.13, ROOM_WALL_HEIGHT + 0.1]) {
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
    for (const [x, z] of [[-4, -7.05], [3.55, -7.05], [-2.35, 7.15], [3.25, 7.15], [6.1, -3.25], [6.1, 3.42]]) {
      ray.set(new Vector3(x * S, 0.65, z * S), direction);
      assert.equal(ray.intersectObject(country).length, 0, 'the rooms remain visible with landscape in the foreground');
    }
  }
});

test('one graded lawn, three steps below the floors, supports the wagon pad and continues across the kitchen frontage', () => {
  const landscape = homesteadLandscape(), ground = landscape.getObjectByName('ranch-ground');
  landscape.updateMatrixWorld(true);
  const S = ROOM_FLOOR_SCALE, down = new Vector3(0, -1, 0), colors = ground.geometry.getAttribute('color');
  const sample = (x, z) => new Raycaster(new Vector3(x * S, 12, z * S), down).intersectObject(ground)[0];
  for (const x of [ROOM_YARD[0], ROOM_YARD[2]]) for (const z of [ROOM_YARD[1], ROOM_YARD[3]]) {
    const { y } = sample(x / S, z / S).point;
    assert.ok(y > ROOM_GRADE - 0.035 && y < ROOM_GRADE, 'wheels remain supported at each corner of the pad');
    assert.ok(Math.abs(groundLevel(x / S, z / S) - y) < 0.02, 'things standing outside the landscape find the same ground');
  }
  const warmth = (x, z) => {
    const { a } = sample(x, z).face;
    return colors.getX(a) / colors.getY(a);
  };
  const bath = warmth(6.5, 5.75), wagon = warmth(6, 0), windmill = warmth(5.15, -5.75), dust = warmth(12.5, 4.35);
  assert.ok(bath < windmill && wagon < windmill && windmill < dust, 'sage grass turns to a dry side lawn, then to desert');
  assert.ok(warmth(9.5, 2.83) > windmill, 'the dirt footpath continues from the gate to the road');
  assert.ok(warmth(7.6, 2.83) > wagon && warmth(7.6, 1.2) < warmth(7.6, 2.83), 'the lawn is worn from the porch steps to the gate');
});
