import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPvpClient, minerHint } from '../client/src/mines/pvpClient.js';

test('nearby miners show the action or protection that applies to the miner in view', () => {
  const grid = [[0, 0, 0, 0, 1, 0]], east = -Math.PI / 2;
  const pose = { x: 1, y: 0, yaw: east };
  const bob = { x: 3, y: 0, yaw: east, name: 'Bob' };
  const hint = (o = {}, view = {}) => minerHint({ others: [{ ...bob, ...o }], ...view }, pose, grid);
  assert.match(hint(), /ASSASSINATE/);
  assert.match(hint({ x: 1.5 }), /STAY BEHIND/, 'wait out a recent sighting when already close');
  assert.match(hint({ yaw: -east }), /FACE TO FACE/);
  assert.match(hint({ shield: 'elevator' }), /BOB HAS ELEVATOR PROTECTION/);
  assert.match(hint({ shield: 'greenhorn' }), /BOB HAS NEW-MINER PROTECTION/);
  assert.match(hint({}, { shield: 'greenhorn' }), /YOU HAVE NEW-MINER PROTECTION/);
  assert.match(hint({ cooling: true }), /TRUCE/);
  assert.match(hint({ x: 5 }), /1 OTHER MINER/, 'no target hints through the rock');
  assert.match(hint({}, { ambush: { id: 'bob' } }), /1 OTHER MINER/, 'the action gets its own prompt');
  assert.equal(hint({}, { others: [] }), '');
});

test('the PvP heartbeat sends one request at a time, says "fresh" once, and skips while paused', async () => {
  const sent = [], views = []; let beat = null, paused = false, release;
  const c = createPvpClient({
    send: (path, body) => { sent.push({ path, body }); return new Promise((r) => { release = () => r({ others: [] }); }); },
    pose: () => ({ x: 1, y: 2, yaw: 0.5 }), onView: (v) => views.push(v), paused: () => paused,
    setTimer: (fn) => { beat = fn; return 1; }, clearTimer: () => { beat = null; },
  });
  beat(); beat();
  assert.equal(sent.length, 1, 'a slow answer skips a beat instead of stacking requests');
  assert.deepEqual(sent[0], { path: '/mines/pvp/tick', body: { x: 1, y: 2, yaw: 0.5, fresh: true } });
  release(); await new Promise((r) => setImmediate(r));
  assert.equal(views.length, 1);
  beat(); assert.equal(sent[1].body.fresh, undefined, 'only the first beat restarts at the elevator');
  release(); await new Promise((r) => setImmediate(r));
  paused = true; beat(); assert.equal(sent.length, 2, 'nothing goes out while paused (the Doom room)');
  paused = false; c.restart(); beat(); assert.equal(sent[2].body.fresh, true);
  c.dispose(); release(); await new Promise((r) => setImmediate(r));
  assert.equal(views.length, 2, 'nothing is delivered after dispose'); assert.equal(beat, null);
});
