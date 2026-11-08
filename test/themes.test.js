// v23: multi-table themes. Pure rules (theme by table count, emotes, tea, table picking) plus the Japanese line
// bank and the 8-bit Japanese tunes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeForCount, pickTables, nextTurn, emotesFor, teaDue, robotMove, ROBOT_MOVES, JA_ONLY, MAX_TABLES } from '../client/src/themes/theme-core.js';
import { JP_TUNES, compileJP } from '../client/src/table/tunes-jp.js';
import { makeSayer, dailyLine } from '../client/src/guntrad-core.js';

const EN = JSON.parse(readFileSync(new URL('../client/src/lines/guntrad-lines.json', import.meta.url)));
const JA = JSON.parse(readFileSync(new URL('../client/src/lines/guntrad-lines-ja.json', import.meta.url)));

test('theme follows the number of tables', () => {
  assert.equal(themeForCount(0), 'saloon');
  assert.equal(themeForCount(1), 'saloon');
  assert.equal(themeForCount(2), 'jade');
  assert.equal(themeForCount(3), 'anime');
  assert.equal(themeForCount(4), 'arcade');
  assert.equal(themeForCount(9), 'arcade');
  assert.equal(themeForCount(undefined), 'saloon');
  for (const n of [1, 2, 3, 4]) assert.equal(themeForCount(n, { plain: true }), 'saloon', 'themes off = the normal look');
});

test('picking tables: only seated, open ones, at most 4, in the order asked', () => {
  const T = (code, o = {}) => ({ code, seated: true, status: 'playing', ...o });
  const mine = [T('AAAA'), T('BBBB'), T('CCCC', { seated: false }), T('DDDD', { status: 'closed' }), T('EEEE'), T('FFFF'), T('GGGG')];
  assert.deepEqual(pickTables(mine), ['AAAA', 'BBBB', 'EEEE', 'FFFF']);
  assert.equal(pickTables(mine).length, MAX_TABLES);
  assert.deepEqual(pickTables(mine, ['eeee', 'CCCC', 'AAAA', 'DDDD', 'AAAA']), ['EEEE', 'AAAA']);
  assert.deepEqual(pickTables([], ['AAAA']), []);
});

test('next turn wraps around and skips the focused pane', () => {
  const codes = ['A', 'B', 'C', 'D'];
  assert.equal(nextTurn(codes, { A: true, C: true }, 'A'), 'C');
  assert.equal(nextTurn(codes, { A: true, C: true }, 'C'), 'A');
  assert.equal(nextTurn(codes, { B: true }, 'B'), 'B', 'only the focused one waiting: stays');
  assert.equal(nextTurn(codes, {}, 'A'), null);
  assert.equal(nextTurn([], {}, null), null);
});

test('anime emotes come from the table view', () => {
  const seat = (o = {}) => ({ name: 'x', stack: 100, inHand: true, folded: false, allIn: false, ...o });
  const v = { settings: { bigBlind: 10 }, hand: { pot: 30 }, seats: [seat({ folded: true }), seat({ allIn: true }), seat(), null, seat({ inHand: false })] };
  assert.deepEqual(emotesFor(v), { 0: ['sweat'], 1: ['speed'] });
  v.hand.pot = 200; // 20 big blinds: a big pot, everyone still in it is shocked
  assert.deepEqual(emotesFor(v), { 0: ['sweat'], 1: ['speed'], 2: ['shock'] });
  const after = { settings: { bigBlind: 10 }, hand: null, seats: [seat(), seat(), seat(), seat()],
    lastHand: { winners: [{ seat: 0, amount: 50 }, { seat: 3, amount: 400 }], shown: { 0: {}, 1: {} }, allInLosers: [{ seat: 2 }] } };
  assert.deepEqual(emotesFor(after), { 0: ['sparkle'], 1: ['anger'], 2: ['anger'], 3: ['sparkle', 'blush'] });
  assert.deepEqual(emotesFor(null), {});
  assert.deepEqual(emotesFor({ seats: [], hand: null, lastHand: null }), {});
});

test('the geisha brings tea every 5 hands', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 15, 0, null].map((n) => teaDue(n)), [false, false, false, false, true, false, false, true, true, false, false]);
  assert.equal(teaDue(6, 3), true);
});

test('robot moves: all kinds show up; reduced motion only beeps', () => {
  const seen = new Set(Array.from({ length: 10 }, (_, i) => robotMove(i)));
  assert.deepEqual([...seen].sort(), [...ROBOT_MOVES].sort());
  assert.equal(robotMove(3, true), 'beep');
});

test('Japanese line bank: same sets and sizes as English, Japanese characters only', () => {
  for (const k of Object.keys(EN)) {
    if (!Array.isArray(EN[k])) continue;
    assert.ok(Array.isArray(JA[k]), `missing set ${k}`);
    assert.equal(JA[k].length, EN[k].length, `${k}: line-for-line translation`);
    JA[k].forEach((l, i) => {
      assert.match(l, JA_ONLY, `${k}[${i}] has non-Japanese characters: ${l}`);
      assert.ok([...l].length <= 72, `${k}[${i}] too long for the fight caption`);
    });
    assert.equal(new Set(JA[k]).size, JA[k].length, `${k}: no duplicates`);
  }
  // facts keep their numbers (full-width digits in Japanese)
  const fw = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  EN.lines.forEach((l, i) => {
    const years = (l.match(/\b(1[89]\d\d|20[0-2]\d)\b/g) || []);
    for (const y of years) assert.ok(fw(JA.lines[i]).includes(y), `lines[${i}] lost the year ${y}`);
  });
  // the same day gives the same fact in both languages
  const d = new Date(2026, 9, 30);
  assert.equal(EN.lines.indexOf(dailyLine(EN.lines, d)), JA.lines.indexOf(dailyLine(JA.lines, d)));
  const say = makeSayer(JA);
  assert.match(say('offer'), JA_ONLY);
});

test('8-bit Japanese tunes compile, stay in their scales, and credit their sources', () => {
  assert.ok(JP_TUNES.length >= 4);
  const NOTE = (m) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12];
  for (const t of JP_TUNES) {
    const { events, beats } = compileJP(t);
    assert.equal(beats, t.bars.length * t.bpb);
    assert.ok(t.title && t.by && t.year, `${t.id} credits`);
    for (const e of events) {
      if (e.midi === undefined) continue;
      assert.ok(t.scale.includes(NOTE(e.midi)), `${t.id}: ${e.voice} ${NOTE(e.midi)} is outside ${t.scale.join(' ')}`);
    }
    assert.ok(events.some((e) => e.voice === 'lead8') && events.some((e) => e.voice === 'taiko') && events.some((e) => e.voice === 'koto'));
  }
  assert.throws(() => compileJP({ id: 'bad', bpb: 4, bars: [['A4:1', 'A2']] }), /expected 4/);
});
