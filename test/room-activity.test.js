import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomActivity, ROOM_LINES, FAUN_LINES, residentPose, faunPose } from '../client/src/room/activity.js';
import * as THREE from 'three';
import { RoomScene } from '../client/src/room/scene.js';
import { makeRoomCamera, RESIDENT_HEIGHT_SCALE } from '../client/src/room/scene-model.js';
import { setupRoomLighting } from '../client/src/room/lighting.js';

test('room comments are brief, spaced apart and never repeat consecutively', () => {
  const activity = new RoomActivity(() => 0);
  activity.nextFaun = Infinity;
  assert.deepEqual(activity.advance(19999), { text: null, speaker: 'resident', faun: false, faunAge: 0 });
  assert.equal(activity.advance(1).text, ROOM_LINES[0]);
  assert.equal(activity.untilChange(), 9000);
  assert.equal(activity.advance(8999).text, ROOM_LINES[0]);
  assert.equal(activity.advance(1).text, null);
  assert.equal(activity.advance(44999).text, null);
  assert.equal(activity.advance(1).text, ROOM_LINES[1]);
});

test('the first faun visit is discoverable, includes his own line, then leaves a long quiet gap', () => {
  const activity = new RoomActivity(() => 0);
  assert.ok(new RoomActivity(() => 0.999).nextFaun < 40000);
  assert.equal(activity.advance(19999).faun, false);
  assert.equal(activity.advance(1).faun, true);
  assert.equal(activity.state().faunAge, 0);
  assert.equal(activity.state().text, null, 'he peeks out before speaking');
  assert.equal(activity.untilChange(), 4000, 'reduced motion wakes for his line');
  assert.equal(activity.advance(3999).text, null);
  assert.equal(activity.advance(1).text, FAUN_LINES[0]);
  assert.equal(activity.state().speaker, 'faun');
  assert.equal(activity.untilChange(), 9000);
  assert.equal(activity.advance(8999).text, FAUN_LINES[0]);
  assert.equal(activity.advance(1).text, null);
  assert.equal(activity.untilChange(), 5000, 'reduced motion wakes to hide him after the retreat');
  assert.equal(activity.advance(4999).faun, true);
  assert.equal(activity.advance(1).faun, false);
  assert.equal(activity.advance(119999).faun, false);
  assert.equal(activity.advance(1).faun, true);
  assert.equal(activity.advance(4000).text, FAUN_LINES[1], 'successive visits do not repeat their line');
  assert.ok(activity.nextSpeech >= activity.faunUntil + 15000, 'resident chatter waits until the visitor has left');
  assert.ok(FAUN_LINES.every(line => line.length <= 110));
});

test('editing before the first visit gives a short fresh wait and retains later visit cooldowns', () => {
  const activity = new RoomActivity(() => 0.5);
  activity.advance(10000); activity.quiet();
  assert.equal(activity.nextFaun, 40000, 'editing does not push the first visit back several minutes');
  assert.equal(activity.advance(29999).faun, false);
  assert.equal(activity.advance(1).faun, true);
  const nextVisit = activity.nextFaun;
  activity.quiet();
  assert.equal(activity.state().faun, false);
  assert.equal(activity.nextFaun, nextVisit, 'a completed or dismissed visit retains its occasional cadence');
});

test('faun movement eases out of cover, pauses and retreats without overshooting', () => {
  assert.equal(faunPose(0).peek, 0); assert.equal(faunPose(18).peek, 0);
  for (const seconds of [3, 8, 14]) assert.equal(faunPose(seconds).peek, 1);
  assert.ok(faunPose(1.5).peek > 0 && faunPose(1.5).peek < 1);
  assert.ok(faunPose(16).peek > 0 && faunPose(16).peek < 1);
  for (let seconds = 0; seconds < 40; seconds += 0.05) {
    const pose = faunPose(seconds);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.peek >= 0 && pose.peek <= 1 && Math.abs(pose.stride) <= 0.18 && Math.abs(pose.lean) <= 0.07);
    if (seconds >= 3 && seconds <= 14 || seconds >= 18) assert.equal(Math.abs(pose.stride), 0);
  }
});

test('pausing dismisses current events and resuming leaves time to settle', () => {
  const activity = new RoomActivity(() => 0.5);
  activity.advance(180000);
  const state = activity.advance(4000);
  assert.ok(state.text && state.faun);
  activity.quiet();
  assert.deepEqual(activity.state(), { text: null, speaker: 'resident', faun: false, faunAge: 0 });
  assert.deepEqual(activity.advance(19999), { text: null, speaker: 'resident', faun: false, faunAge: 0 });
  assert.ok(activity.nextFaun - activity.time >= 120000);
});

function sceneFixture(t, reduced = false) {
  const frames = [], bubbles = [], renders = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => { frames.length = 0; };
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const scene = Object.assign(Object.create(RoomScene.prototype), {
    activity: new RoomActivity(() => 0), motion: { matches: reduced },
    residentGroup: new THREE.Group(), residentHead: new THREE.Group(), faun: new THREE.Group(),
    canvas: { clientWidth: 320, clientHeight: 280 }, camera: makeRoomCamera(320 / 280),
    renderer: { render: () => renders.push(true) }, onSpeech: bubble => bubbles.push(bubble),
  });
  scene.faun.visible = false;
  scene.activity.nextFaun = Infinity;
  return { scene, frames, bubbles, renders };
}

test('pausing stops scheduled animation, clears bubbles and leaves furniture positions alone', t => {
  const { scene, frames, bubbles } = sceneFixture(t);
  scene.residentGroup.position.set(1, 0.05, 2);
  scene.render(); frames.shift()(0);
  t.mock.timers.tick(42); frames.shift()(20000);
  assert.ok(bubbles.at(-1)?.text);
  assert.notEqual(scene.residentGroup.scale.y, RESIDENT_HEIGHT_SCALE);
  scene.setActivityPaused(true); frames.shift()(20001);
  assert.equal(bubbles.at(-1), null);
  assert.equal(scene.faun.visible, false);
  assert.equal(scene.residentGroup.scale.y, RESIDENT_HEIGHT_SCALE);
  assert.deepEqual(scene.residentGroup.position.toArray(), [1, 0.05, 2]);
  t.mock.timers.tick(360000);
  assert.equal(frames.length, 0, 'paused activity never schedules another frame');
  scene.setActivityPaused(false); frames.shift()(380001);
  assert.equal(scene.activity.time, 20000, 'paused wall-clock time does not advance events');
});

test('reduced motion keeps a still resident and renders only at activity boundaries', t => {
  const { scene, frames, bubbles } = sceneFixture(t, true);
  scene.render(); frames.shift()(0);
  t.mock.timers.tick(19999); assert.equal(frames.length, 0);
  t.mock.timers.tick(1); frames.shift()(20000);
  assert.ok(bubbles.at(-1)?.text);
  assert.equal(scene.residentGroup.scale.y, RESIDENT_HEIGHT_SCALE);
  assert.deepEqual(scene.residentGroup.rotation.toArray().slice(0, 3), [0, 0.35, 0]);
  assert.equal(scene.residentHead.rotation.y, 0);
  t.mock.timers.tick(9000); frames.shift()(29000);
  assert.equal(bubbles.at(-1), null);
});

test('hiding a reduced-motion room preserves elapsed viewing time without counting hidden time', t => {
  const { scene, frames, bubbles } = sceneFixture(t, true);
  scene.render(); frames.shift()(0);
  t.mock.timers.tick(19000);
  document.hidden = true; scene.visibilityChanged(19000);
  assert.equal(scene.activity.time, 19000);
  t.mock.timers.tick(100000);
  assert.equal(frames.length, 0);
  document.hidden = false; scene.visibilityChanged(119000); frames.shift()(119000);
  assert.equal(scene.activity.time, 19000);
  t.mock.timers.tick(999); assert.equal(frames.length, 0);
  t.mock.timers.tick(1); frames.shift()(120000);
  assert.equal(bubbles.at(-1)?.text, ROOM_LINES[0]);
  assert.equal(scene.activity.time, 20000);
});

test('the faun peeks from cover, speaks above his own model, then retreats and leaves', t => {
  const { scene, bubbles } = sceneFixture(t);
  scene.canvas = { clientWidth: 846, clientHeight: 380 }; scene.camera = makeRoomCamera(846 / 380);
  scene.residentGroup.position.set(-2, 0.05, 0);
  scene.faunHead = new THREE.Group(); scene.faunLegs = [new THREE.Group(), new THREE.Group()];
  scene.activity.nextFaun = 20000; scene.activity.advance(20000);
  scene.faunVisitKey = scene.activity.faunUntil;
  scene.faunRoute = { from: { x: 2, z: 0 }, to: { x: 3, z: 0.5 }, facing: -0.4 };
  scene.animateActivity(0);
  assert.equal(scene.faun.visible, true);
  assert.deepEqual(scene.faun.position.toArray(), [2, 0.02, 0]);
  scene.animateActivity(1500);
  assert.deepEqual(scene.faun.position.toArray(), [2.5, 0.02, 0.25]);
  assert.notEqual(scene.faunLegs[0].rotation.x, 0);
  assert.equal(scene.faunLegs[0].rotation.x, -scene.faunLegs[1].rotation.x);
  scene.animateActivity(4000);
  assert.deepEqual(scene.faun.position.toArray(), [3, 0.02, 0.5]);
  assert.equal(bubbles.at(-1)?.text, FAUN_LINES[0]);
  assert.equal(bubbles.at(-1)?.speaker, 'faun');
  const anchor = new THREE.Vector3(3, 2.82, 0.5).project(scene.camera);
  assert.equal(bubbles.at(-1).x, Math.round(Math.max(126, Math.min(720, (anchor.x + 1) * 846 / 2))));
  scene.animateActivity(13500);
  assert.equal(bubbles.at(-1), null);
  assert.equal(scene.faun.visible, true);
  scene.animateActivity(16000);
  assert.deepEqual(scene.faun.position.toArray(), [2.5, 0.02, 0.25]);
  scene.animateActivity(18000);
  assert.equal(scene.faun.visible, false);
});

test('reduced motion shows a still faun and refreshes shadows only when he enters or leaves', t => {
  const { scene, frames, bubbles } = sceneFixture(t, true);
  scene.renderer.shadowMap = {};
  scene.lighting = setupRoomLighting(new THREE.Scene(), scene.renderer);
  t.after(() => scene.lighting.dispose());
  const invalidate = scene.lighting.invalidate; let invalidations = 0;
  scene.lighting.invalidate = () => { invalidations++; invalidate(); };
  scene.activity.nextFaun = 20000;
  scene.render(); frames.shift()(0);
  t.mock.timers.tick(20000); frames.shift()(20000);
  assert.equal(scene.faun.visible, true);
  assert.equal(invalidations, 1);
  const position = scene.faun.position.clone(), rotation = scene.faun.rotation.clone();
  assert.deepEqual(position.toArray(), [scene.faunRoute.to.x, 0.02, scene.faunRoute.to.z]);
  t.mock.timers.tick(3999); assert.equal(frames.length, 0);
  t.mock.timers.tick(1); frames.shift()(24000);
  assert.equal(bubbles.at(-1)?.speaker, 'faun');
  assert.ok(scene.faun.position.equals(position) && scene.faun.rotation.equals(rotation));
  assert.equal(invalidations, 1, 'speech does not redraw an unchanged shadow');
  t.mock.timers.tick(9000); frames.shift()(33000);
  assert.equal(bubbles.at(-1), null);
  assert.ok(scene.faun.position.equals(position) && scene.faun.rotation.equals(rotation));
  t.mock.timers.tick(5000); frames.shift()(38000);
  assert.equal(scene.faun.visible, false);
  assert.equal(invalidations, 2, 'departure clears the faun shadow even without continuous animation');
});

test('scrolling the room off screen pauses rendering and preserves current bubbles and visits', t => {
  const { scene, frames, bubbles, renders } = sceneFixture(t);
  scene.activity.nextFaun = 20000;
  scene.render(); frames.shift()(0);
  t.mock.timers.tick(42); frames.shift()(20000);
  t.mock.timers.tick(42); frames.shift()(24000);
  assert.ok(bubbles.at(-1)?.text && scene.faun.visible);
  scene.inViewport = false; scene.visibilityChanged(25000);
  const state = scene.activity.state(), count = renders.length;
  t.mock.timers.tick(300000); scene.render();
  assert.equal(frames.length, 0);
  assert.equal(renders.length, count);
  assert.deepEqual(scene.activity.state(), state);
  document.hidden = true;
  scene.inViewport = true; scene.visibilityChanged(325000);
  assert.equal(frames.length, 0, 'scroll visibility cannot resume a hidden tab');
  document.hidden = false; scene.visibilityChanged(325000); frames.shift()(325000);
  assert.equal(scene.activity.time, 25000);
  assert.ok(bubbles.at(-1)?.text && scene.faun.visible);
  t.mock.timers.tick(42); frames.shift()(333000);
  assert.equal(bubbles.at(-1), null, 'the bubble expires after its remaining visible time');
  assert.equal(scene.faun.visible, true);
});

test('hidden, failed and disposed scenes never schedule or draw another frame', t => {
  const { scene, frames, renders } = sceneFixture(t);
  document.hidden = true; scene.render();
  assert.equal(frames.length, 0);
  document.hidden = false; scene.failed = true; scene.render();
  assert.equal(frames.length, 0);
  scene.failed = false; scene.render();
  scene.disposed = true; frames.shift()(0);
  t.mock.timers.tick(360000);
  assert.equal(frames.length, 0);
  assert.equal(renders.length, 0);
});

test('resident takes bounded steps and gestures, while speech position updates do not replace its text', t => {
  assert.equal(residentPose(0).offset, 0); assert.equal(residentPose(14).offset, 1); assert.equal(residentPose(24).offset, 0);
  assert.ok(residentPose(28).wave > 0.9);
  for (let t = 0; t < 70; t += 0.05) { const pose = residentPose(t); assert.ok(pose.offset >= 0 && pose.offset <= 1 && Math.abs(pose.stride) <= 0.24); }
  const { scene, bubbles } = sceneFixture(t), positions = [];
  scene.residentHome = new THREE.Vector3(0, 0.05, 1); scene.residentRoute = { x: 0.55, z: 0 };
  scene.residentLegs = [new THREE.Group(), new THREE.Group()]; scene.residentArms = [new THREE.Group(), new THREE.Group()];
  scene.onSpeechPosition = (x, y) => positions.push([x, y]);
  scene.activity.time = 8000; scene.activity.lastLine = 0; scene.activity.speechUntil = 17000;
  scene.animateActivity(0); scene.animateActivity(1000);
  assert.equal(bubbles.length, 1); assert.equal(positions.length, 2);
  assert.ok(scene.residentGroup.position.x > 0 && scene.residentGroup.position.x < 0.55);
  assert.notEqual(scene.residentLegs[0].rotation.x, 0);
  // Through every errand and the wave, an arm never swings sideways into the body: right arm out is positive, left negative.
  scene.errands = [{ kind: 'sit', path: [[0.5, 1]], facing: 0, seat: [0.6, 1] }, { kind: 'inspect', path: [[0.5, 1]], facing: 0 }, { kind: 'cash', path: [[0.5, 1]], facing: 0 }];
  let lifted = 0;
  for (let ms = 0; ms < 34000 * 3; ms += 100) {
    scene.activity.time = ms; scene.lastFrame = null; scene.animateActivity(0);
    const [left, right] = scene.residentArms.map(arm => arm.rotation.z);
    assert.ok(left <= 0 && right >= 0, `arms stay out of the body at ${ms} ms`);
    lifted = Math.max(lifted, right);
  }
  assert.ok(lifted > 0.9, 'the wave still lifts the right arm, outward');
  scene.errands = null;
  scene.activityPaused = true; scene.animateActivity(2000);
  assert.ok(scene.residentGroup.position.equals(scene.residentHome));
  assert.equal(Math.abs(scene.residentLegs[0].rotation.x), 0);
});
