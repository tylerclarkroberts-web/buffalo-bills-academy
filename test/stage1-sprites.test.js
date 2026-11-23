import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { BY_ID, ROSTER } from '../server/engine/creatures.js';
import {
  ALL_STAGE1_ASSETS, STAGE1_ARCHETYPES, STAGE1_EGG_SRC,
  hasStage1Egg, stage1ArchetypeOf, stage1Meta, tintImageData,
} from '../client/src/barn/stage1Art.js';
import {
  bugTexture, isHiResSprite, onSpriteReady, spriteCanvas, youngForm,
} from '../client/src/barn/sprite.js';

const INSECTS = ROSTER.filter((b) => b.look?.kind !== 'photo');

function context() {
  return {
    images: [], pixels: [], shadows: [],
    save() {}, restore() {}, clearRect() {},
    beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
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

test('all 55 species map to a Stage I archetype and support adult + young larva forms, while photo cameos opt out', () => {
  assert.equal(INSECTS.length, 55);
  const full = new Set([
    ...STAGE1_ARCHETYPES.map((a) => `stage1-${a}`),
    'stage1-grub',
    'stage1-egg',
  ]);
  for (const bug of INSECTS) {
    const arch = stage1ArchetypeOf(bug);
    assert.ok(STAGE1_ARCHETYPES.includes(arch), `${bug.id} -> ${arch}`);
    const adult = stage1Meta(bug, undefined, full);
    assert.equal(adult.key, `stage1-${arch}`);
    assert.equal(adult.src, `/barn/stage1/stage1-${arch}.webp`);
    assert.equal(adult.young, false);

    const young = youngForm(bug, 1);
    const lv1 = stage1Meta(bug, young, full);
    if (young) {
      assert.equal(lv1.key, 'stage1-grub');
      assert.equal(lv1.young, true);
    } else {
      assert.equal(lv1.key, `stage1-${arch}`);
    }
  }
  assert.equal(stage1ArchetypeOf(BY_ID.dryococelus), 'mantis');
  assert.equal(stage1ArchetypeOf(BY_ID.steeze), null);
  assert.equal(stage1Meta(BY_ID.steeze, undefined, full), null);
  assert.equal(isHiResSprite(BY_ID.steeze, null, 5), false);
});

test('stage1Meta fallback chain maps omitted weevil/larva cleanly to beetle/grub', () => {
  const coreOnly = new Set(['stage1-beetle', 'stage1-grub', 'stage1-egg']);
  const weevil = ROSTER.find((b) => b.look?.kind === 'weevil');
  const larva = ROSTER.find((b) => b.look?.kind === 'larva');
  assert.ok(weevil && larva);
  assert.equal(stage1Meta(weevil, undefined, coreOnly).key, 'stage1-beetle');
  assert.equal(stage1Meta(larva, undefined, coreOnly).key, 'stage1-grub');
  assert.equal(stage1Meta(weevil, undefined, new Set()).src, null);
  assert.equal(hasStage1Egg(coreOnly), true);
  assert.equal(hasStage1Egg(new Set()), false);
});

test('tintImageData preserves alpha, tints species & skins distinctly, and maps amber markings to accent', () => {
  const sample = () => new Uint8ClampedArray([
    0, 0, 0, 0,         // transparent background
    18, 18, 20, 255,    // dark obsidian eye
    150, 150, 154, 255, // neutral pewter mid-chitin
    235, 236, 240, 255, // bright chitin facet highlight
    220, 158, 36, 255,  // high-chroma warm amber dorsal marking
    210, 212, 218, 140, // translucent wing pane
  ]);
  const emerald = ['#082414', '#106a30', '#22b855', '#76ef9a', '#ff3b9a'];
  const ruby = ['#1a0606', '#6a1020', '#b02030', '#f05060', '#ffd0d0'];
  const a = tintImageData(sample(), emerald);
  const b = tintImageData(sample(), ruby);

  // Alpha preserved verbatim across every pixel
  assert.deepEqual([a[3], a[7], a[11], a[15], a[19], a[23]], [0, 255, 255, 255, 255, 140]);
  // Transparent RGB untouched
  assert.deepEqual([...a.slice(0, 3)], [0, 0, 0]);
  // Eye stays dark near outline
  assert.ok(a[4] < 45 && a[5] < 65 && a[6] < 45);
  // Neutral mid-chitin separates distinctly between Emerald species & Ruby skin
  assert.ok(a[9] > a[8] && a[9] > a[10], 'emerald tints neutral chitin green');
  assert.ok(b[8] > b[9] && b[8] > b[10], 'ruby tints neutral chitin red');
  // Warm amber markings shift toward emerald palette 5th accent (#ff3b9a: strong red & blue vs green)
  assert.ok(a[16] > a[17] && a[18] > a[17], `amber shifted toward pink/magenta accent: [${a[16]},${a[17]},${a[18]}]`);
  // Highlight stays brighter than mid-chitin
  assert.ok(a[12] + a[13] + a[14] > a[8] + a[9] + a[10]);
});

test('all 55 species resolve to enabled WebP assets at levels 1 and 10', () => {
  assert.ok(ALL_STAGE1_ASSETS.length >= 9);
  assert.equal(hasStage1Egg(), true);
  const root = path.resolve(import.meta.dirname, '..');
  for (const asset of ALL_STAGE1_ASSETS) {
    const file = path.join(root, 'client/public', asset.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `missing ${file}`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 5000, `${asset} too small (${buf.length} bytes)`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP');
  }
  assert.equal(STAGE1_EGG_SRC, '/barn/stage1/stage1-egg.webp');
  assert.ok(ALL_STAGE1_ASSETS.includes(STAGE1_EGG_SRC));
  for (const bug of INSECTS) for (const level of [1, 10]) {
    const { src } = stage1Meta(bug, youngForm(bug, level));
    assert.ok(src && ALL_STAGE1_ASSETS.includes(src), `${bug.id}/${level} resolves to a validated WebP`);
  }
});

test('spriteCanvas and bugTexture upgrade asynchronously once WebP loads and clean up on dispose', (t) => {
  mockCanvas(t);
  const oldImage = globalThis.Image;
  const instances = [];
  globalThis.Image = class FakeImage {
    constructor() { instances.push(this); }
  };
  t.after(() => {
    if (oldImage === undefined) delete globalThis.Image; else globalThis.Image = oldImage;
  });

  const beetle = ROSTER.find((b) => stage1ArchetypeOf(b) === 'beetle');
  const style = { bugskin: { id: 'stage1-async-test', pal: ['#100400', '#3a0a04', '#8a1a08', '#ff5a10', '#ffd040'] } };
  assert.equal(isHiResSprite(beetle, style, 10), true);
  assert.equal(isHiResSprite(beetle, { ...style, evo: 1 }, 10), true);
  assert.equal(isHiResSprite(BY_ID.steeze, { evo: 1 }, 10), false);

  const canvas = spriteCanvas(beetle, style, 10, 2);
  assert.equal(canvas.width, 512);
  assert.equal(canvas._rev, 0);

  const tex = bugTexture(THREE, beetle, style, 10);
  assert.equal(tex.magFilter, THREE.LinearFilter);
  assert.equal(tex.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(tex.generateMipmaps, true);
  const beforeVer = tex.version;

  let readyCount = 0;
  const unsub = onSpriteReady((ready) => { if (ready === canvas) readyCount++; });
  t.after(unsub);

  const pending = instances.find((im) => im.src === '/barn/stage1/stage1-beetle.webp');
  assert.ok(pending, 'the enabled beetle sprite starts loading');
  pending.onload();
  assert.ok(canvas._hiRes);
  assert.equal(canvas._rev, 1);
  assert.equal(readyCount, 1);
  assert.ok(tex.version > beforeVer);

  tex.dispose();
  const verAfterDispose = tex.version;
  // Second bug with same asset key gets synchronous paint without firing a duplicate spurious bump on old tex
  const beetle2 = ROSTER.find((b) => b.id !== beetle.id && stage1ArchetypeOf(b) === 'beetle');
  if (beetle2) {
    const c2 = spriteCanvas(beetle2, style, 10, 2);
    assert.ok(c2._hiRes);
  }
  assert.equal(tex.version, verAfterDispose);
});
