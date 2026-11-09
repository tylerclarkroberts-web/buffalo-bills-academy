import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brushPoint, paintMask } from '../client/src/avatar/cutout-brush.js';

test('brush coordinates follow a resized canvas and clamp captured pointers outside it', () => {
  const rect = { left: 20, top: 40, width: 120, height: 150 };
  assert.deepEqual(brushPoint(rect, 80, 115, 240, 300), { x: 120, y: 150 });
  assert.deepEqual(brushPoint(rect, -10, 500, 240, 300), { x: 0, y: 300 });
});

test('fast brush strokes erase every pixel between samples without mutating the previous mask', () => {
  const original = new Uint8ClampedArray(20 * 10).fill(255);
  const next = paintMask(original, 20, 10, { x: 1, y: 5 }, { x: 19, y: 5 }, 1, false);
  for (let x = 1; x < 19; x++) assert.equal(next[5 * 20 + x], 0);
  assert.ok(original.every((v) => v === 255));
  assert.equal(next[0], 255, 'other parts of the head remain untouched');
});

test('restore paints original head pixels while keeping outside the head outline transparent', () => {
  const outline = new Uint8ClampedArray(25); outline[12] = outline[13] = 255;
  const next = paintMask(new Uint8ClampedArray(25), 5, 5, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, 3, true, outline);
  assert.deepEqual(next, outline);
  assert.equal(paintMask(next, 5, 5, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, 0.5, false, outline)[12], 0);
});

test('brush bounds stay inside the image and mismatched masks are rejected', () => {
  const original = new Uint8ClampedArray(25).fill(255);
  const next = paintMask(original, 5, 5, { x: -10, y: -10 }, { x: 0, y: 0 }, 2, false);
  assert.equal(next.length, 25); assert.equal(next[0], 0); assert.equal(next[24], 255);
  assert.throws(() => paintMask(new Uint8ClampedArray(24), 5, 5, { x: 0, y: 0 }, { x: 0, y: 0 }, 2, true), /Invalid cutout mask/);
});
