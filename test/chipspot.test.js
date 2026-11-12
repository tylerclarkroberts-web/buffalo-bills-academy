// Bet chip placement on the phone felt (client/src/table/chipspot.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipSpot, rectAt } from '../client/src/table/chipspot.js';

const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
// a 351×479 phone felt box, like the six-seat table in the browser checks
const felt = { cx: 175, cy: 263, rx: 140, ry: 153 };
const chip = { hw: 30, hh: 11 };

test('a chip lands on the felt, clear of every block, close to its seat', () => {
  const seat = rectAt(70, 190, 48, 50); // upper-left seat with its name plate
  const board = { x0: 98, x1: 252, y0: 250, y1: 290 };
  const pot = { x0: 110, x1: 240, y0: 298, y1: 326 };
  const blocks = [seat, board, pot];
  const at = chipSpot({ from: { x: 70, y: 190 }, chip, blocks, felt });
  assert.equal(at.clear, true);
  const r = rectAt(at.x, at.y, chip.hw, chip.hh);
  for (const b of blocks) assert.equal(hit(r, b), false);
  assert.ok(((at.x - felt.cx) / felt.rx) ** 2 + ((at.y - felt.cy) / felt.ry) ** 2 <= 1, 'on the felt');
  assert.ok(Math.hypot(at.x - 70, at.y - 190) < 110, 'still next to its own seat');
});

test('two chips never share a spot once the first is added to the blocks', () => {
  const blocks = [rectAt(60, 300, 48, 50), rectAt(90, 400, 48, 50), { x0: 98, x1: 252, y0: 250, y1: 290 }];
  const a = chipSpot({ from: { x: 60, y: 300 }, chip, blocks, felt });
  blocks.push(rectAt(a.x, a.y, chip.hw, chip.hh));
  const b = chipSpot({ from: { x: 90, y: 400 }, chip, blocks, felt });
  assert.equal(a.clear && b.clear, true);
  assert.equal(hit(rectAt(a.x, a.y, chip.hw, chip.hh), rectAt(b.x, b.y, chip.hw, chip.hh)), false);
});

test('with no free spot it reports that and picks the least-covered one', () => {
  const wall = { x0: -1000, x1: 1000, y0: -1000, y1: 1000 };
  const at = chipSpot({ from: { x: 70, y: 190 }, chip, blocks: [wall], felt });
  assert.equal(at.clear, false);
  assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y));
});

test('with an inner oval to stay outside of, the chip keeps to the band along the rim', () => {
  const inner = { rx: felt.rx * 0.8, ry: felt.ry * 0.8 };
  const at = chipSpot({ from: { x: 175, y: 420 }, chip: { hw: 12, hh: 8 }, blocks: [], felt, outside: inner });
  assert.ok(at.clear);
  for (const [x, y] of [[at.x - 12, at.y - 8], [at.x + 12, at.y - 8], [at.x - 12, at.y + 8], [at.x + 12, at.y + 8]]) {
    assert.ok(((x - felt.cx) / inner.rx) ** 2 + ((y - felt.cy) / inner.ry) ** 2 >= 1, 'no corner past the line');
  }
});

test('with a side given, the chip stays on that side of the seat', () => {
  const seat = rectAt(175, 380, 40, 30);
  const at = chipSpot({ from: { x: 175, y: 380 }, chip, blocks: [seat], felt, side: { x: 175, y: 380, dx: -1, dy: 0 } });
  assert.ok(at.clear && at.x <= 175);
});

test('chip piles: change stays loose, and every chip is counted', async () => {
  const { chipPiles } = await import('../client/src/util.js');
  const counts = (n) => chipPiles(n).map((p) => p[1]);
  assert.deepEqual(counts(525), [5, 9, 7, 3]); // 5×1 + 9×5 + 7×25 + 3×100
  assert.deepEqual(counts(16), [6, 2]);
  assert.deepEqual(counts(2), [2]);
  assert.deepEqual(counts(0), []);
  assert.ok(chipPiles(1e9).every((p) => p[1] <= 10) && chipPiles(1e9).length <= 8);
});
