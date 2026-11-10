import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Rooms } from '../server/rooms.js';
import { Barn, DAY_XP } from '../server/barn.js';
import { ROOM_ANCHORS, ROOM_ITEMS, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_FINISHES, defaultShelves, roomFinishes, roomAnchors, wealthStage, defaultFurniture, furnitureFits } from '../server/catalog/room.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-rooms-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  const owner = { id: 'owner', name: 'Room Owner', login: { email: 'private@example.com', hash: 'secret' }, bankroll: 142.87, txns: [{ note: 'private' }] };
  const visitor = { id: 'visitor', name: 'Visitor', google: { sub: 'private-google-id' } };
  const guest = { id: 'guest', name: 'Legacy Guest', kind: 'guest' };
  Object.assign(store.players, { owner, visitor, guest });
  store.savePlayers();
  const shop = { doc: { inv: { owner: { own: Object.fromEntries(ROOM_ITEMS.map(item => [item.id, 1])) } } } };
  let pen = { stage: 'creature', species: 'bocydium', speciesName: 'Brazilian Treehopper', name: 'Basil', level: 4,
    xp: 399, fedAt: 123, cool: { feed: 999 }, starving: 2, diesInMs: 444, style: { bughat: { id: 'bughat-cowboy', shape: 'cowboy', secret: 'not appearance' } } };
  const barn = { view: () => ({ pen, serverNow: 987654321 }) };
  const avatars = { info: p => ({ kind: 'gen', seed: p.id }) };
  let total = 12000;
  const options = { store, shop, barn, avatars, netWorth: () => ({ total, bankroll: 142.87, chips: 100, holdings: 11707.13, riskEscrow: 50, privateNote: 'secret' }) };
  return { dir, store, owner, visitor, guest, shop, rooms: new Rooms(options), options,
    setPen: value => { pen = value; }, setTotal: value => { total = value; } };
}
const layout = (expectedRevision = 0, placements = [{ anchorId: 'wall-left', itemId: 'odd-deed' }]) => ({ expectedRevision, themeId: 'bunkhouse-sage', placements });
const status = expected => error => error.status === expected;

test('rooms are open without setup or writes; visitors require an account', t => {
  const { rooms, owner, visitor, guest, dir } = fixture(t);
  assert.equal(Object.hasOwn(rooms.owner(owner), 'visibility'), false);
  assert.equal(Object.hasOwn(rooms.owner(owner), 'showWealthPile'), false);
  assert.equal(rooms.owner(owner).layoutRevision, 0);
  assert.deepEqual(rooms.owner(owner).shelves, defaultShelves());
  assert.deepEqual(rooms.owner(owner).finishes, roomFinishes());
  assert.equal(fs.existsSync(path.join(dir, 'rooms.json')), false);
  assert.throws(() => rooms.visit(null, owner), status(401));
  assert.throws(() => rooms.visit(guest, owner), status(403));
  assert.equal(rooms.visit(visitor, owner).owner.id, owner.id);
  assert.equal(rooms.isOpen(owner.id), true);
  assert.equal(rooms.isOpen(guest.id), false);
  assert.throws(() => rooms.visit(visitor, guest), status(404));
  owner.hidden = true;
  assert.throws(() => rooms.visit(visitor, owner), status(404));
  owner.hidden = false;
  assert.throws(() => rooms.visit(visitor, null), status(404));
});

test('visitors see displayed things, appearance and exact current worth without unrelated private data', t => {
  const { rooms, owner, visitor } = fixture(t);
  rooms.saveLayout(owner, layout());
  const shown = rooms.visit(visitor, owner);
  assert.deepEqual(Object.keys(shown).sort(), ['finishes', 'furniture', 'layoutRevision', 'owner', 'pet', 'placements', 'shelves', 'themeId', 'wealthStage', 'worth']);
  assert.deepEqual(shown.owner, { id: 'owner', name: 'Room Owner', avatar: { kind: 'gen', seed: 'owner' } });
  assert.deepEqual(shown.placements, [{ anchorId: 'wall-left', itemId: 'odd-deed' }]);
  assert.deepEqual(shown.pet, { stage: 'creature', species: 'bocydium', speciesName: 'Brazilian Treehopper', name: 'Basil', level: 4,
    style: { bughat: { id: 'bughat-cowboy', shape: 'cowboy' } } });
  assert.doesNotMatch(JSON.stringify(shown), /email|txns|fedAt|cool|starv|diesInMs|secret|privateNote/);
  assert.deepEqual(shown.worth, { bankroll: 142.87, chips: 100, holdings: 11707.13, riskEscrow: 50, total: 12000 });
  assert.deepEqual(shown.worth, rooms.owner(owner).worth);
  assert.equal(rooms.visit(visitor, owner).wealthStage, 3);
  assert.equal(rooms.owner(owner).wealthStage, 3);
});

test('eggs hide their species and memorials hide neglect timing', t => {
  const { rooms, owner, visitor, setPen } = fixture(t);
  setPen({ stage: 'egg', species: 'bocydium', hatchAt: 123, eggAt: 10 });
  assert.deepEqual(rooms.visit(visitor, owner).pet, { stage: 'egg' });
  setPen({ stage: 'dead', species: 'bocydium', speciesName: 'Brazilian Treehopper', name: 'Basil', level: 4, diedAt: 800, fedAt: 1 });
  assert.deepEqual(rooms.visit(visitor, owner).pet, { stage: 'dead', species: 'bocydium', speciesName: 'Brazilian Treehopper', name: 'Basil', level: 4 });
  setPen(null);
  assert.equal(rooms.visit(visitor, owner).pet, null);
});

test('all twelve oddities have compatible positions; placement never consumes ownership', t => {
  const { rooms, owner, shop } = fixture(t);
  assert.equal(ROOM_ITEMS.length, 12);
  const inventory = structuredClone(shop.doc);
  let revision = 0;
  for (const item of ROOM_ITEMS) {
    const anchor = ROOM_ANCHORS.find(value => value.type === item.roomType);
    assert.ok(anchor, item.id);
    const saved = rooms.saveLayout(owner, layout(revision++, [{ anchorId: anchor.id, itemId: item.id }]));
    assert.equal(saved.placements[0].itemId, item.id);
  }
  assert.deepEqual(rooms.saveLayout(owner, layout(revision, [])).placements, []);
  assert.deepEqual(shop.doc, inventory);
  assert.equal(owner.bankroll, 142.87);
});

test('seven contextual positions accept a desk item but keep the wagon outdoors', t => {
  const { rooms, owner, shop } = fixture(t);
  const inventory = structuredClone(shop.doc);
  const placements = [
    { anchorId: 'wall-left', itemId: 'odd-deed' }, { anchorId: 'wall-right', itemId: 'odd-horseshoe' },
    { anchorId: 'shelf-left', itemId: 'odd-lamp' }, { anchorId: 'shelf-right', itemId: 'odd-snakeoil' },
    { anchorId: 'desk', itemId: 'odd-telegraph' }, { anchorId: 'floor', itemId: 'odd-anvil' },
    { anchorId: 'window', itemId: 'odd-wagon' },
  ];
  assert.equal(roomAnchors().length, 7);
  assert.equal(ROOM_ANCHORS.length, 9);
  assert.deepEqual(rooms.saveLayout(owner, layout(0, placements)).placements, placements);
  for (const anchorId of ['wall-left', 'shelf-left', 'desk', 'floor']) {
    assert.throws(() => rooms.saveLayout(owner, layout(1, [{ anchorId, itemId: 'odd-wagon' }])), status(400));
  }
  assert.throws(() => rooms.saveLayout(owner, layout(1, [{ anchorId: 'window', itemId: 'odd-telegraph' }])), status(400));
  assert.throws(() => rooms.saveLayout(owner, layout(1, [
    { anchorId: 'desk', itemId: 'odd-telegraph' }, { anchorId: 'shelf-left', itemId: 'odd-telegraph' },
  ])), status(400));
  let revision = 1;
  for (const itemId of ['odd-lamp', 'odd-piano']) {
    assert.equal(rooms.saveLayout(owner, layout(revision++, [{ anchorId: 'desk', itemId }])).placements[0].itemId, itemId);
  }
  assert.deepEqual(shop.doc, inventory);
});

test('existing window wagons and shelf telegraphs survive restart and subsequent saves', t => {
  const { owner, store, options } = fixture(t);
  const placements = [{ anchorId: 'window', itemId: 'odd-wagon' }, { anchorId: 'shelf-left', itemId: 'odd-telegraph' }];
  store.saveDoc('rooms', { schemaVersion: 1, rooms: { owner: {
    layoutRevision: 4, visibility: 'private', themeId: 'bunkhouse-timber', placements,
  } } });
  const restarted = new Rooms({ ...options, store: new Store(store.dir) });
  assert.deepEqual(restarted.owner(owner).placements, placements);
  assert.deepEqual(restarted.owner(owner).shelves, defaultShelves());
  assert.deepEqual(restarted.owner(owner).finishes, roomFinishes());
  assert.deepEqual(restarted.saveLayout(owner, { expectedRevision: 4, themeId: 'bunkhouse-timber', placements }).placements, placements);
});

test('shelf moves preserve contents and styles across restart without changing possessions or money', t => {
  const { rooms, owner, visitor, shop, options } = fixture(t);
  const inventory = structuredClone(shop.doc), bankroll = owner.bankroll;
  const shelves = ROOM_SHELF_IDS.map((id, i) => ({ id, spotId: ROOM_SHELF_SPOTS[i].id, typeId: 'braced', colorId: 'sage' }));
  const placements = [
    { anchorId: 'shelf-left', itemId: 'odd-lamp' }, { anchorId: 'shelf-right', itemId: 'odd-vaccine' },
    { anchorId: 'shelf-3', itemId: 'odd-rock' }, { anchorId: 'shelf-4', itemId: 'odd-snakeoil' },
  ];
  const finishes = { floor: { typeId: 'stone', colorId: 'slate' }, rug: { typeId: 'striped', colorId: 'indigo' }, wardrobe: { typeId: 'paneled', colorId: 'clay' } };
  rooms.saveLayout(owner, { ...layout(0, placements), shelves, finishes });
  const moved = shelves.map(shelf => ({ ...shelf, spotId: shelf.id === 'shelf-left' ? 'left-high-back' : shelf.id === 'shelf-3' ? 'left-low-back' : shelf.spotId }));
  rooms.saveLayout(owner, { ...layout(1, placements), shelves: moved, finishes });
  const shown = new Rooms(options).visit(visitor, owner);
  assert.deepEqual(shown.shelves, moved);
  assert.deepEqual(shown.finishes, finishes);
  assert.deepEqual(shown.placements, placements);
  assert.deepEqual(shop.doc, inventory);
  assert.equal(owner.bankroll, bankroll);
  const next = rooms.saveLayout(owner, layout(2, placements));
  assert.deepEqual(next.shelves, moved, 'an older client omitting furniture fields retains their current values');
  assert.deepEqual(next.finishes, finishes);
});

test('removing shelves stores their items and explicit empty furniture persists without returning default shelves', t => {
  const { rooms, owner, visitor, shop, options } = fixture(t);
  rooms.saveLayout(owner, { ...layout(0, [{ anchorId: 'shelf-left', itemId: 'odd-lamp' }]), shelves: defaultShelves() });
  assert.throws(() => rooms.saveLayout(owner, { ...layout(1, [{ anchorId: 'shelf-left', itemId: 'odd-lamp' }]), shelves: [] }), status(400));
  const saved = rooms.saveLayout(owner, { ...layout(1, []), shelves: [], finishes: { ...roomFinishes(), rug: { typeId: 'none', colorId: 'maroon' } } });
  assert.deepEqual(saved.shelves, []);
  assert.equal(saved.owned.includes('odd-lamp'), true);
  assert.equal(shop.doc.inv.owner.own['odd-lamp'], 1);
  const restarted = new Rooms(options);
  assert.deepEqual(restarted.visit(visitor, owner).shelves, []);
  assert.deepEqual(restarted.visit(visitor, owner).placements, []);
  assert.equal(restarted.visit(visitor, owner).finishes.rug.typeId, 'none');
  assert.equal(roomAnchors(saved.shelves).some(anchor => anchor.type === 'shelf'), false);
});

test('furniture validation rejects arbitrary values, occupied spots, absent shelves and excessive counts atomically', t => {
  const { rooms, owner } = fixture(t);
  const shelves = defaultShelves(), finishes = roomFinishes(), before = rooms.owner(owner);
  const invalidShelves = [
    null, {}, [null], [{ ...shelves[0], id: 'unlimited-shelf' }], [{ ...shelves[0], spotId: 'on-the-window' }],
    [{ ...shelves[0], x: 9 }], [{ ...shelves[0], typeId: 'html' }], [{ ...shelves[0], colorId: '#ffffff' }],
    [{ id: shelves[0].id, spotId: shelves[0].spotId }], [shelves[0], shelves[0]],
    [shelves[0], { ...shelves[1], spotId: shelves[0].spotId }],
    Array.from({ length: 5 }, (_, i) => ({ ...shelves[0], id: `shelf-${i}` })),
  ];
  for (const value of invalidShelves) assert.throws(() => rooms.saveLayout(owner, { ...layout(0, []), shelves: value }), status(400), JSON.stringify(value));
  const invalidFinishes = [null, {}, [], { ...finishes, shelf: ROOM_FINISHES.shelf.default },
    { ...finishes, floor: { typeId: 'stone', colorId: 'secret' } }, { ...finishes, floor: { typeId: 'html', colorId: 'honey' } },
    { ...finishes, floor: { ...finishes.floor, url: 'https://example.com' } }, { ...finishes, floor: 'stone' }];
  for (const value of invalidFinishes) assert.throws(() => rooms.saveLayout(owner, { ...layout(0, []), finishes: value }), status(400), JSON.stringify(value));
  assert.throws(() => rooms.saveLayout(owner, layout(0, [{ anchorId: 'shelf-3', itemId: 'odd-rock' }])), status(400));
  assert.deepEqual(rooms.owner(owner), before);
});

test('invalid stored furniture is sanitized without discarding valid shelf identities or finishes', t => {
  const { rooms, owner } = fixture(t);
  const first = defaultShelves()[0];
  rooms.doc.rooms.owner = { ...layout(), shelves: [
    { ...first, typeId: 'broken', colorId: 'sage', privateNote: 'secret' },
    { ...first, id: 'shelf-right' },
    { id: 'shelf-3', spotId: 'left-high-back', typeId: 'braced', colorId: 'walnut' },
    { id: 'bad', spotId: 'left-high-front' },
  ], finishes: { floor: { typeId: 'stone', colorId: 'honey', privateNote: 'secret' }, rug: { typeId: 'broken', colorId: 'indigo' } },
  placements: [{ anchorId: 'shelf-3', itemId: 'odd-rock' }, { anchorId: 'shelf-right', itemId: 'odd-lamp' }] };
  const view = rooms.owner(owner);
  assert.deepEqual(view.shelves, [
    { ...first, colorId: 'sage' }, { id: 'shelf-3', spotId: 'left-high-back', typeId: 'braced', colorId: 'walnut' },
  ]);
  assert.deepEqual(view.placements, [{ anchorId: 'shelf-3', itemId: 'odd-rock' }]);
  assert.deepEqual(view.finishes.floor, { typeId: 'stone', colorId: 'honey' });
  assert.deepEqual(view.finishes.rug, { typeId: 'woven', colorId: 'indigo' });
  assert.doesNotMatch(JSON.stringify(view), /privateNote|secret/);
});

test('layout validation rejects invalid, unowned, duplicate and incompatible placements', t => {
  const { rooms, owner, shop } = fixture(t);
  delete shop.doc.inv.owner.own['odd-rock'];
  const bad = [
    null, {}, { ...layout(), expectedRevision: '0' }, { ...layout(), expectedRevision: -1 },
    { ...layout(), ownerId: 'visitor' }, { ...layout(), visibility: 'signed-in' }, { ...layout(), showWealthPile: true },
    { ...layout(), themeId: 'https://example.com/texture' }, { ...layout(), placements: null },
    layout(0, Array.from({ length: ROOM_ANCHORS.length + 1 }, () => ({ anchorId: 'wall-left', itemId: 'odd-deed' }))),
    layout(0, [{ anchorId: 'shelf-left', itemId: 'odd-rock' }]),
    layout(0, [{ anchorId: 'wall-left', itemId: 'odd-lamp' }]),
    layout(0, [{ anchorId: 'unknown', itemId: 'odd-deed' }]),
    layout(0, [{ anchorId: 'wall-left', itemId: 'unknown' }]),
    layout(0, [{ anchorId: 'wall-left', itemId: 'odd-deed', x: 500 }]),
    layout(0, [{ anchorId: 'wall-left', itemId: 'odd-deed' }, { anchorId: 'wall-left', itemId: 'odd-horseshoe' }]),
    layout(0, [{ anchorId: 'wall-left', itemId: 'odd-deed' }, { anchorId: 'wall-right', itemId: 'odd-deed' }]),
    layout(0, [null]), layout(0, ['odd-deed']),
  ];
  for (const body of bad) assert.throws(() => rooms.saveLayout(owner, body), status(400), JSON.stringify(body));
  assert.equal(rooms.owner(owner).layoutRevision, 0);
  assert.deepEqual(rooms.owner(owner).placements, []);
});

test('arrangements survive restart and conflicting tabs cannot replace newer layouts', t => {
  const { rooms, owner, store, options } = fixture(t);
  assert.equal(rooms.saveLayout(owner, layout()).layoutRevision, 1);
  const restarted = new Rooms({ ...options, store: new Store(store.dir) });
  assert.equal(restarted.owner(owner).themeId, 'bunkhouse-sage');
  assert.deepEqual(restarted.owner(owner).placements, layout().placements);
  assert.throws(() => rooms.saveLayout(owner, layout(0, [])), status(409));
  assert.equal(rooms.owner(owner).placements.length, 1);
});

test('legacy private flags do not block visits or exact worth and disappear on the next layout save', t => {
  const { owner, visitor, store, options } = fixture(t);
  store.saveDoc('rooms', { schemaVersion: 1, rooms: { owner: {
    layoutRevision: 3, visibility: 'private', showWealthPile: false, themeId: 'bunkhouse-sage', placements: layout().placements,
  } } });
  const rooms = new Rooms({ ...options, store: new Store(store.dir) });
  const shown = rooms.visit(visitor, owner);
  assert.deepEqual(shown.placements, layout().placements);
  assert.equal(shown.layoutRevision, 3);
  assert.equal(shown.wealthStage, 3);
  assert.equal(shown.worth.bankroll, 142.87);
  rooms.saveLayout(owner, layout(3));
  const saved = new Store(store.dir).loadDoc('rooms').rooms.owner;
  assert.deepEqual(Object.keys(saved).sort(), ['finishes', 'furniture', 'layoutRevision', 'placements', 'shelves', 'themeId']);
  assert.equal(new Rooms({ ...options, store: new Store(store.dir) }).visit(visitor, owner).wealthStage, 3);
});

test('failed persistence leaves both live room and saved room unchanged', t => {
  const { rooms, owner, visitor, store, dir } = fixture(t);
  rooms.saveLayout(owner, layout());
  const before = rooms.owner(owner), bytes = fs.readFileSync(path.join(dir, 'rooms.json'), 'utf8');
  const originalSave = store.saveDoc;
  store.saveDoc = () => { throw new Error('Disk unavailable'); };
  for (const change of [() => rooms.saveLayout(owner, layout(1, [])), () => rooms.forget(owner.id)]) {
    assert.throws(change, /Disk unavailable/);
    assert.deepEqual(rooms.owner(owner), before);
    assert.equal(fs.readFileSync(path.join(dir, 'rooms.json'), 'utf8'), bytes);
    assert.equal(rooms.visit(visitor, owner).owner.id, owner.id);
  }
  store.saveDoc = originalSave;
});

test('invalid saved references are filtered without blocking visits', t => {
  const { rooms, owner, visitor, shop } = fixture(t);
  rooms.doc.rooms.owner = { layoutRevision: 4, themeId: 'invalid', placements: [
    { anchorId: 'wall-left', itemId: 'odd-deed' }, { anchorId: 'wall-left', itemId: 'odd-horseshoe' },
    { anchorId: 'wall-right', itemId: 'odd-deed' }, { anchorId: 'floor', itemId: 'odd-wagon' },
    { anchorId: 'shelf-left', itemId: 'odd-rock' }, { anchorId: 'shelf-right', itemId: 'unknown' },
  ] };
  delete shop.doc.inv.owner.own['odd-rock'];
  assert.deepEqual(rooms.owner(owner).placements, [{ anchorId: 'wall-left', itemId: 'odd-deed' }]);
  assert.equal(rooms.owner(owner).themeId, 'bunkhouse-timber');
  assert.deepEqual(rooms.visit(visitor, owner).placements, rooms.owner(owner).placements);
});

test('forgetting a room resets its arrangement while the account remains visitable', t => {
  const { rooms, owner, visitor, options } = fixture(t);
  rooms.saveLayout(owner, layout());
  rooms.forget(owner.id);
  assert.equal(new Rooms(options).isOpen(owner.id), true);
  assert.deepEqual(rooms.visit(visitor, owner).placements, []);
  assert.equal(rooms.owner(owner).layoutRevision, 0);
  assert.equal(rooms.owner(owner).owned.length, 12);
});

test('wealth stages have bounded, exact boundary behavior', () => {
  for (const [value, stage] of [[-5, 0], [0, 0], [0.01, 1], [999.99, 1], [1000, 2], [9999.99, 2],
    [10000, 3], [99999.99, 3], [100000, 4], [999999.99, 4], [1000000, 5], [Number.MAX_VALUE, 5]]) assert.equal(wealthStage(value), stage);
  for (const value of [undefined, null, NaN, Infinity, '1000']) assert.equal(wealthStage(value), null);
});

test('room worth keeps finite exact values and omits unavailable values instead of inventing zero', t => {
  const { rooms, owner, visitor } = fixture(t);
  rooms.netWorth = () => ({ bankroll: -12.34, chips: 0, holdings: NaN, riskEscrow: Infinity, total: undefined, privateNote: 'secret' });
  const shown = rooms.visit(visitor, owner);
  assert.deepEqual(shown.worth, { bankroll: -12.34, chips: 0 });
  assert.equal(Object.hasOwn(shown, 'wealthStage'), false);
});

test('room visits reconcile the real pet clock without feeding or awarding care XP', t => {
  const { rooms, owner, visitor, store } = fixture(t);
  let now = 100000;
  const barn = new Barn({ store, now: () => now, incubateMs: 1000, eggInt: () => 0 });
  rooms.barn = barn;
  barn.layEgg(owner.id);
  now += 1000;
  assert.equal(rooms.visit(visitor, owner).pet.stage, 'creature');
  const pen = barn.doc.pens[owner.id], fedAt = pen.fedAt;
  now += 86400e3;
  rooms.visit(visitor, owner);
  assert.equal(pen.fedAt, fedAt);
  assert.equal(pen.xp, DAY_XP);
  assert.deepEqual(pen.cool, {});
  const after = structuredClone(pen);
  rooms.visit(visitor, owner);
  assert.deepEqual(pen, after);
});

test('furniture saves within the floor plan, rejects impossible spots atomically and falls back to defaults when stored data is bad', t => {
  const { rooms, owner, visitor, store, options } = fixture(t);
  const home = defaultFurniture();
  assert.deepEqual(rooms.owner(owner).furniture, home);
  Object.keys(home).forEach(id => assert.ok(furnitureFits(home, id), `${id} starts somewhere valid`));
  const moved = { wardrobe: { x: 1.5, z: 0, r: 1 }, desk: { ...home.desk, off: true } };
  const saved = rooms.saveLayout(owner, { ...layout(0, []), furniture: moved });
  assert.deepEqual(saved.furniture, { ...home, ...moved });
  assert.deepEqual(rooms.visit(visitor, owner).furniture, saved.furniture);
  assert.equal(roomAnchors(saved.shelves, saved.furniture).some(anchor => anchor.id === 'desk'), false);
  assert.deepEqual(rooms.saveLayout(owner, layout(1, [])).furniture, saved.furniture, 'older clients keep the saved furniture');
  const bad = [null, [], { sofa: home.desk }, { desk: { ...home.desk, y: 2 } }, { desk: { x: '0', z: 0, r: 0 } }, { desk: { ...home.desk, r: 4 } },
    { desk: { ...home.desk, off: 'yes' } }, { pet: { ...home.pet, off: true } }, { wardrobe: { x: 50, z: 0, r: 0 } },
    { wardrobe: { x: home.pet.x, z: home.pet.z, r: 0 } }, { wardrobe: { x: home.window.x, z: 0, r: 0 } }, { window: { x: 0, z: 0, r: 0 } },
    { wardrobe: { x: 0.2 * Math.sqrt(1.75), z: 1.25 * Math.sqrt(1.75), r: 0 } }];
  for (const furniture of bad) assert.throws(() => rooms.saveLayout(owner, { ...layout(2, []), furniture }), status(400), JSON.stringify(furniture));
  assert.throws(() => rooms.saveLayout(owner, { ...layout(2, [{ anchorId: 'desk', itemId: 'odd-telegraph' }]), furniture: moved }), status(400), 'a stored desk displays nothing');
  assert.equal(rooms.owner(owner).layoutRevision, 2);
  const restarted = new Rooms({ ...options, store: new Store(store.dir) });
  assert.deepEqual(restarted.owner(owner).furniture, saved.furniture);
  restarted.doc.rooms.owner.furniture.wardrobe.x = 999;
  assert.deepEqual(restarted.owner(owner).furniture, home);
});
