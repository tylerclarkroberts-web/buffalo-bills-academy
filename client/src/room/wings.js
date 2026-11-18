import { Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { ROOM_DOOR_HEIGHT, ROOM_FLOOR_SCALE as S, ROOM_WALL_HEIGHT as height } from './scene-model.js';
import { makeWallCutaway } from './cutaway.js';

// x runs from the long rear wall to the porch. Looking in from the porch, +z is on the left.
export function buildWings(parent, box, batch, style, plan) {
  const oak = '#996c48', trim = '#674832', honey = '#c39a67';
  // End the bathroom just behind the parlor's display sill so the pass-through looks into the bedroom.
  const dividerX = -0.45, bathWidth = dividerX + 4, bedWidth = 3.55 - dividerX, wingDepth = 4.05;
  const bathColor = style.bathroom.paint, bedColor = style.bedroom.paint, kitchenColor = style.kitchen.paint;
  const wood = new Color('#b48c64').lerp(bedColor, 0.18);
  const boards = [0.95, 1.08, 0.91, 1.13].map(k => wood.clone().multiplyScalar(k));
  function floorMesh(name, id) {
    const floor = batch(name);
    floor.userData.editSelection = { kind: 'homestead', id };
    parent.add(floor);
  }
  box(bathWidth, 0.19, wingDepth, trim, -4 + bathWidth / 2, -0.095, -5.025);
  const stone = style.bathroom.typeId === 'stone', columns = stone ? 5 : 7, rows = stone ? 6 : 8;
  const tile = [bathColor, bathColor.clone().lerp(new Color('#f2e9d6'), stone ? 0.20 : 0.63)];
  for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
    const w = bathWidth / columns, d = wingDepth / rows;
    box(w - 0.012, 0.016, d - 0.012, tile[(i + j) % 2],
      -4 + (i + 0.5) * w, 0.008, -7.05 + (j + 0.5) * d);
  }
  const turnedTub = style.tub.layoutId === 'alternate', matX = turnedTub ? plan.tub[0] + 0.73 : plan.tub[0];
  const matZ = turnedTub ? plan.tub[1] : plan.tub[1] + 0.77;
  box(1.48, 0.020, 0.55, bathColor, matX, 0.026, matZ, turnedTub ? Math.PI / 2 : 0);
  for (const dx of [-0.61, 0.61]) box(0.056, 0.007, 0.53, '#c0c9a6',
    matX + (turnedTub ? 0 : dx), 0.039, matZ + (turnedTub ? dx : 0), turnedTub ? Math.PI / 2 : 0);
  floorMesh('Bathroom floor', 'bathroom');

  box(bedWidth, 0.19, wingDepth, trim, dividerX + bedWidth / 2, -0.095, -5.025);
  if (style.bedroom.typeId === 'parquet') {
    const w = bedWidth / 5, d = wingDepth / 5;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) {
      const across = (i + j) % 2 === 0;
      box((across ? w : w / 3) - 0.009, 0.016, (across ? d / 3 : d) - 0.009, boards[(i + j + k) % 4],
        dividerX + w * (i + (across ? 0.5 : (k + 0.5) / 3)), 0.008, -7.05 + d * (j + (across ? (k + 0.5) / 3 : 0.5)));
    }
  } else for (let j = 0; j < 14; j++) {
    const z = -7.05 + (j + 0.5) * wingDepth / 14, seam = 0.65 + (j % 3) * 0.87;
    box(seam - dividerX - 0.004, 0.016, wingDepth / 14 - 0.009, boards[j % 4], (seam + dividerX) / 2, 0.008, z);
    box(3.546 - seam, 0.016, wingDepth / 14 - 0.009, boards[(j + 1) % 4], (seam + 3.55) / 2, 0.008, z);
  }
  floorMesh('Bedroom floor', 'bedroom');

  const kitchenRear = -2.35, kitchenWidth = 3.25 - kitchenRear;
  box(kitchenWidth, 0.19, 3.90, trim, kitchenRear + kitchenWidth / 2, -0.095, 5.20);
  const clay = new Color('#ae7960').lerp(kitchenColor, 0.32);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const from = Math.max(0, i - (j % 2) / 2), to = Math.min(6, i + 1 - (j % 2) / 2);
    if (from < to) box((to - from) * kitchenWidth / 6 - 0.014, 0.016, 3.90 / 7 - 0.014,
      clay.clone().multiplyScalar(0.92 + 0.055 * ((i + j * 3) % 4)), kitchenRear + (from + to) * kitchenWidth / 12, 0.008, 3.25 + (j + 0.5) * 3.90 / 7);
  }
  box(1.95, 0.020, 0.68, kitchenColor.clone().multiplyScalar(0.68), plan.counterX + 0.31, 0.026, 6.05);
  for (const dx of [-0.84, -0.76, 0.76, 0.84]) box(0.034, 0.007, 0.66, '#cfaf82', plan.counterX + 0.31 + dx, 0.039, 6.05);
  floorMesh('Kitchen floor', 'kitchen');

  const bath = { paint: new Color('#eee5cd').lerp(bathColor, 0.25), lower: bathColor, base: 0.60 };
  const bunk = { paint: new Color('#f1e2c7').lerp(bedColor, 0.16), lower: wood, base: 0.60 };
  const kitchen = { paint: new Color('#efe0c5').lerp(kitchenColor, 0.23), lower: kitchenColor, base: 0.60 };
  const faces = [
    { name: 'Kitchen rear window', side: 'left', at: kitchenRear, span: [3.25, 7.15], opening: [3.65, 4.85, 1.85, 3.28], ...kitchen },
    { name: 'Kitchen porch window', side: 'right', at: 3.25, span: [3.30, 7.10], opening: [4.38, 5.78, 1.45, 3.02], ...kitchen },
    { name: 'Kitchen counter window', side: 'front', at: 7.15, span: [kitchenRear + 0.05, 3.30], opening: [0.55, 2.27, 1.98, 3.24], ...kitchen },
    { name: 'Parlor garden window', side: 'front', at: 3.35, span: [-4.05, kitchenRear + 0.05], opening: [-3.70, -2.70, 1.82, 3.17], ...bunk },
    { name: 'Kitchen doorway', side: 'front', at: 3.35, span: [kitchenRear + 0.05, 3.20], opening: [1.41, 2.59, 0, ROOM_DOOR_HEIGHT], ...kitchen, base: 0.88, reverseFor: ['kitchen'] },
    { name: 'Bedroom porch window', side: 'right', at: 3.55, span: [-7, -3.11], opening: [-5.97, -4.53, 1.43, 3.05], ...bunk },
    { name: 'Bedroom side window', side: 'back', at: -7.05, span: [dividerX, 3.60], opening: [0.45, 1.85, 1.89, 3.20], ...bunk },
    { name: 'Bathroom rear window', side: 'left', at: -4, span: [-7.05, -3], opening: [-6.35, -4.70, 1.86, 3.33], ...bath, mirror: true },
    { name: 'Bathroom side window', side: 'back', at: -7.05, span: [-3.95, dividerX], opening: [-2.96, -1.50, 1.98, 3.24], ...bath, towel: true },
    { name: 'Bathroom doorway', side: 'right', at: dividerX, span: [-7, -3.10], opening: [-4.69, -3.51, 0, ROOM_DOOR_HEIGHT], ...bath, base: 0.74, reverseFor: ['bunk'] },
  ];

  function panel({ side, at }, start, end, bottom, top, paint, depth = 0.105, inset = 0) {
    const along = (start + end) / 2, y = (bottom + top) / 2;
    if (side === 'left' || side === 'right') box(depth, top - bottom, end - start, paint, at + inset, y, along);
    else box(end - start, top - bottom, depth, paint, along, y, at + inset);
  }
  // Keep a capped base below every cutaway. Only thresholds interrupt its outline.
  for (const face of faces) {
    const { span: [from, to], opening: [a, b, sill], base } = face;
    for (const [lo, hi] of sill ? [[from, to]] : [[from, a], [b, to]]) {
      panel(face, lo, hi, 0, base, face.lower);
      panel(face, lo, hi, 0.03, 0.13, trim, 0.14);
      panel(face, lo, hi, base, base + 0.065, honey, 0.15);
    }
  }
  parent.add(batch('Wing floors and capped cutaway bases'));

  const walls = [];
  const glass = new MeshBasicMaterial({ color: '#b2cdd3', side: DoubleSide, transparent: true, opacity: 0.20, depthWrite: false });
  for (const face of faces) {
    const { name, side, span: [from, to], opening: [a, b, sill, lintel], base, paint } = face;
    const bottom = base + 0.065;
    panel(face, from, a, bottom, height, paint);
    panel(face, b, to, bottom, height, paint);
    if (sill) panel(face, a, b, bottom, sill, paint);
    panel(face, a, b, lintel, height, paint);
    const solid = batch(name);
    if (name !== 'Parlor garden window') solid.userData.editSelection = { kind: 'homestead',
      id: name.startsWith('Bathroom') ? 'bathroom' : name.startsWith('Kitchen') ? 'kitchen' : 'bedroom' };
    parent.add(solid);
    const wall = makeWallCutaway(side, solid, [solid]);
    if (face.reverseFor) wall.reverseFor = face.reverseFor;
    walls.push(wall);

    panel(face, from, to, height, height + 0.084, trim, 0.15);
    panel(face, a - 0.065, a, sill, lintel, oak, 0.15);
    panel(face, b, b + 0.065, sill, lintel, oak, 0.15);
    panel(face, a - 0.065, b + 0.065, lintel, lintel + 0.11, oak, 0.16);
    if (sill) {
      const mid = (a + b) / 2, rail = (sill + lintel) / 2;
      panel(face, a - 0.10, b + 0.10, sill - 0.10, sill, honey, 0.28);
      panel(face, mid - 0.021, mid + 0.021, sill, lintel, oak, 0.07);
      panel(face, a, b, rail - 0.034, rail + 0.034, oak, 0.075);
      const pane = new Mesh(new PlaneGeometry((b - a) * S, lintel - sill), glass);
      const alongZ = side === 'left' || side === 'right';
      pane.position.set((alongZ ? face.at : mid) * S, rail, (alongZ ? mid : face.at) * S);
      if (alongZ) pane.rotation.y = Math.PI / 2;
      solid.add(pane);
    }
    if (!face.mirror) {
      for (const [lo, hi] of sill ? [[from, to]] : [[from, a], [b, to]]) {
        panel(face, lo, hi, bottom, 1.16, face.lower, 0.126);
        panel(face, lo, hi, 1.16, 1.23, honey, 0.155);
      }
    }
    if (face.mirror) {
      const inch = height / 102;
      panel(face, from, to, bottom, 1.54, bathColor, 0.015, 0.063);
      for (let i = 1; from + i * 0.40 < to; i++) panel(face, from + i * 0.40, from + i * 0.40 + 0.019, bottom, 1.54, '#809c8e', 0.012, 0.080);
      for (const y of [0.95, 1.24, 1.52]) panel(face, from, to, y, y + 0.023, '#809c8e', 0.012, 0.084);
      panel(face, -4.29, -3.67, 43 * inch, 75 * inch, trim, 0.075, 0.086);
      panel(face, -4.25, -3.71, 44.5 * inch, 73.5 * inch, '#a8c5bd', 0.025, 0.137);
      panel(face, -4.33, -3.63, 41 * inch, 43 * inch, honey, 0.13, 0.10);
    }
    if (face.towel) {
      panel(face, -3.76, -3.14, 1.76, 1.84, '#a1865a', 0.079, 0.101);
      panel(face, -3.64, -3.28, 1.29, 1.80, '#a76d55', 0.035, 0.157);
      panel(face, -3.64, -3.28, 1.33, 1.37, honey, 0.039, 0.162);
    }
    solid.add(batch(name + ' frame and trim'));
  }
  return walls;
}
