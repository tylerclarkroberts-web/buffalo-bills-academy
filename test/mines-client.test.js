import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMiningClient, readMineReceipt, rememberMineReceipt } from '../client/src/mines/miningClient.js';

const state = (remaining = 20, currentPoolId = 'p0') => ({ currentPoolId, pools: [{ id: 'p0', remaining }] });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(send) {
  const timers = new Map(), updates = [], errors = []; let next = 0, clock = 0;
  const client = createMiningClient({ send, onState: s => updates.push(s), onError: e => errors.push(e),
    now: () => clock, schedule: (fn, delay) => { timers.set(++next, { fn, delay }); return next; }, cancel: id => timers.delete(id) });
  return { client, timers, updates, errors, advance(ms) { clock += ms; }, tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); clock += timer.delay; timer.fn(); } };
}

test('release waits for the in-flight pulse and prevents another continue', async () => {
  const calls = []; let resolve;
  const f = fixture((path, body) => { calls.push([path, body.action]); return body.action === 'start' ? new Promise(r => { resolve = r; }) : Promise.resolve(state(18)); });
  f.client.start('p0'); await flush();
  const stopped = f.client.stop();
  assert.deepEqual(calls, [['/mines/extract', 'start']]);
  resolve(state()); await stopped; await flush();
  assert.deepEqual(calls, [['/mines/extract', 'start'], ['/mines/extract', 'stop']]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.updates.length, 2);
});

test('clock-out serializes stop before settlement and a full response prevents a second settlement', async () => {
  const calls = [];
  const f = fixture(async (path, body) => { calls.push([path, body.action]); return body.action === 'stop' ? { result: { amount: 100 } } : state(); });
  f.client.start('p0'); await flush();
  const ended = await f.client.clockOut();
  assert.equal(ended.result.amount, 100);
  assert.deepEqual(calls, [['/mines/extract', 'start'], ['/mines/extract', 'stop']]);
  assert.equal(f.timers.size, 0);
});

test('draining a pool stops the pulse loop instead of mining the next target', async () => {
  const calls = [];
  const f = fixture(async (path, body) => { calls.push(body.action); return body.action === 'continue' ? state(0, 'p1') : state(); });
  f.client.start('p0'); await flush(); f.tick(); await flush();
  assert.deepEqual(calls, ['start', 'continue']);
  assert.equal(f.timers.size, 0);
});

test('failed requests stop mining, allow a recovery probe, and never discard confirmed state', async () => {
  const f = fixture(async (path, body) => { if (body.action === 'continue') throw new Error('offline'); return state(17); });
  f.client.start('p0'); await flush(); f.tick(); await flush();
  assert.equal(f.errors.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.updates.at(-1).pools[0].remaining, 17);
  await f.client.probe('p0');
  assert.equal(f.updates.length, 2);
});

test('unmount sends stop but suppresses late UI updates', async () => {
  const calls = [];
  const f = fixture(async (path, body) => { calls.push(body.action); return state(); });
  f.client.start('p0'); await flush(); f.client.dispose(); await flush();
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(f.updates.length, 1);
  assert.equal(f.timers.size, 0);
});

test('slow responses do not add another half second to the mining interval', async () => {
  let requests = 0;
  const f = fixture(async () => { requests++; f.advance(650); return state(); });
  f.client.start('p0'); await flush();
  assert.equal(f.timers.values().next().value.delay, 0);
  f.tick(); await flush();
  assert.equal(requests, 2);
  assert.equal(f.timers.size, 1, 'only one next pulse is scheduled');
});

test('lost completion responses recover through a probe without starting extraction again', async () => {
  const calls = [];
  const f = fixture(async (path, body) => {
    calls.push([path, body.action]);
    if (body.action === 'continue') throw new Error('response lost');
    return path === '/mines/probe' ? { result: { amount: 100 } } : state();
  });
  f.client.start('p0'); await flush(); f.tick(); await flush();
  await f.client.probe('p0'); f.client.start('p0'); await flush();
  assert.equal(f.updates.at(-1).result.amount, 100);
  assert.equal(calls.length, 3);
  assert.equal(f.timers.size, 0);
});

test('an empty clock-out returns its pending lecture once', async () => {
  let requests = 0;
  const f = fixture(async () => { requests++; return { pending: { id: 'lecture' } }; });
  assert.equal((await f.client.clockOut()).pending.id, 'lecture');
  assert.equal((await f.client.clockOut()).pending.id, 'lecture');
  assert.equal(requests, 1);
});

test('a late completion after unmount cannot update the abandoned page', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  f.client.start('p0'); await flush(); f.client.dispose();
  resolve({ result: { amount: 100 } }); await flush();
  assert.equal(f.updates.length, 0);
  assert.equal(f.errors.length, 0);
  assert.equal(f.timers.size, 0);
});

test('seen receipts are account-scoped and a lost response never marks one seen', async () => {
  const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
  const client = createMiningClient({
    send: async () => { throw new Error('response lost'); }, onError() {},
    onState: value => rememberMineReceipt('alice', value.result?.shiftId, storage),
  });
  await assert.rejects(client.clockOut(), /response lost/);
  assert.equal(readMineReceipt('alice', storage), null);
  rememberMineReceipt('alice', 'shift-1', storage);
  assert.equal(readMineReceipt('alice', storage), 'shift-1');
  assert.equal(readMineReceipt('bob', storage), null);
  assert.deepEqual([...records.values()], ['shift-1'], 'only the receipt identifier is stored');
  rememberMineReceipt(null, 'shift-2', storage);
  assert.equal(records.size, 1);
});

test('unavailable browser storage leaves receipt recovery usable', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readMineReceipt('alice', storage), null);
  assert.doesNotThrow(() => rememberMineReceipt('alice', 'shift-1', storage));
});
