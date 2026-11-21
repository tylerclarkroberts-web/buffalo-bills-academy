import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cardSlotId, simSteps } from '../client/src/bj/povScene.js';
import { initialPreviewState, previewStep, previewView, previewTouchesLedger } from '../client/src/bj/povPreview.js';

test('card mesh ids include the round, so a new hand does not snap over the last one', () => {
  const a = cardSlotId({ roundNo: 1, seat: 0, hand: 0, idx: 0 });
  const b = cardSlotId({ roundNo: 2, seat: 0, hand: 0, idx: 0 });
  const d1 = cardSlotId({ roundNo: 1, dealer: true, idx: 0 });
  const d2 = cardSlotId({ roundNo: 2, dealer: true, idx: 0 });
  assert.notEqual(a, b);
  assert.notEqual(d1, d2);
  assert.match(a, /^p:1:0:0:0$/);
  assert.match(d2, /^d:2:0$/);
});

test('a long frame drop advances at most two fixed steps, never a skip ahead', () => {
  const { steps, acc } = simSteps(0.5, 1 / 60, 2);
  assert.equal(steps, 2);
  assert.ok(acc > 0.4, `leftover ${acc} stays in the accumulator`);
});

test('the preview loop gets a new deal number each hand, including a loop back to the first script', () => {
  let s = initialPreviewState(0);
  s = previewStep(s, 'next-hand', 1);
  const first = s.dealNo;
  assert.equal(s.round.no, first);
  s = previewStep(s, 'next-hand', 2);
  const second = s.dealNo;
  s = previewStep(s, 'next-hand', 3);
  assert.ok(s.dealNo > second && second > first);
  const v = previewView(s, 3);
  assert.equal(v.round.no, s.dealNo);
  assert.equal(previewTouchesLedger(), false);
});

test('pit boss copy and the tip toast share a top notice queue, not the table center', () => {
  const css = readFileSync(new URL('../client/src/bj/dealer-pov.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../client/src/bj/DealerPov.jsx', import.meta.url), 'utf8');
  assert.match(page, /data-test="bj-pov-notices"/);
  assert.match(page, /bj-pov-notices[\s\S]*bj-pit-line[\s\S]*bj-thanks/);
  assert.match(css, /\.bj-pov-notices/);
  assert.match(css, /\.bj-pov-notices[\s\S]*position:\s*static/);
  assert.doesNotMatch(css, /\.bj-pov-notices[^{]*\{[^}]*bottom:\s*2[0-9]%/);
});
