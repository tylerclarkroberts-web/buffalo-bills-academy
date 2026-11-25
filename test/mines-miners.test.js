import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMiner, walkPose, OtherMiners } from '../client/src/mines/miners.js';
import { MineScene } from '../client/src/mines/scene.js';
import { spriteCanvas, TEXTURE_FINE } from '../client/src/barn/sprite.js';
import { danceStep } from '../client/src/mines/dance.js';
import { headParts, looks } from '../client/src/avatar/genbust.js';
import { DANCE_IDS } from '../server/engine/dances.js';
import { ROSTER } from '../server/engine/creatures.js';

const who = (id = 'miner') => ({ id, name: id, avatar: { kind: 'gen', seed: 'redraw-7' }, bug: { species: ROSTER[0].id }, x: 1, y: 1, yaw: .4 });
const JOINTS = ['body', 'upper', 'head', 'armL', 'armR', 'legL', 'legR'];

// Exercise real canvas textures and tags without asserting artwork on a fake renderer.
function canvases(t) {
  const saved = new Map(['document', 'Path2D'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const made = [];
  globalThis.document = { createElement: () => {
    const calls = [], context = new Proxy({ measureText: text => ({ width: String(text).length * 16 }) }, { get: (o, k) => k in o ? o[k] : (...args) => calls.push([k, ...args]) });
    const canvas = { calls, getContext: () => context }; made.push(canvas); return canvas;
  } };
  globalThis.Path2D = class {};
  t.after(() => { for (const [k, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; } });
  return made;
}

function resources(m) {
  const out = new Set();
  m.group.traverse(o => {
    if (o.isMesh) out.add(o.geometry); // Sprite geometry belongs to Three, shared by all name tags.
    for (const material of [].concat(o.material || [])) { out.add(material); if (material.map) out.add(material.map); }
  });
  return out;
}
const dispose = m => { for (const r of resources(m)) r.dispose(); };
test('the floor spin keeps the whole miner inside a centered tunnel tile', () => {
  const m = buildMiner(who());
  for (let t = 0; t < 12; t += 1 / 30) {
    danceStep(m, 'spin', t); m.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(m.body);
    assert.ok(Math.max(-bounds.min.x, bounds.max.x, -bounds.min.z, bounds.max.z) < 1.1, `fits the tunnel at ${t.toFixed(2)}s`);
  }
  dispose(m);
});
const watch = m => {
  const counts = new Map([...resources(m)].map(r => [r, 0]));
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  return n => { for (const count of counts.values()) assert.equal(count, n, 'each owned resource is disposed exactly once'); };
};

test('miners use the chosen avatar seed for exposed skin, hair and shirt colors', () => {
  for (const avatar of [{ kind: 'gen', seed: 'redraw-7' }, { kind: 'gen', seed: 'different-face', skinTone: '#f6dccb' }, undefined]) {
    const m = buildMiner({ id: 'account-id', avatar }), expected = looks(avatar?.seed || 'account-id');
    if (avatar?.skinTone) expected.skin = avatar.skinTone;
    for (const part of ['skin', 'hair', 'shirt']) {
      const material = [...resources(m)].find(r => r.isMaterial && r.name === `miner-${part}`);
      assert.ok(material, `${part} is visible on the model`);
      assert.equal(material.color.getHex(), new THREE.Color(expected[part]).getHex());
    }
    dispose(m);
  }
});

test('a skin tone recolors generated face facets and preserves the saved face and outfit', () => {
  const seeded = headParts('redraw-7'), chosen = headParts('redraw-7', '#6e4429');
  assert.equal(seeded.L.skin, '#e8b48f'); assert.equal(chosen.L.skin, '#6e4429');
  assert.deepEqual(chosen.skin.map(p => p.d), seeded.skin.map(p => p.d));
  assert.notEqual(chosen.skin[0].fill, seeded.skin[0].fill);
  assert.deepEqual(chosen.hair, seeded.hair); assert.deepEqual(chosen.beard, seeded.beard);
  assert.equal(chosen.L.shirt, seeded.L.shirt);
});

test('photo faces show a fallback while loading and ignore late callbacks after disposal', t => {
  const made = canvases(t), images = [], saved = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  globalThis.Image = class { constructor() { images.push(this); } };
  t.after(() => { if (saved) Object.defineProperty(globalThis, 'Image', saved); else delete globalThis.Image; });
  const m = buildMiner({ id: 'photo/one', avatar: { kind: 'photo', v: 3 } });
  const face = m.head.children.find(o => o.material?.map), texture = face.material.map, image = images[0], canvas = made[0];
  assert.equal(texture.image, canvas); assert.equal(image.src, '/api/avatars/photo%2Fone.png?v=3');
  assert.ok(canvas.calls.some(([method]) => method === 'fill'), 'fallback is drawn before the image loads');
  assert.equal(texture.magFilter, THREE.NearestFilter); assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.generateMipmaps, false);
  canvas.calls.length = 0; image.onload();
  assert.equal(canvas.calls[0][0], 'clearRect', 'the photo replaces the generated fallback');
  assert.ok(canvas.calls.some(([method]) => method === 'drawImage'));
  canvas.calls.length = 0; image.onerror();
  assert.equal(canvas.calls[0][0], 'clearRect');
  assert.ok(canvas.calls.some(([method]) => method === 'fill'), 'failed photos keep a generated face');
  const loaded = image.onload, failed = image.onerror;
  dispose(m); canvas.calls.length = 0;
  assert.equal(image.onload, null); assert.equal(image.onerror, null);
  loaded(); failed();
  assert.equal(canvas.calls.length, 0, 'late image callbacks cannot redraw a disposed texture');
});

test('the complete miner stays inside its draw and triangle budget', t => {
  canvases(t);
  const m = buildMiner(who()); let draws = 0, triangles = 0;
  m.group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      draws++;
      triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
      for (const value of o.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    }
  });
  assert.ok(draws <= 35, `${draws} draw calls including name tag and pet`);
  assert.ok(triangles < 3500, `${triangles} triangles`);
  assert.equal(m.tag.parent, m.group); assert.equal(m.pet.parent, m.group);
  for (const name of ['miner-hand-left', 'miner-hand-right', 'miner-boot-left', 'miner-boot-right', 'miner-hardhat']) assert.ok(m.group.getObjectByName(name), name);
  assert.equal(m.lamp.parent, m.head, 'the headlamp follows the head');
  dispose(m);
});

test('all nine dances keep the real rig attached and return cleanly to walking and rest', t => {
  canvases(t);
  const m = buildMiner(who());
  m.group.position.set(3, 0, 5); m.group.rotation.y = .7;
  const rest = new Map();
  m.group.traverse(o => rest.set(o, { parent: o.parent, position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone() }));
  for (const reduce of [false, true]) for (const id of DANCE_IDS) {
    for (let time = 0; time <= 12; time += .4) {
      assert.equal(danceStep(m, id, time, { reduce }), true);
      m.group.updateMatrixWorld(true);
      m.group.traverse(o => {
        assert.equal(o.parent, rest.get(o).parent, `${id}: attachment stays intact`);
        assert.ok(o.matrixWorld.elements.every(Number.isFinite), `${id}: finite world pose`);
      });
      assert.ok(m.tag.position.equals(rest.get(m.tag).position));
      assert.ok(m.pet.position.equals(rest.get(m.pet).position));
      assert.equal(m.group.rotation.y, .7); assert.deepEqual(m.group.position.toArray(), [3, 0, 5]);
    }
    walkPose(m, .8, true, reduce);
    for (const key of JOINTS) {
      assert.equal(m[key].rotation.y, 0, `${id}: walking clears turns`);
      assert.equal(m[key].rotation.z, 0, `${id}: walking clears leaning`);
    }
    walkPose(m, 0, false, reduce);
    m.group.traverse(o => {
      assert.ok(o.position.equals(rest.get(o).position), `${id}: rest position restored`);
      assert.ok(o.rotation.equals(rest.get(o).rotation), `${id}: rest rotation restored`);
      assert.ok(o.scale.equals(rest.get(o).scale), `${id}: scale preserved`);
    });
  }
  dispose(m);
});

test('remote miners update in place, replace changed avatar seeds, and release owned resources once', t => {
  canvases(t);
  const scene = new THREE.Scene(), miners = new OtherMiners(scene), alice = who('alice'), bob = who('bob');
  miners.set([alice, bob]);
  const a = miners.map.get('alice'), b = miners.map.get('bob'), checkA = watch(a), checkB = watch(b);
  let sharedSpriteDisposals = 0;
  const spriteDisposed = () => sharedSpriteDisposals++;
  a.tag.geometry.addEventListener('dispose', spriteDisposed);
  t.after(() => a.tag.geometry.removeEventListener('dispose', spriteDisposed));
  miners.set([{ ...alice, x: 2, dance: 'robot' }, bob]);
  assert.equal(miners.map.get('alice'), a, 'position and dance changes reuse the model');
  miners.update(.05, 100, .2);
  assert.ok(a.x > 2.2 && a.x < 4.4, 'new position is interpolated');
  assert.equal(a.dance, 'robot'); checkA(0); checkB(0);
  miners.set([{ ...alice, avatar: { ...alice.avatar, seed: 'new-face' } }, bob]);
  const replacement = miners.map.get('alice'), checkReplacement = watch(replacement);
  assert.notEqual(replacement, a, 'a different generated seed rebuilds the appearance');
  assert.equal(a.group.parent, null); assert.equal(miners.map.get('bob'), b);
  checkA(1); checkB(0); checkReplacement(0);
  miners.set([{ ...alice, avatar: { ...alice.avatar, seed: 'new-face' } }]);
  checkA(1); checkB(1); checkReplacement(0);
  miners.set([{ ...alice, avatar: { ...alice.avatar, seed: 'new-face', skinTone: '#f6dccb' } }]);
  assert.notEqual(miners.map.get('alice'), replacement, 'changing just the skin tone refreshes a present miner');
  miners.dispose(); miners.dispose(); miners.remove('alice');
  checkA(1); checkB(1); checkReplacement(1);
  assert.equal(miners.map.size, 0); assert.equal(scene.children.length, 0);
  assert.equal(sharedSpriteDisposals, 0, 'removing one tag never disposes geometry shared by other sprites');
});

test('a companion refreshes its sprite when the evolution or botch changes', t => {
  canvases(t);
  const miners = new OtherMiners(new THREE.Scene()), player = who();
  t.after(() => miners.dispose());
  let previous;
  for (const style of [undefined, { evo: 1 }, { evo: 1, botched: 'haywire' }, { evo: 2, botched: 'haywire' }]) {
    const report = { ...player, bug: { ...player.bug, style } };
    miners.set([report]);
    const next = miners.map.get(player.id);
    assert.notEqual(next, previous);
    assert.equal(next.pet.material.map.image, spriteCanvas(ROSTER[0], style, undefined, TEXTURE_FINE));
    miners.set([report]);
    assert.equal(miners.map.get(player.id), next);
    previous = next;
  }
});

test('scene cleanup disposes the self model once and preserves shared name-tag geometry', t => {
  canvases(t);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (saved) Object.defineProperty(globalThis, 'cancelAnimationFrame', saved); else delete globalThis.cancelAnimationFrame; });
  const self = buildMiner(who()), check = watch(self), scene = new THREE.Scene();
  scene.add(self.group);
  let spriteDisposals = 0, rendererDisposals = 0;
  const spriteDisposed = () => spriteDisposals++;
  self.tag.geometry.addEventListener('dispose', spriteDisposed);
  t.after(() => self.tag.geometry.removeEventListener('dispose', spriteDisposed));
  const state = { scene, self, renderer: { dispose: () => rendererDisposals++ } };
  MineScene.prototype.dispose.call(state);
  check(1);
  assert.equal(state.self, null); assert.equal(scene.children.length, 0);
  assert.equal(rendererDisposals, 1); assert.equal(spriteDisposals, 0);
});
