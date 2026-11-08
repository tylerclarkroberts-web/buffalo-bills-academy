import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, splitPot } from '../server/engine/pots.js';

test('single pot when everyone matched', () => {
  assert.deepEqual(buildPots([{ seat: 0, amount: 100 }, { seat: 1, amount: 100 }, { seat: 2, amount: 100 }]), [{ amount: 300, eligible: [0, 1, 2] }]);
});

test('multiple all-ins create main and side pots', () => {
  const pots = buildPots([
    { seat: 0, amount: 50 }, { seat: 1, amount: 200 }, { seat: 2, amount: 500 }, { seat: 3, amount: 500 },
  ]);
  assert.deepEqual(pots, [
    { amount: 200, eligible: [0, 1, 2, 3] },
    { amount: 450, eligible: [1, 2, 3] },
    { amount: 600, eligible: [2, 3] },
  ]);
});

test('folded chips stay in the pot but folded players are not eligible', () => {
  const pots = buildPots([
    { seat: 0, amount: 300, folded: true }, { seat: 1, amount: 100 }, { seat: 2, amount: 500 }, { seat: 3, amount: 500 },
  ]);
  assert.deepEqual(pots, [
    { amount: 400, eligible: [1, 2, 3] },
    { amount: 1000, eligible: [2, 3] },
  ]);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 1400);
});

test('uncalled top bet becomes a one-player pot (returned)', () => {
  const pots = buildPots([{ seat: 0, amount: 100 }, { seat: 1, amount: 40 }]);
  assert.deepEqual(pots, [{ amount: 80, eligible: [0, 1] }, { amount: 60, eligible: [0] }]);
});

test('odd chip goes to first winner left of the button', () => {
  assert.deepEqual(splitPot(101, [2, 5], 3, 6), { 5: 51, 2: 50 });
  assert.deepEqual(splitPot(101, [2, 5], 0, 6), { 2: 51, 5: 50 });
  assert.deepEqual(splitPot(100, [1, 4, 7], 4, 9), { 7: 34, 1: 33, 4: 33 });
  assert.deepEqual(splitPot(90, [1, 4, 7], 4, 9), { 7: 30, 1: 30, 4: 30 });
});
