import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Group } from 'three';
import { buildHomestead } from '../client/src/room/homestead.js';
import { ROOM_FLOOR_SCALE as S } from '../server/catalog/room.js';

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
    if (name === 'chair' || name === 'pottedPlant') assert.ok(bounds.min.z >= 2.5 * S && bounds.max.z <= 4.8 * S, name);
    else assert.ok(bounds.min.z >= 3.25 * S && bounds.max.z <= 6.4 * S, name);
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
