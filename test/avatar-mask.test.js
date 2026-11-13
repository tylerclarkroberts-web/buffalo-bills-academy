import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headMask, headPath, applyHeadMask, clipHeadTriangles, fitHead } from '../client/src/avatar/head-mask.js';
import { buildHead } from '../client/src/avatar/facepoly.js';
import { lowPoly } from '../client/src/lowpoly.js';

function photo(width = 240, height = 300) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([0, 220, 0, 255], i * 4);
  return { width, height, data };
}
function paint(img, mask, x0, y0, w, h, colour = [170, 100, 60]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    mask[y * img.width + x] = 255;
    img.data.set([...colour, 255], (y * img.width + x) * 4);
  }
}

test('framing mask shares the head outline and intersects semantic alpha and image transparency', () => {
  const img = photo(100, 125), alpha = new Uint8ClampedArray(12500).fill(255);
  alpha[60 * 100 + 50] = 0;
  img.data[(61 * 100 + 50) * 4 + 3] = 0;
  const mask = applyHeadMask(img, alpha);
  assert.equal(mask[60 * 100 + 50], 0); assert.equal(mask[61 * 100 + 50], 0);
  assert.equal(mask[62 * 100 + 50], 255);
  assert.equal(mask[0], 0); assert.equal(mask.at(-1), 0);
  assert.match(headPath(100, 125), /^M.*Z$/);
  assert.throws(() => headMask(0, 125), /size/);
  assert.throws(() => headMask(100, 125, new Uint8ClampedArray(4)), /mask/);
  assert.throws(() => buildHead(photo(), new Uint8ClampedArray(240 * 300)), /No head remains/);
});

test('background colours never enter avatar facets or saved pixels after subject masking', () => {
  const img = photo(), alpha = new Uint8ClampedArray(240 * 300);
  paint(img, alpha, 75, 60, 90, 170);
  paint(img, alpha, 60, 90, 15, 85, [45, 30, 25]); // hair
  paint(img, alpha, 165, 125, 10, 28); // ear
  const result = buildHead(img, alpha), mask = headMask(240, 300, alpha);
  assert.ok(result.tris.length);
  for (let i = 0; i < result.tris.length; i += 10) assert.ok(result.tris[i + 7] < result.tris[i + 6], 'green background never colours a facet');
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) assert.equal(result.pixels[i * 4 + 3], 0, 'saved PNG data never paints outside the mask');
  }
  assert.equal(result.pixels[(120 * 240 + 66) * 4 + 3], 255, 'hair remains');
  assert.equal(result.pixels[(135 * 240 + 170) * 4 + 3], 255, 'ear remains');
  assert.ok(result.tris.length / 10 < 15000, 'ordinary head stays a practical 3D mesh');
});

test('a loosely framed head is enlarged to fill the outline and is not cut to its curve again', () => {
  const img = photo(), alpha = new Uint8ClampedArray(240 * 300), outline = headMask(240, 300);
  for (let i = 0; i < 240 * 300; i++) img.data.set([170, 100, 60, 255], i * 4);
  for (let y = 150; y < 230; y++) for (let x = 120; x < 180; x++) alpha[y * 240 + x] = 255; // a 60×80 head, off centre
  const fit = fitHead(240, 300, alpha);
  let x0 = 240, x1 = 0, y0 = 300, y1 = 0;
  for (let i = 0; i < fit.alpha.length; i++) if (fit.alpha[i]) {
    x0 = Math.min(x0, i % 240); x1 = Math.max(x1, i % 240); y0 = Math.min(y0, Math.floor(i / 240)); y1 = Math.max(y1, Math.floor(i / 240));
  }
  assert.ok(x1 - x0 >= 200 && y1 - y0 >= 270, `grows to ${x1 - x0 + 1}×${y1 - y0 + 1}`);
  assert.ok(Math.abs((x0 + x1) / 2 - 120) < 2 && Math.abs((y0 + y1) / 2 - 141) < 2, 'centred on the outline');
  assert.ok(Math.abs(fit.crop.w / fit.crop.h - 0.8) < 1e-9, 'the photo is redrawn without stretching');
  assert.equal(alpha[160 * 240 + 130], 255, 'the editing mask is left alone');
  const corner = (y0 + 2) * 240 + x0 + 2;
  assert.equal(outline[corner], 0, 'the enlarged corner lies outside the outline curve');
  assert.equal(buildHead(img, fit.alpha, false).pixels[corner * 4 + 3], 255, 'and is saved anyway');
  const full = fitHead(240, 300, outline);
  assert.ok(Math.abs(full.crop.w - 240) < 2 && Math.abs(full.crop.x) < 2, 'a head already filling the outline stays put');
  assert.deepEqual(fitHead(240, 300, new Uint8ClampedArray(240 * 300)).crop, { x: 0, y: 0, w: 240, h: 300 });
});

test('mesh clipping preserves mask holes even when all original triangle vertices are kept', () => {
  const width = 32, height = 32, mask = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) mask[y * width + x] = 0;
  const poly = { width, height, tris: new Float32Array([0, 0, 32, 0, 0, 32, 150, 90, 50, 255, 32, 0, 32, 32, 0, 32, 150, 90, 50, 255]) };
  const clipped = clipHeadTriangles(poly, mask);
  let area = 0;
  for (let i = 0; i < clipped.tris.length; i += 10) {
    const t = clipped.tris.subarray(i, i + 10);
    area += Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2;
    for (const [u, v] of [[1 / 3, 1 / 3], [0.1, 0.1], [0.8, 0.1], [0.1, 0.8]]) {
      const x = Math.floor(t[0] + (t[2] - t[0]) * u + (t[4] - t[0]) * v), y = Math.floor(t[1] + (t[3] - t[1]) * u + (t[5] - t[1]) * v);
      assert.equal(mask[Math.min(31, y) * width + Math.min(31, x)], 255, '3D geometry cannot bridge a removed region');
    }
  }
  assert.equal(area, width * height - 100, 'all kept area is retained, including boundaries');
});

test('thin opaque regions can be retained for precise clipping without changing lowPoly defaults', () => {
  const img = photo(80, 100); img.data.fill(0);
  const alpha = new Uint8ClampedArray(8000);
  paint(img, alpha, 38, 10, 4, 75, [0, 0, 0]);
  const defaultPoly = lowPoly(img, { seed: 5 });
  assert.deepEqual(defaultPoly, lowPoly(img, { seed: 5, minCoverage: 0.5 }));
  const detailed = lowPoly(img, { seed: 5, minCoverage: 0 });
  assert.ok(detailed.tris.length > defaultPoly.tris.length, 'thin boundary facets remain available to clip');
  const result = buildHead(img, alpha);
  assert.equal(result.pixels[(50 * 80 + 40) * 4 + 3], 255);
  assert.equal(result.pixels[(50 * 80 + 30) * 4 + 3], 0);
});
