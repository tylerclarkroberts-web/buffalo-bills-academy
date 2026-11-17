import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_FLOOR_SCALE as S, ROOM_HOMESTEAD, roomHomestead } from '../../../server/catalog/room.js';
import { ROOM_WALL_HEIGHT } from './scene-model.js';
import { buildWings } from './wings.js';

const INCH = ROOM_WALL_HEIGHT / 102, FLOOR = 0.016, DECK = 0.025;
const kitchenBack = -6.96, counterZ = kitchenBack + 25 * INCH / (2 * S), worktop = 36 * INCH;

function furnishingPlan(style) {
  const alt = id => style[id].layoutId === 'alternate';
  const counterX = alt('kitchen') ? -0.65 : 1.61;
  const bed = alt('bed') ? [2.46, -5.10, -Math.PI / 2] : [-2.90, -5.65, Math.PI / 2];
  const tub = alt('tub') ? [-1.84, 4.53, Math.PI / 2] : [-0.85, 6.64, Math.PI];
  const chair = alt('porchChair') ? [5.55, 3.80, Math.PI / 2] : [7.55, 3.70, -Math.PI / 2];
  const plant = alt('porch') ? [8.04, 4.25] : [4.69, 3.93];
  const items = [
    // Model, style target, floor-plan x/z, size in inches, heading, support height, action.
    ['bathtub', 'tub', tub[0], tub[1], [72, 24, 36], tub[2]],
    ['toilet', 'bathroom', 0.85, 6.73, [19, 31, 29], Math.PI, FLOOR, 'flush'],
    ['bathroomSink', 'bathroom', -2.06, 5.70, [22, 38.8, 18], Math.PI / 2],
    // An 80-inch queen mattress fills 89% of the timber frame.
    ['bedSingle', 'bed', bed[0], bed[1], [61, 34, 90], bed[2]],
    // The backsplash is the upper fifteenth of the range and cabinet.
    ['kitchenStove', 'kitchen', counterX - 30 * INCH / S, kitchenBack + 28 * INCH / (2 * S), [30, 36 * 15 / 14, 28], 0],
    ['kitchenCabinet', 'kitchen', counterX, counterZ, [30, 36 * 15 / 14, 25], 0],
    ['kitchenCoffeeMachine', 'kitchen', counterX, counterZ, [10, 13, 13], 0, FLOOR + worktop, 'coffee'],
    ['pottedPlant', 'porch', ...plant, [14, 42, 16], 0.33, DECK],
    ['chair', 'porchChair', chair[0], chair[1], [19.5, 35.25, 21], chair[2], DECK, 'coffee'],
  ];
  const bedSide = Math.sign(bed[2]);
  return { items, bed, tub, chair, counterX, nightX: bed[0] - bedSide * 0.70,
    nightZ: bed[1] + bedSide * (alt('bedroom') ? -1.02 : 1.02) };
}

// A timber windpump and stock tank beyond the fence. Local dimensions are in world units.
function ranchWindpump(paint) {
  function add(geometry, color) {
    paint(geometry.rotateY(Math.PI / 2 + 0.12).translate(7.7 * S, -0.13, -4.75 * S), color);
  }
  function beam(from, to, width, color) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const post = new THREE.BoxGeometry(width, delta.length(), width);
    post.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    add(post.translate(...a.lerp(b, 0.5).toArray()), color);
  }
  const wood = '#80654b', braces = '#9c7f5f', iron = '#69716b';
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    beam([x * 0.79, 0, z * 0.79], [x * 0.17, 3.05, z * 0.17], 0.132, wood);
    beam([x * 0.73, 0.28, z * 0.73], [-x * 0.48, 1.55, z * 0.48], 0.062, braces);
    beam([x * 0.48, 1.55, z * 0.48], [x * 0.21, 2.84, -z * 0.21], 0.062, braces);
  }
  add(new THREE.BoxGeometry(0.78, 0.12, 0.7).translate(0, 2.91, 0), wood);
  beam([0, 0.1, 0], [0, 3.36, 0], 0.07, iron);
  beam([0, 3.33, 0.54], [0, 3.33, -1.53], 0.085, iron);
  const vane = new THREE.BoxGeometry(0.045, 0.64, 0.80);
  const edge = vane.attributes.position;
  for (let i = 0; i < edge.count; i++) edge.setY(i, edge.getY(i) * (edge.getZ(i) < 0 ? 1 : 0.52));
  vane.computeVertexNormals();
  add(vane.translate(0, 3.43, -1.46), '#a45f4a');

  for (let i = 0; i < 12; i++) {
    const blade = new THREE.BoxGeometry(1, 1, 0.055), v = blade.attributes.position;
    for (let j = 0; j < v.count; j++) {
      const reach = v.getY(j) + 0.5;
      const x = v.getX(j) * (0.09 + reach * 0.25);
      v.setXYZ(j, x + reach * 0.10, 0.20 + reach * 0.84, v.getZ(j) + x * 0.33);
    }
    blade.computeVertexNormals();
    add(blade.rotateZ(i * Math.PI / 6).translate(0, 3.33, 0.53), i % 3 === 0 ? '#a49982' : '#b7beb2');
  }
  add(new THREE.TorusGeometry(0.88, 0.027, 5, 28).translate(0, 3.33, 0.48), iron);
  add(new THREE.CylinderGeometry(0.22, 0.18, 0.27, 12).rotateX(Math.PI / 2).translate(0, 3.33, 0.62), '#88654a');

  const tankX = 6.05 * S, tankZ = -4.57 * S;
  function tankRing(width, depth, y, height, color) {
    paint(new THREE.CylinderGeometry(1, 1, height, 22).scale(width, 1, depth).translate(tankX, y, tankZ), color);
  }
  tankRing(1.27, 0.55, 0.12, 0.49, '#818a7c');
  for (const y of [-0.025, 0.25, 0.38]) tankRing(1.31, 0.57, y, 0.048, '#a9ae98');
  tankRing(1.23, 0.49, 0.401, 0.012, '#527f91');
}

function joinery(material = new THREE.MeshLambertMaterial({ vertexColors: true })) {
  const parts = [];
  function paint(geometry, color) {
    const rgb = new THREE.Color(color).toArray(), colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(...rgb);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.push(geometry);
  }
  function box(w, h, d, color, x, y, z, turn = 0) {
    paint(new THREE.BoxGeometry(w * S, h, d * S).rotateY(turn).translate(x * S, y, z * S), color);
  }
  function batch(name) {
    const piece = new THREE.Mesh(mergeGeometries(parts), material);
    for (const geometry of parts) geometry.dispose();
    parts.length = 0;
    piece.name = name;
    piece.castShadow = piece.receiveShadow = true;
    return piece;
  }

  return { paint, box, batch };
}

function architecture(parent, style, plan) {
  const { paint, box, batch } = joinery();
  const plank = '#966a46', trim = '#6b4834', pale = '#ccad82';
  const boards = [0.94, 1.03, 0.89, 1.07].map(factor => style.porch.paint.clone().multiplyScalar(factor));
  function addPiece(name, id) {
    const mesh = batch(name);
    mesh.userData.editSelection = { kind: 'homestead', id };
    parent.add(mesh);
    return mesh;
  }

  // Bedside drawer and an oil lamp at pillow height.
  const { nightX, nightZ } = plan, tableTop = FLOOR + 25 * INCH;
  box(0.41, 2 * INCH, 0.44, plank, nightX, tableTop - INCH, nightZ);
  for (const x of [-0.15, 0.15]) for (const z of [-0.16, 0.16]) {
    box(0.052, 23 * INCH, 0.052, trim, nightX + x, FLOOR + 11.5 * INCH, nightZ + z);
  }
  box(0.34, 7 * INCH, 0.38, plank, nightX, tableTop - 5.5 * INCH, nightZ);
  box(0.04, INCH, 0.048, '#bd995a', nightX + 0.18, tableTop - 5.5 * INCH, nightZ);
  function lamp(geometry, color, bottom) {
    geometry.computeBoundingBox();
    paint(geometry.translate(nightX * S, bottom - geometry.boundingBox.min.y, nightZ * S), color);
  }
  lamp(new THREE.CylinderGeometry(0.095, 0.15, 0.105, 8), '#836d49', tableTop);
  lamp(new THREE.LatheGeometry([[0.06,0], [0.13,0.09], [0.13,0.15], [0.072,0.25], [0.078,0.32]].map(([x,y]) => new THREE.Vector2(x,y)), 8), '#ebcb8c', tableTop + 0.105);
  lamp(new THREE.CylinderGeometry(0.075, 0.10, 0.055, 8), '#755a3e', tableTop + 0.425);

  addPiece('Nightstand and lamp', 'bedroom');

  // Local joinery measurements are in inches above the finished floor.
  function cabinetAt(x, z, turn = 0) {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    return (w, h, d, color, dx, y, dz) => box(w * INCH / S, h * INCH, d * INCH / S, color,
      x + (dx * cos + dz * sin) * INCH / S, FLOOR + y * INCH, z + (dz * cos - dx * sin) * INCH / S, turn);
  }
  const linen = style.bathroom.layoutId === 'alternate' ? cabinetAt(0.2, 3.77, Math.PI) : cabinetAt(2.22, 6.05, -Math.PI / 2);
  const sage = style.bathroom.paint, cream = '#e5d2b4', rust = '#ad715c';
  linen(42, 1.5, 19, plank, 0, 33.25, 0);
  linen(39, 28.5, 0.8, '#667661', 0, 18.25, 8.6);
  for (const dx of [-19.5, 19.5]) linen(1.4, 32.5, 17.5, sage, dx, 16.25, 0);
  for (const y of [5, 18]) linen(39, 1.1, 17.4, pale, 0, y, 0);
  function towel(width, color, dx, bottom) {
    linen(width, 1.5, 12, color, dx, bottom + 0.75, -1);
    linen(width - 0.4, 1.1, 11.3, color, dx, bottom + 2.05, -0.65);
    linen(1.4, 0.12, 11.35, '#d2ad83', dx + width / 3, bottom + 2.66, -0.65);
  }
  for (const y of [5.55, 8.25]) towel(17, cream, -8.4, y);
  towel(15.5, rust, 9.0, 18.55);
  towel(17, cream, -7.6, 34);
  towel(16, '#aabcb2', -7.4, 36.7);

  addPiece('Linen cupboard', 'bathroom');

  // Build the island around the origin so the worktop, bowl and rolling pin move as one.
  const prepX = 0, prepZ = 0, prep = cabinetAt(prepX, prepZ);
  const enamel = style.kitchen.typeId === 'enamel';
  prep(42, 2, 24, enamel ? '#e0e2d3' : style.kitchen.paint, 0, 35, 0);
  for (const dx of [-18, 18]) for (const dz of [-9, 9]) prep(2.7, 34, 2.7, style.kitchen.paint, dx, 17, dz);
  for (const dz of [-9, 9]) prep(37, 4.5, 1, style.kitchen.paint, 0, 32, dz);
  prep(38, 1.2, 20, plank, 0, 8.5, 0);
  prep(15, 0.85, 10, '#c59c70', 8.5, 36.425, -0.5);
  // A flared enamel mixing bowl and a wooden rolling pin on the chopping board.
  const bowl = new THREE.LatheGeometry([[1.6,0], [2.1,0.2], [3.8,2.1], [4.3,3.6], [4.1,3.9],
    [3.8,3.55], [3.3,2.1], [1.7,0.45], [0,0.45]].map(([r,y]) => new THREE.Vector2(r * INCH, y * INCH)), 14);
  paint(bowl.translate(prepX * S - 8 * INCH, FLOOR + worktop, prepZ * S + 1.4 * INCH), '#739595');
  for (const [length, radius, color] of [[13,0.54,'#82613d'],[8.4,1.15,'#d1b38a']]) {
    const pin = new THREE.CylinderGeometry(radius * INCH, radius * INCH, length * INCH, 10).rotateZ(Math.PI / 2).rotateY(-0.13);
    paint(pin.translate(prepX * S + 8.5 * INCH, FLOOR + 38 * INCH, prepZ * S - 0.5 * INCH), color);
  }

  const table = addPiece('Kitchen worktable', 'kitchen');
  const turned = style.kitchen.layoutId === 'alternate';
  table.position.set((turned ? 0.33 : 0.13) * S, 0, (turned ? -4.04 : -4.74) * S);
  if (turned) table.rotation.y = Math.PI / 2;

  // One continuous deck from the side-door sill to the wide step onto the dirt track.
  const deckLeft = 4.13, deckRight = 8.50, deckBack = 1.47, deckFront = 4.80;
  box(deckRight - deckLeft, 0.19, deckFront - deckBack, trim,
    (deckLeft + deckRight) / 2, -0.100, (deckBack + deckFront) / 2);
  box(0.17, 0.06, 0.07, plank, 4.215, DECK - 0.03, 1.45);
  const cedar = style.porch.typeId === 'cedar', plankCount = cedar ? 17 : 24;
  const boardDepth = (deckFront - deckBack) / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const z = deckBack + (i + 0.5) * boardDepth, joint = 5.4 + (i % 4) * 0.47;
    box(joint - deckLeft - 0.006, 0.049, boardDepth - 0.006, boards[(i + 1) % 4], (deckLeft + joint) / 2, DECK - 0.0245, z);
    box(deckRight - joint - 0.006, 0.049, boardDepth - 0.006, boards[i % 4], (joint + deckRight) / 2, DECK - 0.0245, z);
  }
  const opening = 56 * INCH / S, postWidth = 5.5 * INCH / S;
  const gateLeft = 2.60 - (opening + postWidth) / 2, gateRight = 2.60 + (opening + postWidth) / 2;
  const outerX = 8.42, southZ = 4.71, northZ = 1.49;
  box(13 * INCH / S, 0.16, opening, plank, deckRight + 6.5 * INCH / S, DECK - 0.08, 2.60);
  const north = [[5.22, northZ], [6.80, northZ], [outerX, northZ], [outerX, gateLeft]];
  const south = [[outerX, gateRight], [outerX, southZ], [6.28, southZ], [4.22, southZ], [4.22, 3.38]];
  for (const line of [north,south]) {
    for (const [x, z] of line) {
      box(postWidth, 37 * INCH, postWidth, trim, x, DECK + 18.5 * INCH, z);
      box(postWidth + 0.036, 0.085, postWidth + 0.036, pale, x, DECK + 37 * INCH, z);
    }
    for (let i = 1; i < line.length; i++) {
      const [x1,z1] = line[i - 1], [x2,z2] = line[i], dx = x2 - x1, dz = z2 - z1;
      const span = Math.abs(dx || dz), alongX = !!dx;
      for (const [height, railWidth] of [[9,0.071], [35,0.095]]) {
        box(alongX ? span : railWidth, 2 * INCH, alongX ? railWidth : span,
          height === 35 ? (cedar ? '#a06545' : pale) : boards[0], (x1 + x2) / 2, DECK + height * INCH, (z1 + z2) / 2);
      }
      const gaps = Math.ceil(span * S / (9 * INCH));
      for (let n = 1; n < gaps; n++) {
        box(0.040, 24 * INCH, 0.040, '#997a54', x1 + dx * n / gaps, DECK + 22 * INCH, z1 + dz * n / gaps);
      }
    }
  }
  // The silent sprinkler and its hose stay in the scene between flushes.
  box(0.23, 0.115, 0.18, '#567563', 6.98, 0.083, 4.35);
  box(0.078, 0.16, 0.078, '#8d8669', 6.98, 0.167, 4.35);
  box(0.30, 0.079, 0.065, '#54806a', 6.98, 0.256, 4.35, 0.26);
  box(0.047, 0.049, 0.39, '#54664a', 6.98, 0.052, 4.57);
  addPiece('Porch and rails', 'porch');
  return buildWings(parent, box, batch, style, plan);

}

function waterSpray([chairX, chairZ]) {
  const points = [];
  for (let jet = 0; jet < 7; jet++) for (let step = 0; step < 19; step++) {
    for (const t of [step / 19, (step + 0.79) / 19]) {
      points.push((6.98 + t * (chairX - 6.98 + (jet - 3) * 0.054)) * S, 0.3 + 3.4 * t * (1 - t) + (DECK + 18 * INCH - 0.3) * t,
        (4.35 + t * (chairZ - 4.35 - (jet - 3) * 0.061)) * S);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const spray = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#78cce1' }));
  spray.name = 'Watering the lawn chair';
  spray.visible = false;
  return spray;
}

function releaseModels(group) {
  const materials = new Set();
  group.traverse(part => { if (part.geometry) part.geometry.dispose(); if (part.material) materials.add(part.material); });
  for (const material of materials) material.dispose();
}

// Keep the original timber, porcelain and hardware when dyeing the model's editable surfaces.
const dyes = {
  bedSingle: { 107: 'fabric' }, bathtub: { 128: 'rim', 210: 'body' }, chair: { 32: 'body' },
  kitchenCabinet: { 95: 'body', 47: 'inset', 90: 'top' }, kitchenStove: { 95: 'body', 90: 'top' },
  pottedPlant: { 95: 'body' },
};
function finishModel(mesh, choice) {
  const channels = dyes[mesh.name], colors = mesh.geometry.getAttribute('color');
  if (!channels || !colors) return;
  const key = choice.typeId + '/' + choice.colorId;
  if (mesh.userData.finishKey === key) return;
  mesh.userData.finishKey = key;
  if (!mesh.userData.dyeVertices) {
    // The local GLB uses one vertex palette. Its original red bytes identify each material.
    mesh.userData.dyeVertices = {};
    for (let i = 0; i < colors.count; i++) {
      const channel = channels[Math.round(colors.getX(i) * 255)];
      if (channel) (mesh.userData.dyeVertices[channel] ||= []).push(i);
    }
    mesh.material = mesh.material.clone();
  }
  const copper = choice.typeId === 'copper', enamel = choice.typeId === 'enamel';
  const body = copper ? choice.paint.clone().lerp(new THREE.Color('#a65d3b'), 0.39) : choice.paint;
  const palette = { fabric: body, body, inset: body.clone().multiplyScalar(0.65),
    rim: new THREE.Color(copper ? '#c17d53' : '#c5b797'), top: enamel ? new THREE.Color('#e9e8db') : body.clone().lerp(new THREE.Color('#bbc0a9'), 0.42) };
  for (const [channel, vertices] of Object.entries(mesh.userData.dyeVertices)) {
    const { r, g, b } = palette[channel];
    for (const i of vertices) colors.setXYZ(i, r, g, b);
  }
  colors.needsUpdate = true;
  mesh.material.roughness = copper ? 0.49 : enamel || choice.typeId === 'painted' ? 0.64 : 0.93;
  mesh.material.metalness = copper ? 0.38 : 0;

  const old = mesh.getObjectByName('Surface pattern');
  if (old) { mesh.remove(old); releaseModels(old); }
  if (mesh.name !== 'bedSingle' && !(mesh.name === 'chair' && choice.typeId === 'wood')) return;
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()), { paint, batch } = joinery();
  const panel = (w, d, x, y, z, color) => paint(new THREE.PlaneGeometry(w * size.x, d * size.z)
    .rotateX(-Math.PI / 2).translate(x * size.x, y * size.y, z * size.z), color);
  if (mesh.name === 'chair') {
    for (const z of [-0.30, -0.12, 0.06, 0.24]) panel(0.88, 0.015, 0, 0.512, z, body.clone().multiplyScalar(0.62));
  } else if (choice.typeId === 'striped') {
    for (let row = 0; row < 7; row++) panel(0.92, row % 2 ? 0.044 : 0.018, 0, 0.670, -0.18 + row * 0.098, '#d1bc96');
  } else {
    const patches = [body.clone().multiplyScalar(0.86), body.clone().lerp(new THREE.Color('#efe0b7'), 0.25)];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      panel(0.226, 0.13, -0.3465 + col * 0.231, 0.670, -0.14 + row * 0.137, patches[(row + col) % 2]);
    }
  }
  const pattern = batch('Surface pattern');
  pattern.castShadow = false;
  mesh.add(pattern);
}

function fallbackModels() {
  const block = (w, h, d, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(0, y, z);
  const models = new THREE.Group();
  const { paint, batch } = joinery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  // Palette entries match the GLB so all seven finish and arrangement controls also work offline.
  for (const [name, parts] of Object.entries({
    toilet: [['#ede0c5', new THREE.CylinderGeometry(0.38, 0.21, 0.56, 12).translate(0, 0.28, 0.1), block(0.64, 0.88, 0.23, 0.44, -0.33)]],
    bathtub: [[210, block(1, 0.046, 0.47, 0.023), block(1, 0.35, 0.037, 0.175, 0.216), block(1, 0.35, 0.037, 0.175, -0.216),
      ...[-0.48,0.48].map(x => block(0.04, 0.35, 0.42, 0.175).translate(x,0,0))], [128, block(0.09, 0.06, 0.04, 0.35, -0.213)]],
    bathroomSink: [['#eee2ca', block(0.27, 0.76, 0.3, 0.38), block(0.61, 0.19, 0.50, 0.85)]],
    bedSingle: [['#88684c', block(0.5, 0.11, 1, 0.055), block(0.5, 0.333, 0.05, 0.1665, -0.475)],
      ['#eee1c7', block(0.49, 0.07, 0.90, 0.145), block(0.39, 0.06, 0.15, 0.203, -0.31)], [107, block(0.49, 0.04, 0.72, 0.202, 0.13)]],
    kitchenStove: [[95, block(0.95, 1, 1, 0.5)], [90, block(0.91, 0.03, 0.91, 1.01)], ['#38423f', block(0.67, 0.37, 0.04, 0.52, 0.49)]],
    kitchenCabinet: [[95, block(0.95, 0.89, 1, 0.445)], [90, block(0.95, 0.044, 1, 0.912), block(0.95, 1/15, 0.05, 29/30, -0.475)]],
    kitchenCoffeeMachine: [['#535f58', block(0.65, 0.08, 0.96, 0.04), block(0.65, 0.70, 0.35, 0.37, -0.27),
      block(0.65, 0.18, 0.87, 0.64), new THREE.CylinderGeometry(0.17, 0.15, 0.25, 10).translate(0, 0.20, 0.20)]],
    chair: [[32, block(1, 0.12, 0.95, 1.14), block(0.96, 1.32, 0.13, 1.69, -0.42),
      ...[-0.39, 0.39].flatMap(x => [-0.39, 0.39].map(z => block(0.11, 1.08, 0.11, 0.54, z).translate(x, 0, 0)))]],
    pottedPlant: [[95, new THREE.CylinderGeometry(0.28,0.19,0.57,6).translate(0,0.285,0)], ['#6c895c', new THREE.ConeGeometry(0.34,1.05,5).translate(0,1.02,0)]],
  })) {
    for (const [tint, ...partsOfColor] of parts) {
      const color = typeof tint === 'number' ? new THREE.Color(tint / 255, 0.35, 0.25) : tint;
      for (const part of partsOfColor) paint(part, color);
    }
    models.add(batch(name));
  }
  return models;
}

export function buildHomestead(parent, { onReady } = {}) {
  const group = new THREE.Group(), walls = [], picks = [], editPicks = [];
  const pump = joinery(); ranchWindpump(pump.paint);
  group.add(pump.batch('Ranch windpump and stock trough'));
  group.name = 'Homestead extension'; parent.add(group);
  let disposed = false, structure, models, spray, state, plan, savedKey, shapeKey, chairPosition;

  function applyModels() {
    if (!models) return;
    for (const [name, id, x, z, inches, heading, y = FLOOR, action] of plan.items) {
      const mesh = models.getObjectByName(name);
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
      mesh.scale.fromArray(inches).multiplyScalar(INCH).divide(size);
      mesh.position.set(x * S, y, z * S);
      mesh.rotation.y = heading; mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.editSelection = { kind: 'homestead', id };
      if (action) { mesh.userData.selection = { kind: 'houseAction', action }; picks.push(mesh); }
      editPicks.push(mesh);
      finishModel(mesh, state[id]);
    }
  }
  function update(value) {
    if (disposed) return;
    const options = roomHomestead(value), key = JSON.stringify(options);
    if (key === savedKey) return;
    savedKey = key;
    for (const [id, choice] of Object.entries(options)) {
      choice.paint = new THREE.Color(ROOM_HOMESTEAD[id].colors.find(c => c.id === choice.colorId).color);
    }
    state = options; plan = furnishingPlan(state);
    const architectureKey = JSON.stringify([state.bathroom, state.bedroom, state.kitchen, state.porch, state.bed.layoutId, state.tub.layoutId]);
    if (architectureKey !== shapeKey) {
      shapeKey = architectureKey;
      if (structure) { group.remove(structure); releaseModels(structure); }
      structure = new THREE.Group(); group.add(structure);
      const nextWalls = architecture(structure, state, plan);
      walls.splice(0, walls.length, ...nextWalls);
    }
    if (state.porchChair.layoutId !== chairPosition) {
      chairPosition = state.porchChair.layoutId;
      const visible = spray?.visible || false;
      if (spray) { group.remove(spray); releaseModels(spray); }
      spray = waterSpray(plan.chair); spray.visible = visible; group.add(spray);
    }
    picks.length = editPicks.length = 0;
    structure.traverse(mesh => { if (mesh.userData.editSelection) editPicks.push(mesh); });
    applyModels();
    group.updateWorldMatrix(true, true);
  }
  update();
  const url = new URL('./assets/homestead-furnishings.glb', import.meta.url).href;
  const ready = new GLTFLoader().loadAsync(url).then(({ scene }) => scene, () => disposed ? null : fallbackModels()).then(loaded => {
    if (!loaded) return;
    if (disposed) { releaseModels(loaded); return; }
    models = loaded; group.add(models); applyModels(); group.updateWorldMatrix(true, true); onReady?.();
  });
  return {
    picks, editPicks, walls, ready, update,
    setSprinkler(visible) { spray.visible = visible; },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); releaseModels(group);
      picks.length = editPicks.length = walls.length = 0;
    },
  };
}
