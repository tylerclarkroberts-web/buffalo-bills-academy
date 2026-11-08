// v60: deal-reveal must not replay a finished hand when settle → next betting round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetFrom, plan } from '../client/src/bj/useDealReveal.js';

test('targetFrom: showLast keeps the same key as the live round (no r:N → last:N reset)', () => {
  const live = {
    round: { no: 3, phase: 'play', holeShown: true, dealer: ['Ah', '9d'], hands: [{ i: 0, cards: ['Td', '7c'] }] },
    last: null,
  };
  const after = {
    round: { no: 4, phase: 'betting', bets: {}, hands: [], dealer: [] },
    last: { no: 3, dealer: ['Ah', '9d', '5s'], hands: [{ seat: 0, cards: ['Td', '7c'], bet: 10 }], results: [] },
  };
  const a = targetFrom(live, false);
  const b = targetFrom(after, true); // betting + last → showLast
  assert.equal(a.key, 'r:3');
  assert.equal(b.key, 'r:3', 'showLast must reuse r:N so the UI does not reset and replay');
  assert.equal(b.settled, true);
  assert.equal(b.hole, true);
  assert.equal(b.d, 3);
});

test('targetFrom: a brand-new round gets a new key so the initial deal still paces', () => {
  const bettingNew = {
    round: { no: 4, phase: 'play', holeShown: false, dealer: ['2h', null], hands: [{ i: 0, cards: ['Kd', '5c'] }] },
    last: { no: 3, dealer: ['Ah', '9d'], hands: [{ cards: ['Td', '7c'] }] },
  };
  assert.equal(targetFrom(bettingNew, false).key, 'r:4');
  assert.notEqual(targetFrom(bettingNew, false).key, targetFrom(bettingNew, true).key);
});

test('plan: from empty deals interlaced; from partial only appends new cards (no full replay)', () => {
  const want = { d: 2, hands: { 0: 2 } };
  const full = plan(want, { d: 0, hands: {} });
  assert.deepEqual(full.map((b) => `${b.k}${b.hand ?? ''}:${b.n}`), ['h0:1', 'd:1', 'h0:2', 'd:2']);
  const already = plan(want, { d: 2, hands: { 0: 2 } });
  assert.deepEqual(already, [], 'fully shown hand plans nothing — settle must not re-queue the deal');
  const hit = plan({ d: 2, hands: { 0: 3 } }, { d: 2, hands: { 0: 2 } });
  assert.deepEqual(hit, [{ k: 'h', hand: 0, n: 3 }]);
  const dealerHit = plan({ d: 3, hands: { 0: 2 } }, { d: 2, hands: { 0: 2 } });
  assert.deepEqual(dealerHit, [{ k: 'd', n: 3 }]);
});
