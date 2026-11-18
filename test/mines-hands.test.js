import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMineHands, resizeMineHands, stepMineHands } from '../client/src/mines/hands.js';
import { MineScene } from '../client/src/mines/scene.js';
import { looks } from '../client/src/avatar/genbust.js';

const pose = h => [...h.grip.position.toArray(), h.grip.rotation.x, h.grip.rotation.y, h.grip.rotation.z];

test('first person shows the pickaxe alone: no arms, no skin, and the body stays hidden', () => {
  const mine = Object.assign(Object.create(MineScene.prototype), { scene: new THREE.Scene(), camera: { aspect: 1.6 } });
  mine.setSelf({ id: 'player-account', avatar: { kind: 'gen', seed: 'saved-avatar-79' } });
  const skin = looks('saved-avatar-79').skin, meshes = [];
  mine.hands.group.traverse(part => { if (part.isMesh) meshes.push(part); });
  assert.ok(meshes.length && meshes.every(m => m.parent === mine.hands.pickaxe), 'every mesh belongs to the pick');
  assert.ok(meshes.every(m => `#${m.material.color.getHexString()}` !== skin));
  assert.equal(mine.self.group.visible, false, 'full body stays hidden in first person');
});

test('walking follows travelled distance, settles at rest, and mining swings the pickaxe', () => {
  const hands = buildMineHands('miner'), rest = pose(hands);
  for (let i = 0; i < 10; i++) stepMineHands(hands, .05);
  assert.deepEqual(pose(hands), rest, 'waiting or pushing against a wall never starts a walking cycle');
  for (let i = 0; i < 10; i++) stepMineHands(hands, .05, { distance: .18 });
  assert.notDeepEqual(pose(hands), rest);
  const walked = hands.walk;
  for (let i = 0; i < 80; i++) stepMineHands(hands, .05);
  assert.equal(hands.walk, walked, 'stopped feet stop advancing the arm swing');
  pose(hands).forEach((v, i) => assert.ok(Math.abs(v - rest[i]) < 1e-8, 'the pick eases back to its resting pose'));
  stepMineHands(hands, .05, { mining: true }); const first = hands.grip.rotation.z;
  stepMineHands(hands, .05, { mining: true });
  assert.notEqual(hands.grip.rotation.z, first);
  assert.equal(hands.walk, walked, 'mining is independent of walking');
  stepMineHands(hands, .05);
  assert.equal(hands.grip.rotation.z, .45, 'release ends the pick swing');
});

test('reduced motion holds the resting pose, and dancing hides the pick', () => {
  const hands = buildMineHands('miner'), rest = pose(hands);
  for (let i = 0; i < 20; i++) stepMineHands(hands, .05, { distance: .18, mining: true, reduce: true });
  assert.deepEqual(pose(hands), rest);
  stepMineHands(hands, .05, { hidden: true, mining: true });
  assert.equal(hands.group.visible, false);
  assert.equal(hands.mining, 0);
  stepMineHands(hands, .05);
  assert.equal(hands.group.visible, true);
});

test('the pick stays in view from its resting grip through a forward stroke on desktop and phones', () => {
  const hands = buildMineHands('miner');
  for (const [w, h] of [[1280, 800], [390, 844], [320, 568], [844, 390], [568, 320]]) {
    resizeMineHands(hands, w / h); hands.scene.updateMatrixWorld(true);
    assert.equal(hands.camera.aspect, w / h);
    const blade = hands.pickaxe.getObjectByName('pick-head');
    const vertices = blade.geometry.attributes.position;
    const rest = blade.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, 0));
    for (let frame = 0; frame <= 5; frame++) {
      hands.scene.updateMatrixWorld(true);
      const inView = Array.from({ length: vertices.count }, (_, i) => {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(blade.matrixWorld).project(hands.camera);
        return Math.abs(point.x) < 1 && point.y > -1 && point.y < .5;
      });
      if (frame === 0) assert.ok(inView.every(Boolean), `the whole head shows at rest at ${w}×${h}`);
      else assert.ok(inView.some(Boolean), `the downstroke may dip off the bottom but never loses the head at ${w}×${h}`);
      if (frame < 5) stepMineHands(hands, .05, { mining: true });
    }
    const struck = blade.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, 0));
    assert.ok(struck.z < rest.z && struck.y < rest.y, 'the point strikes forward and down');
    stepMineHands(hands, 0);
    const grip = hands.grip.position.clone().project(hands.camera);
    assert.ok(grip.x > 0 && grip.y < -1, 'the grip, where a hand would be, sits below the right of the screen');
  }
});

test('scene disposal releases the foreground geometry and shared materials once', t => {
  const previousCancel = globalThis.cancelAnimationFrame; globalThis.cancelAnimationFrame = () => {};
  t.after(() => { if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel; });
  const hands = buildMineHands('miner'), counts = new Map();
  hands.scene.traverse(o => {
    for (const resource of [o.geometry, ...[].concat(o.material || [])]) {
      if (!resource || counts.has(resource)) continue;
      counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
    }
  });
  hands.blit.traverse(o => { if (o.isMesh) { counts.set(o.geometry, 0); o.geometry.addEventListener('dispose', () => counts.set(o.geometry, counts.get(o.geometry) + 1)); } });
  counts.set(hands.target, 0); hands.target.addEventListener('dispose', () => counts.set(hands.target, counts.get(hands.target) + 1));
  const mine = Object.assign(Object.create(MineScene.prototype), { scene: new THREE.Scene(), hands, renderer: { dispose() {} } });
  mine.dispose();
  assert.equal(mine.hands, null);
  for (const count of counts.values()) assert.equal(count, 1);
});
