import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markWild, readExploration, rememberExploration, revealExploration } from '../client/src/mines/exploration.js';

const grid = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 2, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];
const blank = () => ({ tiles: new Set(), pools: new Set(), wilds: new Set() });
const storage = () => {
  const records = new Map();
  return { records, getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
};

test('the chart reveals only the current tile and short straight views, stopping at walls and rubble', () => {
  const explored = blank();
  assert.equal(revealExploration(explored, grid, 1.1, 0.8, [], null), true);
  assert.deepEqual(explored.tiles, new Set(['1,1', '2,1', '3,1', '0,1', '1,2', '1,3', '1,0']));
  assert.equal(explored.tiles.has('4,1'), false, 'distant tunnel stays hidden');
  assert.equal(explored.tiles.has('2,2'), false, 'no diagonal or around-corner reveal');
  assert.equal(explored.tiles.has('1,4'), false, 'rubble blocks the view');
  assert.equal(revealExploration(explored, grid, 1, 1, [], null), false, 'standing still does not change the chart');
  assert.equal(revealExploration(explored, grid, 3, 1, [], null), true);
  assert.equal(explored.tiles.has('1,1'), true, 'old exploration remains');
  assert.equal(explored.tiles.has('5,1'), true);
  assert.equal(explored.tiles.has('3,3'), false, 'rock blocks the view');
});

test('pool markers need a current view and a hole that actually exists in the scene', () => {
  const explored = blank();
  const pools = [
    { id: 'current', x: 2, y: 1, quantity: null, remaining: null },
    { id: 'future', x: 3, y: 1, quantity: null, remaining: null },
    { id: 'remote', x: 5, y: 1, quantity: 20, remaining: 20 },
    { id: 'blocked', x: 1, y: 4, quantity: 20, remaining: 20 },
  ];
  revealExploration(explored, grid, 1, 1, pools, 'current');
  assert.deepEqual(explored.pools, new Set(['current']));
  assert.equal(revealExploration(explored, grid, 1, 1, pools, 'future'), true, 'a new hole can be discovered on a previously seen tile');
  assert.deepEqual(explored.pools, new Set(['current', 'future']));
  pools[0] = { ...pools[0], quantity: 20, remaining: 0 };
  revealExploration(explored, grid, 5, 1, pools, 'future');
  assert.deepEqual(explored.pools, new Set(['current', 'future', 'remote']), 'drained holes stay charted');
  assert.equal(explored.pools.has('blocked'), false);
});

test('invalid or blocked player positions cannot reveal tiles', () => {
  const explored = blank();
  for (const [x, y] of [[-1, 1], [1, -1], [99, 1], [NaN, 1], [Infinity, 1], [2, 2], [1, 3]]) {
    assert.equal(revealExploration(explored, grid, x, y, [], null), false);
  }
  assert.deepEqual(explored, blank());
});

test('reloading the same shift restores its chart, while another account or shift starts blank', () => {
  const store = storage(), explored = blank(), pools = [{ id: 'p0', x: 2, y: 1, quantity: null }];
  revealExploration(explored, grid, 1, 1, pools, 'p0');
  rememberExploration('alice', 'shift-1', explored, store);
  assert.deepEqual(readExploration('alice', 'shift-1', grid, pools, store), explored);
  assert.deepEqual(readExploration('bob', 'shift-1', grid, pools, store), blank());
  assert.deepEqual(readExploration('alice', 'shift-2', grid, pools, store), blank(), 'the same daily maze does not carry exploration into a new shift');
  const next = blank(); revealExploration(next, grid, 5, 5, pools, 'p0');
  rememberExploration('alice', 'shift-2', next, store);
  assert.equal(store.records.size, 1, 'one current chart per account, not an ever-growing list of shifts');
  assert.deepEqual(readExploration('alice', 'shift-1', grid, pools, store), blank());
  assert.deepEqual(readExploration('alice', 'shift-2', grid, pools, store), next);
});

test('malformed stored charts are discarded without breaking a shift', () => {
  const store = storage(), pools = [{ id: 'p0', x: 2, y: 1 }];
  for (const value of [
    '{', 'null', '{}',
    JSON.stringify({ shiftId: 'shift-1', tiles: {}, pools: [] }),
    ...[
      { tiles: ['99,1'], pools: [] },
      { tiles: ['-1,1'], pools: [] },
      { tiles: ['01,1'], pools: [] },
      { tiles: [null], pools: [] },
      { tiles: ['1,1'], pools: ['unknown'] },
      { tiles: ['1,1'], pools: ['p0'] },
      { tiles: Array(50).fill('1,1'), pools: [] },
    ].map(value => JSON.stringify({ shiftId: 'shift-1', ...value })),
  ]) {
    store.setItem('acidMine.map:alice', value);
    assert.deepEqual(readExploration('alice', 'shift-1', grid, pools, store), blank());
  }
});

test('wild sightings persist only for this shift and only while a known bug is still available', () => {
  const store = storage(), key = 'acidMine.map:alice';
  const a = { id: 'a', x: 3, y: 1 }, b = { id: 'b', x: 4, y: 1 }, unknown = { id: 'c', x: 1, y: 1 };
  const read = (wilds) => readExploration('alice', 'shift-1', grid, [], store, wilds);
  store.setItem(key, JSON.stringify({ shiftId: 'shift-1', tiles: ['1,1'], pools: [] }));
  const chart = read([a, b, unknown]);
  assert.deepEqual(chart.tiles, new Set(['1,1']), 'older chart is preserved');
  assert.equal(chart.wilds.size, 0, 'charted ground alone never reveals a wild bug');
  assert.ok(markWild(chart, a)); assert.ok(markWild(chart, b));
  assert.equal(markWild(chart, a), false, 'spotting the same bug again is silent');
  assert.ok(chart.tiles.has('3,1') && chart.tiles.has('4,1'));
  rememberExploration('alice', 'shift-1', chart, store);
  assert.deepEqual(read([a, b, unknown]).wilds, new Set(['a', 'b']));
  assert.deepEqual(read([a, unknown]).wilds, new Set(['a']), 'a caught or departed bug is gone after a reload');
  assert.equal(readExploration('alice', 'shift-2', grid, [], store, [a]).wilds.size, 0);
});

test('blocked storage and missing identity leave the in-memory chart usable', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const explored = readExploration('alice', 'shift-1', grid, [], blocked);
  assert.equal(revealExploration(explored, grid, 1, 1, [], null), true);
  assert.doesNotThrow(() => rememberExploration('alice', 'shift-1', explored, blocked));
  const store = storage();
  rememberExploration(null, 'shift-1', explored, store);
  rememberExploration('alice', null, explored, store);
  assert.equal(store.records.size, 0);
  assert.deepEqual(readExploration(null, 'shift-1', grid, [], store), blank());
});
