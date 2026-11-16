// Wiring and copy for the tight Your turns chips and the click-only side prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the header chip and next-table prompt are wired into Shell, Hold\'em, blackjack and Scum', () => {
  const shell = read('client/src/Shell.jsx');
  const table = read('client/src/TablePage.jsx');
  const bj = read('client/src/bj/BlackjackPage.jsx');
  const scum = read('client/src/scum/ScumPage.jsx');
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
  assert.match(scum, /useTurnAdvance/);
  assert.match(scum, /NextTablePill/);
  assert.match(scum, /refreshTurns/);
  assert.match(scum, /\/scum\/\$\{String\(code\)\.toUpperCase\(\)\}/);
  assert.match(pill, /Your turns/);
  assert.match(pill, /Next table you're up in/);
  assert.match(pill, /data-test="turns-entry"/);
  assert.match(pill, /data-test="turns-next"/);
  assert.match(pill, /data-test="turns-next-go"/);
  assert.match(pill, /createPortal/);
  assert.match(pill, /next\.name/);
  assert.match(pill, /gameLabel\(next\.game\)/);
  assert.doesNotMatch(pill, /All caught up/);
  assert.doesNotMatch(pill, /data-test="turns-stay"/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /height: 28px/);
});

test('Scum is registered through registerTurnSource with play, swap and beg', () => {
  const src = read('server/turns.js');
  const app = read('server/app.js');
  assert.match(src, /registerTurnSource/);
  assert.match(src, /export function scumSource/);
  assert.match(src, /game: 'scum'/);
  assert.match(src, /\/scum\/\$\{t\.code\}/);
  assert.match(src, /action: 'play'/);
  assert.match(src, /action: 'swap'/);
  assert.match(src, /action: 'beg'/);
  assert.match(app, /registerTurnSource\(scumSource\(scum\)\)/);
  assert.match(app, /unregisterScumTurns/);
});

test('finishing a turn never auto-navigates; only a click on the prompt goes to the next table', () => {
  const hook = read('client/src/turns/useTurns.js');
  const queue = read('client/src/turns/queue.js');
  const pill = read('client/src/turns/TurnsPill.jsx');

  // No countdown, no delayed navigate, no "caught up" timer.
  assert.doesNotMatch(hook, /ADVANCE_MS|CAUGHT_MS/);
  assert.doesNotMatch(queue, /ADVANCE_MS|CAUGHT_MS/);
  assert.doesNotMatch(hook, /setRemain|remain/);
  assert.doesNotMatch(hook, /setTimeout/);
  const advance = hook.slice(hook.indexOf('export function useTurnAdvance'));
  // The only navigate inside useTurnAdvance is the click handler.
  const navs = [...advance.matchAll(/\bnavigate\s*\(/g)];
  assert.equal(navs.length, 1, 'useTurnAdvance should call navigate only from goNow');
  assert.match(advance, /const goNow = useCallback\(\s*\(\)\s*=>\s*\{\s*if \(next\) navigate\(next\.path\)/);
  assert.doesNotMatch(advance, /setInterval/);
  // The prompt itself is a button; it does not navigate on render.
  assert.match(pill, /onClick=\{goNow\}/);
  assert.doesNotMatch(pill, /setTimeout|navigate\(/);
  // Clicking goes to nextTarget's path (the oldest other table).
  assert.match(advance, /const next = nextTarget\(turns, currentPath\)/);
  assert.match(advance, /navigate\(next\.path\)/);
});
