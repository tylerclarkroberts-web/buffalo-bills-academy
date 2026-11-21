// Admin dealer-POV preview: pure mock state, never a real table or ledger write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_PATH, PREVIEW_LABEL, PREVIEW_SEATS, PREVIEW_HANDS,
  initialPreviewState, previewStep, previewView, previewTouchesLedger,
} from '../client/src/bj/povPreview.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('the preview is labeled and bookmarked at /admin/bj-preview', () => {
  assert.equal(PREVIEW_PATH, '/admin/bj-preview');
  assert.equal(PREVIEW_LABEL, 'Preview: not a real game');
  const app = read('client/src/App.jsx');
  assert.match(app, /\/admin\/bj-preview/);
  assert.match(app, /PovPreview/);
  const admin = read('client/src/admin/AdminPage.jsx');
  assert.match(admin, /Preview dealer view/);
  assert.match(admin, /data-test="bo-preview-pov"/);
  assert.match(admin, /navigate\('\/admin\/bj-preview'\)/);
});

test('mock seats look like real players and never use Guntrad', () => {
  const v = previewView(initialPreviewState(0), 0);
  assert.equal(v.mock, true);
  assert.equal(v.house.pov, true);
  assert.equal(v.house.isMe, true);
  assert.equal(v.status, 'playing');
  assert.equal(v.seats.length, 4);
  assert.equal(v.canTip, false, 'real tip buttons stay off; tips are mock-only');
  const names = v.seats.map((s) => s.name);
  assert.deepEqual(names, PREVIEW_SEATS.map((s) => s.name));
  for (const s of v.seats) {
    assert.equal(s.avatar.kind, 'gen');
    assert.ok(s.avatar.seed);
    assert.doesNotMatch(JSON.stringify(s), /guntrad/i);
  }
  assert.doesNotMatch(JSON.stringify(v), /guntrad/i);
  assert.equal(previewTouchesLedger(), false);
});

test('scripted hands include hit, stand, split, double, bust, and blackjack', () => {
  const blob = JSON.stringify(PREVIEW_HANDS);
  for (const k of ['hit', 'stand', 'split', 'double']) assert.match(blob, new RegExp(`"k":"${k}"`));
  assert.match(blob, /"bust":true/);
  assert.match(blob, /"out":"blackjack"/);
});

function runUntil(state, now, pred, limit = 80) {
  let s = state, t = now;
  for (let i = 0; i < limit; i++) {
    s = previewStep(s, 'tick', t);
    if (pred(s, t)) return s;
    t += 400;
  }
  return s;
}

test('autopilot loops a hand: gestures land, then a settle, then the next deal', () => {
  let s = initialPreviewState(1000);
  s = runUntil(s, 1000, (x) => (x.log || []).some((e) => e.ev?.k === 'hit'));
  const kinds = new Set((s.log || []).map((e) => e.ev?.k).filter(Boolean));
  assert.ok(kinds.has('hit'), 'hit gesture is in the log');
  s = runUntil(s, 1000 + 400 * 20, (x) => (x.log || []).some((e) => e.ev?.k === 'stand') && (x.log || []).some((e) => e.ev?.k === 'double'));
  const later = new Set((s.log || []).map((e) => e.ev?.k));
  assert.ok(later.has('stand') && later.has('double'), `got ${[...later]}`);
  s = runUntil(s, 1000, (x) => x.last && x.last.results?.some((r) => r.out === 'blackjack' || r.out === 'bust'));
  assert.ok(s.last, 'the hand settled');
  assert.ok(s.last.results.some((r) => r.out === 'blackjack'), 'blackjack result');
  assert.ok(s.last.results.some((r) => r.out === 'bust'), 'bust result');
  const v = previewView(s, s.settledAt || 20000);
  assert.ok(v.last && v.round.phase === 'betting');
});

test('the second scripted hand splits, and Next hand / manual deal stay on the mock', () => {
  let s = initialPreviewState(0);
  s = previewStep(s, 'next-hand', 10);
  s = previewStep(s, 'next-hand', 20);
  assert.equal(s.handIndex, 1);
  s = previewStep(s, 'auto-off', 21);
  s = previewStep(s, 'deal', 22);
  s = runUntil(s, 22, (x) => (x.log || []).some((e) => e.ev?.k === 'split'), 40);
  // manual: deal repeatedly
  for (let i = 0; i < 12; i++) s = previewStep(s, 'deal', 100 + i * 10);
  const kinds = (s.log || []).map((e) => e.ev?.k);
  assert.ok(kinds.includes('split'), `log ${kinds}`);
});

test('mock tip and pit boss are local only and expire', () => {
  let s = initialPreviewState(5000);
  s = previewStep(s, 'tip', 5000);
  const v = previewView(s, 5000);
  assert.equal(v.tip.mock, true);
  assert.equal(v.tip.amount, 5);
  assert.equal(v.tip.thanks, 'Thanks for the tip');
  assert.equal(previewView(s, 5000 + 5000).tip, null, 'the toast clears without a server call');
  s = previewStep(s, 'pit', 6000);
  const p = previewView(s, 6200).pit;
  assert.ok(p, 'Brisk visits');
  assert.equal(p.name, 'Brisk');
  assert.equal(p.mock, true);
  assert.equal(previewView(s, 6000 + 6000).pit, null);
});

test('say stays on the mock chat list', () => {
  let s = initialPreviewState(0);
  s = previewStep(s, { t: 'say', text: 'nice hand' }, 100);
  const v = previewView(s, 100);
  assert.equal(v.chat.at(-1).text, 'nice hand');
  assert.equal(v.chat.at(-1).name, 'You');
});
