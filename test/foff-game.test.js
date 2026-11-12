import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../client/src/foff/game.js';
import { MATCHES } from '../client/src/foff/course.js';

test('golf starts, takes a turn and can be entered again after a side quest', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0, frame, ui, game;
  t.mock.method(Date, 'now', () => 1);
  t.mock.method(performance, 'now', () => now);
  const ctx = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, {
    get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; },
  });
  const canvas = () => ({ style: {}, clientWidth: 432, getContext: () => ctx });
  const storage = new Map([['bba.foff.save', JSON.stringify({ seen: true })]]);
  const globals = {
    window: Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) }),
    document: { createElement: canvas }, devicePixelRatio: 1,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame: () => { frame = null; },
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    game?.dispose();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  game = createGame(canvas(), snapshot => { ui = snapshot; });
  const step = (ms = 50) => { now += ms; frame(now); t.mock.timers.tick(ms); };
  const finishTalk = () => {
    for (let i = 0; ui?.talk && i < 20; i++) game.tap();
    assert.equal(ui.talk, null, 'dialogue finishes');
  };

  for (const match of MATCHES) {
    game.start(match.id);
    assert.equal(ui.screen, 'play', `match ${match.id} opens its golf HUD`);
    assert.equal(ui.match, match.id);
    assert.ok(ui.talk, 'match introduction is shown');
    finishTalk();
    assert.equal(ui.phase, 'aim');
    step();
    game.menu();
    assert.equal(ui, null);
  }

  game.quest('luggage');
  assert.equal(ui.screen, 'quest');
  finishTalk();
  step();
  game.menu();
  game.start(1);
  finishTalk();
  game.tap(); assert.equal(ui.phase, 'power');
  step(450);
  game.tap(); assert.equal(ui.phase, 'acc');
  step(600);
  game.tap(); assert.equal(ui.phase, 'fly');
  let sawFoes = false;
  for (let i = 0; i < 500 && ui.phase !== 'aim'; i++) {
    step();
    if (ui.talk) finishTalk();
    if (ui.phase === 'foes') { sawFoes = true; game.tap(); }
  }
  assert.ok(sawFoes, 'opponents take their turns');
  assert.equal(ui.phase, 'aim', 'play returns to the golfer after the opponents');
  assert.equal(ui.shot, 2);
});
