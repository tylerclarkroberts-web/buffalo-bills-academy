// After a split on a phone, Hit and Stand must stay visible, 44px, untangled from the
// split hands and the home-indicator safe area, and marked as belonging to the active hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the action bar stays above split hands, with 44px targets and a safe-area pad', () => {
  const css = read('client/src/bj/bj.css');
  assert.match(css, /\.bj-arena\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.bj-bar\s*\{[\s\S]*?z-index:\s*8/);
  assert.match(css, /\.bj-bar\s*\{[\s\S]*?safe-area-inset-bottom/);
  assert.match(css, /\.bj-acts\s+\.btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.bj-rail\.me\s*\{[^}]*translate\(-50%,\s*calc\(-100%/);
  assert.match(css, /\.bj-rail\s+\.bj-hands\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /@media \(max-width:\s*899px\)[\s\S]*\.bj-bar\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width:\s*899px\)[\s\S]*\.bj-acts-main\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /@media \(max-width:\s*899px\)[\s\S]*min-width:\s*44px/);
});

test('the active split hand is labelled This hand, and dealer POV is house-only so player actions are not in that view', () => {
  const arena = read('client/src/bj/BjArena.jsx');
  assert.match(arena, /data-test="bj-hand-now"/);
  assert.match(arena, /This hand/);
  assert.match(arena, /hs\.length > 1 && v\.round\?\.phase === 'play' && v\.round\.turn === h\.i/);
  const page = read('client/src/bj/BlackjackPage.jsx');
  assert.match(page, /hidden=\{showPov\}/);
  const idx = read('server/blackjack/index.js');
  assert.match(idx, /t\.house\.id === viewerId && t\.status === 'playing'/);
});

test('split, hit and stand actions are unchanged: the same buttons still call act\(' + "'hit'" + '\) and act\(' + "'stand'" + '\)', () => {
  const page = read('client/src/bj/BlackjackPage.jsx');
  assert.match(page, /data-test="bj-hit"/);
  assert.match(page, /data-test="bj-stand"/);
  assert.match(page, /data-test="bj-split"/);
  assert.match(page, /onClick=\{\(\) => act\('hit'\)\}/);
  assert.match(page, /onClick=\{\(\) => act\('stand'\)\}/);
  assert.match(page, /onClick=\{\(\) => act\('split'\)\}/);
});
