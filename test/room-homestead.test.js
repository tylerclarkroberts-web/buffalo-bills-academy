import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Raycaster, Vector3 } from 'three';
import { buildHomestead, HOMESTEAD_PIECES } from '../client/src/room/homestead.js';
import { ROOM_FLOOR_SCALE as S, ROOM_HOMESTEAD, defaultFurniture, furnitureRect, furnitureFits } from '../server/catalog/room.js';
import { makeRoomCamera, ROOM_WALL_HEIGHT, ROOM_GRADE } from '../client/src/room/scene-model.js';
import { groundLevel } from '../client/src/room/landscape.js';

async function readAsset(request) {
  const bytes = await readFile(new URL(request.url));
  return { status: 200, arrayBuffer: () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function actions(home) {
  return home.picks.map(mesh => [mesh.name, mesh.userData.selection.kind, mesh.userData.selection.action]);
}
const expected = [['kitchenStove', 'houseAction', 'cook'], ['kitchenCoffeeMachine', 'houseAction', 'coffee'], ['bathtub', 'houseAction', 'bath'], ['toilet', 'houseAction', 'flush'], ['chair', 'houseAction', 'coffee'], ['chair', 'houseAction', 'rock']];
// What the room scene does with saved furniture: put each fitting where it was left.
function place(home, root, furniture = defaultFurniture()) {
  for (const id of HOMESTEAD_PIECES) {
    home.pieces[id].position.set(furniture[id].x, 0, furniture[id].z);
    home.pieces[id].rotation.y = furniture[id].r * Math.PI / 2; home.pieces[id].visible = !furniture[id].off;
  }
  home.update(undefined, furniture); root.updateMatrixWorld(true);
}

test('local GLB supplies the nine furnishings and pickable actions in the expanded floor plan', async t => {
  t.mock.method(globalThis, 'fetch', readAsset);
  const root = new Group(), home = buildHomestead(root);
  await home.ready; place(home, root);
  assert.deepEqual(actions(home), expected);
  const pump = root.getObjectByName('Ranch windpump and stock trough');
  assert.ok(pump.isMesh);
  const pumpBounds = new Box3().setFromObject(pump);
  assert.ok(pumpBounds.min.x > 4.3 * S && pumpBounds.max.z < -3 * S);
  assert.ok(pumpBounds.max.y > 4 + ROOM_GRADE && pumpBounds.max.y < 4.4 + ROOM_GRADE, 'the windpump stands on the lowered ground');
  assert.ok(pumpBounds.min.y < ROOM_GRADE - 0.1 && pumpBounds.min.y > ROOM_GRADE - 0.2);
  const chairs = []; root.traverse(part => { if (part.name === 'chair') chairs.push(part); });
  assert.equal(chairs.length, 2, 'the second porch chair is a copy of the first');
  assert.notEqual(chairs[0].geometry, chairs[1].geometry);
  for (const name of ['bathtub', 'bathroomSink', 'toilet', 'bedSingle', 'kitchenStove', 'kitchenCabinet', 'kitchenCoffeeMachine', 'chair', 'pottedPlant']) {
    const part = root.getObjectByName(name);
    assert.ok(part?.isMesh && part.geometry.attributes.color, name);
    const bounds = new Box3().setFromObject(part);
    if (name === 'chair' || name === 'pottedPlant') assert.ok(bounds.min.x >= 4.13 * S && bounds.max.x <= 6.1 * S && bounds.min.z >= -3.25 * S && bounds.max.z <= 3.42 * S, name);
    else if (name.startsWith('kitchen')) assert.ok(bounds.min.z >= 3.25 * S && bounds.max.z <= 7.15 * S, name);
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
  await home.ready; place(home, root);
  const item = name => root.getObjectByName(name);
  const bounds = name => new Box3().setFromObject(item(name));
  const close = (actual, wanted) => assert.ok(Math.abs(actual - wanted) < 0.1, `${actual}″ should be ${wanted}″`);
  const at = mesh => mesh.getWorldPosition(new Vector3());
  function topAt(mesh, x = at(mesh).x, z = at(mesh).z) {
    const from = new Vector3(x, 8, z);
    return new Raycaster(from, new Vector3(0, -1, 0)).intersectObject(mesh)[0].point.y;
  }
  const tub = bounds('bathtub').getSize(new Vector3()).divideScalar(inch);
  close(tub.x, 72); close(tub.z, 36);
  const toilet = item('toilet');
  close((topAt(toilet) - toilet.position.y) / inch, 17);
  close((topAt(toilet, at(toilet).x, at(toilet).z - 12 * inch) - toilet.position.y) / inch, 31);
  assert.ok(bounds('toilet').min.z > (-7.05 + 0.075) * S, 'tank clears the outer wall cap');
  const camera = makeRoomCamera(2), view = new Raycaster();
  const seat = new Vector3(at(toilet).x, toilet.position.y + 17 * inch, at(toilet).z + 4 * inch);
  view.setFromCamera(seat.project(camera), camera);
  assert.equal(view.intersectObjects([toilet, item('Linen cupboard'), item('bedSingle')], true)[0]?.object,
    toilet, 'the bathroom divider and linen cupboard leave the seat visible in the whole-house view');
  close((topAt(item('chair')) - item('chair').position.y) / inch, 18);
  close((bounds('bedSingle').max.x - bounds('bedSingle').min.x) / inch, 61);
  close((bounds('bedSingle').max.z - bounds('bedSingle').min.z) / inch, 90);
  close((topAt(item('bedSingle')) - item('bedSingle').position.y) / inch, 22.67);
  const cabinet = bounds('kitchenCabinet'), range = bounds('kitchenStove');
  close((range.min.x - cabinet.max.x) / inch, 0);
  close((cabinet.max.z - range.max.z) / inch, 0);
  const counterTop = topAt(item('kitchenCabinet'));
  close((counterTop - cabinet.min.y) / inch, 36);
  close((bounds('kitchenCoffeeMachine').min.y - counterTop) / inch, 0);
  const porch = item('Porch and rails');
  close((topAt(item('Linen cupboard'), -0.79 * S, -5.42 * S + 17 * inch) - cabinet.min.y) / inch, 34);
  close((topAt(item('Kitchen worktable'), -0.61 * S - 15 * inch, 5 * S + 9 * inch) - cabinet.min.y) / inch, 36);
  for (const [x,z] of [[4.23,1.72],[5.3,1.72],[5.22,-0.3],[5,-3.05],[5.85,3.2]]) {
    assert.ok(Math.abs(topAt(porch, x * S, z * S) - 0.025) < 0.001, 'porch boards carry the sill, the walk to the chair and both ends');
  }
  // Two treads share the drop to the lawn evenly with the porch edge.
  const lawn = groundLevel(6.7, 2.83), rise = (0.025 - lawn) / 3;
  assert.ok(rise > 5 * inch && rise < 8 * inch, 'each step is an ordinary height');
  for (const [x, step] of [[6.22, 1], [6.46, 2]]) assert.ok(Math.abs(topAt(porch, x * S, 2.83 * S) - (0.025 - step * rise)) < 0.001, `step ${step}`);
  assert.ok(new Box3().setFromObject(porch).min.y < lawn, 'the porch skirt reaches the ground');
  const footings = new Box3().setFromObject(item('Footings'));
  assert.ok(footings.min.y <= ROOM_GRADE - 0.13 && footings.max.y < 0, 'footings carry the floors down to the lower ground behind the house');
  assert.ok(footings.min.x < -4 * S && footings.max.x > 4 * S && footings.min.z < -7 * S && footings.max.z > 7 * S);
  const throughRail = z => new Raycaster(new Vector3(5.6 * S, 36 * inch, z * S), new Vector3(1, 0, 0), 0, 0.9 * S).intersectObject(porch);
  assert.equal(throughRail(2.83).length, 0, 'the head of the steps is open');
  assert.ok(throughRail(0).length > 0, 'the rest of the front has a rail');
  // What he uses only appears while he uses it; the kitchen chair stands on the side he can reach.
  for (const name of ['Bath water', 'Skillet', 'Supper']) assert.equal(item(name).visible, false, name);
  home.setProps({ bath: 1, cook: true, eat: true, chairSide: -1 }); root.updateMatrixWorld(true);
  for (const name of ['Bath water', 'Skillet', 'Supper', 'Kitchen chair']) assert.equal(item(name).visible, true, name);
  assert.ok(at(item('Bath water')).y > 0.5 && at(item('Bath water')).y < bounds('bathtub').max.y, 'a full tub is full to below the rim');
  close((bounds('Skillet').min.y - counterTop) / inch, 0);
  close((bounds('Supper').min.y - topAt(item('Kitchen worktable'), -0.61 * S - 15 * inch, 5 * S + 9 * inch)) / inch, 0);
  const table = bounds('Kitchen worktable'), stool = bounds('Kitchen chair');
  assert.ok(stool.max.z < table.min.z + 0.2 && stool.min.z > table.min.z - 1.4, 'the chair is tucked up to the near side');
  close((topAt(item('Kitchen chair'), at(item('Kitchen chair')).x, (stool.min.z + stool.max.z) / 2 + 2 * inch) - cabinet.min.y) / inch, 18);
  home.setProps({ chairSide: 0 });
  assert.equal(item('Kitchen chair').visible, false, 'no chair where he could not sit in it');
  assert.equal(item('Skillet').visible, false);
  assert.equal(item('Rockers').parent, home.pieces.porchChair2);
  assert.equal(home.pieces.porchChair2.rotation.order, 'YXZ', 'the rocker tips in its own frame however it is turned');
  home.dispose();
});

test('custom furnishings and surfaces update in place for the GLB and offline models', async t => {
  for (const offline of [false, true]) {
    t.mock.method(globalThis, 'fetch', offline ? async () => { throw Error('Offline'); } : readAsset);
    const root = new Group(), home = buildHomestead(root), next = {};
    for (const [id, catalog] of Object.entries(ROOM_HOMESTEAD)) next[id] = {
      typeId: catalog.types[1].id, colorId: catalog.colors[1].id,
    };
    home.update(next); // The saved room can arrive before its models.
    await home.ready;
    assert.deepEqual(actions(home), expected);
    assert.deepEqual(new Set(home.editPicks.map(mesh => mesh.userData.editSelection.id)), new Set(Object.keys(ROOM_HOMESTEAD)));
    const find = name => root.getObjectByName(name);
    const bed = find('bedSingle'), tub = find('bathtub'), chair = find('chair'), cabinet = find('kitchenCabinet');
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

test('every fitting stays inside the footprint its room checks, at every turn, and the sprinkler follows the chair', async t => {
  t.mock.method(globalThis, 'fetch', readAsset);
  const root = new Group(), home = buildHomestead(root);
  await home.ready; t.after(() => home.dispose());
  // Rugs laid in front of the tub and stove may run past the footprint; everything that stands up may not.
  const standing = id => {
    const box = new Box3();
    home.pieces[id].traverse(part => { if (part.isMesh && !['Bath mat', 'Kitchen runner', 'Surface pattern'].includes(part.name)) box.expandByObject(part, true); });
    return box;
  };
  for (const id of HOMESTEAD_PIECES) for (const r of [0, 1, 2, 3]) {
    const furniture = defaultFurniture(); furniture[id] = { ...furniture[id], r };
    place(home, root, furniture);
    const box = standing(id), [minX, minZ, maxX, maxZ] = furnitureRect(id, furniture[id]);
    assert.ok(box.min.x > minX - 0.06 && box.max.x < maxX + 0.06 && box.min.z > minZ - 0.06 && box.max.z < maxZ + 0.06, `${id} turned ${r}`);
  }
  const furniture = defaultFurniture(); furniture.porchChair = { ...furniture.porchChair, x: 9.5, z: -4, r: 2 };
  assert.ok(furnitureFits(furniture, 'porchChair'));
  place(home, root, furniture);
  const chair = new Box3().setFromObject(root.getObjectByName('chair')), jet = root.getObjectByName('Watering the lawn chair').geometry.attributes.position;
  assert.ok(chair.containsPoint(new Vector3().fromBufferAttribute(jet, jet.count - 1)), 'the spray still lands on the chair after moving it');
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
