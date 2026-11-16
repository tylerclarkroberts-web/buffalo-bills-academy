import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Rooms } from '../server/rooms.js';
import { ROOM_ITEMS, ROOM_WALL_IDS, roomAnchors } from '../server/catalog/room.js';
import { layoutOf, addWallDisplay, removeWallDisplay, placeFurniture, furnitureOf } from '../client/src/room/layout.js';
import { roomPositions } from '../client/src/room/scene-model.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-spots-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir), owner = { id: 'owner', name: 'Room Owner', login: { hash: 'x' } };
  store.players.owner = owner; store.savePlayers();
  const own = Object.fromEntries(ROOM_ITEMS.map(item => [item.id, 1]));
  const rooms = new Rooms({ store, shop: { doc: { inv: { owner: { own } } } }, barn: { view: () => ({ pen: null }) }, avatars: { info: () => null }, netWorth: () => ({ total: 0 }) });
  return { rooms, owner, own };
}
const status = code => error => error.status === code;

test('added wall and floor displays, the sill, the wardrobe top and bought furniture hold items through a save', t => {
  const { rooms, owner, own } = fixture(t), save = (draft, placements, expectedRevision) => rooms.saveLayout(owner,
    { expectedRevision, themeId: draft.themeId, placements, shelves: draft.shelves, wallDisplays: draft.wallDisplays, finishes: draft.finishes, furniture: draft.furniture });
  let draft = layoutOf(rooms.owner(owner));
  for (let i = 0; i < 6; i++) draft = addWallDisplay(draft);
  assert.deepEqual(Object.keys(draft.wallDisplays).sort(), [...ROOM_WALL_IDS].sort(), 'six displays at most');
  assert.equal(new Set(Object.values(draft.wallDisplays)).size, 6);
  for (const id of ['floor-2', 'case', 'poker']) draft = placeFurniture(draft, id, { off: false });
  assert.ok(['floor-2', 'case', 'poker'].every(id => !draft.furniture[id].off));
  assert.equal(furnitureOf({ kind: 'anchor', anchorId: 'case-3' }), 'case', 'a spot on a piece moves that piece');

  // The case and the table are sold at the General Store; nobody arranges one they have not bought.
  assert.throws(() => save(draft, [], 0), status(400));
  own['furn-case'] = 1; own['furn-pokertable'] = 1;
  const placements = [['wall-3', 'odd-charter'], ['wall-6', 'odd-skull'], ['floor-2', 'odd-spittoon'], ['sill', 'odd-rock'], ['wardrobe-top', 'odd-snakeoil'], ['case', 'odd-flipflop'], ['case-3', 'odd-abalone'], ['desk', 'odd-drone']]
    .map(([anchorId, itemId]) => ({ anchorId, itemId }));
  const saved = save(draft, placements, 0);
  assert.deepEqual(saved.placements, placements);
  assert.deepEqual(Object.keys(roomPositions(saved.shelves, saved.furniture, saved.wallDisplays)).sort(),
    roomAnchors(saved.shelves, saved.furniture, saved.wallDisplays).map(anchor => anchor.id).sort(), 'every spot has a place in the scene');
  const spots = roomPositions(saved.shelves, { ...saved.furniture, case: { x: 0, z: 0, r: 1 } }, saved.wallDisplays);
  assert.ok(Math.abs(spots.case[2] - 0.62) < 1e-9 && Math.abs(spots['case-3'][2] + 0.62) < 1e-9 && Math.abs(spots.case[0]) < 1e-9, 'a turned case turns its three spots');

  // Putting furniture away or taking a display down sends what it held back to storage.
  const cleared = removeWallDisplay(placeFurniture(placeFurniture(layoutOf(saved), 'wardrobe', { off: true }), 'case', { off: true }), 'wall-6');
  assert.deepEqual(cleared.placements.map(place => place.anchorId).sort(), ['desk', 'floor-2', 'sill', 'wall-3']);
  assert.equal(removeWallDisplay(cleared, 'wall-left'), cleared, 'the first two displays stay up');
  assert.throws(() => save(cleared, placements, 1), status(400), 'nothing is displayed on a spot that is gone');
  assert.deepEqual(save(cleared, cleared.placements, 1).placements, cleared.placements);
  const { 'wall-left': first, ...missing } = cleared.wallDisplays;
  assert.throws(() => save({ ...cleared, wallDisplays: missing }, [], 2), status(400));

  // Selling is not a thing, but an account that somehow loses the case sees it stored, with its items.
  save(placeFurniture(layoutOf(rooms.owner(owner)), 'case', { off: false }), [{ anchorId: 'case-2', itemId: 'odd-lamp' }], 2);
  delete own['furn-case'];
  const without = rooms.owner(owner);
  assert.equal(without.furniture.case.off, true); assert.deepEqual(without.placements, []);
});
