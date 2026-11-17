import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { VeinTracker, MINE_REACH, LEAVE_REACH, ERROR_RETRY_MS } from '../client/src/mines/vein.js';
import { createApp } from '../server/app.js';

test('arriving at an uninspected pool asks immediately, with no polling while walking or in flight', () => {
  const v = new VeinTracker();
  assert.equal(v.look, 'damp'); assert.equal(v.wantProbe(0), false);
  v.reach(1); assert.equal(v.wantProbe(0), true);
  v.asking = true; assert.equal(v.wantProbe(100), false);
  v.asking = false; v.flowing = true; v.inspected = true;
  assert.equal(v.look, 'acid'); assert.equal(v.canMine(), true);
  assert.equal(v.wantProbe(9e9), false, 'confirmed pools need no repeated inspection');
  v.reach(10); assert.equal(v.canMine(), false);
});

test('a drained final pool does not keep asking for acid to appear', () => {
  const v = new VeinTracker(); v.reach(1); v.inspected = true;
  assert.equal(v.flowing, false); assert.equal(v.canMine(), false);
  assert.equal(v.wantProbe(9e9), false);
  v.inspected = false;
  assert.equal(v.wantProbe(0), true, 'a new target can be inspected immediately');
});

test('reach has hysteresis so the MINE prompt does not flicker at the edge', () => {
  const v = new VeinTracker(); v.flowing = true;
  assert.equal(v.reach(MINE_REACH + 0.05), false);
  assert.equal(v.reach(MINE_REACH - 0.05), true);
  assert.equal(v.reach(MINE_REACH + 0.2), true);
  assert.equal(v.reach(LEAVE_REACH + 0.01), false);
});

test('only failed requests back off; failure never invents acid', () => {
  const v = new VeinTracker(); v.reach(1); v.asking = true; v.fail(0);
  assert.equal(v.look, 'damp'); assert.equal(v.asking, false); assert.equal(v.inspected, false);
  assert.equal(v.wantProbe(ERROR_RETRY_MS - 1), false); assert.equal(v.wantProbe(ERROR_RETRY_MS), true);
});

test('HTTP: immediate inspection permits collection without advancing the shift clock, across maze sizes', async t => {
  const version = { rulesVersion: 2 };
  for (const cells of [7, 9, 11]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-acidvis-'));
    const clock = { now: 1_700_000_000_000 };
    const r = createApp({ dataDir, now: () => clock.now, devLogin: true, env: {}, vein: () => ({ cells }), poolInt: () => 30000, scareInt: n => n - 1 });
    const server = await new Promise(resolve => { const s = r.app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    try {
      const login = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vis', email: `vis${cells}@x.test` }) });
      const cookie = login.headers.get('set-cookie').split(';')[0];
      const post = async (u, body) => { const res = await fetch(base + '/api/mines/' + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ...version, ...body }) }); return { status: res.status, body: await res.json() }; };
      const shift = (await post('start')).body;
      const ids = { shiftId: shift.shiftId, poolId: shift.currentPoolId };
      const uninspected = await post('extract', { ...ids, action: 'start' });
      assert.equal(uninspected.status, 425, 'inspection still confirms server-owned amounts');
      const probe = await post('probe', ids);
      assert.equal(probe.status, 200);
      const pool = probe.body.pools.find(p => p.id === ids.poolId);
      assert.equal(pool.remaining, 50); assert.equal(probe.body.serverNow, shift.startedAt);
      const v = new VeinTracker(); v.flowing = !!pool.remaining; v.inspected = true; v.reach(0.5);
      assert.equal(v.look, 'acid'); assert.equal(v.canMine(), true);
      assert.equal((await post('extract', { ...ids, action: 'start' })).status, 200);
      clock.now += 500;
      const stop = await post('extract', { ...ids, action: 'stop' });
      assert.equal(stop.status, 200); assert.equal(stop.body.collected, 2.5);
      assert.equal((await post('quit', { shiftId: shift.shiftId })).status, 200);
    } finally { r.shutdown(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  }
});
