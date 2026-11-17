// Games tab on phones: all lobby game cards must fit on one screen (no required scroll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Games tab CSS hides the marquee and host strip on phones and keeps a scroll safety net', () => {
  const css = read('client/src/styles.css');
  const start = css.indexOf('v86: Games tab on phones');
  assert.ok(start >= 0, 'v86 Games tab rules are present');
  const block = css.slice(start);
  assert.match(block, /@media \(max-width: 899px\)/);
  assert.match(block, /\.lobby5\.narrow\.tab-games \.marquee5 \{ display: none; \}/);
  assert.match(block, /\.lobby5\.narrow\.tab-games \.host-banner \{ display: none; \}/);
  assert.match(block, /\.lobby5\.narrow\.tab-games \.lobby-panel \.tabs/s);
  assert.match(block, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(block, /\.panel-body\.games-tab/);
  assert.match(block, /overflow-y: auto/);
  assert.match(block, /\.lobby5\.narrow \.promo-pair/);
  assert.match(block, /\.sp-art(?:, [^\n]+)? \{ width: 40px; height: 40px; \}/);
  assert.match(block, /orientation: landscape/);
  assert.match(block, /grid-template-columns: 1fr 1fr 1fr/);
  // Desktop column rules must not be rewritten by the phone block.
  assert.doesNotMatch(block, /@media \(min-width: 900px\)/);
});

test('Games tab panel is marked games-tab and still lists every promo', () => {
  const home = read('client/src/Home.jsx');
  assert.match(home, /tabKey === 'games' \? 'games-tab'/);
  const start = home.indexOf("tabKey === 'games' ?");
  const slice = home.slice(start, start + 400);
  assert.match(slice, /data-test="lobby-games"/);
  assert.match(slice, /<BlackjackPromo \/>/);
  assert.match(slice, /<SlotsPromo \/>/);
  assert.match(slice, /<FoffPromo \/>/);
  assert.match(slice, /<ScumPromo \/>/);
  assert.match(slice, /<ElHaloPromo \/>/);
});

test('phone footer hides the long affiliation clause; house play-money line stays', () => {
  const shell = read('client/src/Shell.jsx');
  assert.match(shell, /Play money only\. <span className="place">Not affiliated with any casino, resort or golf course\.<\/span>/);
  const css = read('client/src/styles.css');
  assert.match(css, /\.legal \.dot, \.legal \.place \{ display: none; \}/);
});

test('SCUM card line and slots copy stay as shipped', () => {
  const scum = read('client/src/scum/ScumCard.jsx');
  assert.match(scum, /You're skipped!/);
  const home = read('client/src/Home.jsx');
  const promo = home.slice(home.indexOf('function SlotsPromo'), home.indexOf('function HouseRules'));
  assert.equal(promo.includes('Play money only'), false);
});

test('e2e no-scroll check covers 390x664, 375x667, 390x844, landscape, 1280x800 and 1440x900', () => {
  const e2e = read('scripts/e2e-games-fit.mjs');
  assert.match(e2e, /width: 390, height: 664/);
  assert.match(e2e, /width: 375, height: 667/);
  assert.match(e2e, /width: 390, height: 844/);
  assert.match(e2e, /width: 1280, height: 800/);
  assert.match(e2e, /width: 1440, height: 900/);
  assert.match(e2e, /landscape/i);
  assert.match(e2e, /bj-go/);
  assert.match(e2e, /slots-go/);
  assert.match(e2e, /foff-go/);
  assert.match(e2e, /scum-go/);
  assert.match(e2e, /elhalo-go/);
  assert.match(e2e, /getBoundingClientRect|within the viewport|inView|fullyVisible/);
});
