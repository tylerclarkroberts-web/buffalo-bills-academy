import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Barn } from '../server/barn.js';

test('only an empty barn gets the 15% egg roll', () => {
  let roll = 14999, calls = 0;
  const barn = new Barn({
    store: { loadDoc: (key, fallback) => fallback }, now: () => 1,
    eggInt: n => { assert.equal(n, 100000); calls++; return roll; },
  });
  assert.equal(barn.rollEgg('miner'), true);
  roll = 15000;
  assert.equal(barn.rollEgg('miner'), false);
  roll = 0;
  barn.doc.stalls.miner = 1;
  for (const stage of ['egg', 'creature', 'dead']) {
    barn.doc.pens.miner = { stage, eggAt: 1 };
    assert.equal(barn.rollEgg('miner'), false, stage);
  }
  delete barn.doc.pens.miner;
  barn.doc.bench.miner = [{ stage: 'creature', eggAt: 2 }];
  assert.equal(barn.rollEgg('miner'), false, 'a benched bug occupies a stall');
  barn.forceEgg = true;
  assert.equal(barn.rollEgg('miner'), false);
  assert.equal(calls, 2, 'only an empty barn draws a random number');
});

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'bba-mines-eggs-');
  const dataDir = fs.mkdtempSync(prefix);
  const clock = { now: 1_800_000_000_000 }, random = { roll: 0, calls: 0 };
  const { app, service, shutdown } = createApp({
    dataDir, now: () => clock.now, devLogin: true, env: {},
    vein: () => ({ veinMs: 60000, cells: 7 }), scareInt: n => n - 1,
    eggInt: n => { if (n !== 100000) return 0; random.calls++; return random.roll; },
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(prefix)));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = cookie => async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  const anon = client();
  const login = async name => {
    const res = await anon('POST', '/auth/dev', { name, email: `${name}@example.test` });
    assert.equal(res.status, 200);
    return { id: res.body.id, api: client(res.headers.get('set-cookie').split(';')[0]) };
  };
  return { clock, random, service, anon, login };
}

test('resuming a shift keeps its original egg roll', async t => {
  const { clock, random, login } = await fixture(t);
  for (const [name, roll, egg] of [['lucky', 14999, true], ['unlucky', 15000, undefined]]) {
    const user = await login(name);
    random.roll = roll;
    const start = await user.api('POST', '/api/mines/start', { rulesVersion: 2 });
    assert.equal(start.status, 200);
    assert.equal(start.body.egg, egg);
    const calls = random.calls;
    random.roll = egg ? 99999 : 0;
    clock.now += 15000;
    const resume = await user.api('POST', '/api/mines/start', { rulesVersion: 2 });
    assert.equal(resume.status, 200);
    assert.equal(resume.body.shiftId, start.body.shiftId);
    assert.equal(resume.body.resumed, true);
    assert.equal(resume.body.egg, egg);
    assert.equal(random.calls, calls);
  }
});

test('a previously rolled egg stays hidden and cannot be picked up once the barn is occupied', async t => {
  const { service, login } = await fixture(t);
  const { api, id } = await login('miner');
  const start = await api('POST', '/api/mines/start', { rulesVersion: 2 });
  assert.equal(start.body.egg, true);
  const shiftId = start.body.shiftId;
  const tick = () => api('POST', '/api/mines/pvp/tick', { rulesVersion: 2, shiftId });
  assert.equal((await tick()).body.egg, true);
  service.barn.layEgg(id);
  assert.equal((await tick()).body.egg, false);
  for (const [action, payload] of [
    ['start', {}], ['probe', { poolId: start.body.currentPoolId }], ['extract', { poolId: start.body.currentPoolId, action: 'stop' }],
  ]) {
    const state = await api('POST', '/api/mines/' + action, { rulesVersion: 2, shiftId, ...payload });
    assert.equal(state.status, 200, action);
    assert.equal(state.body.egg, undefined, action);
  }
  const pickup = await api('POST', '/api/mines/egg', { shiftId });
  assert.equal(pickup.status, 409);
  assert.equal(service.barn.bugs(id).length, 1);
});

test('egg pickup allows 30 seconds plus network grace and rejects invalid or repeated claims', async t => {
  const { clock, service, anon, login } = await fixture(t);
  assert.equal((await anon('POST', '/api/mines/egg', { shiftId: 'missing' })).status, 401);
  for (const elapsed of [30000, 33000, 33001]) {
    const user = await login(`miner${elapsed}`);
    const start = await user.api('POST', '/api/mines/start', { rulesVersion: 2 });
    assert.equal(start.status, 200);
    assert.equal(start.body.egg, true);
    assert.equal((await user.api('POST', '/api/mines/egg', { shiftId: 'wrong' })).status, 409);
    clock.now += elapsed;
    const claim = await user.api('POST', '/api/mines/egg', { shiftId: start.body.shiftId });
    assert.equal(claim.status, elapsed <= 33000 ? 200 : 409, JSON.stringify(claim.body));
    assert.equal(service.barn.has(user.id), elapsed <= 33000);
    if (elapsed <= 33000) {
      assert.equal(claim.body.pen.stage, 'egg');
      const pen = structuredClone(service.barn.doc.pens[user.id]);
      assert.equal((await user.api('POST', '/api/mines/egg', { shiftId: start.body.shiftId })).status, 409);
      assert.deepEqual(service.barn.doc.pens[user.id], pen);
    }
  }
});
