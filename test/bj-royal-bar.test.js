// Player bar: side bets (Kash / Royal Match) stay in their own group; Tip is compact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('KashButtons sit in a sides group and name Royal Match, not a generic Kash-only label', () => {
  const jsx = read('client/src/bj/KashStage.jsx');
  assert.match(jsx, /className="bj-sides"/);
  assert.match(jsx, /data-test="bj-sides"/);
  assert.match(jsx, /Royal Match/);
  assert.match(jsx, /Royal Pairs/);
  assert.match(jsx, /data-test=\{`bj-kash-\$\{k\}`\}/);
});

test('the table bar renders side bets as a sibling of Tip, not inside Hit/Stand or the waiting status', () => {
  const page = read('client/src/bj/BlackjackPage.jsx');
  const css = read('client/src/bj/bj.css');
  assert.match(page, /\{v\.status === 'playing' && mine && ready && <KashButtons/);
  assert.doesNotMatch(page, /\{status\}… \{ready && <KashButtons/);
  const acts = page.match(/r\.myTurn && ready \? <div className="bj-acts"[\s\S]*?: r\.phase/);
  assert.ok(acts, 'the Hit/Stand acts block is present');
  assert.doesNotMatch(acts[0], /KashButtons/, 'KashButtons is not inside the Hit/Stand row');
  assert.match(css, /\.bj-sides/);
  assert.match(css, /flex: 0 0 auto/);
  assert.match(css, /\.bj-bar > \.bj-sides[\s\S]*width: 100%/);
  const tip = read('client/src/bj/DealerPov.jsx');
  assert.match(tip, /bj-tips-lbl/);
  assert.match(tip, />Tip</);
  assert.doesNotMatch(tip, />Tip the dealer</);
});
