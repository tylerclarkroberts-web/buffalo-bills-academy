import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Raycaster, Vector3 } from 'three';
import { buildHomestead } from '../client/src/room/homestead.js';
import { ROOM_FLOOR_SCALE as S, ROOM_HOMESTEAD, roomHomestead } from '../server/catalog/room.js';
import { makeRoomCamera, ROOM_WALL_HEIGHT } from '../client/src/room/scene-model.js';

async function readAsset(request) {
  const bytes = await readFile(new URL(request.url));
  return { status: 200, arrayBuffer: () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function actions(home) {
  return home.picks.map(mesh => [mesh.name, mesh.userData.selection.kind, mesh.userData.selection.action]);
}
const expected = [['toilet', 'houseAction', 'flush'], ['kitchenCoffeeMachine', 'houseAction', 'coffee'], ['chair', 'houseAction', 'coffee']];

test('local GLB supplies the nine furnishings and pickable actions in the expanded floor plan', async t => {
  t.mock.method(globalThis, 'fetch', readAsset);
  const root = new Group(), home = buildHomestead(root);
  await home.ready;
  assert.deepEqual(actions(home), expected);
  const pump = root.getObjectByName('Ranch windpump and stock trough');
  assert.ok(pump.isMesh);
  const pumpBounds = new Box3().setFromObject(pump);
  assert.ok(pumpBounds.min.x > 4.3 * S && pumpBounds.max.z < -3 * S);
  assert.ok(pumpBounds.max.y > 4 && pumpBounds.max.y < 4.4);
  for (const name of ['bathtub', 'bathroomSink', 'toilet', 'bedSingle', 'kitchenStove', 'kitchenCabinet', 'kitchenCoffeeMachine', 'chair', 'pottedPlant']) {
    const part = root.getObjectByName(name);
    assert.ok(part?.isMesh && part.geometry.attributes.color, name);
    const bounds = new Box3().setFromObject(part);
    if (name === 'chair' || name === 'pottedPlant') assert.ok(bounds.min.z >= 1.47 * S && bounds.max.z <= 4.8 * S, name);
    else if (['bathtub', 'toilet', 'bathroomSink'].includes(name)) assert.ok(bounds.min.z >= 3.25 * S && bounds.max.z <= 7.15 * S, name);
    else assert.ok(bounds.min.z >= -7.05 * S && bounds.max.z <= -3 * S, name);
  }
  const spray = root.getObjectByName('Watering the lawn chair');
  assert.equal(spray.visible, false);
  home.setSprinkler(true);
  assert.equal(spray.visible, true);
  const disposed = t.mock.fn();
  root.getObjectByName('chair').geometry.addEventListener('dispose', disposed);
  home.dispose(); home.dispose();
  assert.equal(disposed.mock.callCount(), 1);
  assert.equal(root.children.length, 0);
});

test('an unavailable model file leaves visible, pickable household fixtures', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Offline'); });
  const root = new Group(), home = buildHomestead(root);
  await home.ready;
  assert.deepEqual(actions(home), expected);
  assert.ok(home.picks.every(mesh => mesh.visible && mesh.geometry.attributes.position.count > 0));
  home.dispose();
});

test('furniture fits the resident and usable surfaces meet at their finished heights', async t => {
  t.mock.method(globalThis, 'fetch', readAsset);
  const root = new Group(), home = buildHomestead(root), inch = ROOM_WALL_HEIGHT / 102;
  await home.ready;
  root.updateMatrixWorld(true);
  const item = name => root.getObjectByName(name);
  const bounds = name => new Box3().setFromObject(item(name));
  const close = (actual, wanted) => assert.ok(Math.abs(actual - wanted) < 0.1, `${actual}″ should be ${wanted}″`);
  function topAt(mesh, x = mesh.position.x, z = mesh.position.z) {
    const from = new Vector3(x, 8, z);
    return new Raycaster(from, new Vector3(0, -1, 0)).intersectObject(mesh)[0].point.y;
  }
  const tub = bounds('bathtub').getSize(new Vector3()).divideScalar(inch);
  close(tub.x, 72); close(tub.z, 36);
  const toilet = item('toilet');
  close((topAt(toilet) - toilet.position.y) / inch, 17);
  close((topAt(toilet, toilet.position.x, toilet.position.z + 12 * inch) - toilet.position.y) / inch, 31);
  assert.ok(bounds('toilet').max.z < (7.15 - 0.075) * S, 'tank clears the outer wall cap');
  const camera = makeRoomCamera(2), view = new Raycaster();
  const seat = new Vector3(toilet.position.x, toilet.position.y + 17 * inch, toilet.position.z - 4 * inch);
  view.setFromCamera(seat.project(camera), camera);
  assert.equal(view.intersectObjects([toilet, item('Bathroom doorway'), item('Linen cupboard')], true)[0]?.object,
    toilet, 'the bathroom divider and linen cupboard leave the seat visible in the whole-house view');
  close((topAt(item('chair')) - item('chair').position.y) / inch, 18);
  close((bounds('bedSingle').max.x - bounds('bedSingle').min.x) / inch, 90);
  close((bounds('bedSingle').max.z - bounds('bedSingle').min.z) / inch, 61);
  close((topAt(item('bedSingle')) - item('bedSingle').position.y) / inch, 22.67);
  const cabinet = bounds('kitchenCabinet'), range = bounds('kitchenStove');
  close((cabinet.min.x - range.max.x) / inch, 0);
  close((cabinet.min.z - range.min.z) / inch, 0);
  const counterTop = topAt(item('kitchenCabinet'));
  close((counterTop - cabinet.min.y) / inch, 36);
  close((bounds('kitchenCoffeeMachine').min.y - counterTop) / inch, 0);
  const porch = item('Porch and rails');
  close((topAt(item('Linen cupboard'), 2.22 * S, 6.05 * S + 17 * inch) - cabinet.min.y) / inch, 34);
  close((topAt(item('Kitchen worktable'), 0.13 * S - 15 * inch, -4.74 * S + 9 * inch) - cabinet.min.y) / inch, 36);
  for (const [x,z] of [[4.23,1.72],[5.10,1.82],[6.55,1.85],[6.55,3.50],[8.67,2.60]]) {
    assert.ok(Math.abs(topAt(porch, x * S, z * S) - 0.025) < 0.001, 'deck supports sill, walking route and tread');
  }
  const throughRail = z => new Raycaster(new Vector3(8.1 * S, 36 * inch, z * S), new Vector3(1, 0, 0), 0, 0.9 * S).intersectObject(porch);
  assert.equal(throughRail(2.60).length, 0);
  assert.ok(throughRail(3.9).length > 0);
  home.dispose();
});

test('custom furnishings and surfaces update in place for the GLB and offline models', async t => {
  for (const offline of [false, true]) {
    t.mock.method(globalThis, 'fetch', offline ? async () => { throw Error('Offline'); } : readAsset);
    const root = new Group(), home = buildHomestead(root), next = {};
    for (const [id, catalog] of Object.entries(ROOM_HOMESTEAD)) next[id] = {
      typeId: catalog.types[1].id, colorId: catalog.colors[1].id, layoutId: 'alternate',
    };
    home.update(next); // The saved room can arrive before its models.
    await home.ready;
    assert.deepEqual(actions(home), expected);
    assert.deepEqual(new Set(home.editPicks.map(mesh => mesh.userData.editSelection.id)), new Set(Object.keys(ROOM_HOMESTEAD)));
    const find = name => root.getObjectByName(name);
    const bed = find('bedSingle'), tub = find('bathtub'), chair = find('chair'), cabinet = find('kitchenCabinet');
    assert.equal(bed.rotation.y, -Math.PI / 2); assert.equal(tub.rotation.y, Math.PI / 2);
    assert.equal(chair.position.x, 5.55 * S);
    assert.equal(bed.getObjectByName('Surface pattern').geometry.attributes.position.count, 28);
    assert.equal(cabinet.position.x, find('kitchenCoffeeMachine').position.x);
    assert.equal(cabinet.position.z, find('kitchenCoffeeMachine').position.z);
    assert.ok(tub.material.metalness > 0);
    const tint = mesh => Array.from(mesh.geometry.attributes.color.array);
    const blanket = tint(bed), coloredTub = tint(tub), paintedSeat = tint(chair);
    const floor = find('Bathroom floor'), disposed = t.mock.fn();
    floor.geometry.addEventListener('dispose', disposed);
    home.update(next);
    assert.equal(find('Bathroom floor'), floor);
    home.setSprinkler(true);
    home.update();
    assert.equal(find('bedSingle'), bed); assert.equal(find('bathtub'), tub); assert.equal(find('chair'), chair);
    assert.equal(tub.material.metalness, 0);
    assert.notDeepEqual(tint(bed), blanket); assert.notDeepEqual(tint(tub), coloredTub); assert.notDeepEqual(tint(chair), paintedSeat);
    assert.ok(bed.getObjectByName('Surface pattern').geometry.attributes.position.count > 28);
    assert.ok(chair.getObjectByName('Surface pattern'));
    assert.equal(find('Watering the lawn chair').visible, true);
    assert.equal(home.editPicks.includes(floor), false);
    assert.equal(disposed.mock.callCount(), 1);
    assert.deepEqual(actions(home), expected);
    home.dispose();
    t.mock.restoreAll();
  }
});

test('curated fixture arrangements clear each other and the smaller bathroom walls', async t => {
  t.mock.method(globalThis, 'fetch', readAsset);
  const root = new Group(), home = buildHomestead(root);
  await home.ready; t.after(() => home.dispose());
  const choices = roomHomestead();
  for (let layout = 0; layout < 8; layout++) {
    for (const [id, bit] of Object.entries({ tub: 1, bathroom: 2, bed: 1, bedroom: 2, kitchen: 4, porch: 1, porchChair: 2 })) {
      choices[id].layoutId = layout & bit ? 'alternate' : 'classic';
    }
    home.update(choices);
    const bounds = name => new Box3().setFromObject(root.getObjectByName(name));
    const bath = ['bathtub', 'toilet', 'bathroomSink', 'Linen cupboard'];
    for (const id of bath) {
      const box = bounds(id);
      assert.ok(box.min.x > -2.35 * S && box.max.x < 3.25 * S && box.min.z > 3.35 * S && box.max.z < 7.15 * S, id);
    }
    for (const names of [bath, ['bedSingle', 'Nightstand and lamp', 'Kitchen worktable', 'kitchenCabinet', 'kitchenStove'], ['chair', 'pottedPlant']]) {
      for (let i = 0; i < names.length; i++) for (const other of names.slice(i + 1)) {
        assert.equal(bounds(names[i]).expandByScalar(-0.005).intersectsBox(bounds(other)), false, names[i] + ' clears ' + other);
      }
    }
    const chair = bounds('chair'), jet = root.getObjectByName('Watering the lawn chair').geometry.attributes.position;
    const end = new Vector3().fromBufferAttribute(jet, jet.count - 1);
    assert.ok(chair.containsPoint(end), 'the spray still lands on the chair after moving it');
  }
});

test('leaving before the models arrive releases the scene and suppresses its redraw', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', request => new Promise(resolve => { finish = () => resolve(readAsset(request)); }));
  const onReady = t.mock.fn(), root = new Group(), home = buildHomestead(root, { onReady });
  home.dispose();
  finish();
  await home.ready;
  assert.equal(root.children.length, 0);
  assert.equal(home.picks.length, 0);
  assert.equal(onReady.mock.callCount(), 0);
});
