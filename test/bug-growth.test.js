import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROSTER } from '../server/engine/creatures.js';
import { bugScale, drawBug, spriteCanvas, spriteGrid, youngForm } from '../client/src/barn/sprite.js';
import { RoomScene } from '../client/src/room/scene.js';

function context() {
  return {
    images: [], pixels: [], shadows: [],
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    translate() {}, rotate() {}, scale() {}, arc() {}, bezierCurveTo() {},
    ellipse(...args) { this.shadows.push(args); },
    fillRect(...args) { this.pixels.push([this.fillStyle, ...args]); },
    drawImage(...args) { this.images.push(args); },
    createRadialGradient: () => ({ addColorStop() {} }),
  };
}
function mockCanvas(t) {
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; this.context = context(); }
    getContext() { return this.context; }
  }
  const oldOffscreen = globalThis.OffscreenCanvas, oldDocument = globalThis.document;
  globalThis.OffscreenCanvas = Canvas;
  globalThis.document = { createElement: () => new Canvas(0, 0) };
  t.after(() => {
    if (oldOffscreen === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = oldOffscreen;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  });
}

test('bug growth increases at every level, stops at ten, and missing legacy levels keep adult size', () => {
  assert.equal(bugScale(1), 0.775);
  assert.equal(bugScale(10), 1);
  for (let level = 2; level <= 10; level++) assert.ok(bugScale(level) > bugScale(level - 1));
  assert.equal(bugScale(-10), bugScale(1));
  assert.equal(bugScale(100), 1);
  assert.equal(bugScale(4.8), bugScale(4));
  for (const value of [undefined, null, NaN, Infinity, '4']) assert.equal(bugScale(value), 1);
});

test('all species use their appropriate young form and switch cached art at level three only when needed', t => {
  mockCanvas(t);
  const larvae = {
    grub: ['ceroplophana', 'lamprima', 'sagra', 'polyphylla', 'phanaeus'],
    'legless-grub': ['trachelophorus', 'eupholus', 'pachyrhynchus'],
    borer: ['chrysochroa', 'macrodontia'], crawler: ['onymacris', 'brachinus', 'manticora'],
    'jawed-larva': ['mantispa', 'nemoptera'], caddis: ['helicopsyche'],
  };
  const expected = Object.fromEntries(Object.entries(larvae).flatMap(([form, ids]) => ids.map(id => [id, form])));
  const nymphs = ['bocydium', 'phrictus', 'pyrops', 'graphocephala', 'umbonia', 'platymeris', 'acanthaspis', 'heteropteryx', 'pseudocreobotra', 'deroplatys', 'empusa', 'lethocerus', 'sphaerocoris'];
  assert.equal(Object.keys(expected).length, 16);
  assert.equal(ROSTER.length, Object.keys(expected).length + nymphs.length + 1);
  for (const bug of ROSTER) {
    if (!expected[bug.id]) assert.ok(nymphs.includes(bug.id) || bug.id === 'phrixothrix');
    assert.equal(youngForm(bug, 1), expected[bug.id], bug.id);
    assert.equal(youngForm(bug, 2), expected[bug.id], bug.id);
    for (const level of [3, 10, undefined]) assert.equal(youngForm(bug, level), undefined, bug.id);
    const young = spriteGrid(bug, 1), adult = spriteGrid(bug, 3);
    if (expected[bug.id]) assert.notDeepEqual(young, adult, `${bug.id} has a distinct larva`);
    else assert.deepEqual(young, adult, `${bug.id} keeps its nymph or larviform body`);
    for (const [level, grid] of [[1, young], [3, adult]]) {
      assert.equal(grid.length, 64); assert.ok(grid.every(row => row.length === 64));
      assert.ok(grid.flat().filter(Boolean).length > 100, `${bug.id}/${level} is visible`);
      assert.ok(grid.flat().every(color => color === null || /^#[0-9a-f]{6}$/i.test(color)), `${bug.id}/${level} has valid colors`);
      if (expected[bug.id] && level === 1 || bug.id === 'helicopsyche' && level === 3) {
        assert.ok([...grid[0], ...grid[63], ...grid.map(row => row[0]), ...grid.map(row => row[63])].every(color => color === null), `${bug.id}/${level} leaves room around its outline`);
      }
    }
    const first = spriteCanvas(bug, undefined, 1), grown = spriteCanvas(bug, undefined, 3);
    assert.equal(spriteCanvas(bug, undefined, 2), first);
    assert.equal(spriteCanvas(bug, undefined, 10), grown);
    assert.equal(spriteCanvas(bug), grown, 'unspecified levels use the adult form');
    if (expected[bug.id]) assert.notEqual(first, grown); else assert.equal(first, grown);
  }
});

test('skins and fitted accessories survive both life stages without reusing the wrong cached art', t => {
  mockCanvas(t);
  const style = { bugskin: { id: 'growth-test-skin', pal: ['#110022', '#330055', '#660099', '#aa66dd', '#eeccff'] }, bughat: { shape: 'crown' }, bugacc: { shape: 'scarf' } };
  for (const bug of ROSTER) for (const level of [1, 3]) {
    const plain = spriteCanvas(bug, undefined, level), skin = spriteCanvas(bug, { bugskin: style.bugskin }, level), dressed = spriteCanvas(bug, style, level);
    assert.notDeepEqual(skin.context.pixels, plain.context.pixels, `${bug.id}/${level} applies its skin`);
    assert.ok(dressed.context.pixels.length > skin.context.pixels.length, `${bug.id}/${level} includes accessories`);
    assert.ok(dressed.context.pixels.every(([color, x, y, w, h]) => /^#[0-9a-f]{6}$/i.test(color) && x >= 0 && y >= 0 && x + w <= 64 && y + h <= 64));
    assert.equal(spriteCanvas(bug, style, level === 1 ? 2 : 10), dressed);
    const otherStage = spriteCanvas(bug, style, level === 1 ? 3 : 1);
    if (youngForm(bug, 1)) assert.notEqual(dressed, otherStage); else assert.equal(dressed, otherStage);
  }
});

test('canvas bugs grow every level without moving the floor or rebuilding their fitted accessories', t => {
  mockCanvas(t);
  const bug = ROSTER[0], style = { bughat: { shape: 'crown' }, bugacc: { shape: 'scarf' } };
  const plain = spriteCanvas(bug), dressed = spriteCanvas(bug, style);
  assert.notEqual(dressed, plain);
  assert.ok(dressed.context.pixels.length > plain.context.pixels.length, 'the cached art includes both accessories');
  for (const [w, h] of [[96, 96], [640, 480]]) {
    let previous = 0, floor, shadow;
    for (let level = 1; level <= 10; level++) {
      const ctx = context(), drawn = drawBug(ctx, bug, { w, h, level, still: true, style });
      assert.ok(drawn.s > previous, `level ${level} grows even in the ${w}px preview`);
      assert.equal(Number.isInteger(drawn.s), true);
      assert.equal(ctx.imageSmoothingEnabled, false);
      assert.equal(ctx.images[0][0], spriteCanvas(bug, style, level), 'body and accessories use the correctly staged cached image');
      floor ??= drawn.oy + drawn.s; shadow ??= ctx.shadows[0][1];
      assert.equal(drawn.oy + drawn.s, floor);
      assert.equal(ctx.shadows[0][1], shadow);
      previous = drawn.s;
    }
    const adult = drawBug(context(), bug, { w, h, level: 10, still: true, style });
    assert.equal(adult.s, Math.max(1, Math.floor(Math.min(w, h) * 0.82 / 64)) * 64, 'adult keeps the previous maximum size');
  }
});

test('room pets use the same level growth and stay grounded, while eggs and graves keep their size', t => {
  mockCanvas(t);
  const scene = { furniture: { pet: { x: 2, z: -1 } }, dynamic: new THREE.Group() };
  let floor;
  for (let level = 1; level <= 10; level++) {
    RoomScene.prototype.pet.call(scene, { stage: 'creature', species: ROSTER[0].id, level });
    const sprite = scene.dynamic.children.at(-1);
    assert.ok(Math.abs(sprite.scale.x - 0.95 * bugScale(level)) < 1e-12);
    assert.equal(sprite.scale.x, sprite.scale.y);
    assert.equal(sprite.position.x, 2); assert.equal(sprite.position.z, -1);
    const bottom = sprite.position.y - sprite.scale.y / 2;
    floor ??= bottom; assert.ok(Math.abs(bottom - floor) < 1e-12);
    assert.equal(sprite.material.map.magFilter, THREE.NearestFilter);
    assert.equal(sprite.material.map.image, spriteCanvas(ROSTER[0], undefined, level), 'room texture follows the same larval transition');
  }
  for (const stage of ['egg', 'dead']) {
    RoomScene.prototype.pet.call(scene, { stage, level: 1 });
    const sprite = scene.dynamic.children.at(-1);
    assert.deepEqual(sprite.scale.toArray(), [0.95, 0.95, 1]);
    assert.deepEqual(sprite.position.toArray(), [2, 1.56, -1]);
  }
  scene.dynamic.children.forEach(sprite => { sprite.material.map.dispose(); sprite.material.dispose(); });
});
