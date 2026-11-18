import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residentErrands, residentTasks } from '../client/src/room/scene-model.js';
import { residentPose } from '../client/src/room/activity.js';
import { defaultFurniture, defaultShelves, defaultWallDisplays, furnitureValid, furnitureRect, roomCouchScale, upgradeFurniture, wallMountsFit, roomFinishes, ROOM_FURNITURE, ROOM_FLOOR_SCALE as S } from '../server/catalog/room.js';

test('the couch grows to fit clear floor while an older crowded layout keeps all its positions', () => {
  const furniture = defaultFurniture(), full = roomCouchScale(furniture);
  assert.deepEqual(full, [1.3, 1.16, 1.25]);
  furniture.couch.z = Math.round((-3 * S + 0.6) * 100) / 100;
  assert.deepEqual(roomCouchScale(furniture), [1.3, 1.16, 1.05], 'older back-wall couch can still grow wider');
  furniture.desk = { ...furniture.desk, x: -0.41, z: furniture.couch.z };
  assert.deepEqual(furnitureValid(furniture), furniture);
  assert.deepEqual(roomCouchScale(furniture), [1, 1, 1], 'a nearby desk still fits beside the original couch');
  const [x, z, right, front] = furnitureRect('couch', { ...furniture.couch, r: 1 }, full);
  assert.ok(Math.abs(right - x - 1.25) < 1e-9 && Math.abs(front - z - 3.12) < 1e-9);
});

test('the couch starts somewhere valid and the resident can walk to it, the cash table and things to inspect', () => {
  const furniture = defaultFurniture(), errands = residentErrands(furniture);
  assert.ok(furnitureValid(furniture)); assert.ok(wallMountsFit(defaultShelves(), defaultWallDisplays(), furniture));
  assert.deepEqual(roomFinishes().couch, { typeId: 'settee', colorId: 'oxblood' });
  assert.deepEqual(errands.slice(0, 4).map(errand => errand.kind), ['sit', 'coffee', 'inspect', 'cash']);
  const solid = Object.keys(ROOM_FURNITURE).filter(id => !ROOM_FURNITURE[id].flat && !ROOM_FURNITURE[id].yard && !furniture[id].off).map(id => furnitureRect(id, furniture[id]));
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

test('coffee crosses the open door to a seat in the porch chair, clear of a wagon parked at the near edge of its yard', () => {
  const furniture = defaultFurniture();
  furniture.window = { x: 6.4 * S + 1.4, z: 1.6 * S - 1.025, r: 0 };
  assert.ok(furnitureValid(furniture));
  const { path, seat, facing } = residentErrands(furniture, defaultShelves()).find(errand => errand.kind === 'coffee');
  assert.deepEqual(path.at(-1), [furniture.porchChair.x + 0.75, furniture.porchChair.z], 'he stops in front of the porch chair with his back to it');
  const chair = furnitureRect('porchChair', furniture.porchChair);
  assert.ok(seat[0] > chair[0] && seat[0] < chair[2] && seat[1] > chair[1] && seat[1] < chair[3], 'and sits in it, not beside it');
  assert.equal(facing, Math.PI / 2, 'looking out over the yard');
  const turned = residentErrands({ ...furniture, porchChair: { ...furniture.porchChair, x: 9.5, r: 1 } }, defaultShelves()).find(errand => errand.kind === 'coffee');
  assert.ok(Math.abs(turned.seat[1] - (furniture.porchChair.z - 0.1)) < 1e-9 && turned.facing === Math.PI, 'a turned chair seats him the way it faces');
  const wagon = furnitureRect('window', furniture.window);
  let from = [furniture.rug.x, furniture.rug.z], crossed = false;
  for (const to of path) {
    if (from[0] < 4.08 * S && to[0] > 4.08 * S) {
      const z = from[1] + (to[1] - from[1]) * (4.08 * S - from[0]) / (to[0] - from[0]);
      assert.ok(z > 0.8 * S + 0.35 && z < 2.2 * S - 0.35);
      crossed = true;
    }
    for (let part = 0; part <= 1; part += 0.05) {
      const x = from[0] + (to[0] - from[0]) * part, z = from[1] + (to[1] - from[1]) * part;
      assert.ok(x + 0.35 <= wagon[0] || x - 0.35 >= wagon[2] || z + 0.3 <= wagon[1] || z - 0.3 >= wagon[3]);
    }
    from = to;
  }
  assert.ok(crossed);
});

test('a room saved with the square deck keeps its indoor arrangement and gets the new porch and yard', () => {
  const home = defaultFurniture(), old = { ...home,
    wardrobe: { x: 1.5, z: 0, r: 1 }, desk: { ...home.desk, off: true },
    porchChair: { x: 13.4, z: 6.57, r: 1 }, plant: { x: 8.32, z: 6.98, r: 0, off: true }, 'floor-porch': { x: 11, z: 4, r: 0 }, window: { x: 11, z: -0.53, r: 1 } };
  delete old.porchChair2;
  assert.equal(furnitureValid(old), null, 'the old deck and paddock are no longer places to stand things');
  const upgraded = upgradeFurniture(old, defaultShelves(), defaultWallDisplays(), 3);
  assert.deepEqual(upgraded.wardrobe, old.wardrobe); assert.deepEqual(upgraded.desk, old.desk);
  for (const id of Object.keys(home)) if (!ROOM_FURNITURE[id].yard && ROOM_FURNITURE[id].area !== 'porch') assert.deepEqual(upgraded[id], old[id], id);
  assert.deepEqual(upgraded.porchChair, home.porchChair); assert.deepEqual(upgraded.porchChair2, home.porchChair2);
  assert.deepEqual(upgraded.plant, { ...home.plant, off: true }, 'a plant that was put away stays put away');
  assert.deepEqual(upgraded['floor-porch'], { x: home['floor-porch'].x, z: home['floor-porch'].z, r: 0 }, 'a porch display that was out stays out');
  assert.deepEqual(upgraded.window, { ...home.window, r: 1 }, 'the wagon keeps its turn on the new lawn');
  assert.ok(furnitureValid(upgraded));
  // Rooms from the smaller floors move their outdoor things the same way.
  const older = upgradeFurniture({ wardrobe: { x: 4.54, z: -3.47, r: 0 }, window: { x: 8.2, z: -0.4, r: 0 } }, defaultShelves(), defaultWallDisplays());
  assert.deepEqual(older.window, home.window); assert.notDeepEqual(older.wardrobe, home.wardrobe);
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
  assert.equal(snug.wardrobe.x, upgraded.wardrobe.x); assert.ok(snug.pet.x >= Math.round(-4.39 * k * 100) / 100);
  // A room saved on the 2.1x floor spreads by the smaller step and keeps its couch where it was.
  const second = upgradeFurniture({ couch: { x: -2, z: -3.5, r: 0 }, pet: { x: -3, z: 1.8, r: 1 } }, defaultShelves(), defaultWallDisplays(), 2), step = S / Math.sqrt(2.1);
  assert.deepEqual([second.couch.x, second.pet.x, second.pet.r], [Math.round(-2 * step * 100) / 100, Math.round(-3 * step * 100) / 100, 1]);
  const shelves = [{ ...defaultShelves()[0], spotId: 'back-low-left' }];
  assert.ok(wallMountsFit(shelves, defaultWallDisplays(), upgradeFurniture(undefined, shelves, defaultWallDisplays())), 'an old shelf keeps its place; the couch goes elsewhere');
});

test('each stroll is a new errand with time to act', () => {
  assert.equal(residentPose(5).errand, 0); assert.equal(residentPose(40).errand, 1);
  assert.equal(residentPose(9).act, 0); assert.equal(residentPose(15).act, 1); assert.equal(residentPose(22).act, 0);
});

test('asked, he can reach every room: each task has a clear walk and somewhere to settle', () => {
  const furniture = defaultFurniture(), tasks = residentTasks(furniture, defaultShelves());
  assert.deepEqual(Object.keys(tasks).sort(), ['bath', 'coffee', 'cook', 'corner', 'eat', 'nap', 'rock', 'sign', 'sit']);
  const solid = Object.keys(ROOM_FURNITURE).filter(id => !ROOM_FURNITURE[id].flat && !ROOM_FURNITURE[id].yard && !furniture[id].off).map(id => furnitureRect(id, furniture[id]));
  const inside = ([x, z], rect) => x > rect[0] && x < rect[2] && z > rect[1] && z < rect[3];
  for (const { kind, path } of Object.values(tasks)) {
    let from = [furniture.rug.x, furniture.rug.z];
    for (const to of path) {
      for (let part = 0; part <= 1; part += 0.05) {
        assert.ok(!solid.some(rect => inside([from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part], rect)), kind + ' walks round the furniture');
      }
      from = to;
    }
  }
  const inch = 1.94 * 1.4 / 71, tub = furnitureRect('tub', furniture.tub), table = furnitureRect('worktable', furniture.worktable), range = furnitureRect('range', furniture.range);
  assert.ok(inside(tasks.bath.seat, tub) && !inside(tasks.bath.path.at(-1), tub), 'he stands beside the tub and sits in it');
  assert.ok(inside(tasks.nap.seat, furnitureRect('couch', furniture.couch, roomCouchScale(furniture))), 'he lies on the couch');
  assert.ok(Math.abs(tasks.nap.facing - tasks.sit.facing) > 1, 'along it, not across it');
  assert.ok(!inside(tasks.eat.seat, table) && Math.abs(tasks.eat.seat[1] - table[1]) < 0.51 && tasks.eat.side === -1, 'the kitchen chair stands at the near long side of the worktable');
  const stove = tasks.cook.path.at(-1);
  assert.ok(Math.abs(stove[0] - furniture.range.x - 15 * inch) < 0.01 && stove[1] < range[1] && stove[1] > range[1] - 0.7, 'he cooks at the stove end of the counter');
  assert.ok(inside(tasks.rock.seat, furnitureRect('porchChair2', furniture.porchChair2)) && tasks.rock.pose === 'rock');
  assert.ok(tasks.sign.path.at(-1)[0] > 8.7 * S && tasks.sign.facing === -Math.PI / 2, 'he reads the signpost from the road side of the fence');
  // Whatever is put away or boxed in drops off the list; a turned tub is still a tub.
  const changed = { ...furniture, worktable: { ...furniture.worktable, off: true }, porchChair2: { ...furniture.porchChair2, off: true }, tub: { x: -5.5, z: -9, r: 1 } };
  assert.ok(furnitureValid(changed));
  const fewer = residentTasks(changed, defaultShelves());
  assert.deepEqual(Object.keys(fewer).sort(), ['bath', 'coffee', 'cook', 'corner', 'nap', 'sign', 'sit']);
  assert.ok(Math.abs(Math.abs(fewer.bath.facing) - Math.PI) < 1e-9 && inside(fewer.bath.seat, furnitureRect('tub', changed.tub)));
});
