// SCUM table UI: pass-vs-skip rules copy, a clear turn marker, and smooth card-flight (no remount on poll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canDealNow, canStartDeal } from '../client/src/scum/setup.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('house rules spell out pass vs skip: pass locks you out, a skip does not', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  const start = page.indexOf('const RULES = [');
  const block = page.slice(start, page.indexOf('];', start));
  assert.match(block, /skip only costs that one turn/i);
  assert.match(block, /stay in and can still play/i);
  assert.match(block, /Skips jump over anyone who already passed/);
  assert.match(block, /If you pass, you are out of this pile until it clears/);
  assert.match(block, /even if play goes all the way around or someone else plays after you/);
  assert.match(block, /Skipped players do not count as passed/);
  assert.match(block, /last player then leads fresh|last player who played/i);
});

test('the current seat has a pulsing ring and a Your turn / X\'s turn label', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /data-test="scum-turn-label"/);
  assert.match(page, /s\.me \? \(fly \? 'Playing' : 'Your turn'\) : `\$\{handle\(s\.name\)\}'s turn`/);
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
  assert.match(page, /data-test="scum-passed">Out</);
  assert.match(page, /data-test="scum-skipped"/);
  assert.match(page, /You're out of this pile until it clears/);
  assert.match(page, /Out of this pile\./);
});

test('with fewer than 2 bots the primary action is Open lobby, not a disabled Open & deal', () => {
  assert.equal(canDealNow(0), false);
  assert.equal(canDealNow(1), false);
  assert.equal(canDealNow(2), true);
  assert.equal(canDealNow(3), true);
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /canDealNow\(st\.bots\)/);
  assert.match(page, /data-test="scum-create">Open lobby →/);
  assert.match(page, /data-test="scum-create-deal">Open & deal →/);
  assert.doesNotMatch(page, /Needs 2 bots to deal right away/);
  assert.doesNotMatch(page, /disabled=\{!canDeal\}/);
  // With bots: ghost Open lobby + primary Open & deal. Without: a single primary Open lobby.
  const block = page.slice(page.indexOf('{canDeal'), page.indexOf('</div>', page.indexOf('{canDeal')));
  assert.match(block, /btn ghost small[\s\S]*data-test="scum-create">Open lobby<\/button>/);
  assert.match(block, /: <button className="btn primary"[\s\S]*data-test="scum-create">Open lobby →/);
  assert.equal((block.match(/data-test="scum-create-deal"/g) || []).length, 1);
});

test('Deal in the lobby waits until 3 players (seated humans plus reserved bots)', () => {
  assert.equal(canStartDeal(1, 0), false);
  assert.equal(canStartDeal(1, 1), false);
  assert.equal(canStartDeal(1, 2), true);
  assert.equal(canStartDeal(2, 1), true);
  assert.equal(canStartDeal(3, 0), true);
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /disabled=\{busy \|\| !readyToDeal\}/);
  assert.match(page, /Invite friends with the link/);
});

test('the lobby Deal button actually deals, and a server rejection stays on screen (regression: Z5G38Q)', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  const i = page.indexOf('data-test="scum-deal"');
  const btn = page.slice(page.lastIndexOf('<button', i), page.indexOf('</button>', i));
  assert.match(btn, /onClick=\{\(\) => post\('start'\)\}/, 'Deal must POST /start');
  // Move errors live apart from the poll error, which the 1.5s poll clears on every success.
  const post = page.slice(page.indexOf('const post = async'), page.indexOf('};', page.indexOf('const post = async')));
  assert.match(post, /setActErr\(e\.message/);
  assert.doesNotMatch(post, /setErr\(/);
  assert.match(page, /\(actErr \|\| err\) && <p className="error bj-err" role="alert"/);
});

test('SCUM reuses Hold\'em speech bubbles: composer, Family masking, and a Say control', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  assert.match(page, /import \{ SayBox, SayBubble \} from '..\/table\/Say.jsx'/);
  assert.match(page, /data-test="scum-say-btn"/);
  assert.match(page, /<SayBubble text=\{family \? familyMask\(s\.say\.text\) : s\.say\.text\}/);
  assert.match(page, /<SayBox current=\{mine\.say\?\.text \|\| ''\}/);
  assert.match(page, /post\('say', \{ text \}\)/);
  const css = read('client/src/scum/scum.css');
  assert.match(css, /\.sc-felt > \.say-box/);
  assert.match(css, /position: relative/);
  assert.match(css, /\.sc-seat\.has-say/);
  const shared = read('client/src/table/Say.jsx');
  assert.match(shared, /export function SayBubble/);
  assert.match(shared, /export function SayBox/);
  assert.match(shared, /Stays up until your next turn/);
  const felt = read('client/src/TablePage.jsx');
  assert.match(felt, /import \{ SayBox, SayBubble \} from '.\/table\/Say.jsx'/);
  assert.doesNotMatch(felt, /function SayBubble/);
});
