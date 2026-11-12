import test from 'node:test';
import assert from 'node:assert/strict';
import { distFrom, pathSteps, geigerFacing, geigerBars } from '../server/engine/maze.js';

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
  assert.equal(geigerFacing(d, 1, 1, Math.PI), 1, 'follow the bend south');
  assert.ok(Math.abs(geigerFacing(d, 1, 1, -Math.PI / 2)) < 1e-9, 'no bonus for facing acid through rock');
  assert.equal(geigerFacing(d, 1, 1, 0), -1);
  assert.equal(geigerFacing(d, 3, 1, 0), 0, 'neutral on the target');
  assert.equal(geigerFacing(d, 2, 1, 0), 0, 'neutral without a route');
  assert.equal(geigerFacing(d, -2, -2, 0), 0, 'neutral outside the map');
});

test('turning at a fork favors the acid tunnel smoothly, including wrapped yaw', () => {
  const grid = [
    [1, 1, 1, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 1, 1, 1],
  ];
  const d = distFrom(grid, 3, 2);
  assert.equal(geigerFacing(d, 2, 2, -Math.PI / 2), 1);
  assert.equal(geigerFacing(d, 2, 2, Math.PI / 2), -1);
  assert.ok(Math.abs(geigerFacing(d, 2, 2, 0)) < 1e-9);
  for (let yaw = -Math.PI * 2; yaw <= Math.PI * 2; yaw += 0.1) {
    const facing = geigerFacing(d, 2.2, 1.8, yaw);
    assert.ok(Math.abs(facing + Math.sin(yaw)) < 1e-9);
    assert.ok(Math.abs(facing - geigerFacing(d, 2.2, 1.8, yaw + Math.PI * 2)) < 1e-9);
  }
});

test('both equally short routes receive the facing bonus', () => {
  const grid = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  const d = distFrom(grid, 3, 2);
  assert.equal(geigerFacing(d, 1, 2, 0), 1);
  assert.equal(geigerFacing(d, 1, 2, Math.PI), 1);
  assert.ok(Math.abs(geigerFacing(d, 1, 2, -Math.PI / 2)) < 1e-9);
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

test('direction nudges the bars while distance still dominates and ten means close', () => {
  assert.ok(geigerBars(10, 48, 1) > geigerBars(10));
  assert.ok(geigerBars(10) > geigerBars(10, 48, -1));
  assert.ok(geigerBars(3, 48, -1) > geigerBars(30, 48, 1));
  for (const facing of [-1, -0.5, 0, 0.5, 1]) {
    let last = 10;
    for (let steps = 0; steps <= 80; steps += 0.25) {
      const base = geigerBars(steps), bars = geigerBars(steps, 48, facing);
      assert.ok(Number.isInteger(bars) && bars >= 1 && bars <= 10);
      assert.ok(bars <= last); last = bars;
      assert.ok(Math.abs(bars - base) <= 1, 'direction changes at most one bar');
      if (facing === 0 || base === 10) assert.equal(bars, base);
      else assert.ok(bars < 10, 'direction cannot claim the pool is in reach');
    }
  }
});
