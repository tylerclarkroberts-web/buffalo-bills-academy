// SCUM table UI: pass-vs-skip rules copy, a clear turn marker, and smooth card-flight (no remount on poll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('house rules spell out pass vs skip: pass locks you out, a skip does not', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  const start = page.indexOf('const RULES = [');
  const block = page.slice(start, page.indexOf('];', start));
  assert.match(block, /skip only costs that one turn/i);
  assert.match(block, /stay in and can still play/i);
  assert.match(block, /If you pass, you are out of this pile until it clears/);
  assert.match(block, /Skipped players do not count as passed/);
  assert.match(block, /last player then leads fresh|last player who played/i);
});

test('the current seat has a pulsing ring and a Your turn / X\'s turn label', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /data-test="scum-turn-label"/);
  assert.match(page, /s\.me \? \(fly \? 'Playing' : 'Your turn'\) : `\$\{s\.name\}'s turn`/);
  const css = read('client/src/scum/scum.css');
  assert.match(css, /\.sc-seat\.turn \.bust/);
  assert.match(css, /sc-turnpulse/);
  assert.match(css, /\.sc-turnlbl/);
  assert.match(css, /\.sc-status\.mine/);
});

test('plays fly face-up from the seat or hand to the pile with transform/opacity only', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /function FlyBatch/);
  assert.match(page, /data-test="scum-fly"/);
  assert.match(page, /handRects/);
  const css = read('client/src/scum/scum.css');
  assert.match(css, /\.sc-fly\.to/);
  assert.match(css, /transition: transform 400ms/);
  assert.match(css, /transition-delay: calc\(var\(--k\) \* 50ms\)/);
  assert.doesNotMatch(css, /\.sc-fly[^}]*transition:[^;]*margin/);
  assert.doesNotMatch(css, /\.sc-fly[^}]*transition:[^;]*top/);
});

test('prefers-reduced-motion disables the turn pulse and the card flight', () => {
  const css = read('client/src/scum/scum.css');
  const i = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(i >= 0);
  const block = css.slice(i, i + 900);
  assert.match(block, /\.sc-seat\.turn \.bust/);
  assert.match(block, /\.sc-fly/);
  assert.match(block, /transition: none/);
});

test('the 1.5s poll diffs on seq so a repeat fetch does not remount the pile', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /prev\.seq !== nv\.seq/);
  assert.doesNotMatch(page, /key=\{frame\.seq\}/);
  assert.match(page, /Same move: keep the same object tree/);
  assert.match(page, /data-test="scum-passed"/);
  assert.match(page, /data-test="scum-skipped"/);
});
