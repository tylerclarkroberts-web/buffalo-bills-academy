import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultShelves, roomFinishes, ROOM_SHELF_SPOTS } from '../server/catalog/room.js';
import { layoutOf, layoutKey, addShelf, moveShelf, removeShelf, changeStyle } from '../client/src/room/layout.js';

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
