import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { faunVisitRoute, roomShelfPosition } from '../client/src/room/scene-model.js';
import { roomFaun } from '../client/src/room/faun.js';
import { faunPose } from '../client/src/room/activity.js';
import { coveredWagon } from '../client/src/room/wagon.js';
import { defaultFurniture, defaultShelves, defaultWallDisplays, furnitureRect, residentRect, furnitureValid, wallMountsFit, ROOM_FLOOR_SCALE as S, ROOM_FURNITURE, ROOM_SHELF_SPOTS } from '../server/catalog/room.js';

const box = ([x1, z1, x2, z2]) => new THREE.Box3(new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 4, z2));
function dispose(root) {
  const resources = new Set();
  root.traverse(object => { if (object.geometry) resources.add(object.geometry); if (object.material) resources.add(object.material); });
  resources.forEach(resource => resource.dispose());
}
function checkAnimatedRoute(route, furniture, shelves = []) {
  const faun = roomFaun(), wagon = coveredWagon(); faun.scale.y = 1.25;
  wagon.scale.setScalar(1.65); wagon.rotation.y = furniture.window.r * Math.PI / 2 - 0.16;
  wagon.position.set(furniture.window.x, 0.02, furniture.window.z);
  const obstacles = route.location === 'room' ? Object.entries(ROOM_FURNITURE)
    .filter(([id, piece]) => !piece.flat && !piece.yard && !furniture[id].off).map(([id]) => box(furnitureRect(id, furniture[id])))
    : [new THREE.Box3().setFromObject(wagon)];
  if (route.location === 'room') {
    obstacles.push(box(residentRect(furniture)), box([-0.45 * S, -3 * S, 1.95 * S, -3 * S + 0.65]));
    for (const shelf of shelves) {
      const spot = ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId), [x, , z] = roomShelfPosition(spot), along = shelf.sizeId === 'wide' ? 1.25 : 0.45;
      obstacles.push(box(spot.wallSide === 'left' ? [x - 0.65, z - along, x + 0.65, z + along] : [x - along, z - 0.65, x + along, z + 0.65]));
    }
  }
  const area = route.location === 'room' ? [-4 * S, -3 * S, 4 * S, 3 * S] : [4.3 * S, -2.8 * S, 8.4 * S, 3 * S];
  for (let seconds = 0; seconds <= 18; seconds += 0.25) {
    const pose = faunPose(seconds);
    faun.position.set(route.from.x + (route.to.x - route.from.x) * pose.peek, 0.02, route.from.z + (route.to.z - route.from.z) * pose.peek);
    faun.rotation.set(0, route.facing + pose.turn, pose.lean);
    faun.getObjectByName('faun-head').rotation.y = pose.glance;
    faun.children.filter(part => part.name === 'faun-goat-leg').forEach((leg, i) => { leg.rotation.x = pose.stride * (i ? 1 : -1); });
    const bounds = new THREE.Box3().setFromObject(faun);
    assert.ok(bounds.min.x >= area[0] && bounds.min.z >= area[1] && bounds.max.x <= area[2] && bounds.max.z <= area[3], `${route.location} pose ${seconds} stays on the floor`);
    assert.ok(obstacles.every(obstacle => !bounds.intersectsBox(obstacle)), `${route.location} pose ${seconds} clears furniture, resident and mounts`);
  }
  dispose(faun); dispose(wagon);
}

test('faun visits alternate room and wagon areas deterministically without changing the layout', () => {
  const furniture = defaultFurniture(), shelves = defaultShelves(), wallDisplays = defaultWallDisplays(), before = structuredClone({ furniture, shelves, wallDisplays });
  for (let i = 0; i < 8; i++) {
    const route = faunVisitRoute(furniture, shelves, wallDisplays, i);
    assert.equal(route.location, i % 2 ? 'yard' : 'room');
    if (route.location === 'room') assert.equal(route.facing, 0.35, 'indoor visits face the viewer');
    assert.ok(Math.abs(Math.hypot(route.to.x - route.from.x, route.to.z - route.from.z) - 0.6) < 1e-8);
    assert.deepEqual(faunVisitRoute(furniture, shelves, wallDisplays, i), route);
    if (i < 4) checkAnimatedRoute(route, furniture, shelves);
  }
  assert.deepEqual({ furniture, shelves, wallDisplays }, before);
  assert.deepEqual(faunVisitRoute(), faunVisitRoute(undefined, undefined, undefined, NaN));
  const demo = { ...furniture, wardrobe: { x: 3.5, z: -2.25, r: 0 } };
  const firstVisit = faunVisitRoute(demo, shelves, wallDisplays, 0);
  assert.equal(firstVisit.location, 'room'); assert.ok(firstVisit.from.x < 3, 'the first visit is visible in the room, away from the glazed divider');
  checkAnimatedRoute(firstVisit, demo, shelves);
});

test('animated visits follow moved and rotated wagons and avoid newly occupied indoor routes', () => {
  const furniture = defaultFurniture();
  for (const place of [{ x: 7.25, z: -2.5, r: 0 }, { x: 9.5, z: -1.5, r: 1 }, { x: 8.2, z: 0.5, r: 2 }, { x: 7, z: -1, r: 3 }]) {
    const moved = { ...furniture, window: place };
    assert.ok(furnitureValid(moved));
    const route = faunVisitRoute(moved, defaultShelves(), defaultWallDisplays(), 1);
    assert.equal(route.location, 'yard'); checkAnimatedRoute(route, moved);
  }
  const residentMoved = { ...furniture, rug: { x: 3.5, z: 0.5, r: 0 } };
  assert.ok(furnitureValid(residentMoved));
  const route = faunVisitRoute(residentMoved, defaultShelves(), defaultWallDisplays(), 0);
  assert.notDeepEqual(route, faunVisitRoute(furniture, defaultShelves(), defaultWallDisplays(), 0));
  checkAnimatedRoute(route, residentMoved);
  const shelves = [{ ...defaultShelves()[0], spotId: 'back-shelf-1-10' }], storedWardrobe = { ...furniture, wardrobe: { ...furniture.wardrobe, off: true } };
  assert.ok(wallMountsFit(shelves, defaultWallDisplays(), storedWardrobe));
  const nearShelf = faunVisitRoute(storedWardrobe, shelves, defaultWallDisplays(), 2);
  assert.notDeepEqual(nearShelf, faunVisitRoute(storedWardrobe, [], defaultWallDisplays(), 2));
  checkAnimatedRoute(nearShelf, storedWardrobe, shelves);
});

test('a crowded valid layout uses the clear path without moving through blocked routes', () => {
  const furniture = { ...defaultFurniture(), wardrobe: { x: 4, z: 0.5, r: 0 }, pet: { x: 2, z: -0.8, r: 0 }, window: { x: 6.35 * S, z: -0.7 * S, r: 0 } };
  assert.ok(furnitureValid(furniture));
  const route = faunVisitRoute(furniture, defaultShelves(), defaultWallDisplays(), 0);
  assert.equal(route.location, 'path'); assert.deepEqual(route.from, route.to);
  checkAnimatedRoute(route, furniture);
});
