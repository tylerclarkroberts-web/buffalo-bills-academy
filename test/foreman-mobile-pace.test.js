// Temporary phone pace for the Foreman typing test (t606u): 35 WPM on a phone until 8 PM MST Nov 27 2026
// (2026-11-28T03:00Z), 80 everywhere else and afterwards. "Phone" is decided on the server from the request.
// Accuracy, the paste/dump block, the keystroke trace and the max-speed check are the same on every device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Foreman } from '../server/foreman.js';
import {
  TYPING_WPM, TYPING_ACCURACY, TYPING_MAX_WPM, TYPING_MAX_INSERT, TYPING_TRACE_MIN, TYPING_PROMPT, TYPING_JABS,
  MOBILE_TYPING_WPM, MOBILE_TYPING_UNTIL, isPhoneRequest, mobileTypingUntil, typingPace, typingStats, minTypingMs,
  emptyTypingTrace, recordTypingInput, endTypingComposition, verifyTypingTrace, typingTraceFor, shouldBlockTypingInput, publicTypingTrace,
} from '../server/foremanTyping.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};
const END = Date.parse('2026-11-28T03:00:00Z');
const at = (wpm, prompt = TYPING_PROMPT) => Math.ceil(((prompt.length / 5) / wpm) * 60_000); // ms to type `prompt` at `wpm`

test('the phone pace numbers: 35 WPM until 8 PM MST Nov 27 2026; the rest of the test is untouched', () => {
  assert.equal(MOBILE_TYPING_WPM, 35); assert.equal(TYPING_WPM, 80);
  assert.equal(MOBILE_TYPING_UNTIL, END);
  assert.equal(new Date(END).toLocaleString('en-US', { timeZone: 'America/Phoenix' }), '11/27/2026, 8:00:00 PM');
  assert.deepEqual([TYPING_ACCURACY, TYPING_MAX_WPM, TYPING_MAX_INSERT, TYPING_TRACE_MIN], [0.95, 200, 2, 0.9]);
});

test('phone or not comes from the request: phone User-Agents and the Sec-CH-UA-Mobile hint', () => {
  assert.equal(isPhoneRequest({ ua: UA.iphone }), true);
  assert.equal(isPhoneRequest({ ua: UA.android }), true);
  for (const k of ['androidTablet', 'ipad', 'mac', 'windows']) assert.equal(isPhoneRequest({ ua: UA[k] }), false, k);
  assert.equal(isPhoneRequest({ ua: UA.windows, chMobile: '?1' }), true, 'Chromium says it is a phone');
  assert.equal(isPhoneRequest({ ua: UA.android, chMobile: '?0' }), true, 'the UA still counts');
  assert.equal(isPhoneRequest({}), false); assert.equal(isPhoneRequest(), false);
});

test('the end time: built in, overridable by MOBILE_TYPING_UNTIL, and exact', () => {
  assert.equal(mobileTypingUntil(undefined), END); assert.equal(mobileTypingUntil(''), END);
  assert.equal(mobileTypingUntil('off'), 0); assert.equal(mobileTypingUntil('0'), 0);
  assert.equal(mobileTypingUntil('2026-12-01T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'));
  assert.equal(mobileTypingUntil(String(END + 5)), END + 5);
  assert.equal(mobileTypingUntil('garbage'), END);
  assert.deepEqual(typingPace({ phone: true, now: END - 1 }), { wpm: 35, phone: true, until: END });
  assert.deepEqual(typingPace({ phone: true, now: END }), { wpm: 80, phone: false }, 'over at the stroke of 8 PM MST');
  assert.deepEqual(typingPace({ phone: false, now: END - 1 }), { wpm: 80, phone: false });
  assert.deepEqual(typingPace({ phone: true, now: END - 1, until: 0 }), { wpm: 80, phone: false }, "'off' ends it");
});

test('typingStats takes the needed speed; everything else grades the same', () => {
  const p = TYPING_PROMPT;
  assert.equal(typingStats(p, at(50), p, 35).passed, true);
  assert.equal(typingStats(p, at(50), p).fail, 'speed', '80 by default');
  assert.equal(typingStats(p, at(30), p, 35).fail, 'speed');
  assert.equal(typingStats(p, minTypingMs(p) - 1, p, 35).fail, 'early', 'still no faster than 200 WPM');
  const sloppy = p.replace(/number/g, 'nmuber');
  assert.equal(typingStats(sloppy, at(50), p, 35).fail, 'accuracy', '95% on a phone too');
  assert.equal(typingStats(p.slice(0, 60), at(50), p, 35).fail, 'short');
});

function foreman(t, { now, until } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-phone-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { t: now ?? END - 3600e3 };
  const f = new Foreman({ store: new Store(dir), accounts: null, now: () => clock.t, randInt: () => 0, mobileTypingUntil: until });
  const player = { id: 'miner', bankroll: 100 };
  f.scoldTyping('miner');
  const id = f.doc.pending.miner.id, prompt = f.doc.pending.miner.prompt;
  const run = (ms, { phone, text = prompt, trace = typingTraceFor(text) } = {}) => { f.startTyping(player, id, { phone }); clock.t += ms; return f.gradeTyping(player, id, text, trace); };
  return { f, clock, player, id, prompt, run };
}

test('Foreman: a phone passes at 50 WPM before the end time; a desktop does not', (t) => {
  const d = foreman(t);
  const desk = d.run(at(50, d.prompt), { phone: false });
  assert.equal(desk.fail, 'speed'); assert.equal(desk.jab, TYPING_JABS.speed);
  const phone = d.run(at(50, d.prompt), { phone: true });
  assert.equal(phone.passed, true, JSON.stringify(phone));
  const log = d.f.doc.typingLog.filter((r) => r.k === 'submit');
  assert.deepEqual(log.map((r) => [r.needWpm, r.phone, r.passed]), [[80, false, false], [35, true, true]]);
});

test('Foreman: too slow even for the phone pace gets the phone jab; the view shows the pace', (t) => {
  const d = foreman(t);
  assert.deepEqual([d.f.view('miner', { phone: true }).pending.wpm, d.f.view('miner', { phone: true }).pending.phonePace], [35, true]);
  assert.deepEqual([d.f.view('miner').pending.wpm, d.f.view('miner').pending.phonePace], [80, undefined]);
  const slow = d.run(at(25, d.prompt), { phone: true });
  assert.equal(slow.fail, 'speed'); assert.equal(slow.jab, TYPING_JABS.speedPhone);
});

test('Foreman: after the end time a phone needs 80 again, by itself', (t) => {
  const d = foreman(t, { now: END + 1 });
  assert.equal(d.f.view('miner', { phone: true }).pending.wpm, 80);
  const r = d.run(at(50, d.prompt), { phone: true });
  assert.equal(r.fail, 'speed'); assert.equal(r.jab, TYPING_JABS.speed);
});

test('Foreman: an attempt started just before the end keeps the phone pace it was shown', (t) => {
  const d = foreman(t, { now: END - 10_000 });
  assert.equal(d.run(at(50, d.prompt), { phone: true }).passed, true);
});

test('Foreman: MOBILE_TYPING_UNTIL=off turns the phone pace off', (t) => {
  const d = foreman(t, { until: 'off' });
  assert.equal(d.run(at(50, d.prompt), { phone: true }).fail, 'speed');
});

test('Foreman: on a phone the dump and keystroke checks are unchanged', (t) => {
  const d = foreman(t);
  assert.equal(d.run(at(50, d.prompt), { phone: true, trace: { ...typingTraceFor(d.prompt), maxInsert: 3 } }).fail, 'keys');
  assert.equal(d.run(at(50, d.prompt), { phone: true, trace: typingTraceFor(d.prompt.slice(0, 80)) }).fail, 'keys');
  assert.equal(d.run(minTypingMs(d.prompt) - 1, { phone: true }).fail, 'early');
});

/** A composing keyboard (Gboard etc.) re-sends the word so far with each key, then ends the composition. */
function composeWord(trace, word) {
  for (let i = 1; i <= word.length; i++) recordTypingInput(trace, 'insertCompositionText', word.slice(0, i));
  endTypingComposition(trace);
}

test('phone keyboards that compose words are counted letter by letter, not as dumps', () => {
  const tr = emptyTypingTrace();
  for (const w of TYPING_PROMPT.split(' ')) { composeWord(tr, w); recordTypingInput(tr, 'insertText', ' '); }
  const text = TYPING_PROMPT + ' ';
  assert.equal(tr.maxInsert, 1); assert.equal(tr.chars, text.length); assert.equal(tr.inserts, text.length);
  assert.deepEqual(verifyTypingTrace(text, publicTypingTrace(tr)), { ok: true, fail: null });
  assert.ok(!('comp' in publicTypingTrace(tr)), 'the composing word is not sent');
});

test('a backspace inside a composition is a delete; a tapped suggestion or in-place rewrite does not count as typing', () => {
  const tr = emptyTypingTrace();
  recordTypingInput(tr, 'insertCompositionText', 'T'); recordTypingInput(tr, 'insertCompositionText', 'Ty');
  recordTypingInput(tr, 'insertCompositionText', 'T');
  assert.deepEqual([tr.inserts, tr.chars, tr.deletes], [2, 2, 1]);
  recordTypingInput(tr, 'insertCompositionText', 'Tyler'); // suggestion: 4 letters at once
  assert.deepEqual([tr.inserts, tr.chars, tr.maxInsert, tr.blocked], [2, 2, 1, 1]);
  recordTypingInput(tr, 'insertCompositionText', 'Taylor'); // autocorrect rewrote it
  assert.deepEqual([tr.inserts, tr.blocked], [2, 2]);
  recordTypingInput(tr, 'insertCompositionText', 'Ta'); // shorter but not a prefix: rewrite, not typing
  assert.equal(tr.inserts, 2);
});

test('a multi-letter insertText from autocorrect or predictive text is stopped before it lands, so honest typing after it still passes', () => {
  assert.equal(shouldBlockTypingInput('insertText', 'number '), true);
  assert.equal(shouldBlockTypingInput('insertReplacementText', 'number'), true);
  assert.equal(shouldBlockTypingInput('insertText', '. '), false, "iOS double-space period still allowed");
  const tr = emptyTypingTrace();
  assert.equal(recordTypingInput(tr, 'insertText', 'Tyler ').blocked, true); // the page prevents it: nothing typed
  for (const ch of TYPING_PROMPT) recordTypingInput(tr, 'insertText', ch);
  assert.deepEqual(verifyTypingTrace(TYPING_PROMPT, publicTypingTrace(tr)), { ok: true, fail: null });
});

test('HTTP: the server decides phone from the request headers, not the body', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-phone-http-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const clock = { t: END - 3600e3 };
  const r = createApp({ dataDir, now: () => clock.t, devLogin: true, env: { DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, marketSources: {}, snapshots: false });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  t.after(async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Thumbs', email: 'thumbs@type.test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0], { id: playerId } = await login.json();
  const call = async (m, u, b, headers = {}) => { const x = await fetch(base + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie, ...headers }, body: b ? JSON.stringify(b) : undefined }); return x.json(); };
  // the typing lock, planted straight on the server's Foreman (the same one the routes use)
  const fm = r.service.mines.foreman; fm.scoldTyping(playerId);
  const phone = { 'user-agent': UA.iphone }, desk = { 'user-agent': UA.mac };
  assert.equal((await call('GET', '/mines/foreman', null, phone)).pending.wpm, 35);
  assert.equal((await call('GET', '/mines/foreman', null, desk)).pending.wpm, 80);
  assert.equal((await call('GET', '/mines/foreman', null, { 'user-agent': UA.windows, 'sec-ch-ua-mobile': '?1' })).pending.wpm, 35);
  const { id, prompt } = (await call('GET', '/mines/foreman', null, desk)).pending;
  // a desktop asking for the phone pace in the body gets 80
  const began = await call('POST', '/mines/foreman/typing/start', { id, phone: true, mobile: true, wpm: 35 }, desk);
  assert.equal(began.wpm, 80); assert.equal(began.phonePace, undefined);
  clock.t += at(50, prompt);
  assert.equal((await call('POST', '/mines/foreman/typing/submit', { id, text: prompt, trace: typingTraceFor(prompt) }, desk)).fail, 'speed');
  const again = await call('POST', '/mines/foreman/typing/start', { id }, phone);
  assert.deepEqual([again.wpm, again.phonePace, again.paceUntil], [35, true, END]);
  clock.t += at(50, prompt);
  const pass = await call('POST', '/mines/foreman/typing/submit', { id, text: prompt, trace: typingTraceFor(prompt) }, phone);
  assert.equal(pass.passed, true, JSON.stringify(pass));
});
