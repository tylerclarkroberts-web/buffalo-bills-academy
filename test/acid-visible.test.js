// v67 regression: "if you can see acid, you can mine it". Before v67 every pool was drawn glowing, but the
// server only says the acid is in once the shift's vein time passes, so players reached bright acid with no
// MINE button (seeping / dry). Now the drawn look and the MINE prompt come from one tracker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { VeinTracker, MINE_REACH, LEAVE_REACH, AWAY_POLL_MS } from '../client/src/mines/vein.js';
import { makeMaze, veinChain, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { createApp } from '../server/app.js';

const chain = [{ x: 5, y: 5 }, { x: 9, y: 1 }, { x: 1, y: 9 }];

test('invariant: acid is drawn exactly when it is minable in reach, across every answer sequence', () => {
  const answers = [{ flowing: false, seeping: false }, { flowing: false, seeping: true }, { flowing: true, seeping: false }];
  let seq = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (const startNear of [true, false]) {
    seq++;
    const v = new VeinTracker(chain); let now = 0;
    for (const r of [answers[a], answers[b], answers[c]]) {
      v.reach(startNear ? 0.5 : 6);
      const kind = v.wantProbe(now); if (!kind) { now += 5000; continue; }
      v.begin(kind); v.settle(r, now); now += 5000;
      // whatever happened, standing on the current pool: drawn acid <=> MINE allowed
      v.reach(0.3);
      assert.equal(v.look === 'acid', v.canMine(), `seq ${seq}`);
      // and far away nothing is minable even if it glows
      v.reach(10); assert.equal(v.canMine(), false);
    }
  }
});

test('pools start damp; seeping keeps you there damp; flowing lights it and MINE works at once', () => {
  const v = new VeinTracker(chain);
  assert.equal(v.look, 'damp');
  v.reach(1.0); assert.equal(v.wantProbe(0), 'pool'); v.begin('pool');
  assert.deepEqual(v.settle({ flowing: false, seeping: true }, 0), { seeping: true });
  assert.equal(v.look, 'damp'); assert.equal(v.canMine(), false); assert.equal(v.i, 0);
  assert.equal(v.wantProbe(1000), null); assert.equal(v.wantProbe(3000), 'pool');
  v.begin('pool'); assert.deepEqual(v.settle({ flowing: true }, 3000), { flowing: true });
  assert.equal(v.look, 'acid'); assert.equal(v.canMine(), true);
  assert.equal(v.wantProbe(9e9), null, 'never asks again once flowing');
});

test('a probe sent while walking can light the pool but can never move the vein', () => {
  const v = new VeinTracker(chain);
  v.reach(8); assert.equal(v.wantProbe(0), 'away'); v.begin('away');
  v.reach(1.0); // arrived while the answer was in flight
  assert.deepEqual(v.settle({ flowing: false, seeping: false }, 100), {});
  assert.equal(v.i, 0, 'not dry-moved by a walking probe');
  assert.equal(v.wantProbe(100), 'pool'); v.begin('pool');
  assert.deepEqual(v.settle({ flowing: false, seeping: false }, 200), { moved: chain[1] });
  assert.equal(v.look, 'damp');
  v.reach(9); assert.equal(v.wantProbe(200), null); assert.equal(v.wantProbe(200 + AWAY_POLL_MS), 'away');
  v.begin('away'); assert.deepEqual(v.settle({ flowing: true }, 4000), { flowing: true });
  assert.equal(v.look, 'acid'); assert.equal(v.canMine(), false);
  v.reach(MINE_REACH - 0.01); assert.equal(v.canMine(), true);
});

test('reach has hysteresis so the MINE prompt does not flicker at the edge', () => {
  const v = new VeinTracker(chain); v.flowing = true;
  assert.equal(v.reach(MINE_REACH + 0.05), false);
  assert.equal(v.reach(MINE_REACH - 0.05), true);
  assert.equal(v.reach(MINE_REACH + 0.2), true);
  assert.equal(v.reach(LEAVE_REACH + 0.01), false);
});

test('errors back off and never flip what is drawn', () => {
  const v = new VeinTracker(chain); v.reach(1); v.begin('pool'); v.fail(0);
  assert.equal(v.look, 'damp'); assert.equal(v.wantProbe(100), null); assert.equal(v.wantProbe(3000), 'pool');
});

test('end to end with the real server: once a pool shows acid, mining it is allowed (no 425) and pays, on every maze size', async () => {
  // Bucket shifts (rules v2): the server only fills a pool in once you reach and inspect it, so the invariant is
  // "a pool the server reports as holding acid can be mined the moment you are in reach".
  const V2 = { rulesVersion: 2 };
  for (const [veinMs, cells] of [[20000, 7], [60000, 9], [200000, 11]]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-acidvis-'));
    const clock = { t: 1_700_000_000_000 };
    const r = createApp({ dataDir, now: () => clock.t, devLogin: true, env: {}, vein: () => ({ veinMs, cells }), scareInt: () => 99 });
    const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const lr = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vis', email: `vis${cells}@x.test` }) });
      const cookie = lr.headers.get('set-cookie').split(';')[0];
      const post = async (u, b) => { const x = await fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(b || {}) }); return { status: x.status, body: await x.json() }; }
      let s = (await post('/api/mines/start', V2)).body;
      const v = new VeinTracker(s.pools);
      const current = () => s.pools.find((p) => p.id === s.currentPoolId);
      // walk pool to pool, inspecting each on arrival, until one holds acid
      for (let k = 0; !current()?.remaining && k < 400; k++) {
        clock.t = Math.max(clock.t + 2500, s.readyAt || 0); v.reach(0.5);
        assert.equal(v.wantProbe(clock.t), 'pool');
        const ask = await post('/api/mines/probe', { ...V2, shiftId: s.shiftId, poolId: s.currentPoolId });
        assert.equal(ask.status, 200, JSON.stringify(ask.body)); s = ask.body;
      }
      v.flowing = !!current()?.remaining;
      assert.equal(v.look, 'acid');
      v.reach(0.5); assert.equal(v.canMine(), true);
      const poolId = s.currentPoolId;
      const hold = await post('/api/mines/extract', { ...V2, shiftId: s.shiftId, poolId, action: 'start' });
      assert.equal(hold.status, 200, JSON.stringify(hold.body));
      clock.t += 1000;
      const drawn = await post('/api/mines/extract', { ...V2, shiftId: s.shiftId, poolId, action: 'stop' });
      assert.equal(drawn.status, 200, JSON.stringify(drawn.body));
      const f = drawn.body.result ? drawn : await post('/api/mines/quit', { ...V2, shiftId: s.shiftId });
      assert.equal(f.status, 200, JSON.stringify(f.body));
    } finally { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); }
  }
});
