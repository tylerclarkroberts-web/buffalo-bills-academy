import test from 'node:test';
import assert from 'node:assert/strict';
import { offerQueue } from '../client/src/fight/offerQueue.js';

test('fight offers queue in first-seen order, one at a time', () => {
  const book = { seen: {}, seq: 0 };
  let offers = { A: null, B: 'B.1', C: null };
  const q = () => offerQueue(book, ['A', 'B', 'C'], (c) => offers[c]);
  assert.deepEqual(q(), ['B']);
  offers.A = 'A.1'; // appears later, so it waits behind B even though A is first in the layout
  assert.deepEqual(q(), ['B', 'A']);
  offers.B = null; // B declined or fought
  assert.deepEqual(q(), ['A']);
  offers.B = 'B.2'; offers.C = 'C.1'; // B's next hand: a new offer, back of the line
  assert.deepEqual(q(), ['A', 'B', 'C']);
  offers.A = 'A.2'; // A's offer for a new hand rejoins at the back
  assert.deepEqual(q(), ['B', 'C', 'A']);
});

test('closed tables drop out of the queue', () => {
  const book = { seen: {}, seq: 0 };
  const offers = { A: 'A.1', B: 'B.1' };
  assert.deepEqual(offerQueue(book, ['A', 'B'], (c) => offers[c]), ['A', 'B']);
  assert.deepEqual(offerQueue(book, ['B'], (c) => offers[c]), ['B']);
  assert.deepEqual(Object.keys(book.seen), ['B']);
});
