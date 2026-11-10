import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoomScene } from '../client/src/room/scene.js';
import { ROOM_ITEMS, defaultFurniture } from '../server/catalog/room.js';

function fixture(t) {
  const before = globalThis.document;
  globalThis.document = { createElement() {
    const text = [], ctx = new Proxy({ fillText: value => text.push(value) }, { get: (target, key) => target[key] ?? (() => {}) });
    return { width: 0, height: 0, text, getContext: () => ctx };
  } };
  t.after(() => { if (before === undefined) delete globalThis.document; else globalThis.document = before; });
  return Object.assign(Object.create(RoomScene.prototype), {
    dynamic: new THREE.Group(), wallMaterial: new THREE.MeshLambertMaterial(), generation: 0,
    cancelPointer() {}, furnishings() {}, pick() {}, pet() {}, resident() {}, wealth() {}, setEditing() {},
  });
}

test('room oddities remain bounded, with the anvil horn inside the floor display', t => {
  const scene = fixture(t);
  for (const item of ROOM_ITEMS.filter(item => item.id !== 'odd-wagon')) {
    scene.update({ shelves: [], placements: [{ anchorId: 'floor', itemId: item.id }] });
    const prop = scene.dynamic.getObjectByName(item.id);
    assert.ok(prop, item.id);
    prop.position.set(0, 0, 0);
    const bounds = new THREE.Box3().setFromObject(prop);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    assert.ok(bounds.min.x >= -0.65 && bounds.max.x <= 0.65, `${item.id} fits its display width`);
    assert.ok(bounds.min.z >= -0.45 && bounds.max.z <= 0.45, `${item.id} fits its display depth`);
    let meshes = 0;
    prop.traverse(object => { if (object.isMesh) meshes++; });
    assert.ok(meshes <= 8, `${item.id} stays inexpensive to draw (${meshes} meshes)`);
  }
  scene.update({ shelves: [], placements: [] }); scene.wallMaterial.dispose();
});

test('certificates and labels use crisp paint textures that are disposed when replaced', t => {
  const scene = fixture(t);
  for (const [id, width, title] of [
    ['odd-deed', 512, 'DEED TO THE MOON'], ['odd-sheriffbadge', 512, 'FISHING LICENCE'],
    ['odd-snakeoil', 256, 'SNAKE OIL'], ['odd-piano', 512, null],
  ]) {
    scene.update({ shelves: [], placements: [{ anchorId: 'floor', itemId: id }] });
    const maps = [];
    scene.dynamic.traverse(object => { if (object.material?.map) maps.push(object.material.map); });
    assert.equal(maps.length, 1, id);
    const map = maps[0];
    assert.equal(map.image.width, width);
    assert.equal(map.magFilter, THREE.LinearFilter);
    assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(map.generateMipmaps, true);
    if (title) assert.ok(map.image.text.includes(title));
    let disposed = 0; map.addEventListener('dispose', () => disposed++);
    scene.update({ shelves: [], placements: [] });
    assert.equal(disposed, 1, `${id} texture is released on replacement`);
  }
  scene.wallMaterial.dispose();
});

test('living room pets retain nearest-neighbor pixel art', t => {
  const scene = fixture(t); scene.furniture = defaultFurniture();
  RoomScene.prototype.pet.call(scene, { stage: 'creature', species: 'ceroplophana', level: 4 });
  const map = scene.dynamic.children.find(object => object.isSprite)?.material.map;
  assert.ok(map);
  assert.equal(map.magFilter, THREE.NearestFilter);
  assert.equal(map.minFilter, THREE.NearestFilter);
  assert.equal(map.generateMipmaps, false);
  scene.update({ shelves: [], placements: [] }); scene.wallMaterial.dispose();
});
