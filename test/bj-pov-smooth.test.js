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

test('pit and tip notices are compact single-line pills, one at a time, in the top HUD row', () => {
  const css = readFileSync(new URL('../client/src/bj/dealer-pov.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../client/src/bj/DealerPov.jsx', import.meta.url), 'utf8');
  assert.match(page, /data-test="bj-pov-notices"/);
  // Queue is one at a time: a live tip takes the slot, otherwise the pit line, never both.
  assert.match(page, /thanks[\s\S]{0,200}kind: 'tip'[\s\S]{0,120}v\.pit[\s\S]{0,80}kind: 'pit'/);
  assert.match(page, /notice\?\.kind === 'pit'/);
  assert.match(page, /notice\?\.kind === 'tip'/);
  assert.match(page, /bj-pov-hud-top[\s\S]*bj-pov-notices[\s\S]*bj-pov-hud-bottom/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /border-radius:\s*999px/);
  assert.match(css, /\.bj-pov-notices[\s\S]*position:\s*static/);
  assert.match(css, /@keyframes bj-notice-in/);
  assert.doesNotMatch(css, /\.bj-pov-notices[^{]*\{[^}]*bottom:\s*2[0-9]%/);
});

test('the dealer hand is laid out as a fanned row wider than a card, not a piled stack', () => {
  const scene = readFileSync(new URL('../client/src/bj/povScene.js', import.meta.url), 'utf8');
  const block = scene.split('dealerCards || []')[1] || '';
  assert.match(block, /\* 0\.3[0-9]/); // spacing at least 0.30, wider than the ~0.28 world card
  assert.match(block, /rotZ: fan/);
  assert.doesNotMatch(block.split('_syncPlayers')[0], /\* 0\.20/);
});

test('preview status names the player to act and only says Autopilot is dealing while dealing', () => {
  const base = initialPreviewState(0);
  const play = {
    ...base,
    round: { ...base.round, phase: 'play', turn: 1, holeShown: false, dealer: ['7h', '4d'], hands: [{ seat: 0, cards: ['Ah'] }] },
  };
  assert.equal(previewView(play, 0).dealer.label, 'Cal to act');
  const bea = { ...play, round: { ...play.round, turn: 2 } };
  assert.equal(previewView(bea, 0).dealer.label, 'Bea to act');
  const dealer = { ...play, round: { ...play.round, phase: 'dealer', turn: -1, holeShown: true } };
  assert.equal(previewView(dealer, 0).dealer.label, 'Dealer is playing');
  const betting = { ...base, round: { ...base.round, phase: 'betting', turn: 0 } };
  assert.equal(previewView(betting, 0).dealer.label, 'Autopilot is dealing');
  const over = { ...betting, last: { no: 1, dealer: ['7c', '4c'], hands: [], results: [] } };
  assert.equal(previewView(over, 0).dealer.label, 'Hand is over');
  const pov = readFileSync(new URL('../client/src/bj/DealerPov.jsx', import.meta.url), 'utf8');
  assert.match(pov, /if \(actor\) status = `\$\{actor\.name\} to act`/);
  assert.match(pov, /dealing && phase !== 'dealer'/);
});

test('an idle preview tick does not allocate a new state object', () => {
  let s = initialPreviewState(0);
  s = previewStep(s, 'tick', 10);
  const next = previewStep(s, 'tick', 10);
  assert.equal(next, s);
});
