// Raise panel sizing: steps, pot presets and the curved slider (client/src/table/betsize.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betPresets, betToSlider, clampBet, sliderToBet, stepBet, SLIDER_MAX } from '../client/src/table/betsize.js';

test('steps move one blind at a time and stay inside the legal range', () => {
  assert.equal(stepBet(20, 1, 5, 20, 5000), 25);
  assert.equal(stepBet(25, 1, 10, 20, 5000), 30); // lands on the 10 grid
  assert.equal(stepBet(333, 1, 5, 20, 5000), 335); // an off-grid pot size snaps first
  assert.equal(stepBet(333, -1, 5, 20, 5000), 330);
  assert.equal(stepBet(20, -1, 5, 20, 5000), 20); // never below the minimum raise
  assert.equal(stepBet(4998, 1, 5, 20, 5000), 5000); // never past all-in
  assert.equal(stepBet(5000, -1, 5, 20, 5000), 4995);
  assert.equal(stepBet('', 1, 5, 20, 5000), 25); // an emptied amount box starts from the minimum
});

test('typed amounts are clamped to whole chips', () => {
  assert.equal(clampBet(12, 20, 5000), 20);
  assert.equal(clampBet(99999, 20, 5000), 5000);
  assert.equal(clampBet(45.6, 20, 5000), 46);
  assert.equal(clampBet('abc', 20, 5000), 20);
});

test('the slider spends most of its travel on small sizes when the range is large', () => {
  const min = 20, max = 5000;
  assert.equal(sliderToBet(0, min, max, 5), min);
  assert.equal(sliderToBet(SLIDER_MAX, min, max, 5), max);
  const half = sliderToBet(SLIDER_MAX / 2, min, max, 5);
  assert.ok(half < 400, `half way is ${half}, far below the 2,510 a straight line gives`);
  // every stop is a multiple of the small blind (or an end), and the slider never goes backwards
  let prev = min;
  for (let p = 0; p <= SLIDER_MAX; p += 1) {
    const v = sliderToBet(p, min, max, 5);
    assert.ok(v >= prev && v >= min && v <= max);
    assert.ok(v % 5 === 0 || v === min || v === max);
    prev = v;
  }
  // near the minimum one slider unit changes the amount by at most one step
  assert.ok(sliderToBet(40, min, max, 5) - sliderToBet(0, min, max, 5) <= 5);
});

test('slider position and amount agree in both directions', () => {
  for (const [min, max] of [[20, 5000], [100, 150], [2, 400], [50, 50]]) {
    for (const v of [min, Math.round((min + max) / 2), max]) {
      const back = sliderToBet(betToSlider(v, min, max), min, max, 1);
      assert.ok(Math.abs(back - v) <= Math.max(1, v * 0.01), `${v} -> ${back} in ${min}..${max}`);
    }
  }
  assert.equal(betToSlider(20, 20, 5000), 0);
  assert.equal(betToSlider(5000, 20, 5000), SLIDER_MAX);
});

test('a small range keeps a straight-line slider', () => {
  assert.equal(sliderToBet(SLIDER_MAX / 2, 100, 200, 1), 150);
});

test('presets are pot sizes after calling, rounded to the small blind, without duplicates', () => {
  // facing a bet of 100 into a pot of 300 (pot already includes the bet): calling makes it 400
  const p = betPresets({ min: 200, max: 5000, pot: 300, toCall: 100, currentBet: 100, step: 5 });
  assert.deepEqual(p, [['Min', 200], ['½ pot', 300], ['¾ pot', 400], ['Pot', 500], ['All-in', 5000]]);
  // short stack: every pot size is past all-in, so only the two ends remain
  assert.deepEqual(betPresets({ min: 200, max: 260, pot: 3000, toCall: 100, currentBet: 100, step: 5 }), [['Min', 200], ['All-in', 260]]);
  // all-in is the only legal raise
  assert.deepEqual(betPresets({ min: 80, max: 80, pot: 300, toCall: 40, currentBet: 40, step: 5 }), [['Min', 80]]);
  // tiny pot: sizes below the minimum collapse onto Min
  const tiny = betPresets({ min: 20, max: 5000, pot: 15, toCall: 10, currentBet: 10, step: 5 });
  assert.deepEqual(tiny.map(([l]) => l), ['Min', '½ pot', '¾ pot', 'Pot', 'All-in']);
  assert.deepEqual(tiny.map(([, v]) => v), [20, 25, 30, 35, 5000]);
});
