import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPvpClient } from '../client/src/mines/pvpClient.js';

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
