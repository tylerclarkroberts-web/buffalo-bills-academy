import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { BY_ID, ROSTER } from '../server/engine/creatures.js';
import {
  ALL_EVO_ASSETS, STAGE2_ARCHETYPES, STAGE3_CULTURES, SPECIES_CULTURE,
  evolutionMeta, stage2ArchetypeOf, stage3CultureOf,
} from '../client/src/barn/evolutionArt.js';
import {
  EVO_COARSE, EVO_FINE, FINE, SPRITE,
  bugTexture, isHiResEvo, onSpriteReady, spriteCanvas, spriteGrid,
} from '../client/src/barn/sprite.js';

const INSECTS = ROSTER.filter((b) => b.look?.kind !== 'photo');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

function isValidWebp(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.length > 100 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

function mockCanvas(t) {
  const calls = [];
  const context = (canvas) => new Proxy({ pixels: [], calls }, {
    get: (o, k) => (k in o ? o[k] : k === 'clearRect' ? (...a) => calls.push(['clearRect', canvas, ...a])
      : k === 'drawImage' ? (...a) => calls.push(['drawImage', canvas, ...a])
        : k === 'fillRect' ? (...a) => o.pixels.push(a) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; this.ctx = context(this); }
    getContext() { return this.ctx; }
  }
  const oldOffscreen = globalThis.OffscreenCanvas;
  const oldDoc = globalThis.document;
  globalThis.OffscreenCanvas = Canvas;
  globalThis.document = { createElement: () => new Canvas(0, 0) };
  t.after(() => {
    if (oldOffscreen === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = oldOffscreen;
    if (oldDoc === undefined) delete globalThis.document; else globalThis.document = oldDoc;
  });
  return calls;
}

test('every insect species maps to a valid Stage II archetype and Stage III culture, and all cultures are used', () => {
  const usedCultures = new Set();
  const usedArchetypes = new Set();
  assert.equal(Object.keys(SPECIES_CULTURE).length, INSECTS.length, 'SPECIES_CULTURE covers every insect species');
  for (const bug of INSECTS) {
    assert.ok(SPECIES_CULTURE[bug.id], `${bug.id} has an explicit Stage III culture`);
    const culture = stage3CultureOf(bug);
    assert.ok(STAGE3_CULTURES[culture], `${bug.id} culture ${culture} exists in STAGE3_CULTURES`);
    usedCultures.add(culture);
    const arch = stage2ArchetypeOf(bug);
    assert.ok(STAGE2_ARCHETYPES.includes(arch), `${bug.id} archetype ${arch} is valid`);
    usedArchetypes.add(arch);
  }
  assert.equal(stage2ArchetypeOf(BY_ID.dryococelus), 'mantis');
  assert.equal(evolutionMeta(BY_ID.steeze, 1, false), null);
  assert.equal(isHiResEvo(BY_ID.steeze, { evo: 1 }), false);
  assert.deepEqual([...usedCultures].sort(), Object.keys(STAGE3_CULTURES).sort(), 'every Stage III culture is represented');
  assert.deepEqual([...usedArchetypes].sort(), [...STAGE2_ARCHETYPES].sort(), 'every Stage II archetype is represented');
});

test('all evolved sprite and Bug Center story panel WebP assets exist and are valid WebP files', () => {
  assert.equal(ALL_EVO_ASSETS.length, 25);
  for (const url of ALL_EVO_ASSETS) {
    const filePath = path.join(ROOT, 'client/public', url);
    assert.ok(fs.existsSync(filePath), `missing asset ${url}`);
    assert.ok(isValidWebp(filePath), `invalid WebP header for ${url}`);
  }
  for (let i = 1; i <= 4; i++) {
    const panelPath = path.join(ROOT, `client/public/bugcenter/evo-${i}.webp`);
    assert.ok(fs.existsSync(panelPath), `missing Bug Center panel evo-${i}.webp`);
    assert.ok(isValidWebp(panelPath), `invalid WebP header for evo-${i}.webp`);
  }
});

test('evolutionMeta resolves distinct Stage III cultures, all nine Stage II archetypes, and high-res botched sprites', () => {
  assert.equal(evolutionMeta(ROSTER[0], 0, false), null);
  const s2 = evolutionMeta(ROSTER[0], 1, false);
  assert.equal(s2.key, 'stage2-beetle');
  assert.equal(s2.src, '/barn/evo/stage2-beetle.webp');
  assert.equal(s2.culture, null);

  const expectedStage2 = [
    ['ceroplophana', 'stage2-beetle', '/barn/evo/stage2-beetle.webp'],
    ['pseudocreobotra', 'stage2-mantis', '/barn/evo/stage2-mantis.webp'],
    ['gromphadorhina', 'stage2-crawler', '/barn/evo/stage2-crawler.webp'],
    ['meganeura', 'stage2-flier', '/barn/evo/stage2-flier.webp'],
    ['ampulex', 'stage2-flier', '/barn/evo/stage2-flier.webp'],
    ['lethocerus', 'stage2-aquatic', '/barn/evo/stage2-aquatic.webp'],
    ['dytiscus', 'stage2-aquatic', '/barn/evo/stage2-aquatic.webp'],
    ['bocydium', 'stage2-hopper', '/barn/evo/stage2-hopper.webp'],
    ['gryllotalpa', 'stage2-hopper', '/barn/evo/stage2-hopper.webp'],
    ['trachelophorus', 'stage2-weevil', '/barn/evo/stage2-weevil.webp'],
    ['brachinus', 'stage2-shield', '/barn/evo/stage2-shield.webp'],
    ['sphaerocoris', 'stage2-shield', '/barn/evo/stage2-shield.webp'],
    ['phrixothrix', 'stage2-larva', '/barn/evo/stage2-larva.webp'],
  ];
  for (const [id, key, src] of expectedStage2) {
    const bug = ROSTER.find((b) => b.id === id);
    const meta = evolutionMeta(bug, 1, false);
    assert.equal(meta.key, key, `${id} Stage II key`);
    assert.equal(meta.src, src, `${id} Stage II src`);
  }

  const expectedCultures = [
    ['ceroplophana', 'Thai'],
    ['phanaeus', 'Mexican'],
    ['brachinus', 'Bavarian'],
    ['photuris', 'Bayou'],
    ['pyrops', 'Chinese'],
    ['gromphadorhina', 'Appalachian'],
    ['chrysochroa', 'Japanese'],
    ['onymacris', 'Egyptian'],
    ['acanthaspis', 'Maasai'],
    ['dytiscus', 'Norse'],
    ['lamprima', 'Outback'],
    ['arachnocampa', 'Polynesian'],
  ];
  for (const [id, label] of expectedCultures) {
    const bug = ROSTER.find((b) => b.id === id);
    assert.equal(evolutionMeta(bug, 2, false).cultureLabel, label, `${id} resolves to ${label}`);
  }

  const sampleBug = ROSTER[0];
  const botched2 = evolutionMeta(sampleBug, 1, true);
  assert.equal(botched2.botched, true);
  assert.equal(botched2.src, '/barn/evo/botched-stage2.webp');
  const botched3 = evolutionMeta(sampleBug, 2, true);
  assert.equal(botched3.botched, true);
  assert.equal(botched3.src, '/barn/evo/botched-stage3.webp');
  assert.equal(isHiResEvo(sampleBug, null), false);
  assert.equal(isHiResEvo(sampleBug, { evo: 0 }), false);
  assert.equal(isHiResEvo(sampleBug, { evo: 1, botched: 'lazy' }), true);
  assert.equal(isHiResEvo(sampleBug, { evo: 2, botched: 'berserk' }), true);
  assert.equal(isHiResEvo(sampleBug, { evo: 1 }), true);
  assert.equal(isHiResEvo(sampleBug, { evo: 2 }), true);
});

test('Stage I and evolved WebPs upgrade async and refresh Three textures while spriteGrid stays 64x64', (t) => {
  const calls = mockCanvas(t);
  const oldImage = globalThis.Image;
  const created = [];
  globalThis.Image = class FakeImage {
    set src(v) { this._src = v; created.push(this); }
    get src() { return this._src; }
  };
  t.after(() => {
    if (oldImage === undefined) delete globalThis.Image; else globalThis.Image = oldImage;
  });

  const bug = ROSTER[0];
  const s1 = spriteCanvas(bug, null, 10, 1);
  assert.deepEqual([s1.width, s1.height], [EVO_COARSE, EVO_COARSE]);
  assert.equal(spriteGrid(bug, 10).length, SPRITE);

  // Use a unique bugskin id so cache key is fresh for this mocked Image test
  const style = { evo: 2, bugskin: { id: 'test-async-upgrade-skin', pal: ['#111111', '#333333', '#666666', '#999999', '#cc3333'] } };
  const s3Coarse = spriteCanvas(bug, style, 10, 1);
  assert.deepEqual([s3Coarse.width, s3Coarse.height], [EVO_COARSE, EVO_COARSE]);
  assert.equal(s3Coarse._hiRes, false);
  assert.equal(s3Coarse._rev, 0);

  const map = bugTexture(THREE, bug, style, 10);
  const s3Fine = map.image;
  assert.deepEqual([s3Fine.width, s3Fine.height], [EVO_FINE, EVO_FINE]);
  assert.equal(map.magFilter, THREE.LinearFilter);
  assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(map.generateMipmaps, true);

  const readySeen = [];
  const unsub = onSpriteReady((c) => readySeen.push(c));
  t.after(unsub);

  // Both fine & coarse requested the same URL, deduplicated into one Image load
  const evoUrl = evolutionMeta(bug, 2, false).src;
  const evoCreated = created.filter((im) => im.src === evoUrl);
  assert.equal(evoCreated.length, 1);
  evoCreated[0].onload();

  assert.equal(s3Coarse._hiRes, true);
  assert.equal(s3Fine._hiRes, true);
  assert.equal(s3Fine._rev, 1);
  assert.ok(readySeen.includes(s3Fine));
  assert.ok(readySeen.includes(s3Coarse));
  assert.ok(calls.some((c) => c[0] === 'drawImage' && c[1] === s3Fine && c[2] === evoCreated[0]));

  // Three.js texture marks needsUpdate on async upgrade and stops once disposed
  const beforeVer = map.version;
  map.needsUpdate = true; // increments version internally in Three.js
  assert.ok(map.version > beforeVer);
  const afterVer = map.version;
  map.dispose();
  // Subsequent cache miss with another skin should still work without crashing disposed texture
  const style2 = { evo: 2, bugskin: { id: 'test-async-upgrade-skin-2', pal: ['#111111', '#333333', '#666666', '#999999', '#cc3333'] } };
  const s3Other = spriteCanvas(bug, style2, 10, FINE);
  assert.equal(s3Other._hiRes, true, 'subsequent sprite using cached Image upgrades synchronously');
  assert.equal(map.version, afterVer);
});
