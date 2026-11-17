import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_FLOOR_SCALE as S } from '../../../server/catalog/room.js';

// Positions use the original floor plan horizontally and world heights vertically, like the cabin shell.
const furnishings = [
  // Model, x, z, longest footprint in world units, heading, floor height, action.
  ['bathtub', -2.74, 5.82, 3.22, Math.PI],
  ['toilet', -3.49, 3.93, 1.28, Math.PI / 2, 0, 'flush'],
  ['bathroomSink', -3.66, 4.9, 0.88, Math.PI / 2],
  ['bedSingle', -0.25, 4.19, 2.92, Math.PI / 2],
  ['kitchenStove', 0.68, 5.91, 1.45, Math.PI],
  ['kitchenCabinet', 1.61, 5.91, 1.45, Math.PI],
  ['kitchenCoffeeMachine', 1.62, 5.89, 0.64, Math.PI, 1.45, 'coffee'],
  ['pottedPlant', 4.69, 3.93, 0.61, 0.33, 0.025],
  ['chair', 7.55, 3.7, 0.92, -Math.PI / 2, 0.025, 'coffee'],
];

// A timber windpump and stock tank beyond the fence. Local dimensions are in world units.
function ranchWindpump(paint) {
  function add(geometry, color) {
    paint(geometry.rotateY(-0.25).translate(7.7 * S, -0.13, -4.75 * S), color);
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

function architecture() {
  const plank = '#966a46', trim = '#6b4834', pale = '#ccad82', slate = '#738d7c';
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

  // The old floor ends exactly at z=3.25. All new walls and fittings stand beyond its edge.
  box(6.5, 0.19, 3.15, trim, -0.75, -0.095, 4.825);
  const tiles = ['#a6b6a3', '#d4d1b5'];
  for (let x = 0; x < 7; x++) for (let z = 0; z < 8; z++) {
    box(2.7 / 7 - 0.009, 0.017, 3.15 / 8 - 0.009, tiles[(x + z) % 2],
      -4 + (x + 0.5) * 2.7 / 7, 0.007, 3.25 + (z + 0.5) * 3.15 / 8);
  }
  const boards = ['#b6895e', '#b08a63', '#bc936a', '#ad8059'];
  for (let i = 0; i < 14; i++) {
    const z = 3.25 + (i + 0.5) * 3.15 / 14, seam = -0.31 + (i % 3) * 0.72;
    box(seam + 1.29, 0.018, 3.15 / 14 - 0.009, boards[i % 4], (seam - 1.3) / 2, 0.007, z);
    box(2.49 - seam, 0.018, 3.15 / 14 - 0.009, boards[(i + 1) % 4], (seam + 2.5) / 2, 0.007, z);
  }
  function wall(x, z, w, d, height, color) {
    box(w, height, d, color, x, height / 2, z);
    box(w + 0.026, 0.084, d + 0.026, plank, x, height + 0.042, z);
  }
  wall(-3.35, 3.32, 1.3, 0.09, 1.1, slate);
  wall(-1.30, 4.04, 0.088, 1.50, 1.02, slate);
  wall(-1.30, 5.97, 0.088, 0.77, 0.68, slate);
  wall(-2.65, 6.36, 2.7, 0.08, 0.40, slate);
  wall(0.60, 6.36, 3.8, 0.08, 0.40, '#987757');
  wall(2.46, 5.95, 0.08, 0.82, 0.60, '#a58f66');
  // A woven runner between the cot and counter.
  box(1.55, 0.025, 0.67, '#925348', 0.65, 0.035, 5.05);
  for (const dz of [-0.24, -0.18, 0.18, 0.24]) box(1.50, 0.009, 0.019, pale, 0.65, 0.052, 5.05 + dz);

  box(4.02, 0.18, 2.30, trim, 6.35, -0.105, 3.65);
  for (let i = 0; i < 11; i++) {
    box(4, 0.043, 2.3 / 11 - 0.013, boards[(i + 1) % 4], 6.35, 0.003, 2.5 + (i + 0.5) * 2.3 / 11);
  }
  // Porch rails wrap the outer corner. The north edge is open to the old yard path.
  for (const [x,z] of [[4.43,4.71], [6.35,4.71], [8.27,4.71], [8.27,2.6]]) {
    box(0.095, 1.00, 0.095, trim, x, 0.51, z);
    box(0.13, 0.085, 0.13, pale, x, 1.048, z);
  }
  for (const y of [0.28, 0.87]) {
    box(3.88, 0.104, 0.064, plank, 6.35, y, 4.71);
    box(0.064, 0.104, 2.13, plank, 8.27, y, 3.66);
  }
  // The silent sprinkler and its hose stay in the scene between flushes.
  box(0.23, 0.115, 0.18, '#567563', 6.98, 0.083, 4.35);
  box(0.078, 0.16, 0.078, '#8d8669', 6.98, 0.167, 4.35);
  box(0.30, 0.079, 0.065, '#54806a', 6.98, 0.256, 4.35, 0.26);
  box(0.047, 0.049, 0.39, '#54664a', 6.98, 0.052, 4.57);
  const shell = batch('Homestead floors, open partitions and porch');

  // The near side of this higher wall disappears on rotation, just like the living room walls.
  wall(-3.96, 4.825, 0.11, 3.15, 2.59, '#c4c4a6');
  box(0.05, 1.08, 3.12, slate, -3.886, 0.54, 4.825);
  box(0.07, 0.09, 3.15, trim, -3.87, 1.10, 4.825);
  for (let i = 1; i < 12; i++) box(0.022, 0.91, 0.014, '#627e71', -3.853, 0.54, 3.25 + i * 3.15 / 12);
  box(0.075, 0.80, 0.66, trim, -3.86, 1.98, 4.90);
  box(0.022, 0.66, 0.56, '#a7c1b9', -3.81, 1.98, 4.90);
  box(0.10, 0.072, 0.70, pale, -3.81, 1.54, 4.90);
  box(0.090, 0.075, 0.59, '#bc9e61', -3.84, 1.81, 5.76);
  box(0.038, 0.49, 0.34, '#bb775e', -3.776, 1.62, 5.76);
  box(0.042, 0.044, 0.34, pale, -3.774, 1.45, 5.76);
  const leftWall = batch('Bathroom beadboard, mirror and towel rail');
  ranchWindpump(paint);
  const windpump = batch('Ranch windpump and stock trough');
  return { shell, leftWall, windpump };
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
  const group = new THREE.Group(), picks = [], { shell, leftWall, windpump } = architecture(), spray = waterSpray();
  group.name = 'Homestead extension';
  group.add(shell, leftWall, windpump, spray);
  parent.add(group);
  let disposed = false;
  function place(mesh, x, z, width, heading, y = 0, action) {
    mesh.scale.setScalar(width);
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
      kitchenCabinet: ['#927252', block(0.95, 1, 1, 0.5)],
      kitchenCoffeeMachine: ['#535f58', block(0.65, 0.08, 0.96, 0.04), block(0.65, 0.70, 0.35, 0.37, -0.27),
        block(0.65, 0.18, 0.87, 0.64), new THREE.CylinderGeometry(0.17, 0.15, 0.25, 10).translate(0, 0.20, 0.20)],
      chair: ['#63806b', block(1, 0.12, 0.95, 0.92), block(0.96, 1.32, 0.13, 1.53, -0.42),
        ...[-0.39, 0.39].flatMap(x => [-0.39, 0.39].map(z => block(0.11, 0.90, 0.11, 0.45, z).translate(x, 0, 0)))],
    };
    for (const [name, x, z, width, heading, y, action] of furnishings) {
      if (!models[name]) continue;
      const [color, ...parts] = models[name];
      const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color }));
      for (const geometry of parts) geometry.dispose();
      mesh.name = name;
      place(mesh, x, z, width, heading, y, action);
    }
  }
  const url = new URL('./assets/homestead-furnishings.glb', import.meta.url).href;
  const ready = new GLTFLoader().loadAsync(url).then(({ scene }) => {
    if (disposed) { releaseModels(scene); return; }
    for (const [name, ...placement] of furnishings) place(scene.getObjectByName(name), ...placement);
  }, () => { if (!disposed) fallback(); }).then(() => { if (!disposed) onReady?.(); });
  return {
    picks, leftWall, ready,
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
