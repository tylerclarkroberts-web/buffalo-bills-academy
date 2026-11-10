import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeRoomCamera, ROOM_BOUNDS, ROOM_POSITIONS, wealthLayout, roomRenderSize, ROOM_VIEW_LIMITS, roomView, roomWallVisibility, roomPositions, nearestShelfSpot } from '../client/src/room/scene-model.js';
import { roomAnchors, ROOM_SHELF_SPOTS, defaultShelves, roomFinishes } from '../server/catalog/room.js';
import { RoomScene } from '../client/src/room/scene.js';

function furnitureScene() {
  const canvas = { clientWidth: 846, clientHeight: 380, style: {}, captured: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 846, height: 380 }),
    setPointerCapture(id) { this.captured = id; }, hasPointerCapture(id) { return this.captured === id; }, releasePointerCapture() { this.captured = null; } };
  return Object.assign(Object.create(RoomScene.prototype), {
    canvas, camera: makeRoomCamera(846 / 380), dynamic: new THREE.Group(), highlights: new THREE.Group(), dragPreview: new THREE.Group(),
    picks: [], walls: [], wallMaterial: new THREE.MeshLambertMaterial(), wardrobe: new THREE.Group(), rug: new THREE.Group(),
    generation: 0, shelves: defaultShelves(), render() {}, pet() {}, resident() {}, wealth() {},
  });
}
const screenPoint = (camera, position) => {
  const p = new THREE.Vector3(...position).project(camera);
  return { clientX: (p.x + 1) * 846 / 2, clientY: (1 - p.y) * 380 / 2 };
};

test('shelf positions follow identities, including added shelves, while removed shelves disappear', () => {
  assert.deepEqual(roomPositions(), ROOM_POSITIONS);
  const shelves = [{ ...defaultShelves()[0], spotId: 'left-high-front' }, { ...defaultShelves()[1], id: 'shelf-3' }];
  const positions = roomPositions(shelves);
  assert.deepEqual(positions['shelf-left'], ROOM_SHELF_SPOTS[3].position);
  assert.deepEqual(positions['shelf-3'], ROOM_SHELF_SPOTS[1].position);
  assert.equal(Object.hasOwn(positions, 'shelf-right'), false);
  assert.deepEqual(Object.keys(roomPositions([])).sort(), roomAnchors([]).map(anchor => anchor.id).sort());
});

test('nearest shelf mount respects occupancy, camera changes and a bounded drop distance', () => {
  const shelves = defaultShelves(), rect = { left: 0, top: 0, width: 846, height: 380 };
  for (const view of [{ zoom: 1, rotation: 0 }, { zoom: 1.5, rotation: -15 }]) {
    const camera = makeRoomCamera(rect.width / rect.height, view), destination = ROOM_SHELF_SPOTS[2];
    const point = screenPoint(camera, destination.position);
    assert.equal(nearestShelfSpot(camera, rect, point.clientX, point.clientY, shelves, shelves[0].id).id, destination.id);
    const occupied = screenPoint(camera, ROOM_SHELF_SPOTS[1].position);
    assert.notEqual(nearestShelfSpot(camera, rect, occupied.clientX, occupied.clientY, shelves, shelves[0].id)?.id, shelves[1].spotId);
    assert.equal(nearestShelfSpot(camera, rect, rect.width - 2, 2, shelves, shelves[0].id), null);
    assert.equal(nearestShelfSpot(camera, rect, -10, 20, shelves, shelves[0].id), null);
  }
});

test('furniture choices change rendered types and colors, and a removed rug remains editable', () => {
  const scene = furnitureScene();
  scene.floorMaps = { planks: new THREE.Texture(), stone: new THREE.Texture() };
  scene.floor = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 6.5), new THREE.MeshLambertMaterial());
  scene.furnishings(roomFinishes());
  const classicParts = scene.wardrobe.children.length, wovenParts = scene.rug.children.length;
  const defaultColor = scene.wardrobe.children[1].material.color.getHexString();
  scene.furnishings(roomFinishes({ floor: { typeId: 'stone', colorId: 'slate' }, rug: { typeId: 'striped', colorId: 'indigo' }, wardrobe: { typeId: 'paneled', colorId: 'sage' } }));
  assert.equal(scene.floor.material.map, scene.floorMaps.stone);
  assert.ok(scene.wardrobe.children.length > classicParts);
  assert.notEqual(scene.wardrobe.children[1].material.color.getHexString(), defaultColor);
  assert.ok(scene.rug.children.length > wovenParts);
  scene.update({ placements: [], shelves: [], finishes: roomFinishes({ rug: { typeId: 'none' } }) });
  assert.equal(scene.rug.children.length, 0);
  assert.ok(scene.picks.some(pick => pick.userData.selection.surface === 'rug'));
  assert.equal(scene.picks.some(pick => pick.userData.selection.anchorId?.startsWith('shelf-')), false);
  scene.setEditing(true, { kind: 'surface', surface: 'rug' });
  assert.ok(scene.highlights.children.some(glow => glow.userData.selection.surface === 'rug'));
});

test('shelf hold requires a deliberate pause and moves only on release at a free mount', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scene = furnitureScene(), moves = [];
  scene.editing = true; scene.onMoveShelf = (...move) => moves.push(move); scene.onSelect = () => {};
  scene.targetAt = () => ({ kind: 'anchor', anchorId: 'shelf-left' });
  const start = { button: 0, pointerId: 7, pointerType: 'mouse', ...screenPoint(scene.camera, ROOM_SHELF_SPOTS[0].position) };
  const destination = { ...start, ...screenPoint(scene.camera, ROOM_SHELF_SPOTS[2].position) };
  scene.pointerDown(start); t.mock.timers.tick(449); assert.equal(scene.dragging, null);
  scene.pointerMove({ ...start, clientX: start.clientX + 20 }); t.mock.timers.tick(10);
  assert.equal(scene.dragging, null, 'movement before the hold cancels pickup');
  scene.pointerDown(start); t.mock.timers.tick(450);
  assert.equal(scene.dragging.id, 'shelf-left'); assert.equal(scene.canvas.captured, 7);
  scene.pointerDown({ ...start, pointerId: 8, isPrimary: false });
  scene.pointerMove({ ...destination, pointerId: 8 }); scene.pointerUp({ ...destination, pointerId: 8 });
  assert.equal(scene.dragging.id, 'shelf-left'); assert.equal(moves.length, 0, 'another contact cannot move or release this shelf');
  scene.pointerMove(destination); assert.equal(moves.length, 0, 'preview does not change the saved layout');
  scene.pointerUp(destination); assert.deepEqual(moves, [['shelf-left', 'left-high-back']]);
  assert.equal(scene.dragPreview.children.length, 0); assert.equal(scene.canvas.captured, null);
  scene.pointerDown(start); t.mock.timers.tick(450); scene.pointerUp({ ...start, clientX: 844, clientY: 2 });
  assert.equal(moves.length, 1, 'a far release cancels rather than snapping arbitrarily');
  scene.pointerDown(start); t.mock.timers.tick(450); scene.setEditing(false);
  scene.pointerUp(destination); assert.equal(moves.length, 1, 'leaving edit mode cancels a held shelf');
  scene.pointerDown(start); t.mock.timers.tick(500); assert.equal(scene.dragging, null, 'visitors cannot pick up shelves');
  scene.setEditing(true); scene.canvas.setPointerCapture = () => { throw new Error('Pointer ended'); };
  scene.pointerDown(start); t.mock.timers.tick(450);
  assert.equal(scene.dragging, null, 'a pointer ending before capture cancels cleanly');
  assert.equal(moves.length, 1);
});

test('room view has finite limits and resetting keeps the original camera transform', () => {
  assert.deepEqual(roomView(), { zoom: 1, rotation: 0 });
  assert.deepEqual(roomView(null), { zoom: 1, rotation: 0 });
  assert.deepEqual(roomView({ zoom: NaN, rotation: Infinity }), { zoom: 1, rotation: 0 });
  assert.deepEqual(roomView({ zoom: '2', rotation: '-15' }), { zoom: 1, rotation: 0 });
  assert.deepEqual(roomView({ zoom: -100, rotation: 999 }), { zoom: ROOM_VIEW_LIMITS.minZoom, rotation: -81 });
  assert.deepEqual(roomView({ zoom: 100, rotation: -999 }), { zoom: ROOM_VIEW_LIMITS.maxZoom, rotation: 81 });
  for (const [rotation, expected] of [[180, -180], [-180, -180], [360, 0], [-360, 0], [450, 90], [-450, -90]]) {
    assert.equal(roomView({ rotation }).rotation, expected, 'rotation wraps continuously through a full turn');
  }
  const camera = makeRoomCamera(846 / 380);
  const original = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  original.position.set(10, 9, 12); original.lookAt(0, 1.1, -0.4); original.updateMatrixWorld();
  assert.deepEqual(camera.matrixWorld.toArray(), original.matrixWorld.toArray());
  assert.equal(camera.zoom, 1);
  assert.deepEqual(camera.projectionMatrix.toArray(), makeRoomCamera(846 / 380, roomView()).projectionMatrix.toArray());
});

test('camera zoom and rotation survive resize and room refresh while edit highlights remain usable', t => {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  let clearedHover = false;
  const scene = Object.assign(Object.create(RoomScene.prototype), {
    canvas: { clientWidth: 846, clientHeight: 380 }, renderer: { setSize() {} }, render() {},
    dynamic: new THREE.Group(), highlights: new THREE.Group(), picks: [], walls: [],
    wallMaterial: new THREE.MeshLambertMaterial(), wardrobe: new THREE.Group(),
    generation: 0, pet() {}, resident() {}, wealth() {}, hovered: true,
    onWealthHover(value) { clearedHover = value === false; },
  });
  const view = { zoom: 1.75, rotation: -15 };
  scene.setView(view);
  assert.deepEqual(scene.view, view);
  assert.equal(scene.camera.zoom, 1.75);
  assert.equal(scene.hovered, false);
  assert.ok(clearedHover, 'changing the view clears the previous money tooltip');
  scene.canvas.clientWidth = 353; scene.canvas.clientHeight = 278;
  scene.resize();
  assert.deepEqual(scene.view, view);
  assert.deepEqual(scene.camera.projectionMatrix.toArray(), makeRoomCamera(353 / 278, view).projectionMatrix.toArray());
  scene.setEditing(true, { kind: 'anchor', anchorId: 'desk' });
  scene.update({ themeId: 'bunkhouse-sage', placements: [], pet: null });
  assert.deepEqual(scene.view, view);
  assert.equal(scene.camera.zoom, 1.75);
  assert.ok(scene.highlights.children.some(glow => glow.userData.selection.anchorId === 'desk'));
  scene.setView();
  assert.deepEqual(scene.view, { zoom: 1, rotation: 0 });
  assert.deepEqual(scene.camera.projectionMatrix.toArray(), makeRoomCamera(353 / 278).projectionMatrix.toArray());
  scene.setEditing(false);
  scene.dynamic.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  scene.wallMaterial.dispose();
});

test('edit highlights include empty display spots and survive scene updates, then dispose on exit', () => {
  const scene = Object.assign(Object.create(RoomScene.prototype), {
    dynamic: new THREE.Group(), highlights: new THREE.Group(), picks: [], walls: [],
    wallMaterial: new THREE.MeshLambertMaterial(), wardrobe: new THREE.Group(),
    generation: 0, render() {}, pet() {}, resident() {}, wealth() {},
  });
  scene.wardrobe.position.set(3.25, 0, -2.5);
  const selection = { kind: 'anchor', anchorId: 'desk' };
  scene.setEditing(true, selection);
  scene.update({ themeId: 'bunkhouse-sage', placements: [], pet: null });
  const targets = scene.highlights.children.map(glow => glow.userData.selection);
  assert.deepEqual(targets.filter(target => target.kind === 'anchor').map(target => target.anchorId).sort(), roomAnchors().map(anchor => anchor.id).sort());
  assert.ok(targets.some(target => target.kind === 'wardrobe'));
  assert.ok(targets.some(target => target.kind === 'pet'));
  assert.ok(!targets.some(target => target.kind === 'wealth'), 'money is inspectable, not editable');
  const desk = scene.highlights.children.find(glow => glow.userData.selection.anchorId === 'desk');
  const shelf = scene.highlights.children.find(glow => glow.userData.selection.anchorId === 'shelf-left');
  assert.ok(desk.children[1].material.opacity > shelf.children[1].material.opacity, 'selected spot has a stronger outline');
  assert.ok(scene.wallMaterial.emissiveIntensity > 0);
  let disposed = 0, resources = 0, pickDisposed = false;
  scene.highlights.traverse(o => {
    for (const resource of [o.geometry, o.material].filter(Boolean)) { resources++; resource.addEventListener('dispose', () => { disposed++; }); }
  });
  scene.picks[0].geometry.addEventListener('dispose', () => { pickDisposed = true; });
  scene.setEditing(false, selection);
  assert.equal(scene.highlights.children.length, 0, 'preview and visitor mode have no edit outlines');
  assert.equal(scene.wallMaterial.emissiveIntensity, 0);
  assert.equal(disposed, resources, 'all old highlight geometry and materials are released');
  assert.equal(pickDisposed, false, 'highlights do not own the live picking geometry');
  scene.dynamic.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  scene.wallMaterial.dispose();
});

test('walls open finish choices only in edit mode without intercepting displayed wall items', () => {
  const width = 846, height = 380, camera = makeRoomCamera(width / height);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 0.16));
  wall.position.set(0, 1.7, -3); wall.userData.selection = { kind: 'finish' }; wall.updateMatrixWorld();
  const display = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.3));
  display.position.set(-2.9, 2.95, -2.81); display.userData.selection = { kind: 'anchor', anchorId: 'wall-left' }; display.updateMatrixWorld();
  const scene = { camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) },
    picks: [display], walls: [wall], raycaster: new THREE.Raycaster() };
  const target = point => {
    const p = new THREE.Vector3(...point).project(camera);
    return RoomScene.prototype.targetAt.call(scene, (p.x + 1) * width / 2, (1 - p.y) * height / 2);
  };
  assert.equal(target([1, 1, -3]), null);
  scene.editing = true;
  assert.deepEqual(target([1, 1, -3]), { kind: 'finish' });
  assert.deepEqual(target([-2.9, 2.95, -2.81]), { kind: 'anchor', anchorId: 'wall-left' });
  for (const object of [wall, display]) { object.geometry.dispose(); object.material.dispose(); }
});

test('the money hover and click target follows the visible pile after camera resizing, zooming and rotation', () => {
  for (const [width, height] of [[846, 380], [353, 278], [283, 278]]) {
    for (const view of [{ zoom: 0.75, rotation: -30 }, { zoom: 1, rotation: 0 }, { zoom: 2.5, rotation: 30 }]) {
      const camera = makeRoomCamera(width / height, view);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1, 1.25));
      pick.position.set(2.25, 1.4, 1.45); pick.userData.selection = { kind: 'wealth' }; pick.updateMatrixWorld();
      const canvas = { getBoundingClientRect: () => ({ left: 30, top: 20, width, height }) };
      const scene = { canvas, camera, picks: [pick], raycaster: new THREE.Raycaster() };
      const point = pick.position.clone().project(camera);
      const x = 30 + (point.x + 1) * width / 2, y = 20 + (1 - point.y) * height / 2;
      assert.deepEqual(RoomScene.prototype.targetAt.call(scene, x, y), { kind: 'wealth' });
      assert.equal(RoomScene.prototype.targetAt.call(scene, 30, 20), null);
      scene.failed = true;
      assert.equal(RoomScene.prototype.targetAt.call(scene, x, y), null);
      pick.geometry.dispose(); pick.material.dispose();
    }
  }
});

test('room camera fits every room bound through a full turn on narrow, wide and landscape screens', () => {
  for (const aspect of [320 / 480, 390 / 420, 1, 736 / 440, 844 / 300, 1920 / 600, NaN]) {
    for (const rotation of [-180, -135, -90, -45, 0, 45, 90, 135, 179]) {
      const camera = makeRoomCamera(aspect, { rotation });
      for (const x of [ROOM_BOUNDS.min[0], ROOM_BOUNDS.max[0]]) {
        for (const y of [ROOM_BOUNDS.min[1], ROOM_BOUNDS.max[1]]) {
          for (const z of [ROOM_BOUNDS.min[2], ROOM_BOUNDS.max[2]]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1, `clipped room at aspect ${aspect}`);
          }
        }
      }
    }
  }
});

test('near walls, window trim, wall decorations and their click targets cut away together through a full turn', () => {
  const scene = furnitureScene();
  scene.raycaster = new THREE.Raycaster();
  scene.backWall = new THREE.Group(); scene.leftWall = new THREE.Group(); scene.cornerPost = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 0.16));
  wall.position.set(0, 1.7, -3); wall.userData.selection = { kind: 'finish' }; scene.backWall.add(wall);
  scene.backWall.updateMatrixWorld(); scene.walls.push(wall);
  const decoration = new THREE.Group(); decoration.userData.wallSide = 'back'; scene.dynamic.add(decoration);
  scene.pick([-2.9, 2.95, -2.81], [1.2, 1.1, 0.3], { kind: 'anchor', anchorId: 'wall-left' });
  scene.dynamic.updateMatrixWorld();
  for (const [rotation, expected] of [[0, { back: true, left: true }], [90, { back: false, left: true }],
    [180, { back: false, left: false }], [270, { back: true, left: false }]]) {
    scene.camera = makeRoomCamera(846 / 380, { rotation });
    assert.deepEqual(roomWallVisibility(scene.camera.position), expected);
    scene.setEditing(true, { kind: 'anchor', anchorId: 'wall-left' });
    assert.equal(scene.backWall.visible, expected.back);
    assert.equal(scene.leftWall.visible, expected.left);
    assert.equal(scene.cornerPost.visible, expected.back || expected.left);
    assert.equal(decoration.visible, expected.back);
    assert.equal(scene.picks[0].visible, expected.back);
    assert.equal(scene.highlights.children[0].visible, expected.back);
    if (!expected.back) {
      const point = screenPoint(scene.camera, [1, 1, -3]);
      assert.equal(scene.targetAt(point.clientX, point.clientY), null, 'hidden parent walls do not intercept clicks');
    }
  }
  scene.setEditing(false); scene.applyCutaway();
  wall.geometry.dispose(); wall.material.dispose();
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  scene.wallMaterial.dispose();
});

test('wealth art distinguishes unknown from empty and caps extreme inputs', () => {
  for (const value of [undefined, null, -1, 6, 1e12, 1.5, '3']) assert.deepEqual(wealthLayout(value), { neutral: true, chips: [], bundles: [] });
  assert.equal(wealthLayout(0).neutral, false);
  assert.equal(wealthLayout(0).chips.length, 0);
  let previous = 0;
  for (let stage = 0; stage <= 5; stage++) {
    const { chips, bundles } = wealthLayout(stage);
    assert.ok(chips.length >= previous && chips.length <= 126);
    assert.ok(bundles.length <= 6);
    chips.forEach(p => assert.ok(Math.abs(p.x) <= 0.32 && Math.abs(p.z) <= 0.32 && p.y < 0.7));
    previous = chips.length;
  }
});

test('the wagon footprint stays outside the cabin and desk props sit above the indoor floor', () => {
  assert.deepEqual(Object.keys(ROOM_POSITIONS).sort(), roomAnchors().map(anchor => anchor.id).sort());
  const [x, y, z] = ROOM_POSITIONS.window;
  assert.ok(x - 1.3 > 4.25, 'the full wagon belongs beyond the cabin floor edge');
  assert.ok(y >= 0 && y < 0.1, 'the wagon sits at yard ground level');
  const [deskX, deskY, deskZ] = ROOM_POSITIONS.desk;
  assert.ok(Math.abs(deskX) < 4 && Math.abs(deskZ) < 3 && deskY > 0.8 && deskY < 1.2, 'writing surface is inside at desk height');
  for (const aspect of [320 / 280, 390 / 280, 736 / 440, 844 / 300]) {
    const camera = makeRoomCamera(aspect);
    for (const dx of [-1.3, 1.3]) for (const dy of [0, 1.9]) for (const dz of [-0.9, 0.9]) {
      const projected = new THREE.Vector3(x + dx, y + dy, z + dz).project(camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'the outdoor wagon is not cropped');
    }
  }
});

test('room rendering stays sharp at ordinary sizes and bounds high-DPI drawing buffers', () => {
  assert.deepEqual(roomRenderSize(850, 380, 1), { width: 850, height: 380 });
  assert.deepEqual(roomRenderSize(390, 280, 2), { width: 585, height: 420 });
  for (const ratio of [1, 1.5, 2, 4, Infinity]) {
    for (const [w, h] of [[320, 280], [850, 500], [1920, 1080], [4096, 2160]]) {
      const size = roomRenderSize(w, h, ratio);
      assert.ok(size.width <= 1600 && size.height <= 1000);
      assert.ok(Math.abs(size.width / size.height - w / h) < 0.01, 'resizing preserves the scene aspect');
    }
  }
  assert.deepEqual(roomRenderSize(0, NaN, NaN), { width: 1, height: 1 });
});
