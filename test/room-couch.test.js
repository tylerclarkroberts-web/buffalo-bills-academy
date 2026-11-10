import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residentErrands, makeRoomCamera } from '../client/src/room/scene-model.js';
import { residentPose } from '../client/src/room/activity.js';
import { defaultFurniture, defaultShelves, defaultWallDisplays, furnitureValid, furnitureRect, upgradeFurniture, wallMountsFit, roomFinishes, ROOM_FURNITURE, ROOM_FLOOR_SCALE as S } from '../server/catalog/room.js';

test('the couch starts somewhere valid and the resident can walk to it, the cash table and things to inspect', () => {
  const furniture = defaultFurniture(), errands = residentErrands(furniture);
  assert.ok(furnitureValid(furniture)); assert.ok(wallMountsFit(defaultShelves(), defaultWallDisplays(), furniture));
  assert.deepEqual(roomFinishes().couch, { typeId: 'settee', colorId: 'oxblood' });
  assert.deepEqual(errands.slice(0, 3).map(errand => errand.kind), ['sit', 'inspect', 'cash']);
  const solid = Object.keys(ROOM_FURNITURE).filter(id => !ROOM_FURNITURE[id].flat && !ROOM_FURNITURE[id].yard).map(id => furnitureRect(id, furniture[id]));
  for (const errand of errands) {
    let from = [furniture.rug.x, furniture.rug.z];
    for (const to of errand.path) {
      for (let part = 0; part <= 1; part += 0.05) {
        const x = from[0] + (to[0] - from[0]) * part, z = from[1] + (to[1] - from[1]) * part;
        assert.ok(!solid.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3]), `${errand.kind} walks around furniture`);
      }
      from = to;
    }
  }
  const seat = errands[0].seat, couch = furnitureRect('couch', furniture.couch);
  assert.ok(seat[0] > couch[0] && seat[0] < couch[2] && seat[1] > couch[1] && seat[1] < couch[3], 'they sit on it, not beside it');
  assert.equal(residentErrands({ ...furniture, couch: { ...furniture.couch, off: true } }).some(errand => errand.kind === 'sit'), false);
  const boxedIn = { ...furniture, rug: { x: 0, z: 0, r: 0 }, desk: { x: 0, z: -0.9, r: 0 }, floor: { x: 0, z: 0.9, r: 0 }, wardrobe: { x: -1.3, z: 0, r: 0 }, pet: { x: 1.45, z: 0, r: 0 } };
  assert.deepEqual(residentErrands(boxedIn), []);
});

test('rooms arranged on the earlier floor spread out and gain a couch only where one fits', () => {
  const k = S / Math.sqrt(1.75), old = { desk: { x: -0.73, z: -2.87, r: 0 }, wardrobe: { x: 4.54, z: -3.47, r: 0 }, window: { x: 8.2, z: -0.4, r: 0 } };
  const upgraded = upgradeFurniture(old, defaultShelves(), defaultWallDisplays());
  assert.ok(furnitureValid(upgraded));
  assert.equal(upgraded.wardrobe.x, Math.round(4.54 * k * 100) / 100);
  assert.equal(!!upgraded.couch.off, false, 'the old desk spot is taken, so the couch finds clear floor nearby');
  assert.notDeepEqual([upgraded.couch.x, upgraded.couch.z], ROOM_FURNITURE.couch.home);
  assert.deepEqual(upgradeFurniture(undefined, defaultShelves(), defaultWallDisplays()), defaultFurniture());
  const snug = upgradeFurniture({ ...old, pet: { x: -4.39, z: 1.65, r: 0 } }, defaultShelves(), defaultWallDisplays());
  assert.ok(furnitureValid(snug), 'a terrarium that was tight against the wall is nudged, not reset');
  assert.equal(snug.wardrobe.x, upgraded.wardrobe.x); assert.ok(snug.pet.x > Math.round(-4.39 * k * 100) / 100);
  const shelves = [{ ...defaultShelves()[0], spotId: 'back-low-left' }];
  assert.ok(wallMountsFit(shelves, defaultWallDisplays(), upgradeFurniture(undefined, shelves, defaultWallDisplays())), 'an old shelf keeps its place; the couch goes elsewhere');
});

test('each stroll is a new errand with time to act, and panning only moves a zoomed view', () => {
  assert.equal(residentPose(5).errand, 0); assert.equal(residentPose(40).errand, 1);
  assert.equal(residentPose(9).act, 0); assert.equal(residentPose(15).act, 1); assert.equal(residentPose(22).act, 0);
  const fit = makeRoomCamera(2), same = makeRoomCamera(2, {}, [1, -1]);
  assert.equal(same.left, fit.left); assert.equal(same.top, fit.top);
  const zoomed = makeRoomCamera(2, { zoom: 2 }), panned = makeRoomCamera(2, { zoom: 2 }, [1, 9]);
  assert.ok(panned.left > zoomed.left && panned.top > zoomed.top);
  assert.ok(Math.abs((panned.left + panned.right) / 2 + (panned.right - panned.left) / 4 - fit.right) < 1e-9, 'the view stops at the edge of the fitted frame');
});
