import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, evaluate5, compareScores, CATEGORY } from '../server/engine/evaluator.js';

const best = (s) => bestHand(s.split(' '));
const cmp = (a, b) => compareScores(best(a).score, best(b).score);

test('recognizes every hand category', () => {
  const cases = [
    ['As Ks Qs Js Ts', CATEGORY.STRAIGHT_FLUSH, 'Royal Flush'],
    ['9h 8h 7h 6h 5h', CATEGORY.STRAIGHT_FLUSH, 'Straight Flush, Nine high'],
    ['Ad Ac Ah As 2c', CATEGORY.QUADS, 'Four of a Kind, Aces'],
    ['Kd Kc Kh 7s 7c', CATEGORY.FULL_HOUSE, 'Full House, Kings full of Sevens'],
    ['Ah 9h 7h 4h 2h', CATEGORY.FLUSH, 'Flush, Ace high'],
    ['Td 9c 8h 7s 6c', CATEGORY.STRAIGHT, 'Straight, Ten high'],
    ['5d 4c 3h 2s Ac', CATEGORY.STRAIGHT, 'Straight, Five high'],
    ['Qd Qc Qh 7s 2c', CATEGORY.TRIPS, 'Three of a Kind, Queens'],
    ['Jd Jc 4h 4s Ac', CATEGORY.TWO_PAIR, 'Two Pair, Jacks and Fours'],
    ['6d 6c Ah 9s 2c', CATEGORY.PAIR, 'Pair of Sixes'],
    ['Kd Jc 9h 6s 3c', CATEGORY.HIGH_CARD, 'High Card, King'],
  ];
  for (const [cards, cat, name] of cases) {
    const r = best(cards);
    assert.equal(r.category, cat, cards);
    assert.equal(r.name, name, cards);
  }
});

test('category ordering', () => {
  const order = ['Kd Jc 9h 6s 3c', '6d 6c Ah 9s 2c', 'Jd Jc 4h 4s Ac', 'Qd Qc Qh 7s 2c', 'Td 9c 8h 7s 6c',
    'Ah 9h 7h 4h 2h', 'Kd Kc Kh 7s 7c', 'Ad Ac Ah As 2c', '9h 8h 7h 6h 5h'];
  for (let i = 1; i < order.length; i++) assert.equal(cmp(order[i], order[i - 1]), 1, order[i]);
});

test('wheel straight is the lowest straight; A-high straight is the highest', () => {
  assert.equal(cmp('6d 5c 4h 3s 2c', '5d 4c 3h 2s Ac'), 1);
  assert.equal(cmp('Ad Kc Qh Js Tc', 'Kd Qc Jh Ts 9c'), 1);
  assert.equal(best('5s 4s 3s 2s As').name, 'Straight Flush, Five high');
  // A-K-Q-J-2 is not a straight
  assert.equal(best('Ad Kc Qh Js 2c').category, CATEGORY.HIGH_CARD);
});

test('kickers decide ties', () => {
  assert.equal(cmp('Ad Ac Kh 9s 3c', 'Ah As Qh Js Tc'), 1, 'pair kicker');
  assert.equal(cmp('Kd Kc 4h 4s Ac', 'Kh Ks 4d 4c Qc'), 1, 'two pair kicker');
  assert.equal(cmp('Kd Kc 5h 5s 2c', 'Kh Ks 4d 4c Ac'), 1, 'second pair beats kicker');
  assert.equal(cmp('7d 7c 7h As 2c', '7d 7c 7h Ks Qc'), 1, 'trips kicker');
  assert.equal(cmp('Ah Jh 9h 4h 3h', 'Ad Jd 9d 4d 2d'), 1, 'flush last card');
  assert.equal(cmp('Ad Ac Ah As Kc', 'Ad Ac Ah As Qc'), 1, 'quads kicker');
  assert.equal(cmp('3d 3c 3h As Ac', '2d 2c 2h Ks Kc'), 1, 'full house trips first');
  assert.equal(cmp('Kd Jc 9h 6s 3c', 'Kh Jd 9c 6d 2c'), 1, 'high card 5th kicker');
});

test('identical hands tie (split pot)', () => {
  assert.equal(cmp('Ad Kc Qh Js 9c', 'Ah Ks Qd Jc 9d'), 0);
  // board plays: both players use the same five board cards
  const board = 'Ts Js Qd Kh Ac';
  assert.equal(cmp(`2c 3d ${board}`, `4c 5d ${board}`), 0);
});

test('picks the best 5 of 7 cards', () => {
  const r = best('2c 2d Kh Ks Kd 7h 7c');
  assert.equal(r.name, 'Full House, Kings full of Sevens');
  const f = best('Ah 2h 5h 9h Kh Qh 3c');
  assert.equal(f.name, 'Flush, Ace high');
  assert.deepEqual(f.score, [CATEGORY.FLUSH, 14, 13, 12, 9, 5]);
  assert.equal(best('As 2d 3c 4h 5s 9d 9c').name, 'Straight, Five high');
  assert.equal(best('8s 9s Ts Js Qs Ks 2c').name, 'Straight Flush, King high');
  assert.equal(best('4c 5d 6h 7s 8c 9d Tc').name, 'Straight, Ten high');
});

test('evaluate5 rejects wrong sizes', () => {
  assert.throws(() => evaluate5(['As']));
});
