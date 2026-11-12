import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTiltControls } from '../client/src/mines/tilt.js';

class Phone extends EventTarget {
  isSecureContext = true;
  DeviceOrientationEvent = class {};
  document = Object.assign(new EventTarget(), { hidden: false });
  screen = { orientation: Object.assign(new EventTarget(), { angle: 0 }) };
  time = 0;
  timers = new Map();
  nextTimer = 0;
  performance = { now: () => this.time };
  setTimeout = (fn, delay) => { const id = ++this.nextTimer; this.timers.set(id, { at: this.time + delay, fn }); return id; };
  clearTimeout = id => this.timers.delete(id);
  requestAnimationFrame = fn => this.setTimeout(() => fn(this.time), 16);
  cancelAnimationFrame = id => this.clearTimeout(id);
  tick(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at; this.timers.delete(next[0]); next[1].fn();
    }
    this.time = end;
  }
  motion(alpha, beta, gamma, ms = 16) {
    this.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha, beta, gamma }));
    this.tick(ms);
  }
}
function setup() {
  const phone = new Phone(), inputs = [], statuses = [];
  const controls = createTiltControls({ target: phone, onInput: (f, t) => inputs.push([f, t]), onStatus: (s, m) => statuses.push([s, m]) });
  return { phone, controls, inputs, statuses, input: () => inputs.at(-1), status: () => statuses.at(-1)?.[0] };
}

test('tilt is opt-in, checks support, and requests permission during enable', async () => {
  const s = setup();
  s.phone.motion(0, 45, 0);
  assert.equal(s.inputs.length, 0);
  s.phone.isSecureContext = false;
  await s.controls.enable();
  assert.equal(s.status(), 'error'); assert.match(s.statuses.at(-1)[1], /HTTPS/);
  s.phone.isSecureContext = true; s.phone.DeviceOrientationEvent = undefined;
  await s.controls.enable();
  assert.match(s.statuses.at(-1)[1], /does not support/);
  let called = false;
  s.phone.DeviceOrientationEvent = { requestPermission: () => { called = true; return Promise.resolve('granted'); } };
  const enabling = s.controls.enable();
  assert.equal(called, true, 'permission requested before enable yields');
  await enabling;
  assert.equal(s.status(), 'calibrating');
  s.controls.dispose();
});

test('denied, failed and cancelled permission requests leave touch controls usable', async () => {
  for (const permission of [() => Promise.resolve('denied'), () => Promise.reject(new Error('blocked'))]) {
    const s = setup(); s.phone.DeviceOrientationEvent.requestPermission = permission;
    await s.controls.enable();
    assert.equal(s.status(), 'error'); assert.deepEqual(s.input(), [0, 0]);
    assert.equal(s.phone.timers.size, 0);
    s.phone.motion(0, 20, 20); assert.equal(s.status(), 'error');
  }
  for (const cancel of ['disable', 'dispose', 'hidden']) {
    const s = setup(); let resolve;
    s.phone.DeviceOrientationEvent.requestPermission = () => new Promise(r => { resolve = r; });
    const enabling = s.controls.enable();
    if (cancel === 'hidden') { s.phone.document.hidden = true; s.phone.document.dispatchEvent(new Event('visibilitychange')); }
    else s.controls[cancel]();
    const count = s.inputs.length;
    resolve('granted'); await enabling; s.phone.motion(0, 20, 20);
    assert.equal(s.inputs.length, count); assert.equal(s.phone.timers.size, 0);
  }
});

test('initial missing/invalid readings time out; later invalid readings stop movement and recalibrate', async () => {
  for (const invalid of [false, true]) {
    const s = setup(); await s.controls.enable();
    if (invalid) for (let i = 0; i < 5; i++) s.phone.motion(null, NaN, Infinity, 100);
    s.phone.tick(3000);
    assert.equal(s.status(), 'error'); assert.deepEqual(s.input(), [0, 0]);
  }
  const s = setup(); await s.controls.enable();
  s.phone.motion(0, 45, 0); s.phone.motion(0, 20, 20, 100);
  assert.ok(s.input()[0] > 0 && s.input()[1] > 0);
  s.phone.motion(0, null, 0);
  assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(0, 20, 20);
  assert.deepEqual(s.input(), [0, 0], 'valid data resumes from a new neutral pose');
  s.phone.motion(0, 0, 35, 100); assert.ok(s.input()[0] > 0);
  s.phone.motion(null, null, null); s.phone.tick(3000);
  assert.equal(s.status(), 'error'); assert.deepEqual(s.input(), [0, 0]);
});

test('calibration, deadzone, smooth bounded movement and recenter use the current grip', async () => {
  const s = setup(); await s.controls.enable();
  s.phone.motion(35, 70, 0); assert.equal(s.status(), 'on'); assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(35, 68, 2); assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(35, 45, 0);
  const first = s.input()[0]; assert.ok(first > 0 && first < 0.2);
  s.phone.tick(5000);
  assert.equal(s.status(), 'on'); assert.deepEqual(s.input(), [1, 0], 'held pose converges without more orientation events');
  assert.equal(s.phone.timers.size, 0, 'smoothing stops scheduling once settled');
  s.controls.recenter(); assert.deepEqual(s.input(), [0, 0]);
  assert.equal(s.status(), 'on'); s.phone.tick(5000);
  assert.equal(s.status(), 'on', 'recenter uses the latest reading without waiting for another event');
  s.phone.motion(35, 45, 0); assert.deepEqual(s.input(), [0, 0]);
  for (let i = 0; i < 40; i++) s.phone.motion(35, 70, -35);
  assert.ok(s.input()[0] < 0 && s.input()[0] >= -1);
  assert.ok(s.input()[1] < 0 && s.input()[1] >= -0.9);
  s.controls.dispose();
});

test('portrait and both landscape orientations map screen-relative gestures consistently', async () => {
  for (const [angle, forwardPose, turnPose] of [[0, [0, -20, 0], [0, 0, 20]], [90, [0, 0, 20], [0, 20, 0]], [-90, [0, 0, -20], [0, -20, 0]]]) {
    const s = setup(); s.phone.screen.orientation.angle = angle;
    await s.controls.enable(); s.phone.motion(0, 0, 0); s.phone.motion(...forwardPose, 100);
    assert.ok(s.input()[0] > 0, `forward at ${angle}`); assert.ok(Math.abs(s.input()[1]) < 1e-10);
    s.phone.motion(0, 0, 0); s.controls.recenter(); s.phone.motion(...turnPose, 100);
    assert.ok(s.input()[1] > 0, `right turn at ${angle}`); assert.ok(Math.abs(s.input()[0]) < 1e-10);
    s.controls.dispose();
  }
});

test('crossing upright and heading wrap does not create a sudden movement reversal', async () => {
  const s = setup(); await s.controls.enable(); s.phone.motion(359, 89, 0);
  s.phone.motion(0, 90, 0); assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(1, 91, 0); assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(359, 110, 0, 100); assert.ok(s.input()[0] < 0); assert.equal(s.input()[1], 0);
  s.phone.motion(10, 30, 89); s.controls.recenter();
  s.phone.motion(190, 150, -89);
  assert.deepEqual(s.input(), [0, 0], 'equivalent Euler-axis flip is only a two-degree physical movement');
  s.phone.motion(190, 150, -80, 100);
  assert.ok(s.input()[1] > 0); assert.equal(s.input()[0], 0);
  s.controls.dispose();
});

test('pause and rotation clear input and recalibrate before moving again', async () => {
  const s = setup(); await s.controls.enable(); s.phone.motion(0, 45, 0); s.phone.motion(0, 20, 0, 100);
  assert.ok(s.input()[0] > 0);
  s.controls.setPaused(true); assert.deepEqual(s.input(), [0, 0]); assert.equal(s.phone.timers.size, 0);
  const pausedCount = s.inputs.length;
  s.phone.motion(0, -20, 0); s.phone.tick(5000); assert.deepEqual(s.input(), [0, 0]);
  assert.equal(s.inputs.length, pausedCount, 'paused readings only update the calibration pose');
  s.controls.setPaused(false); assert.equal(s.status(), 'on');
  s.phone.motion(0, -20, 0); assert.deepEqual(s.input(), [0, 0]);
  s.phone.motion(0, -40, 0, 100); assert.ok(s.input()[0] > 0);
  s.phone.screen.orientation.angle = 90; s.phone.screen.orientation.dispatchEvent(new Event('change'));
  assert.deepEqual(s.input(), [0, 0]); s.phone.motion(0, -40, 0); assert.deepEqual(s.input(), [0, 0]);
  s.phone.dispatchEvent(new Event('orientationchange'));
  assert.equal(s.status(), 'on', 'duplicate screen-rotation events keep the calibrated pose');
  assert.equal(s.phone.timers.size, 0);
  s.controls.dispose();
  const held = setup(); held.controls.setPaused(true); await held.controls.enable();
  assert.equal(held.status(), 'on'); assert.deepEqual(held.input(), [0, 0]); assert.equal(held.phone.timers.size, 0);
  held.controls.setPaused(false); assert.equal(held.status(), 'calibrating'); held.controls.dispose();
});

test('blur, hidden pages and disposal stop input and remove timers/listeners', async () => {
  for (const finish of ['blur', 'hidden', 'dispose']) {
    const s = setup(); await s.controls.enable(); s.phone.motion(0, 45, 0); s.phone.motion(0, 20, 0, 100);
    if (finish === 'blur') s.phone.dispatchEvent(new Event('blur'));
    if (finish === 'hidden') { s.phone.document.hidden = true; s.phone.document.dispatchEvent(new Event('visibilitychange')); }
    if (finish === 'dispose') s.controls.dispose();
    assert.deepEqual(s.input(), [0, 0]); assert.equal(s.phone.timers.size, 0);
    const count = s.inputs.length;
    s.phone.motion(0, -20, 0); s.phone.tick(5000); s.phone.dispatchEvent(new Event('blur'));
    assert.equal(s.inputs.length, count);
    if (finish === 'dispose') { await s.controls.enable(); assert.equal(s.inputs.length, count); }
  }
});
