import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { ROOM_DOOR_HEIGHT, ROOM_FLOOR_SCALE as S, ROOM_WALL_HEIGHT as height } from './scene-model.js';
import { makeWallCutaway } from './cutaway.js';

// x runs from the long rear wall to the porch. Looking in from the porch, +z is on the left.
export function buildWings(parent, box, batch) {
  const oak = '#996c48', trim = '#674832', honey = '#c39a67';
  const boards = ['#ab8058', '#b18b65', '#a77a52', '#bb956d'];
  box(7.25, 0.19, 3.90, trim, -0.375, -0.095, 5.20);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 8; j++) {
    const w = 7.25 / 14, d = 3.90 / 8;
    box(w - 0.012, 0.016, d - 0.012, (i + j) % 2 ? '#93a39a' : '#c3c9b8',
      -4 + (i + 0.5) * w, 0.008, 3.25 + (j + 0.5) * d);
  }
  box(7.55, 0.19, 4.05, trim, -0.225, -0.095, -5.025);
  for (let j = 0; j < 14; j++) {
    const z = -7.05 + (j + 0.5) * 4.05 / 14, seam = -1.72 + (j % 3) * 1.14;
    box(seam + 3.996, 0.016, 4.05 / 14 - 0.009, boards[j % 4], (seam - 4) / 2, 0.008, z);
    box(3.546 - seam, 0.016, 4.05 / 14 - 0.009, boards[(j + 1) % 4], (seam + 3.55) / 2, 0.008, z);
  }
  box(1.95, 0.020, 0.68, '#915948', 1.30, 0.026, -5.96);
  for (const dx of [-0.84, -0.76, 0.76, 0.84]) box(0.034, 0.007, 0.66, '#cfaf82', 1.30 + dx, 0.039, -5.96);
  box(1.48, 0.020, 0.55, '#7d997d', -0.95, 0.026, 5.98);
  for (const dx of [-0.61, 0.61]) box(0.056, 0.007, 0.53, '#c0c9a6', -0.95 + dx, 0.039, 5.98);

  const bath = { paint: '#dedfca', lower: '#839a91', base: 0.60 };
  const bunk = { paint: '#e7d5b3', lower: oak, base: 0.60 };
  const faces = [
    { name: 'Bathroom rear window', side: 'left', at: -4, span: [3.25, 7.15], opening: [3.65, 4.85, 1.85, 3.28], ...bath, mirror: true },
    { name: 'Bunk rear window', side: 'left', at: -4, span: [-7.05, -3], opening: [-6.35, -4.70, 1.86, 3.33], ...bunk },
    { name: 'Bathroom porch window', side: 'right', at: 3.25, span: [3.30, 7.10], opening: [4.38, 5.78, 1.45, 3.02], ...bath },
    { name: 'Bunk porch window', side: 'right', at: 3.55, span: [-7, -3.11], opening: [-5.97, -4.53, 1.43, 3.05], ...bunk },
    { name: 'Bathroom outer window', side: 'front', at: 7.15, span: [-3.95, 3.30], opening: [-1.64, 0.06, 1.98, 3.24], ...bath, towel: true },
    { name: 'Kitchen counter window', side: 'back', at: -7.05, span: [-3.95, 3.60], opening: [0.57, 2.20, 1.89, 3.20], ...bunk },
    { name: 'Bathroom doorway', side: 'front', at: 3.35, span: [-3.95, 3.20], opening: [1.41, 2.59, 0, ROOM_DOOR_HEIGHT], ...bath, base: 0.88, reverseFor: 'bathroom' },
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
      panel(face, from, to, bottom, 1.54, '#91aa9c', 0.015, 0.063);
      for (let i = 1; i < 10; i++) panel(face, from + i * 0.40, from + i * 0.40 + 0.019, bottom, 1.54, '#809c8e', 0.012, 0.080);
      for (const y of [0.95, 1.24, 1.52]) panel(face, from, to, y, y + 0.023, '#809c8e', 0.012, 0.084);
      panel(face, 5.39, 6.01, 43 * inch, 75 * inch, trim, 0.075, 0.086);
      panel(face, 5.43, 5.97, 44.5 * inch, 73.5 * inch, '#a8c5bd', 0.025, 0.137);
      panel(face, 5.35, 6.05, 41 * inch, 43 * inch, honey, 0.13, 0.10);
    }
    if (face.towel) {
      panel(face, -2.15, -1.53, 1.76, 1.84, '#a1865a', 0.079, -0.101);
      panel(face, -2.03, -1.67, 1.29, 1.80, '#a76d55', 0.035, -0.157);
      panel(face, -2.03, -1.67, 1.33, 1.37, honey, 0.039, -0.162);
    }
    solid.add(batch(name + ' frame and trim'));
  }
  return walls;
}
