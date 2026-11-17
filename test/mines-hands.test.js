import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMineHands, resizeMineHands, stepMineHands } from '../client/src/mines/hands.js';
import { MineScene } from '../client/src/mines/scene.js';
import { looks } from '../client/src/avatar/genbust.js';

const pose = h => [h.left, h.right].flatMap(arm => [...arm.position.toArray(), arm.rotation.x, arm.rotation.y, arm.rotation.z]);

test('first-person hands use the saved avatar colors rather than rerolling from the account id', () => {
  const mine = Object.assign(Object.create(MineScene.prototype), { scene: new THREE.Scene(), camera: { aspect: 1.6 } });
  mine.setSelf({ id: 'player-account', avatar: { kind: 'gen', seed: 'saved-avatar-79' } });
  const expected = looks('saved-avatar-79'), colors = new Set();
  mine.hands.group.traverse(part => { if (part.material?.color) colors.add(`#${part.material.color.getHexString()}`); });
  assert.ok(colors.has(expected.skin)); assert.ok(colors.has(expected.shirt));
  assert.equal(mine.self.group.visible, false, 'full body stays hidden in first person');
});

test('walking follows travelled distance, settles at rest, and mining moves the right-hand pickaxe', () => {
  const hands = buildMineHands('miner'), rest = pose(hands);
  assert.equal(hands.pickaxe.parent, hands.right);
  for (let i = 0; i < 10; i++) stepMineHands(hands, .05);
  assert.deepEqual(pose(hands), rest, 'waiting or pushing against a wall never starts a walking cycle');
  for (let i = 0; i < 10; i++) stepMineHands(hands, .05, { distance: .18 });
  assert.notDeepEqual(pose(hands), rest);
  const walked = hands.walk;
  for (let i = 0; i < 80; i++) stepMineHands(hands, .05);
  assert.equal(hands.walk, walked, 'stopped feet stop advancing the arm swing');
  pose(hands).forEach((v, i) => assert.ok(Math.abs(v - rest[i]) < 1e-8, 'arms ease back to their resting pose'));
  stepMineHands(hands, .05, { mining: true }); const first = hands.right.rotation.z;
  stepMineHands(hands, .05, { mining: true });
  assert.notEqual(hands.right.rotation.z, first);
  assert.equal(hands.walk, walked, 'mining is independent of walking');
  stepMineHands(hands, .05);
  assert.equal(hands.right.rotation.z, .2, 'release ends the pick swing');
});

test('reduced motion holds the resting pose, and dancing hides the foreground arms', () => {
  const hands = buildMineHands('miner'), rest = pose(hands);
  for (let i = 0; i < 20; i++) stepMineHands(hands, .05, { distance: .18, mining: true, reduce: true });
  assert.deepEqual(pose(hands), rest);
  stepMineHands(hands, .05, { hidden: true, mining: true });
  assert.equal(hands.group.visible, false);
  assert.equal(hands.mining, 0);
  stepMineHands(hands, .05);
  assert.equal(hands.group.visible, true);
});

test('the idle pick fits desktop and narrow/short phone views while keeping the center clear', () => {
  const hands = buildMineHands('miner');
  for (const [w, h] of [[1280, 800], [390, 844], [320, 568], [844, 390], [568, 320]]) {
    resizeMineHands(hands, w / h); hands.scene.updateMatrixWorld(true);
    assert.equal(hands.camera.aspect, w / h);
    const blade = hands.pickaxe.children.find(mesh => mesh.geometry.type === 'ExtrudeGeometry');
    const vertices = blade.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(blade.matrixWorld).project(hands.camera);
      assert.ok(point.x > 0 && point.x < 1 && point.y > -1 && point.y < .5, `pick head fits right side at ${w}×${h}`);
    }
    for (const arm of [hands.left, hands.right]) {
      const wrist = arm.position.clone().project(hands.camera);
      assert.ok(Math.abs(wrist.x) < 1 && wrist.y > -1 && wrist.y < 0, 'both hands sit in the lower view');
    }
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
  const mine = Object.assign(Object.create(MineScene.prototype), { scene: new THREE.Scene(), hands, renderer: { dispose() {} } });
  mine.dispose();
  assert.equal(mine.hands, null);
  for (const count of counts.values()) assert.equal(count, 1);
});
