// Acid Mines welcome screen: one tight page, no required scroll, CLOCK IN always in reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the mines intro is a no-scroll flex page with CLOCK IN above the brief', () => {
  const jsx = read('client/src/mines/Mines.jsx');
  const intro = jsx.slice(jsx.indexOf('function Intro('), jsx.indexOf('const DRY_LINES'));
  assert.match(intro, /data-test="mine-intro"/);
  assert.match(intro, /data-test="mine-clock-in"/);
  assert.match(intro, /data-test="mine-brief"/);
  assert.match(intro, /data-test="mine-brief-orientation"/);
  assert.match(intro, /data-test="mine-brief-down"/);
  assert.match(intro, /SHIFT ORIENTATION/);
  assert.match(intro, /WHAT'S DOWN THERE/);
  assert.match(intro, /NOW HIRING · ALL SHIFTS · NO EXPERIENCE · NO QUESTIONS/);
  assert.match(intro, /TODAY'S DIG/);
  // CLOCK IN is rendered before the brief tabs/panels, so it is on screen without scrolling.
  const clock = intro.indexOf('data-test="mine-clock-in"');
  const brief = intro.indexOf('data-test="mine-brief"');
  assert.ok(clock > 0 && brief > clock, 'CLOCK IN comes before the orientation brief');
  // Key orientation facts are still there, just tighter.
  assert.match(intro, /WASD \/ arrows/);
  assert.match(intro, /TILT/);
  assert.match(intro, /Hold <b>MINE<\/b>/);
  assert.match(intro, /One bucket/);
  assert.match(intro, /hatched barn bug/);
  assert.match(intro, /Assassinate/);
  assert.match(intro, /Bug Center/);
});

test('mines welcome CSS forbids page scroll and uses tabs on short screens', () => {
  const css = read('client/src/mines/mines.css');
  assert.match(css, /\.mines:has\(\.m-intro\) \{ overflow: hidden;/);
  assert.match(css, /\.m-intro \{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.m-intro \.m-title \{[\s\S]*clamp\(32px, 5\.4vw, 64px\)/);
  assert.match(css, /\.m-brief-tabs/);
  assert.match(css, /@media \(max-width: 899px\), \(max-height: 699px\)/);
  assert.match(css, /\.m-brief \.m-box \{ display: none; \}/);
  assert.match(css, /\.m-brief \.m-box\.on \{ display: flex; \}/);
  // The old 80px intro padding that forced a scroll is gone from the intro.
  assert.doesNotMatch(css, /\.m-intro,\s*\.m-result \{[^}]*padding: 28px 20px 80px/);
});

test('e2e no-scroll check covers 390x844, 1280x800 and 1024x663', () => {
  const e2e = read('scripts/e2e-welcome-turkey.mjs');
  assert.match(e2e, /w: 390, h: 844/);
  assert.match(e2e, /w: 1280, h: 800/);
  assert.match(e2e, /w: 1024, h: 663/);
  assert.match(e2e, /scrollHeight|no scroll|clientHeight/);
  assert.match(e2e, /mine-clock-in/);
  assert.match(e2e, /neon-turkey/);
  assert.match(e2e, /crucible-say/);
});
