// Desert Resort Night: date window, flag precedence, Guntrad-only Crucible bubble, dealer art left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  EVENT_DATE, EVENT_ID, EVENT_LABEL, EVENT_TZ, CRUCIBLE_LINE,
  BUBBLE_SHOW_MS, BUBBLE_CYCLE_MS,
  phoenixDate, parseFlag, isEventThemeOn, bubblePhase, bubbleVisible,
  injectEventThemeScript,
} from '../client/src/themes/event-theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEALER_SHA256 = '35ec9f29204c67fe380d04f2cd913d42a8bbf3d34d8f970e10f2efe08c9e6f92';

const at = (iso) => new Date(iso);

test('the window is Thanksgiving Day 2026 in America/Phoenix', () => {
  assert.equal(EVENT_DATE, '2026-11-26');
  assert.equal(EVENT_TZ, 'America/Phoenix');
  assert.equal(EVENT_ID, 'desert-resort');
  assert.equal(EVENT_LABEL, 'Desert Resort Night');
  // Phoenix is MST (UTC-7) year-round, so midnight is 07:00Z.
  assert.equal(phoenixDate(at('2026-11-26T07:00:00Z')), '2026-11-26');
  assert.equal(phoenixDate(at('2026-11-26T06:59:59Z')), '2026-11-25');
  assert.equal(phoenixDate(at('2026-11-27T06:59:59Z')), '2026-11-26');
  assert.equal(phoenixDate(at('2026-11-27T07:00:00Z')), '2026-11-27');
});

test('the skin is on only for that Phoenix date, unless a flag overrides it', () => {
  assert.equal(isEventThemeOn({ now: at('2026-11-26T18:00:00Z') }), true);
  assert.equal(isEventThemeOn({ now: at('2026-11-25T23:00:00Z') }), false);
  assert.equal(isEventThemeOn({ now: at('2026-11-27T18:00:00Z') }), false);
  // query wins over env, env wins over the date
  assert.equal(isEventThemeOn({ now: at('2026-11-26T18:00:00Z'), query: 'off' }), false);
  assert.equal(isEventThemeOn({ now: at('2026-11-20T18:00:00Z'), query: 'on' }), true);
  assert.equal(isEventThemeOn({ now: at('2026-11-26T18:00:00Z'), env: 'off' }), false);
  assert.equal(isEventThemeOn({ now: at('2026-11-20T18:00:00Z'), env: 'on' }), true);
  assert.equal(isEventThemeOn({ now: at('2026-11-20T18:00:00Z'), env: 'off', query: 'on' }), true);
  assert.equal(isEventThemeOn({ now: at('2026-11-26T18:00:00Z'), env: 'on', query: 'off' }), false);
  assert.equal(parseFlag(undefined), null);
  assert.equal(parseFlag(''), null);
  assert.equal(parseFlag('yes'), true);
  assert.equal(parseFlag('0'), false);
});

test('the Crucible line is exact, and the bubble stays up all day', () => {
  assert.equal(CRUCIBLE_LINE, 'Because it is my name!!!');
  const id = 'guntrad';
  const a = bubblePhase(id, 1_000_000);
  const b = bubblePhase(id, 1_000_000);
  assert.deepEqual(a, b);
  assert.equal(a.on, true);
  // force and the default persist window both keep it on
  assert.equal(bubbleVisible(id, 1_000_000, { force: true }), true);
  assert.equal(bubbleVisible(id, 1_000_000), true);
  assert.equal(bubbleVisible(id, 1_000_000 + BUBBLE_CYCLE_MS * 3), true);
  // the old show/hide cycle is still available when a test asks for it
  const seen = new Set(Array.from({ length: BUBBLE_CYCLE_MS / 200 }, (_, i) => bubbleVisible(id, i * 200, { persist: false })));
  assert.deepEqual([...seen].sort(), [false, true]);
  const cycled = bubblePhase(id, 1_000_000, { persist: false });
  assert.equal(cycled.on, cycled.t < BUBBLE_SHOW_MS);
  assert.ok(cycled.wait > 0 && cycled.wait <= BUBBLE_CYCLE_MS);
});

test('the server can stamp EVENT_THEME into the SPA shell', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  assert.match(injectEventThemeScript(html, 'on'), /window\.__BBA_EVENT_THEME="on"/);
  assert.match(injectEventThemeScript(html, 'off'), /window\.__BBA_EVENT_THEME="off"/);
  assert.match(injectEventThemeScript(html, ''), /window\.__BBA_EVENT_THEME=null/);
  const stamped = injectEventThemeScript(html, 'on');
  assert.match(injectEventThemeScript(stamped, 'off'), /window\.__BBA_EVENT_THEME="off"/);
  assert.equal(injectEventThemeScript(stamped, 'off').includes('__BBA_EVENT_THEME="on"'), false);
});

test('dealer.png is the original file: the Proctor look is an overlay, not a rewrite', () => {
  const buf = readFileSync(path.join(ROOT, 'server/assets/dealer.png'));
  const hash = createHash('sha256').update(buf).digest('hex');
  assert.equal(hash, DEALER_SHA256);
});

test('players keep the pilgrim overlay; only Guntrad speaks the line', () => {
  const bust = readFileSync(path.join(ROOT, 'client/src/avatar/Bust.jsx'), 'utf8');
  const dealer = readFileSync(path.join(ROOT, 'client/src/table/Dealer.jsx'), 'utf8');
  const miners = readFileSync(path.join(ROOT, 'client/src/mines/miners.js'), 'utf8');
  assert.match(bust, /PilgrimHat/);
  assert.match(bust, /PilgrimCoat/);
  assert.doesNotMatch(bust, /CRUCIBLE_LINE|crucible-say|useCrucibleBubble/);
  assert.match(dealer, /ProctorHat|ProctorCoat/);
  assert.match(dealer, /CRUCIBLE_LINE/);
  assert.match(dealer, /data-test="crucible-say"/);
  assert.match(dealer, /data-test="guntrad-proctor-hat"/);
  assert.match(dealer, /data-test="guntrad-proctor-coat"/);
  assert.doesNotMatch(miners, /CRUCIBLE_LINE|speechSprite|tickEventMiner|crucible-say/);
  assert.match(miners, /miner-capotain|festive/);
});

test('the skin copy stays a neutral desert-resort look: no caricature language', () => {
  const files = [
    'client/src/themes/desert-resort.css',
    'client/src/themes/event-theme.js',
    'server/engine/event-theme.js',
    'client/src/themes/event-store.js',
    'client/src/table/Dealer.jsx',
    'client/src/avatar/Bust.jsx',
  ].map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n').toLowerCase();
  for (const word of ['headdress', 'war paint', 'tomahawk', 'teepee', 'tipi', 'wigwam', 'redskin', 'squaw', 'powwow', 'indian casino', 'chief ', 'sacred']) {
    assert.equal(files.includes(word), false, `forbidden term: ${word}`);
  }
  assert.match(files, /desert resort night/);
});

test('the hook and dealer keep the Crucible line on with no hide cycle', () => {
  const store = readFileSync(path.join(ROOT, 'client/src/themes/event-store.js'), 'utf8');
  assert.match(store, /useCrucibleBubble/);
  assert.doesNotMatch(store, /setTimeout\(loop/);
  assert.match(store, /return !!\(enabled && id\)/);
  const dealer = readFileSync(path.join(ROOT, 'client/src/table/Dealer.jsx'), 'utf8');
  assert.match(dealer, /useCrucibleBubble\('guntrad', festive && !still\)/);
  const css = readFileSync(path.join(ROOT, 'client/src/themes/desert-resort.css'), 'utf8');
  assert.match(css, /translate\(-50%, calc\(-100%/);
  assert.match(css, /clear of cards and the action bar/);
});

test('the lobby marquee swaps Neon Bill for a neon waving turkey only during the event', () => {
  const theme = readFileSync(path.join(ROOT, 'client/src/theme.jsx'), 'utf8');
  assert.match(theme, /export function NeonTurkey/);
  assert.match(theme, /data-test="neon-turkey"/);
  assert.match(theme, /data-test="neon-bill"/);
  assert.match(theme, /festive \? <NeonTurkey \/> : <NeonBill \/>/);
  assert.match(theme, /nb-wave a/);
  assert.match(theme, /nb-wave b/);
  assert.match(theme, /className=\{`neonbill neon-turkey/);
  // same palette and tube style as the cowboy
  assert.match(theme, /c=\{C\.red\}/);
  assert.match(theme, /c=\{C\.yellow\}/);
  assert.match(theme, /c=\{C\.blue\}/);
  assert.match(theme, /viewBox="0 0 420 660"/);
  const css = readFileSync(path.join(ROOT, 'client/src/neon.css'), 'utf8');
  assert.match(css, /\.neonbill \.nb-wave\.a/);
});
