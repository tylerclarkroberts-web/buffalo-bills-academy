// v89: the nine mine dances: one shared list for server and page, and every move draws finite, bounded poses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DANCES, DANCE_IDS, danceId } from '../server/engine/dances.js';
import { danceStep, resetPose, MOVE_IDS } from '../client/src/mines/dance.js';

const joint = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
const rig = () => ({ body: joint(), upper: joint(), head: joint(), armL: joint(), armR: joint(), legL: joint(), legR: joint() });

test('nine dances, unique ids, names and lines; the page draws exactly those', () => {
  assert.equal(DANCES.length, 9);
  assert.equal(new Set(DANCE_IDS).size, 9);
  for (const d of DANCES) { assert.match(d.id, /^[a-z]+$/); assert.ok(d.name && d.icon && d.line); }
  assert.deepEqual(MOVE_IDS, DANCE_IDS);
  for (const name of ['Hip Thrust', 'Tuk Tuk', 'The Robot', 'Sprinkler', 'Disco Point', 'Running Man', 'The Swing', 'Floor Spin', 'Boot Scoot']) assert.ok(DANCES.some((d) => d.name === name), name);
});

test('danceId passes known ids only', () => {
  for (const id of DANCE_IDS) assert.equal(danceId(id), id);
  for (const bad of [null, undefined, '', 'ROBOT', 'moonwalk', 'toString', '__proto__', 3, {}, ['robot']]) assert.equal(danceId(bad), null);
});

test('every dance moves, stays finite, keeps feet near the floor; reduced motion is smaller and never spins', () => {
  for (const id of DANCE_IDS) {
    const m = rig(), r = rig(); let moved = 0, big = 0, small = 0;
    for (let t = 0; t < 12; t += 1 / 30) {
      assert.equal(danceStep(m, id, t), true);
      danceStep(r, id, t, { reduce: true });
      for (const j of Object.values(m)) for (const v of [...Object.values(j.position), ...Object.values(j.rotation)]) { assert.ok(Number.isFinite(v)); moved += Math.abs(v); }
      assert.ok(Math.abs(m.body.position.y) < 0.3 && Math.hypot(m.body.position.x, m.body.position.z) < (id === 'spin' ? 1 : .3), `${id} stays put`);
      big += Math.abs(m.armL.rotation.x) + Math.abs(m.armR.rotation.z) + Math.abs(m.legL.rotation.x);
      small += Math.abs(r.armL.rotation.x) + Math.abs(r.armR.rotation.z) + Math.abs(r.legL.rotation.x);
      assert.equal(r.body.rotation.y, 0, `${id}: no spinning with reduced motion`);
      assert.equal(r.body.rotation.z, 0, `${id}: no flipping over with reduced motion`);
    }
    assert.ok(moved > 1, `${id} moves`);
    assert.ok(small <= big, `${id} reduced is smaller`);
  }
});

test('an unknown dance leaves the miner standing at rest', () => {
  const m = rig(); danceStep(m, 'robot', 1.3); assert.equal(danceStep(m, 'nope', 1), false);
  for (const j of Object.values(m)) { assert.deepEqual(j.rotation, { x: 0, y: 0, z: 0 }); }
  resetPose(m); assert.deepEqual(m.body.position, { x: 0, y: 0, z: 0 });
});
