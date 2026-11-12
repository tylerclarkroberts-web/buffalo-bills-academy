import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickTurn } from '../client/src/mines/controls.js';

test('the walking stick ignores small sideways drift and steers equally in both directions', () => {
  for (const x of [-0.3, -0.1, 0, 0.1, 0.3]) assert.equal(stickTurn(x), 0);
  for (const x of [0.31, 0.45, 0.7, 1]) assert.equal(stickTurn(-x), -stickTurn(x));
  assert.equal(stickTurn(1), 0.9);
  assert.equal(stickTurn(-1), -0.9);
  assert.equal(stickTurn(2), 0.9);
});

test('small thumb movements change steering gradually across the entire stick range', () => {
  let previous = stickTurn(-1);
  for (let step = -999; step <= 1000; step++) {
    const current = stickTurn(step / 1000);
    assert.ok(current >= previous, 'steering never reverses while the thumb moves right');
    assert.ok(current - previous < 0.002, `steering jumps near ${step / 1000}`);
    previous = current;
  }
});
