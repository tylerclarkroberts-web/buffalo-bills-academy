import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultShelves, roomFinishes, ROOM_SHELF_SPOTS, ROOM_WALL_SPOTS, ROOM_FLOOR_SCALE, defaultFurniture, furnitureFits, residentRect, defaultWallDisplays, wallMountsFit, shelfSlots, shelfForAnchor, roomAnchors } from '../server/catalog/room.js';
import { layoutOf, layoutKey, addShelf, moveShelf, resizeShelf, removeShelf, changeStyle, placeFurniture, furnitureOf, moveWallDisplay } from '../client/src/room/layout.js';

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
  assert.equal(layout.shelves.length, 6);
  assert.equal(new Set(layout.shelves.map(shelf => shelf.id)).size, 6);
  assert.equal(addShelf(layout, ROOM_SHELF_SPOTS[0].id), layout);
  assert.equal(addShelf(room(), 'invalid').shelves.length, 2);
  assert.equal(changeStyle(layout, 'floor', 'typeId', 'arbitrary'), layout);
  assert.equal(changeStyle(layout, 'unknown', 'colorId', 'sage'), layout);
  assert.equal(changeStyle(layout, 'rug', 'html', 'sage'), layout);
});
test('wide shelves keep three distinct slots together through moves, shrinking, removal and cancelable drafts', () => {
  const saved = room(), draft = layoutOf(saved), wide = resizeShelf(draft, 'shelf-left', 'wide');
  assert.notEqual(layoutKey(wide), layoutKey(saved));
  assert.equal(saved.shelves[0].sizeId, undefined, 'legacy saved data remains unchanged');
  assert.deepEqual(shelfSlots(wide.shelves[0]).map(slot => [slot.id, slot.offset]), [['shelf-left', 0], ['shelf-left-slot-2', -0.8], ['shelf-left-slot-3', 0.8]]);
  const filled = { ...wide, placements: [...wide.placements, { anchorId: 'shelf-left-slot-2', itemId: 'odd-rock' }, { anchorId: 'shelf-left-slot-3', itemId: 'odd-snakeoil' }] };
  assert.equal(shelfForAnchor(filled.shelves, 'shelf-left-slot-3'), filled.shelves[0]);
  assert.equal(shelfForAnchor(filled.shelves, 'shelf-left-slot-4'), undefined);
  assert.equal(shelfForAnchor(filled.shelves, 'shelf-right-slot-2'), undefined);
  assert.deepEqual(roomAnchors(filled.shelves).filter(anchor => anchor.shelfId === 'shelf-left').map(anchor => anchor.slotIndex), [0, 1, 2]);
  const moved = moveShelf(filled, 'shelf-left', 'left-low-door');
  assert.notEqual(moved, filled); assert.deepEqual(moved.placements, filled.placements);
  const small = resizeShelf(moved, 'shelf-left', 'standard');
  assert.deepEqual(small.placements, saved.placements, 'shrinking stores only the two outer items');
  assert.equal(small.shelves[0].sizeId, 'standard');
  assert.equal(resizeShelf(small, 'shelf-left', 'standard'), small);
  assert.equal(resizeShelf(small, 'shelf-left', 'giant'), small);
  for (const sizeId of [['wide'], ['standard'], { toString: 'wide' }]) assert.equal(resizeShelf(small, 'shelf-left', sizeId), small);
  assert.equal(resizeShelf(small, 'missing', 'wide'), small);
  assert.deepEqual(removeShelf(moved, 'shelf-left').placements, []);
  assert.equal(filled.placements.length, 3, 'shrinking and removal leave the earlier draft intact for cancel');
  const packed = addShelf(draft, 'left-low-corner');
  assert.notEqual(packed, draft);
  assert.equal(resizeShelf(packed, 'shelf-left', 'wide'), packed, 'widening cannot overlap a nearby shelf');
});
test('automatic shelf additions choose a clear mount for the requested size and stop at capacity', () => {
  let layout = layoutOf(room());
  for (let i = 0; i < 4; i++) {
    const previous = layout; layout = addShelf(layout, undefined, i === 0 ? 'wide' : 'standard');
    assert.equal(layout.shelves.length, previous.shelves.length + 1);
    assert.ok(wallMountsFit(layout.shelves, layout.wallDisplays, layout.furniture));
  }
  assert.equal(layout.shelves.find(shelf => shelf.id === 'shelf-3').sizeId, 'wide');
  assert.equal(addShelf(layout), layout);
  const unchanged = layoutOf(room());
  assert.equal(addShelf(unchanged, undefined, 'unlimited'), unchanged);
  for (const sizeId of [['wide'], ['standard'], { toString: 'wide' }]) assert.equal(addShelf(unchanged, undefined, sizeId), unchanged);
});
test('dense wall mounts include low window space and front wall positions while wide shelves respect window and wall ends', () => {
  const at = (side, x, y) => ROOM_SHELF_SPOTS.find(spot => spot.wallSide === side && spot.position[1] === y && spot.position[side === 'left' ? 2 : 0] === x);
  const shelf = { ...defaultShelves()[0], sizeId: 'wide' }, S = ROOM_FLOOR_SCALE;
  const low = at('back', 1.15, 0.4), high = at('back', 1.15, 1.75), front = at('left', 2.3, 1.75);
  assert.ok(low && high && front);
  assert.ok(wallMountsFit([{ ...shelf, spotId: low.id }], {}), 'low shelves and their contents clear the window apron');
  assert.equal(wallMountsFit([{ ...shelf, spotId: high.id }], {}), false, 'the same position at window height is blocked');
  assert.equal(wallMountsFit([{ ...shelf, spotId: front.id }], {}), false, 'a wide shelf cannot stick beyond the front wall');
  assert.ok(wallMountsFit([{ ...shelf, sizeId: 'standard', spotId: front.id }], {}));
  const available = ROOM_SHELF_SPOTS.filter(spot => wallMountsFit([{ ...shelf, spotId: spot.id }], {}));
  assert.ok(available.length > 30);
  for (const spot of available) {
    const along = spot.position[spot.wallSide === 'left' ? 2 : 0] * S;
    const lowBound = (spot.wallSide === 'left' ? -3 : -4) * S + 0.08, highBound = (spot.wallSide === 'left' ? 3 : 4) * S - 0.08;
    assert.ok(along - 1.25 >= lowBound && along + 1.25 <= highBound);
  }
  assert.ok(ROOM_WALL_SPOTS.filter(spot => wallMountsFit([], { 'wall-left': spot.id })).length > 40);
  for (const spots of [ROOM_SHELF_SPOTS, ROOM_WALL_SPOTS]) assert.equal(new Set(spots.map(spot => `${spot.wallSide}:${spot.position.join(',')}`)).size, spots.length);
});
test('wall display drafts move without changing items and share collision rules with shelf additions and moves', () => {
  const saved = room(), draft = layoutOf(saved);
  assert.deepEqual(draft.wallDisplays, defaultWallDisplays());
  const moved = moveWallDisplay(draft, 'wall-left', 'left-high-front');
  assert.notEqual(layoutKey(moved), layoutKey(draft));
  assert.deepEqual(moved.placements, saved.placements);
  assert.equal(draft.wallDisplays['wall-left'], 'back-high-left');
  assert.equal(moveWallDisplay(moved, 'wall-left', 'back-high-right'), moved, 'another display occupies that mount');
  assert.equal(moveWallDisplay(moved, 'wall-left', 'unknown'), moved);
  assert.equal(moveWallDisplay(moved, 'not-a-display', 'back-high-left'), moved);
  assert.equal(addShelf(moved, 'left-high-door'), moved, 'a new shelf cannot intersect the moved picture');
  assert.equal(moveShelf(moved, 'shelf-left', 'left-high-door'), moved, 'moving a shelf uses the same collision check');
  assert.equal(addShelf(draft, 'left-high-corner'), draft, 'corner shelves cannot cut through an adjoining wall frame');
  const more = addShelf(moved, 'back-low-left');
  assert.equal(more.shelves.length, 3);
  assert.ok(wallMountsFit(more.shelves, more.wallDisplays));
  assert.equal(moveWallDisplay(more, 'wall-left', 'back-low-left'), more);
  assert.equal(moveWallDisplay(null, 'wall-left', 'left-high-front'), null);
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
  const under = placeFurniture(saved, 'rug', { x: home.pet.x + 1.6, z: home.pet.z });
  assert.notEqual(under, saved, 'a rug may lie partly under furniture');
  assert.deepEqual(residentRect(under.furniture).slice(0, 2), [under.furniture.rug.x - 0.45, under.furniture.rug.z - 0.35], 'the resident follows the rug');
  assert.equal(placeFurniture(saved, 'rug', { x: home.pet.x, z: home.pet.z }), saved, 'the resident cannot be carried into furniture');
  assert.equal(placeFurniture(under, 'wardrobe', { x: under.furniture.rug.x, z: under.furniture.rug.z }), under, 'furniture cannot land on the resident');
  assert.notEqual(placeFurniture(under, 'wardrobe', { x: home.rug.x, z: home.rug.z + 0.3 }), under, 'the old resident spot is free once the rug moves');
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

test('shelves, wall art, furniture and the resident reject collisions in either editing direction', () => {
  const draft = layoutOf(room()), place = { x: -4.4, z: 1.4, r: 0 };
  const wardrobeFirst = placeFurniture(draft, 'wardrobe', place);
  assert.notEqual(wardrobeFirst, draft, 'an empty mount does not reserve new floor space');
  assert.equal(addShelf(wardrobeFirst, 'left-low-door'), wardrobeFirst);
  assert.equal(moveShelf(wardrobeFirst, 'shelf-left', 'left-high-door'), wardrobeFirst);
  assert.equal(moveWallDisplay(wardrobeFirst, 'wall-left', 'left-low-front'), wardrobeFirst);
  const shelfFirst = addShelf(draft, 'left-low-door');
  assert.notEqual(shelfFirst, draft);
  assert.equal(placeFurniture(shelfFirst, 'wardrobe', place), shelfFirst);
  assert.notEqual(placeFurniture(shelfFirst, 'floor', { x: -4.5, z: 1.2 }), shelfFirst, 'a low decoration still fits beneath the shelf');
  const stored = placeFurniture(wardrobeFirst, 'wardrobe', { off: true });
  const withShelf = addShelf(stored, 'left-low-door');
  assert.notEqual(withShelf, stored, 'stored furniture does not block a shelf');
  const restored = placeFurniture(withShelf, 'wardrobe', { off: false });
  assert.equal(!!restored.furniture.wardrobe.off, false);
  assert.notDeepEqual(restored.furniture.wardrobe, place, 'restoring finds a clear floor spot');
  assert.ok(wallMountsFit(restored.shelves, restored.wallDisplays, restored.furniture));
  const residentFirst = placeFurniture(draft, 'rug', { x: -2.8, z: -2.7 });
  assert.notEqual(residentFirst, draft);
  assert.equal(addShelf(residentFirst, 'back-low-left'), residentFirst);
  const backShelfFirst = addShelf(draft, 'back-low-left');
  assert.notEqual(backShelfFirst, draft);
  assert.equal(placeFurniture(backShelfFirst, 'rug', { x: -2.8, z: -2.7 }), backShelfFirst);
});

test('upper shelves stay clear of the taller resident without moving saved furniture back to defaults', () => {
  const draft = layoutOf(room()), place = { x: -4.1, z: 1.2, r: 1 };
  const residentFirst = placeFurniture(draft, 'rug', place);
  assert.notEqual(residentFirst, draft);
  assert.ok(Object.keys(residentFirst.furniture).every(id => furnitureFits(residentFirst.furniture, id)), 'the arrangement itself is valid');
  assert.equal(addShelf(residentFirst, 'left-high-door'), residentFirst, 'a high shelf cannot pass through the resident');
  assert.deepEqual(layoutOf(residentFirst).furniture, residentFirst.furniture, 'reading a saved layout preserves its valid floor positions');
  const shelfFirst = addShelf(draft, 'left-high-door');
  assert.notEqual(shelfFirst, draft);
  assert.equal(placeFurniture(shelfFirst, 'rug', place), shelfFirst, 'moving the resident under a high shelf is also refused');
  assert.ok(wallMountsFit(draft.shelves, draft.wallDisplays, draft.furniture), 'original room defaults still fit');
});
