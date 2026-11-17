import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_FLOOR_SCALE as S } from '../../../server/catalog/room.js';
import { ROOM_WALL_HEIGHT } from './scene-model.js';
import { buildWings } from './wings.js';

const INCH = ROOM_WALL_HEIGHT / 102, FLOOR = 0.016, DECK = 0.025;
const counterX = 1.61, kitchenBack = -6.96, counterZ = kitchenBack + 25 * INCH / (2 * S);
const worktop = 36 * INCH;
const furnishings = [
  // Model, floor-plan x/z, unrotated width/height/depth in inches, heading, support height, action.
  ['bathtub', -0.95, 6.66, [60, 21, 31], Math.PI],
  ['toilet', 0.85, 6.73, [19, 31, 29], Math.PI, FLOOR, 'flush'],
  ['bathroomSink', -3.74, 5.70, [22, 38.8, 18], Math.PI / 2],
  // The twin mattress occupies 89% of the frame length between the two rails.
  ['bedSingle', -2.95, -5.65, [39, 32, 84], Math.PI / 2],
  // The backsplash projects above the working countertop, which is at 14/15 of the mesh height.
  ['kitchenStove', counterX - 30 * INCH / S, kitchenBack + 28 * INCH / (2 * S), [30, 36 * 15 / 14, 28], 0],
  ['kitchenCabinet', counterX, counterZ, [30, 36 * 15 / 14, 25], 0],
  ['kitchenCoffeeMachine', counterX, counterZ, [10, 13, 13], 0, FLOOR + worktop, 'coffee'],
  ['pottedPlant', 4.69, 3.93, [14, 42, 16], 0.33, DECK],
  ['chair', 7.55, 3.7, [19.5, 35.25, 21], -Math.PI / 2, DECK, 'coffee'],
];

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

function architecture(parent) {
  const plank = '#966a46', trim = '#6b4834', pale = '#ccad82';
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
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  function batch(name) {
    const piece = new THREE.Mesh(mergeGeometries(parts), material);
    for (const geometry of parts) geometry.dispose();
    parts.length = 0;
    piece.name = name;
    piece.castShadow = piece.receiveShadow = true;
    return piece;
  }

  const boards = ['#b6895e', '#b08a63', '#bc936a', '#ad8059'];

  // Bedside drawer and an oil lamp at pillow height.
  const nightX = -3.55, nightZ = -4.85, tableTop = FLOOR + 25 * INCH;
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

  // Local joinery measurements are in inches above the finished floor.
  function cabinetAt(x, z, turn = 0) {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    return (w, h, d, color, dx, y, dz) => box(w * INCH / S, h * INCH, d * INCH / S, color,
      x + (dx * cos + dz * sin) * INCH / S, FLOOR + y * INCH, z + (dz * cos - dx * sin) * INCH / S, turn);
  }
  const linen = cabinetAt(2.22, 6.05, -Math.PI / 2), sage = '#87947e', cream = '#e5d2b4', rust = '#ad715c';
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

  const prepX = 0.13, prepZ = -4.74, prep = cabinetAt(prepX, prepZ);
  prep(42, 2, 24, '#b79164', 0, 35, 0);
  for (const dx of [-18, 18]) for (const dz of [-9, 9]) prep(2.7, 34, 2.7, '#6c7766', dx, 17, dz);
  for (const dz of [-9, 9]) prep(37, 4.5, 1, '#7f8b74', 0, 32, dz);
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

  // One continuous deck from the side-door sill to the wide step onto the dirt track.
  const deckLeft = 4.13, deckRight = 8.50, deckBack = 1.47, deckFront = 4.80;
  box(deckRight - deckLeft, 0.19, deckFront - deckBack, trim,
    (deckLeft + deckRight) / 2, -0.100, (deckBack + deckFront) / 2);
  box(0.17, 0.06, 0.07, plank, 4.215, DECK - 0.03, 1.45);
  const boardDepth = (deckFront - deckBack) / 24;
  for (let i = 0; i < 24; i++) {
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
          height === 35 ? pale : plank, (x1 + x2) / 2, DECK + height * INCH, (z1 + z2) / 2);
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
  const shell = batch('Porch and fixed furnishings');

  const walls = buildWings(parent, box, batch);
  ranchWindpump(paint);
  const windpump = batch('Ranch windpump and stock trough');
  return { shell, walls, windpump };
}

function waterSpray() {
  const points = [];
  for (let jet = 0; jet < 7; jet++) for (let step = 0; step < 19; step++) {
    for (const t of [step / 19, (step + 0.79) / 19]) {
      points.push((6.98 + t * (0.4 + jet * 0.054)) * S, 0.3 + 4.0 * t * (1 - t) - 0.2 * t,
        (4.35 - t * (0.46 + jet * 0.061)) * S);
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

export function buildHomestead(parent, { onReady } = {}) {
  const group = new THREE.Group(), picks = [], { shell, walls, windpump } = architecture(group), spray = waterSpray();
  group.name = 'Homestead extension';
  group.add(shell, windpump, spray);
  parent.add(group);
  let disposed = false;
  function place(mesh, x, z, inches, heading, y = FLOOR, action) {
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    mesh.scale.fromArray(inches).multiplyScalar(INCH).divide(size);
    mesh.position.set(x * S, y, z * S);
    mesh.rotation.y = heading;
    mesh.castShadow = mesh.receiveShadow = true;
    if (action) { mesh.userData.selection = { kind: 'houseAction', action }; picks.push(mesh); }
    group.add(mesh);
  }
  // A missing art download still leaves each action attached to a visible fixture.
  function fallback() {
    const block = (w, h, d, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(0, y, z);
    const models = {
      toilet: ['#eae1cf', new THREE.CylinderGeometry(0.38, 0.21, 0.56, 12).translate(0, 0.28, 0.1),
        block(0.64, 0.88, 0.23, 0.44, -0.33)],
      kitchenCabinet: ['#927252', block(0.95, 14 / 15, 1, 7 / 15), block(0.95, 1 / 15, 0.05, 29 / 30, -0.475)],
      kitchenCoffeeMachine: ['#535f58', block(0.65, 0.08, 0.96, 0.04), block(0.65, 0.70, 0.35, 0.37, -0.27),
        block(0.65, 0.18, 0.87, 0.64), new THREE.CylinderGeometry(0.17, 0.15, 0.25, 10).translate(0, 0.20, 0.20)],
      chair: ['#63806b', block(1, 0.12, 0.95, 1.14), block(0.96, 1.32, 0.13, 1.69, -0.42),
        ...[-0.39, 0.39].flatMap(x => [-0.39, 0.39].map(z => block(0.11, 1.08, 0.11, 0.54, z).translate(x, 0, 0)))],
    };
    for (const [name, x, z, inches, heading, y, action] of furnishings) {
      if (!models[name]) continue;
      const [color, ...parts] = models[name];
      const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color }));
      for (const geometry of parts) geometry.dispose();
      mesh.name = name;
      place(mesh, x, z, inches, heading, y, action);
    }
  }
  const url = new URL('./assets/homestead-furnishings.glb', import.meta.url).href;
  const ready = new GLTFLoader().loadAsync(url).then(({ scene }) => {
    if (disposed) { releaseModels(scene); return; }
    for (const [name, ...placement] of furnishings) place(scene.getObjectByName(name), ...placement);
  }, () => { if (!disposed) fallback(); }).then(() => { if (!disposed) onReady?.(); });
  return {
    picks, walls, ready,
    setSprinkler(visible) { spray.visible = visible; },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      releaseModels(group);
      picks.length = 0;
    },
  };
}
