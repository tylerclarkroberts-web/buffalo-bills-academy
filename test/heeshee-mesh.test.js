import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeeshee, poseHeeshee } from '../client/src/mines/heesheeMesh.js';

test('the Heeshee is a compact original mesh: hunched body, feathered eye sockets, phone budget', () => {
  const model = buildHeeshee();
  for (const key of ['head', 'torso', 'hips', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'leftEye', 'rightEye', 'leftTuft', 'rightTuft']) {
    assert.ok(model[key], key);
  }
  assert.equal(model.group.visible, false);
  let meshes = 0, triangles = 0;
  model.group.traverse((part) => {
    if (!part.isMesh) return;
    meshes++;
    triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    for (const attribute of ['position', 'normal']) assert.ok([...part.geometry.attributes[attribute].array].every(Number.isFinite));
  });
  assert.ok(meshes <= 36, `${meshes} meshes`);
  assert.ok(triangles < 4000, `${triangles} triangles`);
  const names = []; model.group.traverse((o) => { if (o.name) names.push(o.name); });
  assert.ok(names.includes('heeshee-left-eye') && names.includes('heeshee-right-eye'));
});

test('posing opens the feather tufts, lunges the arms, and leaves the root facing alone', () => {
  const model = buildHeeshee();
  model.group.rotation.y = 1.1; model.group.position.set(3, 0, 4);
  poseHeeshee(model, 0, { fan: 0, lunge: 0, moving: false, reduce: true });
  const closed = model.leftTuft.scale.z;
  const arm0 = model.leftArm.rotation.x;
  poseHeeshee(model, 400, { fan: 1, snap: 1, lunge: 1, moving: true, reduce: false });
  assert.ok(model.leftTuft.scale.z > closed, 'tufts fan open');
  assert.ok(model.leftArm.rotation.x < arm0, 'arms uncoil on the lunge');
  assert.equal(model.group.rotation.y, 1.1);
  assert.equal(model.group.position.x, 3);
});
