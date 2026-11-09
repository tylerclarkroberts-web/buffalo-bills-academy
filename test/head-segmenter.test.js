import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentHead } from '../client/src/avatar/head-segmenter.js';

function browser(t) {
  class WorkerStub {
    static created = [];
    constructor() { WorkerStub.created.push(this); this.terminated = false; }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const replacements = { window: { Worker: WorkerStub, OffscreenCanvas: class {} }, Worker: WorkerStub, OffscreenCanvas: class {} };
  for (const [name, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; });
  }
  return WorkerStub.created;
}

const source = () => ({ width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(16) }) }) });

test('automatic head segmentation returns the worker mask and releases the worker', async (t) => {
  const workers = browser(t);
  const pending = segmentHead(source());
  const alpha = new Uint8ClampedArray([0, 255, 255, 0]);
  workers[0].onmessage({ data: { alpha: alpha.buffer } });
  assert.deepEqual(await pending, alpha);
  assert.equal(workers[0].terminated, true);
});

test('cancelling automatic segmentation rejects promptly and releases its worker', async (t) => {
  const workers = browser(t), controller = new AbortController();
  const pending = segmentHead(source(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
  assert.equal(workers[0].terminated, true);
});

test('an already-cancelled cutout never starts a worker', async (t) => {
  const workers = browser(t), controller = new AbortController(); controller.abort();
  await assert.rejects(segmentHead(source(), { signal: controller.signal }), (e) => e.name === 'AbortError');
  assert.equal(workers.length, 0);
});

test('runtime and model failures reject and release their worker for manual fallback', async (t) => {
  const workers = browser(t);
  const crashed = segmentHead(source()); workers[0].onerror({ message: 'worker runtime failed' });
  await assert.rejects(crashed, /Automatic cutout unavailable/); assert.equal(workers[0].terminated, true);
  const unavailable = segmentHead(source()); workers[1].onmessage({ data: { error: 'Model could not load' } });
  await assert.rejects(unavailable, /Model could not load/); assert.equal(workers[1].terminated, true);
});

test('browsers missing Worker or OffscreenCanvas reject without starting work', async (t) => {
  const workers = browser(t);
  window.OffscreenCanvas = undefined;
  await assert.rejects(segmentHead(source()), /Unsupported browser/);
  window.OffscreenCanvas = class {}; window.Worker = undefined;
  await assert.rejects(segmentHead(source()), /Unsupported browser/);
  assert.equal(workers.length, 0);
});
