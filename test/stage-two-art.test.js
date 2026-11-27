// Stage II art (stageTwoArt.js): every species is its own monster, told apart by shape and colour, in a small palette,
// crisp at every size; botched Stage II, Stage III and the photo bug are drawn exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ROSTER } from '../server/engine/creatures.js';
import { spriteGrid } from '../client/src/barn/sprite.js';
import { STAGE_TWO, STAGE_TWO_PAL, stageTwoHandOf } from '../client/src/barn/stageTwoArt.js';
import { drawTool } from '../client/src/barn/varietyArt.js';
import { TOOLS } from '../server/engine/tools.js';
import { varietyFor, BASES, AILMENTS, FRUITS, PATTERNS, MORPHS, METALS } from '../server/engine/variety.js';
import { spriteCanvas } from '../client/src/barn/sprite.js';

const bugs = ROSTER.filter((b) => b.id !== 'steeze');
const mask = (g) => g.map((row) => row.map((px) => (px ? 1 : 0)));

test('every species but the photo bug has a Stage II design and a palette of its own', () => {
  for (const b of bugs) { assert.ok(STAGE_TWO[b.id], `${b.id} has a design`); assert.equal(STAGE_TWO_PAL[b.id]?.length, 5, `${b.id} has a palette`); }
  assert.ok(!STAGE_TWO.steeze && !STAGE_TWO_PAL.steeze, 'the photo bug is left alone');
  const bases = bugs.map((b) => STAGE_TWO_PAL[b.id][2]);
  assert.equal(new Set(bases).size, bases.length, 'no two species share a base colour');
});

test('no two Stage II silhouettes are alike, even as a 64-pixel thumbnail', () => {
  const m = bugs.map((b) => mask(spriteGrid(b, undefined, 1, 1)));
  let worst = Infinity, pair = '';
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
    let x = 0, u = 0; for (let y = 0; y < 64; y++) for (let k = 0; k < 64; k++) { const a = m[i][y][k], c = m[j][y][k]; if (a || c) u++; if (a !== c) x++; }
    if (x / u < worst) { worst = x / u; pair = `${bugs[i].id}/${bugs[j].id}`; }
  }
  assert.ok(worst > 0.2, `the closest pair (${pair}) still differs in ${Math.round(worst * 100)}% of its outline`);
});

test('a small palette, and crisp pixels: native on a 64 or 128 grid, only ever doubled up', () => {
  for (const b of bugs) {
    const g2 = spriteGrid(b, undefined, 2, 1), colours = new Set(g2.flat().filter(Boolean));
    assert.ok(colours.size <= 20, `${b.id}: ${colours.size} colours`);
    const g4 = spriteGrid(b, undefined, 4, 1);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (g4[y][x] !== g2[y >> 1][x >> 1]) assert.fail(`${b.id}: x4 is not the x2 drawing doubled at ${x},${y}`);
    const g3 = spriteGrid(b, undefined, 3, 1); assert.equal(g3.length, 192);
    assert.ok(new Set(g3.flat().filter(Boolean)).size === colours.size, `${b.id}: no new in-between colours when stretched`);
  }
});

test('the mining tool sits in each design\'s right hand and stays in the frame', () => {
  for (const b of bugs) {
    const hand = stageTwoHandOf(b.id); assert.ok(hand && hand.x >= 15 && hand.x <= 52 && hand.y >= 28 && hand.y <= 50, `${b.id}: hand at ${hand?.x},${hand?.y}`);
    for (const id of Object.keys(TOOLS)) {
      const pts = [], c = { put: (x, y) => pts.push([x, y]), line: (x0, y0, x1, y1) => pts.push([x0, y0], [x1, y1]), ell: (x, y, rx, ry) => pts.push([x - rx, y - ry], [x + rx, y + ry]), hair: (p) => pts.push(...p) };
      drawTool(c, { top: 10, bottom: 60, rows: [] }, id, hand);
      for (const [x, y] of pts) assert.ok(x >= 0 && x <= 64 && y >= 0 && y <= 64, `${b.id} ${id}: ${x.toFixed(1)},${y.toFixed(1)} off the sprite`);
    }
  }
});

test('botched Stage II, Stage III and the photo bug are drawn exactly as before', () => {
  const h = crypto.createHash('sha256');
  for (const b of ROSTER) for (const fine of [1, 2]) { h.update(JSON.stringify(spriteGrid(b, undefined, fine, 1, true))); h.update(JSON.stringify(spriteGrid(b, undefined, fine, 2))); h.update(JSON.stringify(spriteGrid(b, undefined, fine, 2, true))); }
  const s = ROSTER.find((b) => b.id === 'steeze'); for (const fine of [1, 2]) h.update(JSON.stringify(spriteGrid(s, undefined, fine, 1)));
  // the art from main before this change (6660abf); if any of it is ever changed on purpose, this is the line to update
  assert.equal(h.digest('hex'), 'babfe0f5894f6313298202fe804de27f396673f69edd83bd9705e0603a511c11');
});

test('a clean Stage II bug is drawn bare: no base, colouring, pattern, ailment, fruit or tool, whatever its variety', () => {
  const ails = Object.keys(AILMENTS), fruits = Object.keys(FRUITS), bases = Object.keys(BASES);
  bugs.forEach((b, i) => {
    const plain1 = spriteGrid(b, undefined, 1, 1), plain2 = spriteGrid(b, undefined, 2, 1);
    for (const v of [varietyFor(i + 1, b.id), varietyFor(9000 + i, b.id), { seed: i + 7, base: bases[i % 4], ail: [ails[i % ails.length], ails[(i + 3) % ails.length]], fruit: fruits[i % fruits.length], hue: 120, tone: 10, pat: PATTERNS[i % PATTERNS.length], morph: MORPHS[i % MORPHS.length], metal: METALS[i % METALS.length] }]) {
      assert.deepEqual(spriteGrid(b, undefined, 1, 1, false, v), plain1, `${b.id}: x1 with variety`);
      assert.deepEqual(spriteGrid(b, undefined, 2, 1, false, v), plain2, `${b.id}: x2 with variety`);
    }
  });
});

test('every surface draws the bare art: the canvas a stall, ring, bout or mine uses ignores variety, and a rotor never spins it', () => {
  const old = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; const px = []; this.px = px; } getContext() { const px = this.px; let fill = null; return { set fillStyle(v) { fill = v; }, fillRect: (x, y, w, h) => px.push([fill, x, y, w, h]), pixels: px }; } };
  for (const b of bugs.slice(0, 12)) for (const fine of [1, 2, 4]) {
    const bare = spriteCanvas(b, { evo: 1 }, 23, fine).getContext().pixels;
    for (const base of Object.keys(BASES)) for (const frame of [0, 1]) {
      const worn = spriteCanvas(b, { evo: 1, variety: { ...varietyFor(5, b.id), base } }, 23, fine, frame).getContext().pixels;
      assert.deepEqual(worn, bare, `${b.id} x${fine} ${base} frame ${frame}`);
    }
  }
  if (old === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = old;
});
