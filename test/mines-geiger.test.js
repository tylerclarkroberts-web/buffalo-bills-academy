import test from 'node:test';
import assert from 'node:assert/strict';
import { distFrom, pathSteps, geigerBars } from '../client/src/mines/maze.js';

test('the geiger measures the walk, not the wall', () => {
  // A U-shaped tunnel: the pool is two tiles away through rock, six by foot.
  const grid = [
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  const d = distFrom(grid, 3, 1);
  assert.equal(pathSteps(d, 1, 1), 6);
  assert.ok(Math.abs(pathSteps(d, 3, 1.4) - 0.4) < 1e-9);
  assert.ok(Math.abs(pathSteps(d, 1, 1.5) - 5.5) < 1e-9); // moves smoothly between tiles
});

test('geiger bars span the whole mine and never rise as you walk away', () => {
  assert.equal(geigerBars(0), 10);
  assert.equal(geigerBars(60), 1);
  assert.equal(geigerBars(Infinity), 1);
  let last = 10; const seen = new Set();
  for (let s = 0; s <= 60; s += 0.25) { const b = geigerBars(s); assert.ok(b <= last); last = b; seen.add(b); }
  assert.equal(seen.size, 10);
  assert.ok(geigerBars(26) >= 3); // the nearest first pool already reads above the floor at clock-in
});
