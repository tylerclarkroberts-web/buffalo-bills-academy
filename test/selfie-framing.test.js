import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameCrop } from '../client/src/avatar/frame-crop.js';
import { segmentationAlpha } from '../client/src/avatar/segmentation-mask.js';

test('framing keeps a 4:5 crop inside portrait and landscape sources at each edge', () => {
  for (const [width, height] of [[1280, 960], [960, 1280], [240, 300]]) {
    for (const zoom of [1, 1.25, 4]) for (const cx of [-500, width / 2, width + 500]) for (const cy of [-500, height / 2, height + 500]) {
      const c = frameCrop(width, height, { zoom, cx, cy });
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= width + 1e-9 && c.y + c.h <= height + 1e-9);
      assert.ok(Math.abs(c.w / c.h - 0.8) < 1e-9);
    }
  }
});

test('head segmentation preserves hair, face and accessories while excluding background, body and clothes', () => {
  const categories = Uint8Array.from([0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...segmentationAlpha(categories, 3, 2, 3, 2)], [0, 255, 0, 255, 0, 255]);
  assert.deepEqual([...segmentationAlpha(Uint8Array.from([1, 0]), 2, 1, 4, 2)], [255, 255, 0, 0, 255, 255, 0, 0]);
  assert.throws(() => segmentationAlpha(categories, 2, 2, 240, 300), /Invalid/);
});
