import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS, cleanSettings, loadSettings, saveSettings, STORAGE_KEY,
  isNearSquare, isTallNarrow, needsRotatePrompt, isLargeScreen, thumbPockets,
  graphicsTier, graphicsOpts, stickValue, STICK_RADIUS, STICK_DEAD,
  lookDelta, hitRole, createPointerMap, bindPad, applyPadLayout, LOOK_BASE,
} from '../client/src/mines/elhalo/controls.js';

test('rotate prompt: only tall narrow phones, never a near-square unfolded Duo', () => {
  assert.equal(isTallNarrow(390, 844), true);
  assert.equal(needsRotatePrompt(390, 844), true);
  assert.equal(needsRotatePrompt(360, 660), true, 'folded outer is still a tall phone');
  assert.equal(isNearSquare(1000, 900), true);
  assert.equal(isNearSquare(900, 1000), true);
  assert.equal(needsRotatePrompt(1000, 900), false);
  assert.equal(needsRotatePrompt(900, 1000), false);
  assert.equal(needsRotatePrompt(844, 390), false, 'landscape phone: already sideways');
  assert.equal(isLargeScreen(1000, 900), true);
  assert.equal(isLargeScreen(390, 844), false);
});

test('thumb pockets stay in reach on a big screen instead of the far corners', () => {
  const phone = thumbPockets(844, 333, { l: 0, r: 0, b: 0 });
  assert.ok(phone.stick.left >= 10 && phone.acts.right >= 10);
  assert.ok(phone.lookRight === 422);
  const duo = thumbPockets(1000, 900, { l: 0, r: 0, b: 20 });
  assert.equal(duo.large, true);
  assert.ok(duo.stick.width <= 360, 'stick pocket does not stretch across a 1000px panel');
  assert.ok(duo.acts.width <= 230);
  assert.ok(duo.stick.left >= 20, 'inset from the far left corner');
  assert.ok(duo.acts.right >= 20, 'inset from the far right corner');
  assert.ok(duo.stick.left + duo.stick.width < 500, 'left thumb stays on the left half');
  assert.ok(1000 - duo.acts.right - duo.acts.width > 500, 'right thumb stays on the right half');
});

test('graphics: phones stay on the light tier; a big or strong screen steps up', () => {
  assert.equal(graphicsTier({ w: 390, h: 844, coarse: true, dpr: 3, cores: 6 }), 'low');
  assert.equal(graphicsTier({ w: 1000, h: 900, coarse: true, dpr: 2, cores: 6 }), 'high');
  assert.equal(graphicsTier({ w: 1280, h: 720, coarse: false, dpr: 2, cores: 8 }), 'high');
  assert.equal(graphicsTier({ w: 900, h: 600, coarse: false, dpr: 1, cores: 2 }), 'med');
  assert.equal(graphicsTier({ w: 844, h: 390, coarse: true, reduceMotion: true }), 'low');
  assert.equal(graphicsOpts('high').dpr, 1.75);
  assert.equal(graphicsOpts('low').phoneDogs, true);
  assert.ok(graphicsOpts('high').particles > graphicsOpts('low').particles);
  assert.ok(graphicsOpts('low').far < graphicsOpts('high').far);
});

test('settings clamp, default auto-fire off, and survive localStorage', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadSettings(storage).autoFire, false);
  const saved = saveSettings({ hipSens: 9, adsSens: 0.1, accel: -2, assist: 4, autoFire: 1, invert: 'yes' }, storage);
  assert.equal(saved.hipSens, 2.4);
  assert.equal(saved.adsSens, 0.4);
  assert.equal(saved.accel, 0);
  assert.equal(saved.assist, 1);
  assert.equal(saved.autoFire, true);
  assert.equal(saved.invert, true);
  assert.equal(store.get(STORAGE_KEY).includes('hipSens'), true);
  assert.deepEqual(loadSettings(storage), saved);
  assert.equal(cleanSettings(null).hipSens, DEFAULT_SETTINGS.hipSens);
});

test('stick dead zone: small wiggles do not move you; the knob still follows', () => {
  const still = stickValue(3, 0);
  assert.equal(still.x, 0);
  assert.equal(still.y, 0);
  assert.ok(still.knobX > 0);
  const half = stickValue(STICK_RADIUS / 2, 0);
  assert.ok(half.x > 0 && half.x < 1);
  const full = stickValue(200, 0);
  assert.ok(Math.abs(full.x - 1) < 1e-9);
  assert.equal(full.knobX, STICK_RADIUS);
  const dead = stickValue(STICK_RADIUS * STICK_DEAD, 0);
  assert.equal(dead.x, 0);
});

test('look: hip/ADS sliders, mild acceleration, assist slowdown, invert', () => {
  const hip = lookDelta(10, 0, { settings: { hipSens: 1, adsSens: 1, accel: 0, assist: 0 } });
  const ads = lookDelta(10, 0, { settings: { hipSens: 1, adsSens: 0.5, accel: 0, assist: 0 }, zoom: true });
  assert.ok(Math.abs(hip.yaw + 10 * LOOK_BASE) < 1e-9);
  assert.ok(Math.abs(ads.yaw) < Math.abs(hip.yaw));
  const flick = lookDelta(40, 0, { settings: { hipSens: 1, accel: 0.35, assist: 0 } });
  const slow = lookDelta(2, 0, { settings: { hipSens: 1, accel: 0.35, assist: 0 } });
  assert.ok(Math.abs(flick.yaw / 40) > Math.abs(slow.yaw / 2), 'flicks are a little faster per pixel');
  const raw = lookDelta(10, 0, { settings: { assist: 0.4 }, aiming: false });
  const aided = lookDelta(10, 0, { settings: { assist: 0.4 }, aiming: true });
  assert.ok(Math.abs(aided.yaw) < Math.abs(raw.yaw), 'aim assist slows the look on a target');
  const inv = lookDelta(0, 10, { settings: { invert: true, accel: 0, assist: 0 } });
  const nrm = lookDelta(0, 10, { settings: { invert: false, accel: 0, assist: 0 } });
  assert.equal(Math.sign(inv.pitch), -Math.sign(nrm.pitch));
});

test('a left-thumb stick, a right-thumb look and FIRE never steal each other', () => {
  const layout = thumbPockets(844, 333);
  layout.stick = { left: layout.stick.left, top: 333 - layout.stick.bottom - layout.stick.height, width: layout.stick.width, height: layout.stick.height };
  const fire = { role: 'fire', id: 'fire', x: 760, y: 220, width: 70, height: 110 };
  const map = createPointerMap();
  const stick = map.down(1, layout.stick.left + 40, layout.stick.top + 80, layout, [fire]);
  assert.equal(stick.role, 'stick');
  const look = map.down(2, 700, 80, layout, [fire]);
  assert.equal(look.role, 'look');
  const fireRec = map.down(3, 780, 260, layout, [fire]);
  assert.equal(fireRec.role, 'fire');
  // sliding the stick finger onto the right half must not start a look or steal FIRE
  const moved = map.move(1, 800, 80);
  assert.equal(moved.rec.role, 'stick');
  assert.equal(map.get(2).role, 'look');
  assert.equal(map.get(3).role, 'fire');
  // a second finger in the stick pocket is ignored (one stick)
  assert.equal(map.down(4, layout.stick.left + 20, layout.stick.top + 20, layout, [fire]), null);
  // lifting the look finger leaves move + fire running
  map.up(2);
  assert.equal(map.get(1).role, 'stick');
  assert.equal(map.get(3).role, 'fire');
  assert.equal(map.get(2), null);
  // a new right-thumb look can start while the stick is still held
  assert.equal(map.down(5, 600, 100, layout, [fire]).role, 'look');
});

test('look starts on the right half even while the stick is held; the left half does not start a look', () => {
  const layout = { width: 800, height: 300, lookRight: 400, stick: { left: 0, top: 120, width: 300, height: 180 } };
  assert.equal(hitRole(100, 40, layout, []).role, 'ignore', 'above the stick, still the left half');
  assert.equal(hitRole(100, 200, layout, []).role, 'stick');
  assert.equal(hitRole(500, 40, layout, []).role, 'look');
  const fire = { role: 'fire', id: 'fire', x: 700, y: 180, width: 80, height: 100 };
  assert.equal(hitRole(720, 200, layout, [fire]).role, 'fire');
});

test('bindPad routes two simultaneous pointers by id onto one pad element', () => {
  const pad = {
    listeners: {},
    rect: { left: 0, top: 0, right: 800, bottom: 300, width: 800, height: 300 },
    getBoundingClientRect() { return this.rect; },
    setPointerCapture() {},
    addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); },
    removeEventListener(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn); },
    fire(ev, e) { for (const fn of this.listeners[ev] || []) fn(e); },
  };
  const layout = { width: 800, height: 300, lookRight: 400, stick: { left: 0, top: 120, width: 300, height: 180 } };
  const events = [];
  const unbind = bindPad(pad, {
    layout: () => layout,
    buttons: () => [{ role: 'fire', id: 'fire', x: 700, y: 180, width: 80, height: 100 }],
    onStickStart: () => events.push('stick-start'),
    onStickMove: () => events.push('stick-move'),
    onStickEnd: () => events.push('stick-end'),
    onLook: () => events.push('look'),
    onFire: (on) => events.push(on ? 'fire-on' : 'fire-off'),
  });
  const ev = (type, id, x, y) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, preventDefault() {} });
  pad.fire('pointerdown', ev('down', 1, 80, 200));
  pad.fire('pointerdown', ev('down', 2, 500, 80));
  pad.fire('pointermove', ev('move', 1, 90, 190));
  pad.fire('pointermove', ev('move', 2, 540, 90));
  pad.fire('pointerup', ev('up', 2, 540, 90));
  pad.fire('pointermove', ev('move', 1, 100, 180));
  assert.deepEqual(events.filter((n) => n === 'stick-start'), ['stick-start']);
  assert.ok(events.includes('stick-move'));
  assert.ok(events.includes('look'));
  assert.equal(events.filter((n) => n === 'look').length, 1);
  assert.ok(events.filter((n) => n.startsWith('stick-move')).length >= 2, 'stick still moves after the look finger lifts');
  unbind();
});

test('applyPadLayout writes thumb-pocket variables without remounting', () => {
  const el = { style: new Map(), dataset: {}, styleSet: null };
  el.style.setProperty = (k, v) => el.style.set(k, v);
  applyPadLayout(el, thumbPockets(1000, 900));
  assert.equal(el.dataset.large, '1');
  assert.ok(el.style.get('--stick-w').endsWith('px'));
  assert.ok(el.style.get('--acts-right').endsWith('px'));
});
