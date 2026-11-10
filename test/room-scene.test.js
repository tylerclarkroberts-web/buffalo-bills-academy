import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeRoomCamera, ROOM_BOUNDS, ROOM_POSITIONS, wealthLayout, roomRenderSize, ROOM_VIEW_LIMITS, roomView, roomWallVisibility, roomPositions, nearestShelfSpot, ROOM_FLOOR_SCALE, ROOM_WALL_HEIGHT, ROOM_DOOR_HEIGHT, RESIDENT_HEIGHT_SCALE, ROOM_FIXTURES, roomShelfPosition, floorPoint, nudgeAxes } from '../client/src/room/scene-model.js';
import { roomAnchors, ROOM_SHELF_SPOTS, ROOM_WALL_SPOTS, shelfSlots, defaultShelves, defaultWallDisplays, roomFinishes, defaultFurniture, furnitureFits, wallMountsFit } from '../server/catalog/room.js';
import { wallDisplayPosition, residentStep } from '../client/src/room/scene-model.js';
import { RoomScene } from '../client/src/room/scene.js';
const S = ROOM_FLOOR_SCALE;

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

test('house and yard gain 75 percent floor area while furniture, shelves and wagon keep their size', t => {
  const previousDocument = globalThis.document;
  const context = { fillRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const scene = furnitureScene(); scene.static = new THREE.Group(); scene.scene = new THREE.Scene();
  scene.scene.add(scene.static, scene.dynamic, scene.highlights, scene.dragPreview);
  scene.buildRoom();
  scene.update({ placements: [{ anchorId: 'window', itemId: 'odd-wagon' }], finishes: roomFinishes() });
  scene.scene.updateMatrixWorld(true);
  const yard = scene.structure.children.find(object => object.geometry?.parameters.width === 4.2 && object.geometry?.parameters.depth === 6);
  assert.ok(yard, 'the enlarged yard is part of the room architecture');
  for (const [floor, originalArea] of [[scene.floor, 8.5 * 6.5], [yard, 4.2 * 6]]) {
    const size = new THREE.Box3().setFromObject(floor).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x * size.z / originalArea - 1.75) < 1e-6);
    assert.equal(floor.getWorldScale(new THREE.Vector3()).y, 1, 'height is unchanged');
  }
  for (const fixture of scene.static.children.filter(object => object !== scene.structure)) {
    assert.deepEqual(fixture.getWorldScale(new THREE.Vector3()).toArray(), [1, 1, 1]);
  }
  const wardrobeSize = new THREE.Box3().setFromObject(scene.wardrobe.children[0]).getSize(new THREE.Vector3());
  for (const [actual, expected] of [[wardrobeSize.x, 1.5], [wardrobeSize.y, 2.5], [wardrobeSize.z, 0.85]]) assert.ok(Math.abs(actual - expected) < 1e-6);
  const shelf = scene.dynamic.children.find(object => object.isGroup && object.position.equals(new THREE.Vector3(...ROOM_POSITIONS['shelf-left'])));
  assert.ok(shelf);
  assert.deepEqual(shelf.getWorldScale(new THREE.Vector3()).toArray(), [1, 1, 1]);
  const shelfBounds = new THREE.Box3().setFromObject(shelf), wallInside = -4 * S + 0.08 * S;
  assert.ok(shelfBounds.min.x > wallInside && shelfBounds.min.x - wallInside < 0.15, 'the original-size shelf remains flush with the moved wall');
  scene.wagon.getWorldScale(new THREE.Vector3()).toArray().forEach(scale => assert.ok(Math.abs(scale - 1.65) < 1e-6));
  for (const offset of [-0.01, 0.01]) {
    assert.equal(roomWallVisibility({ x: -4 * S + offset, z: 0 }).left, offset > 0);
    assert.equal(roomWallVisibility({ x: 0, z: -3 * S + offset }).back, offset > 0);
  }
  scene.setEditing(false);
  scene.scene.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); });
});

test('all wall caps share the 8.5-foot proportion and the yard door stays an ordinary height', t => {
  const previousDocument = globalThis.document;
  const context = { fillRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const scene = furnitureScene(); scene.static = new THREE.Group(); scene.buildRoom(); scene.static.updateMatrixWorld(true);
  const side = scene.static.getObjectByName('yard-partition'), door = scene.static.getObjectByName('open-yard-door');
  assert.ok(Math.abs(ROOM_WALL_HEIGHT / (1.94 * RESIDENT_HEIGHT_SCALE) - 102 / 71) < 1e-10);
  for (const wall of [scene.leftWall, scene.backWall, side]) {
    const bounds = new THREE.Box3().setFromObject(wall);
    assert.ok(Math.abs(bounds.max.y - (ROOM_WALL_HEIGHT + 0.095)) < 1e-6, 'all three wall caps meet at one height');
    assert.ok(bounds.max.y < ROOM_BOUNDS.max[1], 'camera and shadow bounds include the taller cap');
    for (const rotation of [0, 90, 180, 270]) {
      const camera = makeRoomCamera(846 / 380, { rotation });
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, 'the raised walls fit through a full turn');
      }
    }
  }
  const doorHeight = new THREE.Box3().setFromObject(door).getSize(new THREE.Vector3()).y;
  assert.ok(Math.abs(doorHeight - ROOM_DOOR_HEIGHT) < 1e-6);
  assert.ok(Math.abs(doorHeight / ROOM_WALL_HEIGHT - 80 / 102) < 1e-6, 'the door is 6 ft 8 in against 8 ft 6 in walls');
  const doorway = new THREE.Raycaster(new THREE.Vector3(3.6 * S, ROOM_DOOR_HEIGHT - 0.15, 1.525 * S), new THREE.Vector3(1, 0, 0), 0, S);
  assert.equal(doorway.intersectObject(side, true).length, 0, 'the opening stays clear even above the resident’s head');
  scene.static.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); });
});

test('yard partition leaves an open doorway and its glazing does not intercept room controls', () => {
  const scene = furnitureScene();
  const [yardX, yardY, yardZ] = ROOM_POSITIONS.window;
  scene.static = new THREE.Group(); scene.raycaster = new THREE.Raycaster();
  scene.wardrobe.position.set(...ROOM_FIXTURES.wardrobe);
  scene.structure = new THREE.Group(); scene.structure.scale.set(S, 1, S); scene.static.add(scene.structure);
  scene.buildSideDoor();
  scene.update({ placements: [], shelves: [], finishes: roomFinishes() });
  scene.static.updateMatrixWorld(true); scene.dynamic.updateMatrixWorld(true);
  const partition = scene.static.getObjectByName('yard-partition');
  const doorway = new THREE.Raycaster(new THREE.Vector3(3.6 * S, 1.3, 1.525 * S), new THREE.Vector3(1, 0, 0), 0, S);
  assert.equal(doorway.intersectObject(partition, true).length, 0, 'the walkway through the door is open');
  const glass = [];
  partition.traverse(object => { if (object.material?.transparent) glass.push(object); });
  assert.ok(glass.length > 0);
  for (const pane of glass) {
    assert.equal(pane.material.depthWrite, false);
    assert.equal(pane.material.side, THREE.DoubleSide);
    assert.ok(pane.material.opacity < 0.2, 'glazing keeps the interior visible');
    assert.ok(!scene.picks.includes(pane) && !scene.walls.includes(pane), 'glazing is not an invisible input blocker');
  }
  for (const editing of [false, true]) {
    scene.setEditing(editing);
    for (const [position, selection] of [
      [[ROOM_FIXTURES.wealth[0], 1.4, ROOM_FIXTURES.wealth[2]], { kind: 'wealth' }],
      [[ROOM_FIXTURES.wardrobe[0], 2.2, ROOM_FIXTURES.wardrobe[2]], { kind: 'wardrobe' }],
      [[yardX, yardY + 1.1, yardZ], { kind: 'anchor', anchorId: 'window' }],
    ]) {
      const point = screenPoint(scene.camera, position);
      assert.deepEqual(scene.targetAt(point.clientX, point.clientY), selection);
    }
  }
  scene.setEditing(false);
  for (const group of [scene.static, scene.dynamic]) group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('a displayed wagon picks its visible canopy without swallowing the nearby wardrobe', () => {
  const scene = furnitureScene(); scene.raycaster = new THREE.Raycaster();
  scene.wardrobe.position.set(...ROOM_FIXTURES.wardrobe);
  const view = { placements: [{ anchorId: 'window', itemId: 'odd-wagon' }], shelves: [], finishes: roomFinishes() };
  scene.update(view); scene.dynamic.updateMatrixWorld(true);
  const canopy = scene.wagon.localToWorld(new THREE.Vector3(-0.075, 1.25, 0)).toArray();
  const pointAt = position => { const p = screenPoint(scene.camera, position); return scene.targetAt(p.clientX, p.clientY); };
  for (const editing of [false, true]) {
    scene.setEditing(editing);
    assert.deepEqual(pointAt(canopy), { kind: 'anchor', anchorId: 'window' });
    assert.deepEqual(pointAt([ROOM_FIXTURES.wardrobe[0], 1.3, ROOM_FIXTURES.wardrobe[2]]), { kind: 'wardrobe' }, 'empty corners of the wagon box cannot intercept the visible wardrobe');
  }
  scene.update({ ...view, placements: [] }); scene.dynamic.updateMatrixWorld(true);
  assert.equal(scene.wagon, null, 'removing the display clears the old model pick reference');
  assert.deepEqual(pointAt(canopy), { kind: 'anchor', anchorId: 'window' }, 'the empty yard still offers a display target');
  scene.setEditing(false);
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('shelf positions follow identities, including added shelves, while removed shelves disappear', () => {
  assert.deepEqual(roomPositions(), ROOM_POSITIONS);
  const shelves = [{ ...defaultShelves()[0], spotId: 'left-high-front' }, { ...defaultShelves()[1], id: 'shelf-3' }];
  const positions = roomPositions(shelves);
  assert.deepEqual(positions['shelf-left'], roomShelfPosition(ROOM_SHELF_SPOTS[3]));
  assert.deepEqual(positions['shelf-3'], roomShelfPosition(ROOM_SHELF_SPOTS[1]));
  assert.equal(Object.hasOwn(positions, 'shelf-right'), false);
  assert.deepEqual(Object.keys(roomPositions([])).sort(), roomAnchors([]).map(anchor => anchor.id).sort());
});

test('nearest shelf mount respects occupancy, camera changes and a bounded drop distance', () => {
  const shelves = defaultShelves(), rect = { left: 0, top: 0, width: 846, height: 380 };
  for (const view of [{ zoom: 1, rotation: 0 }, { zoom: 1.5, rotation: -15 }]) {
    const camera = makeRoomCamera(rect.width / rect.height, view), destination = ROOM_SHELF_SPOTS[2];
    const point = screenPoint(camera, roomShelfPosition(destination));
    assert.equal(nearestShelfSpot(camera, rect, point.clientX, point.clientY, shelves, shelves[0].id).id, destination.id);
    const occupied = screenPoint(camera, roomShelfPosition(ROOM_SHELF_SPOTS[1]));
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

test('shelves drag immediately after movement, retain click selection and move only on release at a free mount', () => {
  const scene = furnitureScene(), moves = [], selections = [];
  scene.editing = true; scene.onMoveShelf = (...move) => moves.push(move); scene.onSelect = selection => selections.push(selection);
  scene.targetAt = () => ({ kind: 'anchor', anchorId: 'shelf-left' });
  const shelf = new THREE.Group(); shelf.userData.dragId = 'shelf-left'; shelf.position.set(...roomShelfPosition(ROOM_SHELF_SPOTS[0])); scene.dynamic.add(shelf);
  const original = shelf.position.clone();
  const start = { button: 0, pointerId: 7, pointerType: 'mouse', ...screenPoint(scene.camera, roomShelfPosition(ROOM_SHELF_SPOTS[0])) };
  const destination = { ...start, ...screenPoint(scene.camera, roomShelfPosition(ROOM_SHELF_SPOTS[2])) };
  scene.pointerDown(start); scene.pointerMove({ ...start, clientX: start.clientX + 3 }); assert.equal(scene.dragging, null);
  scene.pointerUp(start); assert.equal(selections.length, 1, 'a click opens the shelf without moving it'); assert.equal(moves.length, 0);
  scene.pointerDown(start); scene.pointerMove(destination);
  assert.equal(scene.dragging.id, 'shelf-left'); assert.equal(scene.canvas.captured, 7);
  assert.deepEqual(shelf.position.toArray(), roomShelfPosition(ROOM_SHELF_SPOTS[2]), 'the shelf and its contents follow the preview');
  scene.pointerDown({ ...start, pointerId: 8, isPrimary: false });
  scene.pointerMove({ ...destination, pointerId: 8 }); scene.pointerUp({ ...destination, pointerId: 8 });
  assert.equal(scene.dragging.id, 'shelf-left'); assert.equal(moves.length, 0, 'another contact cannot move or release this shelf');
  scene.pointerMove(destination); assert.equal(moves.length, 0, 'preview does not change the saved layout');
  scene.pointerUp(destination); assert.deepEqual(moves, [['shelf-left', 'left-high-back']]);
  assert.equal(scene.dragPreview.children.length, 0); assert.equal(scene.canvas.captured, null);
  assert.ok(shelf.position.equals(original), 'preview transforms restore before the layout callback renders its result');
  scene.pointerDown(start); scene.pointerMove(destination); scene.pointerUp({ ...start, clientX: 844, clientY: 2 });
  assert.equal(moves.length, 1, 'a far release cancels rather than snapping arbitrarily');
  assert.ok(shelf.position.equals(original));
  scene.pointerDown(start); scene.pointerMove(destination); scene.setEditing(false);
  scene.pointerUp(destination); assert.equal(moves.length, 1, 'leaving edit mode cancels a dragged shelf');
  scene.pointerDown(start); scene.pointerMove(destination); assert.equal(scene.dragging, null, 'visitors cannot pick up shelves');
  scene.setEditing(true); scene.canvas.setPointerCapture = () => { throw new Error('Pointer ended'); };
  scene.pointerDown(start); scene.pointerMove(destination);
  assert.equal(scene.dragging, null, 'a pointer ending before capture cancels cleanly');
  assert.equal(moves.length, 1);
});

test('room view has finite limits and resetting keeps the enlarged room at its original viewing angle', () => {
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
  original.position.set(10 * S, 1.1 + 7.9 * S, 12 * S); original.lookAt(0, 1.1, -0.4 * S); original.updateMatrixWorld();
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
  scene.wardrobe.position.set(...ROOM_FIXTURES.wardrobe);
  const selection = { kind: 'anchor', anchorId: 'desk' };
  scene.setEditing(true, selection);
  scene.update({ themeId: 'bunkhouse-sage', placements: [], pet: null });
  const targets = scene.highlights.children.map(glow => glow.userData.selection);
  assert.deepEqual(targets.filter(target => target.kind === 'anchor').map(target => target.anchorId).sort(), roomAnchors().map(anchor => anchor.id).sort());
  assert.ok(targets.some(target => target.kind === 'wardrobe'));
  assert.ok(targets.some(target => target.kind === 'pet'));
  assert.ok(targets.some(target => target.kind === 'wealth'), 'the cash table can be selected to move it');
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
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8 * S, 3.4, 0.16 * S));
  wall.position.set(0, 1.7, -3 * S); wall.userData.selection = { kind: 'finish' }; wall.updateMatrixWorld();
  const display = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.3));
  display.position.set(ROOM_POSITIONS['wall-left'][0], 2.95, ROOM_POSITIONS['wall-left'][2]); display.userData.selection = { kind: 'anchor', anchorId: 'wall-left' }; display.updateMatrixWorld();
  const scene = { camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) },
    picks: [display], walls: [wall], raycaster: new THREE.Raycaster() };
  const target = point => {
    const p = new THREE.Vector3(...point).project(camera);
    return RoomScene.prototype.targetAt.call(scene, (p.x + 1) * width / 2, (1 - p.y) * height / 2);
  };
  assert.equal(target([S, 1, -3 * S]), null);
  scene.editing = true;
  assert.deepEqual(target([S, 1, -3 * S]), { kind: 'finish' });
  assert.deepEqual(target([ROOM_POSITIONS['wall-left'][0], 2.95, ROOM_POSITIONS['wall-left'][2]]), { kind: 'anchor', anchorId: 'wall-left' });
  for (const object of [wall, display]) { object.geometry.dispose(); object.material.dispose(); }
});

test('the money hover and click target follows the visible pile after camera resizing, zooming and rotation', () => {
  for (const [width, height] of [[846, 380], [353, 278], [283, 278]]) {
    for (const view of [{ zoom: 0.75, rotation: -30 }, { zoom: 1, rotation: 0 }, { zoom: 2.5, rotation: 30 }]) {
      const camera = makeRoomCamera(width / height, view);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1, 1.25));
      pick.position.set(ROOM_FIXTURES.wealth[0], 1.4, ROOM_FIXTURES.wealth[2]); pick.userData.selection = { kind: 'wealth' }; pick.updateMatrixWorld();
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
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8 * S, 3.4, 0.16 * S));
  wall.position.set(0, 1.7, -3 * S); wall.userData.selection = { kind: 'finish' }; scene.backWall.add(wall);
  scene.backWall.updateMatrixWorld(); scene.walls.push(wall);
  const decoration = new THREE.Group(); decoration.userData.wallSide = 'back'; scene.dynamic.add(decoration);
  scene.pick([ROOM_POSITIONS['wall-left'][0], 2.95, ROOM_POSITIONS['wall-left'][2]], [1.2, 1.1, 0.3], { kind: 'anchor', anchorId: 'wall-left' });
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
      const point = screenPoint(scene.camera, [S, 1, -3 * S]);
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
  assert.ok(x - 1.3 > 4.25 * S, 'the full wagon belongs beyond the cabin floor edge');
  assert.ok(y >= 0 && y < 0.1, 'the wagon sits at yard ground level');
  const [deskX, deskY, deskZ] = ROOM_POSITIONS.desk;
  assert.ok(Math.abs(deskX) < 4 * S && Math.abs(deskZ) < 3 * S && deskY > 0.8 && deskY < 1.2, 'writing surface is inside at desk height');
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
  assert.deepEqual(roomRenderSize(390, 280, 2), { width: 780, height: 560 });
  assert.deepEqual(roomRenderSize(3000, 800, 1), { width: 3000, height: 800 });
  for (const ratio of [1, 1.5, 2, 4, Infinity]) {
    for (const [w, h] of [[320, 280], [850, 500], [1920, 1080], [4096, 2160]]) {
      const size = roomRenderSize(w, h, ratio);
      assert.ok(size.width <= 4096 && size.height <= 2160 && size.width * size.height < 5005000);
      assert.ok(Math.abs(size.width / size.height - w / h) < 0.01, 'resizing preserves the scene aspect');
    }
  }
  assert.deepEqual(roomRenderSize(0, NaN, NaN), { width: 1, height: 1 });
});

test('furniture follows a direct drag without jumping to the pointer and commits only valid drops', () => {
  const scene = furnitureScene(), moves = [], home = defaultFurniture();
  scene.raycaster = new THREE.Raycaster(); scene.onMoveFurniture = (...move) => moves.push(move); scene.onSelect = () => {};
  scene.update({ placements: [], finishes: roomFinishes() }); scene.dynamic.updateMatrixWorld(true); scene.setEditing(true);
  const at = (x, z) => ({ button: 0, pointerId: 3, pointerType: 'mouse', ...screenPoint(scene.camera, [x, 1.3, z]) });
  const grab = { button: 0, pointerId: 3, pointerType: 'mouse', ...screenPoint(scene.camera, [home.wardrobe.x, 1.3, home.wardrobe.z]) };
  const floor = screenPoint(scene.camera, [1.1, 0, -0.9]);
  assert.deepEqual(floorPoint(scene.camera, scene.canvas.getBoundingClientRect(), floor.clientX, floor.clientY), { x: 1, z: -1 });
  scene.pointerDown(grab); assert.equal(scene.dragging, null, 'pressing alone still selects on release');
  scene.pointerMove(at(2, -1));
  assert.equal(scene.dragging.furniture, 'wardrobe');
  assert.equal(moves.length, 0, 'preview does not change the layout');
  assert.deepEqual([scene.wardrobe.position.x, scene.wardrobe.position.z], [2, -1]);
  assert.deepEqual(scene.furniture, home, 'moving the visual leaves the room draft unchanged until release');
  assert.equal(scene.dragPreview.children.length, 2);
  scene.pointerUp(at(2, -1)); assert.deepEqual(moves, [['wardrobe', { x: 2, z: -1 }]]);
  assert.equal(scene.dragPreview.children.length, 0);
  assert.deepEqual([scene.wardrobe.position.x, scene.wardrobe.position.z], [home.wardrobe.x, home.wardrobe.z]);
  for (const [x, z] of [[home.pet.x, home.pet.z], [20, 0]]) {
    scene.pointerDown(grab); scene.pointerMove(at(x, z)); scene.pointerUp(at(x, z));
  }
  assert.equal(moves.length, 1, 'occupied and out-of-room releases are ignored');
  scene.pointerDown(grab); scene.pointerMove(at(2, -1)); scene.cancelPointer(); scene.pointerUp(at(2, -1));
  assert.equal(moves.length, 1, 'Escape, pointer cancellation and leaving the page restore the preview without a move');
  assert.deepEqual([scene.wardrobe.position.x, scene.wardrobe.position.z], [home.wardrobe.x, home.wardrobe.z]);
  scene.update({ placements: [], finishes: roomFinishes(), furniture: { ...home, wardrobe: { x: 2, z: -1, r: 1 }, desk: { ...home.desk, off: true } } });
  assert.equal(scene.wardrobe.position.x, 2); assert.equal(scene.wardrobe.rotation.y, Math.PI / 2);
  assert.equal(scene.picks.some(pick => pick.userData.selection.anchorId === 'desk'), false, 'a stored desk has no display spot');
  assert.equal(Object.hasOwn(roomPositions([], { ...home, desk: { ...home.desk, off: true } }), 'desk'), false);
  scene.setEditing(false);
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('touch drags preserve the grab point after rotating the camera and restore every carried object', () => {
  const scene = furnitureScene(), home = defaultFurniture(), moves = [];
  scene.camera = makeRoomCamera(846 / 380, { rotation: -90 });
  scene.update({ placements: [{ anchorId: 'desk', itemId: 'odd-telegraph' }], finishes: roomFinishes() }); scene.setEditing(true);
  scene.fixtures = { desk: new THREE.Group() }; scene.fixtures.desk.position.set(home.desk.x, 0, home.desk.z);
  scene.targetAt = () => ({ kind: 'anchor', anchorId: 'desk' }); scene.onMoveFurniture = (...move) => moves.push(move);
  const at = (x, z) => ({ button: 0, pointerId: 12, pointerType: 'touch', ...screenPoint(scene.camera, [x + 0.4, 0.97, z]) });
  const prop = scene.dynamic.children.find(object => object.userData.dragId === 'desk'), original = prop.position.clone();
  scene.pointerDown(at(home.desk.x, home.desk.z)); scene.pointerMove(at(0.5, -2.75));
  assert.deepEqual([scene.fixtures.desk.position.x, scene.fixtures.desk.position.z], [0.5, -2.75]);
  assert.deepEqual([prop.position.x, prop.position.z], [0.5, -2.75]);
  scene.cancelPointer();
  assert.ok(prop.position.equals(original)); assert.equal(moves.length, 0); assert.equal(scene.canvas.captured, null);
  scene.setEditing(false);
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('zoomed furniture drags when its visible top is onscreen but its floor origin is cropped', () => {
  const scene = furnitureScene(), home = defaultFurniture(), moves = [];
  scene.camera = makeRoomCamera(846 / 380, { rotation: 135, zoom: 1.5 });
  scene.raycaster = new THREE.Raycaster(); scene.onMoveFurniture = (...move) => moves.push(move);
  scene.update({ placements: [], finishes: roomFinishes() }); scene.dynamic.updateMatrixWorld(true); scene.setEditing(true);
  const at = (x, z, height = 2) => ({ button: 0, pointerId: 16, pointerType: 'mouse', ...screenPoint(scene.camera, [x, height, z]) });
  const grab = at(home.wardrobe.x, home.wardrobe.z), destination = at(4, -3.25);
  assert.ok(grab.clientY < 380 && destination.clientY < 380, 'the grabbed point stays visible');
  assert.ok(at(home.wardrobe.x, home.wardrobe.z, 0).clientY > 380 && at(4, -3.25, 0).clientY > 380, 'both floor origins are below the canvas');
  scene.pointerDown(grab); scene.pointerMove(destination);
  assert.equal(scene.dragging.furniture, 'wardrobe');
  assert.deepEqual([scene.wardrobe.position.x, scene.wardrobe.position.z], [4, -3.25]);
  scene.pointerUp(destination);
  assert.deepEqual(moves, [['wardrobe', { x: 4, z: -3.25 }]]);
  scene.pointerDown(grab); scene.pointerMove(destination); scene.pointerUp({ ...destination, clientY: 381 });
  assert.equal(moves.length, 1, 'an actual pointer release outside the canvas is still rejected');
  scene.setEditing(false);
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('move arrows follow the view through a full turn', () => {
  assert.deepEqual(nudgeAxes(0), { right: [1, 0], away: [0, -1] });
  for (let rotation = -180; rotation < 180; rotation += 15) {
    const { right, away } = nudgeAxes(rotation), camera = makeRoomCamera(1, { rotation });
    const shift = ([x, z]) => new THREE.Vector3(x, 0, z).project(camera).sub(new THREE.Vector3(0, 0, 0).project(camera));
    assert.ok(shift(right).x > 0 && shift(away).y > 0, `rotation ${rotation}`);
    assert.ok(right[0] * away[0] + right[1] * away[1] === 0);
  }
});

test('wall decorations drag between walls with their orientation and restore on cancellation', () => {
  const scene = furnitureScene(), moves = [];
  scene.onMoveWall = (...move) => moves.push(move);
  scene.update({ placements: [{ anchorId: 'wall-left', itemId: 'odd-horseshoe' }] }); scene.setEditing(true);
  const id = 'wall-left', target = { kind: 'anchor', anchorId: id };
  scene.targetAt = () => target;
  const at = spotId => { const pos = wallDisplayPosition(ROOM_WALL_SPOTS.find(spot => spot.id === spotId)); pos[1] += 0.4; return { button: 0, pointerId: 9, ...screenPoint(scene.camera, pos) }; };
  const from = at(defaultWallDisplays()[id]), to = at('left-high-front');
  const prop = scene.dynamic.children.find(object => object.userData.dragId === id), home = prop.position.clone();
  scene.pointerDown(from); scene.pointerMove(to);
  assert.equal(scene.dragging.wall, true);
  assert.deepEqual(prop.position.toArray(), wallDisplayPosition(ROOM_WALL_SPOTS.find(spot => spot.id === 'left-high-front')));
  assert.equal(prop.rotation.y, Math.PI / 2);
  assert.equal(moves.length, 0);
  scene.cancelPointer(); assert.ok(prop.position.equals(home)); assert.equal(prop.rotation.y, 0);
  scene.pointerDown(from); scene.pointerMove(to); scene.pointerUp(to);
  assert.deepEqual(moves, [[id, 'left-high-front']]); assert.ok(prop.position.equals(home));
  scene.update({ placements: [{ anchorId: id, itemId: 'odd-horseshoe' }], wallDisplays: { ...defaultWallDisplays(), [id]: 'left-high-front' } });
  const placed = scene.dynamic.children.find(object => object.userData.dragId === id);
  assert.equal(placed.rotation.y, Math.PI / 2); assert.equal(placed.userData.wallSide, 'left');
  const pick = scene.picks.find(object => object.userData.selection.anchorId === id);
  assert.equal(pick.rotation.y, Math.PI / 2); assert.equal(pick.userData.wallSide, 'left');
  scene.setEditing(false); scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('shelves rotate across walls and restore the shelf and displayed object together', () => {
  const scene = furnitureScene(), moves = [], id = 'shelf-left';
  scene.onMoveShelf = (...move) => moves.push(move);
  scene.update({ placements: [{ anchorId: id, itemId: 'odd-lamp' }] }); scene.setEditing(true);
  scene.targetAt = () => ({ kind: 'anchor', anchorId: id });
  const at = spotId => ({ button: 0, pointerId: 4, ...screenPoint(scene.camera, roomShelfPosition(ROOM_SHELF_SPOTS.find(spot => spot.id === spotId))) });
  const shelf = scene.dynamic.children.find(object => object.userData.dragId === id), home = shelf.position.clone();
  scene.pointerDown(at('left-low-back')); scene.pointerMove(at('back-low-left'));
  assert.equal(shelf.rotation.y, -Math.PI / 2); assert.notDeepEqual(shelf.position.toArray(), home.toArray());
  scene.pointerUp(at('back-low-left')); assert.deepEqual(moves, [[id, 'back-low-left']]);
  assert.ok(shelf.position.equals(home)); assert.equal(shelf.rotation.y, 0);
  scene.setEditing(false); scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('resident stroll stays on clear floor and falls back to standing when boxed in', () => {
  const furniture = defaultFurniture(), route = residentStep(furniture);
  assert.ok(Math.hypot(route.x, route.z) > 0 && Math.hypot(route.x, route.z) <= 0.55);
  for (let part = 0; part <= 1; part += 0.05) assert.ok(furnitureFits({ ...furniture, rug: { ...furniture.rug, x: furniture.rug.x + route.x * part, z: furniture.rug.z + route.z * part } }, 'rug'));
  const tight = { ...furniture, rug: { x: 0, z: 0, r: 0 }, desk: { x: 0, z: -0.9, r: 0 }, floor: { x: 0, z: 0.9, r: 0 }, wardrobe: { x: -1.3, z: 0, r: 0 }, pet: { x: 1.3, z: 0, r: 0 } };
  assert.ok(furnitureFits(tight, 'rug'));
  assert.deepEqual(residentStep(tight), { x: 0, z: 0 });
});

test('a large shelf has three separate item targets and drags all three from an outside slot', () => {
  const scene = furnitureScene(), moves = [], shelf = { ...defaultShelves()[0], spotId: 'left-low-door', sizeId: 'wide' };
  const slots = shelfSlots(shelf), items = ['odd-lamp', 'odd-rock', 'odd-telegraph'];
  const view = { shelves: [shelf], placements: slots.map((slot, i) => ({ anchorId: slot.id, itemId: items[i] })) };
  scene.onMoveShelf = (...move) => moves.push(move); scene.raycaster = new THREE.Raycaster();
  scene.update(view); scene.setEditing(true); scene.dynamic.updateMatrixWorld(true);
  const positions = roomPositions([shelf]);
  assert.deepEqual(Object.keys(positions).sort(), roomAnchors([shelf]).map(anchor => anchor.id).sort());
  const holder = scene.dynamic.children.find(object => object.userData.dragId === shelf.id), home = holder.position.clone();
  assert.equal(holder.children[0].geometry.parameters.depth, 2.4);
  assert.equal(scene.dynamic.children.filter(object => object.userData.dragId === shelf.id).length, 1);
  for (const [i, slot] of slots.entries()) {
    const prop = holder.getObjectByName(items[i]); assert.ok(prop);
    assert.equal(prop.position.z, slot.offset);
    const pick = scene.picks.find(pick => pick.userData.selection.anchorId === slot.id);
    assert.deepEqual(pick.position.toArray(), [positions[slot.id][0], positions[slot.id][1] - 0.04, positions[slot.id][2]]);
  }
  const from = { button: 0, pointerId: 31, ...screenPoint(scene.camera, [positions[slots[2].id][0], positions[slots[2].id][1] + 0.3, positions[slots[2].id][2]]) };
  assert.deepEqual(scene.targetAt(from.clientX, from.clientY), { kind: 'anchor', anchorId: slots[2].id });
  scene.pointerDown(from);
  const point = screenPoint(scene.camera, roomShelfPosition(ROOM_SHELF_SPOTS.find(spot => spot.id === 'back-low-left')));
  const to = { ...from, clientX: point.clientX + scene.dragCandidate.grab.x, clientY: point.clientY + scene.dragCandidate.grab.y };
  scene.pointerMove(to);
  assert.equal(scene.dragging.id, shelf.id); assert.equal(holder.rotation.y, -Math.PI / 2);
  assert.equal(scene.dragPreview.children.length, 2, 'only the current drop footprint is shown');
  scene.pointerUp(to); assert.deepEqual(moves, [[shelf.id, 'back-low-left']]);
  assert.ok(holder.position.equals(home)); assert.equal(holder.rotation.y, 0);
  scene.update({ ...view, shelves: [{ ...shelf, spotId: 'back-low-left' }] });
  const backHolder = scene.dynamic.children.find(object => object.userData.dragId === shelf.id);
  assert.equal(backHolder.rotation.y, -Math.PI / 2);
  for (const item of items) assert.ok(backHolder.getObjectByName(item), 'all items survive the cross-wall move');
  scene.setEditing(false); scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('all three visible large-shelf items select their own slot in an angled view', () => {
  const scene = furnitureScene(), shelf = { ...defaultShelves()[0], spotId: 'left-high-door', sizeId: 'wide' };
  const slots = shelfSlots(shelf), items = ['odd-lamp', 'odd-rock', 'odd-telegraph'];
  scene.raycaster = new THREE.Raycaster();
  for (const spotId of ['left-high-door', 'back-low-left']) {
    const moved = { ...shelf, spotId };
    scene.update({ shelves: [moved], placements: slots.map((slot, i) => ({ anchorId: slot.id, itemId: items[i] })) });
    scene.dynamic.updateMatrixWorld(true);
    const positions = roomPositions([moved]);
    for (const slot of slots) {
      const [x, y, z] = positions[slot.id], point = screenPoint(scene.camera, [x, y + 0.2, z]);
      assert.deepEqual(scene.targetAt(point.clientX, point.clientY), { kind: 'anchor', anchorId: slot.id }, `${spotId}: ${slot.id}`);
    }
  }
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('keyboard movement reaches nearby clear mounts and keeps furniture collision rules', () => {
  const scene = furnitureScene(), moves = [], wallMoves = [], furnitureMoves = [];
  scene.update({ placements: [] }); scene.view = { rotation: 0 };
  scene.onMoveShelf = (...args) => moves.push(args); scene.onMoveWall = (...args) => wallMoves.push(args); scene.onMoveFurniture = (...args) => furnitureMoves.push(args);
  scene.setEditing(true, { kind: 'anchor', anchorId: 'shelf-left' }); scene.moveSelected('ArrowUp');
  assert.equal(moves.length, 1);
  assert.ok(wallMountsFit(scene.shelves.map(shelf => shelf.id === moves[0][0] ? { ...shelf, spotId: moves[0][1] } : shelf), scene.wallDisplays, scene.furniture));
  scene.setEditing(true, { kind: 'anchor', anchorId: 'wall-left' }); scene.moveSelected('ArrowDown'); assert.equal(wallMoves.length, 1);
  scene.setEditing(true, { kind: 'anchor', anchorId: 'desk' }); scene.moveSelected('ArrowRight');
  assert.deepEqual(furnitureMoves, [['desk', { x: scene.furniture.desk.x + 0.25, z: scene.furniture.desk.z }]]);
  scene.setEditing(false); scene.moveSelected('ArrowRight'); assert.equal(furnitureMoves.length, 1);
  scene.dynamic.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});
