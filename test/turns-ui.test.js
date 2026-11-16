// Wiring and copy for the tight Your turns chips (no new screens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the header chip and next-table pill are wired into Shell, Hold\'em and blackjack', () => {
  const shell = read('client/src/Shell.jsx');
  const table = read('client/src/TablePage.jsx');
  const bj = read('client/src/bj/BlackjackPage.jsx');
  const pill = read('client/src/turns/TurnsPill.jsx');
  const css = read('client/src/turns/turns.css');
  assert.match(shell, /<TurnsEntry \/>/);
  assert.match(shell, /from '.\/turns\/TurnsPill.jsx'/);
  assert.match(table, /useTurnAdvance/);
  assert.match(table, /NextTablePill/);
  assert.match(table, /enabled: !pane/);
  assert.match(table, /rp\.pending/);
  assert.match(table, /sdPlay/);
  assert.match(bj, /useTurnAdvance/);
  assert.match(bj, /NextTablePill/);
  assert.match(bj, /dealing \|\| !ready/);
  assert.match(pill, /Your turns/);
  assert.match(pill, /Next table you're up/);
  assert.match(pill, /All caught up/);
  assert.match(pill, /data-test="turns-entry"/);
  assert.match(pill, /data-test="turns-next"/);
  assert.match(pill, /data-test="turns-stay"/);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /height: 28px/);
});

test('the Scum adapter hook is documented next to the registry', () => {
  const src = read('server/turns.js');
  assert.match(src, /registerTurnSource/);
  assert.match(src, /\/scum\/\$\{g\.code\}/);
  assert.match(src, /game: 'scum'/);
  assert.match(src, /when Async Scum ships/);
});
