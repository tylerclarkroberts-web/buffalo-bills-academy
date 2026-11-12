// Foff's Bachelor Party: every side quest can be started, played badly for a minute and drawn without falling
// over; the puzzles have an answer; and the trip lists everything once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHES } from '../client/src/foff/course.js';
import { QUESTS, TRIP } from '../client/src/foff/quests.js';
import { INTRO, OUTRO } from '../client/src/foff/scenes.js';
import { rng } from '../server/engine/maze.js';

const sfx = new Proxy({}, { get: () => () => {} });
const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : () => {}), set: () => true }); // a canvas that draws nothing
const env = (seed, said = []) => ({ rnd: rng(seed), sfx, calm: false, say: (line) => said.push(line) });
const idle = { x: 0, y: 0, held: false, tap: false, point: null };

test('the trip lists every match and every quest exactly once, and each quest has its speeches', () => {
  const stops = TRIP.flatMap((d) => d.stops);
  assert.deepEqual(stops.filter((s) => s.match).map((s) => s.match.id), MATCHES.map((m) => m.id));
  assert.deepEqual(stops.filter((s) => s.quest).map((s) => s.quest.id).sort(), QUESTS.map((q) => q.id).sort());
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, QUESTS.length);
  for (const q of QUESTS) {
    assert.ok(q.title && q.intro.length && q.win.length >= 3 && (q.lose.length === 0 || q.lose.length >= 3), q.id); // a few different endings each
    for (const lines of [q.intro, ...q.win, ...q.lose]) assert.ok(lines.length && lines.every((l) => l.length === 2 && l[0] && l[1]), q.id); assert.ok([0, ...MATCHES.map((m) => m.id)].includes(q.need), q.id); }
});

test('the story at each end of the trip draws, moving or still, and the ending covers the flight, GFR and the abalone', () => {
  for (const scene of [...INTRO, ...OUTRO]) { assert.ok(scene.lines.length && scene.lines.every((l) => typeof l === 'string' && l)); scene.draw(ctx, 3.7, false); scene.draw(ctx, 3.7, true); }
  const ending = OUTRO.flatMap((s) => s.lines).join(' ');
  for (const word of ['fly home', 'GFR', 'holds his breath', 'December']) assert.ok(ending.includes(word), word);
  assert.ok(QUESTS.find((q) => q.id === 'burma').intro.some(([who, text]) => who === 'Foff' && text.includes('twenty-seven dollars a person')));
});

test('every quest survives a minute of button mashing, says things in the right shape and ends or keeps a status', () => {
  for (const q of QUESTS) for (const seed of [1, 2, 3]) {
    const said = [], stage = q.make(env(seed, said)), rnd = rng(seed * 77);
    assert.ok(['dpad', 'lr', 'none'].includes(stage.pad) && stage.hint, q.id);
    for (let i = 0; i < 3600 && !stage.result; i++) {
      const inp = { x: Math.floor(rnd() * 3) - 1, y: Math.floor(rnd() * 3) - 1, held: rnd() < 0.5, tap: rnd() < 0.05, point: rnd() < 0.02 ? [rnd() * 432, rnd() * 704] : null };
      stage.update(1 / 60, inp);
      if (i % 30 === 0) { stage.draw(ctx, i / 60); assert.equal(typeof stage.status(), 'string', q.id); }
    }
    stage.draw(ctx, 60);
    assert.ok([null, 'win', 'lose'].includes(stage.result), q.id);
    for (const line of said) assert.ok(line.includes(': '), `${q.id}: ${line}`);
  }
});

test('the ones with a clock end on their own if nobody touches anything', () => {
  for (const id of ['van', 'dessert', 'carmel', 'edibles', 'mystery', 'sardine', 'dametra', 'hmb', 'sfo', 'banya', 'piper']) {
    const stage = QUESTS.find((q) => q.id === id).make(env(5));
    for (let i = 0; i < 60 * 150 && !stage.result; i++) stage.update(1 / 60, idle);
    assert.ok(stage.result, id);
  }
});

test('the timed drives: holding the speed they start at is too slow, and putting your foot down gets there', () => {
  const clear = () => ({ ...env(1), rnd: () => 0.99 }); // everything parks in the right-hand lane, out of a straight line's way
  for (const id of ['van', 'sfo']) {
    const run = (y) => { const stage = QUESTS.find((q) => q.id === id).make(clear()); for (let i = 0; i < 60 * 90 && !stage.result; i++) stage.update(1 / 60, { ...idle, y }); return stage.result; };
    assert.deepEqual([run(0), run(-1)], ['lose', 'win'], id);
  }
});

test('the lockers pack, with one bag turned on its side', () => {
  const stage = QUESTS.find((q) => q.id === 'luggage').make(env(1)), S = 56, tap = (x, y) => stage.update(0, { ...idle, point: [48 + x * S + 20, 130 + y * S + 20] });
  // bags come up in order: duffel 3x2, clubs 4x1, clubs 4x1, case 2x2, case 2x2, bag 2x1, bag 2x1 (stood up in the last column)
  for (const [x, y] of [[0, 0], [2, 2], [2, 3], [3, 0], [0, 2], [0, 4], [5, 0]]) tap(x, y);
  assert.equal(stage.result, 'win');
});

test('Steeze will eat exactly one dish, and each refusal names something he really dislikes', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const said = [], stage = QUESTS.find((q) => q.id === 'burma').make(env(seed, said)), order = (i) => stage.update(0, { ...idle, point: [200, 140 + i * 58 + 20] });
    let eaten = 0;
    for (let i = 0; i < 8 && !stage.result; i++) { order(i); if (stage.result === 'win') eaten++; }
    assert.ok(stage.result === 'win' ? eaten === 1 : said.length >= 5, `seed ${seed}`);
  }
});

test('the lazy Susan has an order that satisfies everyone', () => {
  const said = [], stage = QUESTS.find((q) => q.id === 'chinese').make(env(1, said)), row = (i) => stage.update(0, { ...idle, point: [200, 96 + i * 40 + 20] });
  row(9); assert.equal(stage.result, null); assert.equal(said.length, 1, 'an empty order gets a complaint');
  for (const i of [0, 4, 5, 6]) row(i); // orange chicken, fried rice, chow mein, duck
  row(9); assert.equal(stage.result, 'win');
});

test('the Mystery Spot: a ball pushed off the edge starts the room again, every room can be finished, and down moves in the last one', () => {
  const make = () => QUESTS.find((q) => q.id === 'mystery').make(env(1));
  let ball = [0, 0]; // read the ball back out of the picture: it is the only 12 by 12 square drawn
  const eye = new Proxy({}, { get: (_, k) => (k === 'fillRect' ? (x, y, w, h) => { if (w === 12 && h === 12) ball = [x + 6, y + 6]; } : () => {}), set: () => true });
  const look = (stage) => { stage.draw(eye, 0); return ball.slice(); };
  const routes = [[[340, 420], [340, 340], [216, 172]], [[193, 540], [243, 360], [360, 200]], [[110, 545], [110, 400], [216, 395]]]; // round each wall, then to the hole
  /** Steer along a room's route until the room changes or the time is up. A big jump means it fell off and began again. */
  function play(stage, n, secs = 40) {
    let leg = 0, before = look(stage);
    for (let i = 0; i < 60 * secs && !stage.result && stage.status().startsWith(`ROOM ${n + 1}`); i++) {
      const p = look(stage);
      const vel = [(p[0] - before[0]) * 60, (p[1] - before[1]) * 60];
      if (Math.hypot(p[0] - before[0], p[1] - before[1]) > 80) { leg = 0; vel[0] = vel[1] = 0; }
      before = p;
      const [tx, ty] = routes[n][leg], dx = tx - p[0], dy = ty - p[1], ax = dx - vel[0] * 0.5, ay = dy - vel[1] * 0.5; // ease off before it gets there
      if (leg < routes[n].length - 1 && Math.hypot(dx, dy) < 22) leg++;
      stage.update(1 / 60, { ...idle, x: Math.abs(ax) > 5 ? Math.sign(ax) : 0, y: Math.abs(ay) > 5 ? Math.sign(ay) : 0 });
    }
  }

  const lost = make(), tee = look(lost); // hold down in the first room: off the bottom, and back where it began
  let far = 0, back = false;
  for (let i = 0; i < 60 * 5 && !back; i++) { lost.update(1 / 60, { ...idle, y: 1 }); const p = look(lost); far = Math.max(far, p[1]); back = far > 640 && Math.hypot(p[0] - tee[0], p[1] - tee[1]) < 30; }
  assert.ok(back && lost.status().startsWith('ROOM 1'), `got as far as ${Math.round(far)} and came back: ${back}`);

  const stage = make();
  for (const n of [0, 1, 2]) { assert.ok(stage.status().startsWith(`ROOM ${n + 1}`), stage.status()); play(stage, n); }
  assert.equal(stage.result, 'win');

  const last = make(), pulls = new Set(); // left alone in the last room, the ball is pulled several different ways
  play(last, 0); play(last, 1);
  assert.ok(last.status().startsWith('ROOM 3'));
  for (let i = 0; i < 60 * 14; i++) { const p = look(last); last.update(1 / 60, idle); const q = look(last), dx = q[0] - p[0], dy = q[1] - p[1]; if (Math.hypot(dx, dy) < 40 && Math.hypot(dx, dy) > 0.3) pulls.add(`${Math.sign(Math.round(dx))},${Math.sign(Math.round(dy))}`); }
  assert.ok(pulls.size >= 3, `pulled ${pulls.size} ways: ${[...pulls].join(' ')}`);
});
