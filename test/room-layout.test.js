import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultShelves, roomFinishes, ROOM_SHELF_SPOTS, defaultFurniture, furnitureFits } from '../server/catalog/room.js';
import { layoutOf, layoutKey, addShelf, moveShelf, removeShelf, changeStyle, placeFurniture, furnitureOf } from '../client/src/room/layout.js';

const room = () => ({ layoutRevision: 3, themeId: 'bunkhouse-sage', shelves: defaultShelves(), finishes: roomFinishes(),
  placements: [{ anchorId: 'shelf-left', itemId: 'odd-lamp' }] });
test('furniture drafts copy saved data and every furniture/style change marks the layout dirty', () => {
  const saved = room(), draft = layoutOf(saved), key = layoutKey(saved);
  draft.shelves[0].colorId = 'sage'; draft.finishes.floor.colorId = 'slate'; draft.placements[0].itemId = 'odd-rock';
  assert.equal(saved.shelves[0].colorId, 'honey');
  assert.equal(saved.finishes.floor.colorId, 'honey');
  assert.equal(saved.placements[0].itemId, 'odd-lamp');
  assert.notEqual(layoutKey(draft), key);
  assert.notEqual(layoutKey(changeStyle(saved, 'rug', 'typeId', 'none')), key);
  assert.notEqual(layoutKey(changeStyle(saved, 'wardrobe', 'colorId', 'sage')), key);
  assert.notEqual(layoutKey(changeStyle(saved, 'shelf', 'typeId', 'braced', 'shelf-left')), key);
});
test('moving a filled shelf retains its item; removing it returns that display to storage without mutating the saved layout', () => {
  const saved = room(), open = ROOM_SHELF_SPOTS.find(spot => !saved.shelves.some(shelf => shelf.spotId === spot.id));
  const moved = moveShelf(saved, 'shelf-left', open.id);
  assert.equal(moved.shelves[0].spotId, open.id);
  assert.deepEqual(moved.placements, saved.placements);
  assert.notEqual(layoutKey(moved), layoutKey(saved));
  const removed = removeShelf(moved, 'shelf-left');
  assert.deepEqual(removed.placements, []);
  assert.equal(saved.shelves.length, 2); assert.equal(saved.placements.length, 1);
  assert.equal(moveShelf(saved, 'shelf-left', saved.shelves[1].spotId), saved);
  assert.equal(moveShelf(saved, 'shelf-left', 'invalid'), saved);
  assert.equal(moveShelf(null, 'missing', open.id), null);
});
test('adding shelves uses bounded free identities and positions; invalid style choices have no effect', () => {
  let layout = room();
  for (const spot of ROOM_SHELF_SPOTS) if (!layout.shelves.some(shelf => shelf.spotId === spot.id)) layout = addShelf(layout, spot.id);
  assert.equal(layout.shelves.length, 4);
  assert.equal(new Set(layout.shelves.map(shelf => shelf.id)).size, 4);
  assert.equal(addShelf(layout, ROOM_SHELF_SPOTS[0].id), layout);
  assert.equal(addShelf(room(), 'invalid').shelves.length, 2);
  assert.equal(changeStyle(layout, 'floor', 'typeId', 'arbitrary'), layout);
  assert.equal(changeStyle(layout, 'unknown', 'colorId', 'sage'), layout);
  assert.equal(changeStyle(layout, 'rug', 'html', 'sage'), layout);
});
test('furniture moves, turns and is stored only where it fits; a stored desk returns its display and comes back to a free spot', () => {
  const saved = { ...layoutOf(room()), placements: [{ anchorId: 'desk', itemId: 'odd-telegraph' }] }, home = defaultFurniture();
  assert.deepEqual(saved.furniture, home);
  const moved = placeFurniture(saved, 'wardrobe', { x: 1.5, z: 0 });
  assert.notEqual(layoutKey(moved), layoutKey(saved));
  assert.deepEqual(moved.furniture.wardrobe, { x: 1.5, z: 0, r: 0 });
  assert.equal(placeFurniture(placeFurniture(moved, 'wardrobe', { r: 1 }), 'wardrobe', { r: 2 }).furniture.wardrobe.r, 2);
  for (const [id, change] of [['wardrobe', { x: 99 }], ['wardrobe', { x: home.pet.x, z: home.pet.z }], ['wardrobe', { r: 1 }], ['pet', { off: true }], ['sofa', { x: 0 }], ['window', { x: 0, z: 0 }]]) {
    assert.equal(placeFurniture(saved, id, change), saved, `${id} ${JSON.stringify(change)}`);
  }
  assert.notEqual(placeFurniture(saved, 'rug', { x: home.pet.x, z: home.pet.z }), saved, 'a rug may lie under furniture');
  const stored = placeFurniture(saved, 'desk', { off: true });
  assert.deepEqual(stored.placements, []); assert.equal(stored.furniture.desk.off, true);
  const blocked = placeFurniture(stored, 'wardrobe', { x: home.desk.x, z: home.desk.z });
  const back = placeFurniture(blocked, 'desk', { off: false });
  assert.equal('off' in back.furniture.desk, false);
  assert.notDeepEqual([back.furniture.desk.x, back.furniture.desk.z], [home.desk.x, home.desk.z]);
  Object.keys(home).forEach(id => assert.ok(furnitureFits(back.furniture, id)));
  for (const [selection, id] of [[{ kind: 'anchor', anchorId: 'desk' }, 'desk'], [{ kind: 'anchor', anchorId: 'floor' }, 'floor'], [{ kind: 'surface', surface: 'rug' }, 'rug'],
    [{ kind: 'surface', surface: 'floor' }, null], [{ kind: 'wealth' }, 'wealth'], [{ kind: 'anchor', anchorId: 'wall-left' }, null], [{ kind: 'edit' }, null], [null, null]]) {
    assert.equal(furnitureOf(selection), id);
  }
});
