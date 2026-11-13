// Barn bout replays (v35): the staged show must follow the stored rounds, cover every bug, and draw every gear item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../server/engine/creatures.js';
import { simulateBout } from '../server/engine/bout.js';
import { Barn } from '../server/barn.js';
import { BUG_ITEMS } from '../server/catalog/bug.js';
import { STYLES, STYLE_OF, planBout, locate, drawBout, introLine, verdictLine, INTRO_MS, FINISH_MS } from '../client/src/barn/boutFx.js';
import { GEAR_SHAPES, spriteCanvas } from '../client/src/barn/sprite.js';

// A canvas stand-in: every drawing call is a no-op, pixels are recorded.
function mockCanvas(t) {
  const context = () => new Proxy({ pixels: [] }, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} })
      : k === 'fillRect' ? (...a) => o.pixels.push(a) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  class Canvas { constructor(w, h) { this.width = w; this.height = h; this.ctx = context(); } getContext() { return this.ctx; } }
  const old = globalThis.OffscreenCanvas; globalThis.OffscreenCanvas = Canvas;
  t.after(() => { if (old === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = old; });
  return Canvas;
}
const fighter = (species, level = 10, specials = ['technique', 'signature']) => ({ species, name: species, level, mood: 70, gear: 0, battle: { stance: 'balanced', specials } });
const bout = (a, b, seed, extra = {}) => { const r = simulateBout(a, b, seed); return { id: seed, you: a, them: b, ...r, result: r.winner === 0 ? 'won' : r.winner === 1 ? 'lost' : 'draw', ...extra }; };

test('every bug has a fighting style and the style table names only real bugs', () => {
  for (const bug of ROSTER) assert.ok(STYLES[STYLE_OF[bug.id]], `${bug.id} has a style`);
  for (const id of Object.keys(STYLE_OF)) assert.ok(ROSTER.some((bug) => bug.id === id), `${id} is in the roster`);
});

test('statuses follow the engine: guard, venom and weaken start and wear off with the stored rounds', () => {
  const r = (by, effect, extra = {}) => ({ by, type: 'move', effect, moveId: effect === 'strike' ? 'basic' : 'technique', tier: 1, hit: true, dmg: 5, hp: [90, 90], line: 'x', ...extra });
  const plan = planBout({ you: fighter('lamprima'), them: fighter('phrictus'), maxHp: [100, 100], result: 'draw', rounds: [
    r(0, 'guard', { hit: false, dmg: 0 }), r(1, 'heal', { dmg: 0, healed: 10 }), r(1, 'venom'), { by: 1, type: 'venom', effect: 'venom', tier: 1, hit: true, dmg: 5, hp: [80, 90], line: 'x' },
    r(0, 'weaken'), { by: 1, type: 'venom', effect: 'venom', tier: 1, hit: true, dmg: 5, hp: [75, 90], line: 'x' }, r(1, 'strike'),
  ] });
  const after = plan.beats.map((b) => b.after);
  assert.equal(after[0][0].guard, true, 'a guard move raises a guard even when it misses');
  assert.equal(after[1][0].guard, true, 'healing is not an attack, so the guard holds');
  assert.equal(after[2][0].guard, false, 'the next attack spends it');
  assert.equal(after[2][0].poison, 2);
  assert.equal(after[3][0].poison, 1, 'a venom round damages the side opposite its `by`');
  assert.equal(after[4][1].weak, true);
  assert.equal(after[5][0].poison, 0);
  assert.equal(after[6][1].weak, false, 'the weakened bug\'s next attack uses it up');
  assert.deepEqual(plan.beats[3].before, after[2], 'each beat starts from the previous one\'s statuses');
});

test('replays of real bouts keep a sane timeline, from either fighter\'s side', () => {
  for (let i = 0; i < ROSTER.length; i++) {
    const a = fighter(ROSTER[i].id), b = fighter(ROSTER[(i * 7 + 3) % ROSTER.length].id, 9, ['technique', 'capstone']);
    for (const seed of ['s1', 's2']) {
      const host = bout(a, b, `${i}:${seed}`);
      const guest = { ...host, you: b, them: a, rounds: host.rounds.map((r) => ({ ...r, by: 1 - r.by, hp: [...r.hp].reverse() })) }; // as server/barn.js stores it
      for (const bt of [host, guest]) {
        const plan = planBout(bt);
        assert.equal(plan.beats.length, bt.rounds.length);
        let at = INTRO_MS;
        for (const beat of plan.beats) {
          assert.equal(beat.at, at); assert.ok(beat.charge <= beat.impactAt && beat.impactAt < beat.dur); at += beat.dur;
          assert.ok(beat.dur - beat.impactAt - beat.stop >= 1300, 'after a blow lands there is time to read it before the next begins');
          if (beat.kind === 'tick') assert.ok(beat.before[1 - beat.r.by].poison > 0, 'venom only ticks on a poisoned bug');
          assert.equal(locate(plan, beat.at).i, beat.i); assert.equal(locate(plan, beat.at + beat.impactAt).phase, 'land');
        }
        assert.equal(plan.total, plan.end + FINISH_MS);
        assert.equal(plan.ending === 'ko', bt.rounds.at(-1).hp.includes(0));
        assert.deepEqual([locate(plan, 0).phase, locate(plan, plan.end).phase, locate(plan, plan.total).phase], ['intro', 'finish', 'done']);
      }
    }
  }
});

test('the whole show draws without errors for every style, wide and tall, and with reduced motion', (t) => {
  const Canvas = mockCanvas(t);
  const ids = Object.values(Object.fromEntries(Object.entries(STYLE_OF).map(([id, style]) => [style, id])));
  ids.forEach((id, k) => {
    const b = bout({ ...fighter(id), style: { gear: { shape: GEAR_SHAPES[k % GEAR_SHAPES.length] } } }, fighter(ids[(k + 1) % ids.length], 10, ['signature', 'capstone']), `draw${k}`);
    const plan = planBout(b);
    for (const [W, H] of [[900, 420], [330, 520]]) {
      const x = new Canvas(W, H).getContext(), fx = { parts: [], fired: new Set() };
      for (let tt = 0; tt <= plan.total + 500; tt += 33) drawBout(x, { W, H, bout: b, plan, t: tt, reduced: false, fx });
      assert.equal(fx.fired.size, plan.beats.length, 'every beat landed once');
      drawBout(x, { W, H, bout: b, plan, t: plan.total + 1, reduced: true, fx: { parts: [], fired: new Set() } });
    }
  });
});

test('every battle gear item draws on every bug, and the Barn passes equipped gear to the sprite', (t) => {
  mockCanvas(t);
  const gear = BUG_ITEMS.filter((item) => item.slot === 'gear').map((item) => item.id.slice(5));
  assert.deepEqual([...gear].sort(), [...GEAR_SHAPES].sort());
  for (const bug of ROSTER) for (const level of [3, 10]) {
    const plain = spriteCanvas(bug, null, level).getContext().pixels.length;
    for (const shape of GEAR_SHAPES) assert.ok(spriteCanvas(bug, { gear: { shape } }, level).getContext().pixels.length > plain, `${shape} shows on ${bug.id} at level ${level}`);
  }
  const barn = Object.create(Barn.prototype);
  barn.styleOf = () => ({ gear: 'gear-armor', gearBonus: 0.06, bughat: { id: 'bugwear-crown', shape: 'crown' } });
  assert.deepEqual(barn.looksOf('p'), { bughat: { id: 'bugwear-crown', shape: 'crown' }, gear: { id: 'gear-armor', shape: 'armor' } });
  barn.styleOf = () => ({ gearBonus: 0 });
  assert.equal(barn.looksOf('p'), undefined);
});

test('intro and verdict lines are picked per bout and name the fighters', () => {
  const b = bout(fighter('lamprima'), fighter('phrictus'), 'lines');
  assert.equal(introLine(b), introLine({ ...b })); assert.equal(verdictLine(b), verdictLine({ ...b }));
  const v = verdictLine(b);
  assert.ok(b.result === 'draw' ? /draw/i.test(v) : v.includes(b.result === 'won' ? 'lamprima wins' : 'phrictus wins'), v);
});
