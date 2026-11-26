// Extra-mad Foreman typing test: seeing the Heeshee Mazode and bailing before it takes
// the bug locks clock-in until the player types the required line at 80 WPM / 95% accuracy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Foreman } from '../server/foreman.js';
import { Mines, SCARE_CHANCE, FAUN_CHANCE, HEESHEE_GONE } from '../server/mines.js';
import { APPEAR_AFTER_MS } from '../client/src/mines/heeshee.js';
import {
  TYPING_PROMPT, TYPING_PROMPTS, TYPING_WPM, TYPING_ACCURACY, TYPING_RANTS, TYPING_JABS, TYPING_PRAISE,
  TYPING_MAX_INSERT, TYPING_TRACE_MIN, HEESHEE_APPEAR_MS, minTypingMs, levenshtein, typingStats,
  pickTypingPrompt, shouldBlockTypingInput, verifyTypingTrace, typingTraceFor, recordTypingInput,
  emptyTypingTrace,
} from '../server/foremanTyping.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = { rulesVersion: 2 };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function barnWith(bug) {
  const row = bug ? { stage: 'creature', species: bug.species, name: bug.name, speciesName: bug.speciesName || bug.species } : null;
  const pens = { miner: row };
  const penOf = (id) => pens[id] || pens.miner;
  return {
    view: (id = 'miner') => ({ pen: penOf(id) ? { ...penOf(id) } : null }),
    isHeesheeHeld: (pen) => !!(pen && (pen.heesheeHeld || pen.heesheeHeldAt)),
    heesheeHoldOf(id = 'miner') {
      const pen = penOf(id);
      if (!pen || !(pen.heesheeHeld || pen.heesheeHeldAt)) return null;
      return { name: pen.name, species: pen.species, fromShift: pen.heesheeHeldFromShift || null, at: pen.heesheeHeldAt || null };
    },
    holdHeeshee(id, { shiftId, at } = {}) {
      const pen = penOf(id);
      if (!pen || pen.stage !== 'creature') return null;
      if (pen.heesheeHeld) return this.heesheeHoldOf(id);
      Object.assign(pen, { heesheeHeld: true, heesheeHeldAt: at || 1, heesheeHeldFromShift: shiftId || null });
      return this.heesheeHoldOf(id);
    },
    releaseHeeshee(id) {
      const pen = penOf(id);
      if (!pen?.heesheeHeld) return [];
      const out = [{ name: pen.name, species: pen.species }];
      delete pen.heesheeHeld; delete pen.heesheeHeldAt; delete pen.heesheeHeldFromShift;
      return out;
    },
    foundAcid() {},
    rollEgg() { return false; },
    rollPurple() { return false; },
    rollCollect() { return false; },
    has() { return !!bug; },
  };
}

function fixture(t, { scareInt, bug } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-type-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  const accounts = new Accounts({ store, now: () => clock.now });
  const foreman = new Foreman({ store, accounts, now: () => clock.now, randInt: (n) => 0 });
  const mines = new Mines({
    store, accounts, now: () => clock.now, foreman,
    randInt: (n) => (n === 100000 ? 50000 : 0),
    scareInt: scareInt || (() => SCARE_CHANCE + FAUN_CHANCE),
    vein: () => ({ veinMs: 60000, cells: 7 }),
    barn: barnWith(bug),
  });
  const player = store.players.miner = { id: 'miner', name: 'Miner' };
  accounts.ensure(player);
  player.bankroll = 1000;
  store.savePlayers();
  return { mines, foreman, player, clock, store, dir, start: () => mines.start(player, V) };
}

function heesheeBug(t) {
  return fixture(t, { bug: { species: 'candela', name: 'Pip' } });
}

function mineAcid(f, shiftId) {
  let shift = f.mines.publicShift(f.mines.doc.active[f.player.id], true, f.player.id, f.mines.guideBug(f.player.id));
  const poolId = shift.currentPoolId;
  shift = f.mines.probe(f.player, shiftId, { ...V, poolId });
  f.mines.extract(f.player, shiftId, { ...V, poolId, action: 'start' });
  f.clock.now += 1000;
  const drawn = f.mines.extract(f.player, shiftId, { ...V, poolId, action: 'stop' });
  return drawn.result ? drawn : f.mines.quit(f.player, shiftId, V);
}

function pendingOf(f) {
  return f.foreman.view(f.player.id).pending;
}

const keys = (text) => typingTraceFor(text);

test('the appear delay and the required line are exact', () => {
  assert.equal(HEESHEE_APPEAR_MS, 5000);
  assert.equal(APPEAR_AFTER_MS, HEESHEE_APPEAR_MS);
  assert.equal(TYPING_PROMPT, 'Tyler Clark Roberts is number one. His legs are number one. His eyes are number one. His muscles are number one. Tyler is number one.');
  assert.equal(TYPING_PROMPTS[0], TYPING_PROMPT);
  assert.ok(TYPING_PROMPTS.length >= 4);
  for (const line of TYPING_PROMPTS) {
    assert.equal(line.length, TYPING_PROMPT.length, line);
    assert.equal(minTypingMs(line), minTypingMs(TYPING_PROMPT));
  }
  assert.equal(TYPING_WPM, 80);
  assert.equal(TYPING_ACCURACY, 0.95);
  assert.ok(TYPING_RANTS.length >= 3);
  assert.ok(TYPING_JABS.speed && TYPING_JABS.accuracy && TYPING_JABS.short && TYPING_JABS.early && TYPING_JABS.keys);
  assert.notEqual(TYPING_JABS.keys, TYPING_JABS.early, 'keys and early must be distinguishable');
  assert.match(TYPING_JABS.early, /paste-hands/i);
  assert.match(TYPING_JABS.keys, /keystrokes/i);
  assert.doesNotMatch(TYPING_JABS.keys, /paste-hands/i);
  assert.ok(TYPING_PRAISE);
});

test('typingStats: perfect text at 80+ WPM passes; slow, sloppy, short, or instant fails', () => {
  const min = minTypingMs();
  assert.ok(min >= 7000 && min <= 9000, min);
  const pass = typingStats(TYPING_PROMPT, min);
  assert.equal(pass.passed, true);
  assert.ok(pass.wpm >= 80);
  assert.ok(pass.accuracy >= 0.95);

  const slow = typingStats(TYPING_PROMPT, 60_000);
  assert.equal(slow.passed, false);
  assert.equal(slow.fail, 'speed');
  assert.ok(slow.wpm < 80);

  const typo = typingStats('X'.repeat(TYPING_PROMPT.length), min);
  assert.equal(typo.passed, false);
  assert.equal(typo.fail, 'accuracy');
  assert.ok(typo.accuracy < 0.95);

  const short = typingStats('Tyler', min);
  assert.equal(short.passed, false);
  assert.equal(short.fail, 'short');

  const paste = typingStats(TYPING_PROMPT, 200);
  assert.equal(paste.passed, false);
  assert.equal(paste.fail, 'early');

  assert.equal(levenshtein(TYPING_PROMPT, TYPING_PROMPT), 0);
  assert.ok(levenshtein('Tyler', TYPING_PROMPT) > 100);
});

test('quitting after seeing Heeshee, before the steal, arms the typing test and blocks a new shift', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  assert.equal(s.heeshee, true);
  assert.equal(f.mines.doc.active[f.player.id].heesheeHadBug, true);
  f.mines.seeHeeshee(f.player, s.shiftId);
  const out = f.mines.quit(f.player, s.shiftId, V);
  const pend = out.pending || pendingOf(f);
  assert.ok(pend);
  assert.equal(pend.kind, 'typing');
  assert.equal(pend.reason, 'heeshee-quit');
  assert.equal(pend.prompt, TYPING_PROMPT);
  assert.equal(pend.wpm, 80);
  assert.equal(pend.accuracy, 0.95);
  assert.deepEqual(pend.lines, TYPING_RANTS[0]);
  let err;
  try { f.start(); } catch (e) { err = e; }
  assert.ok(err, 'clock-in must be blocked');
  assert.equal(err.code, 'foreman');
  assert.match(err.message, /foreman is waiting/i);
});

test('a safety-net quit after the appear delay, with no client seen POST, still arms the test', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.clock.now += HEESHEE_APPEAR_MS;
  // Resume / stateFor stamps seen so a refresh cannot wipe the appear.
  const mid = f.mines.stateFor(f.player);
  assert.equal(mid.heeshee, true);
  assert.equal(f.mines.doc.active[f.player.id].heesheeSeen, true);
  f.mines.quit(f.player, s.shiftId, V);
  assert.equal(pendingOf(f)?.kind, 'typing');
});

test('quitting before the Heeshee appears does not arm the typing test', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.clock.now += HEESHEE_APPEAR_MS - 1;
  f.mines.quit(f.player, s.shiftId, V);
  const pend = pendingOf(f);
  assert.ok(!pend || pend.kind !== 'typing');
  // An empty quit still gets the regular math lecture.
  if (pend) assert.ok(pend.problem);
});

test('finishing the shift with acid after seeing Heeshee does not arm the typing test', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  const paid = mineAcid(f, s.shiftId);
  assert.ok(paid.result || paid.amount != null || pendingOf(f)?.kind !== 'typing');
  assert.notEqual(pendingOf(f)?.kind, 'typing');
  // They may collect a regular mud lecture if the payout was a dud, but they can still be clear of typing.
  f.foreman.forget(f.player.id);
  const again = f.start();
  const next = again.shiftId ? again : f.mines.start(f.player, { ...V, afterShiftId: s.shiftId });
  assert.ok(next.shiftId);
});

test('letting Heeshee steal the bug, then quitting, does not arm the typing test', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  const stolen = f.mines.stealBug(f.player, s.shiftId);
  assert.ok(stolen.bugStolen);
  f.mines.quit(f.player, s.shiftId, V);
  assert.notEqual(pendingOf(f)?.kind, 'typing');
  assert.match(f.mines.barn.heesheeHoldOf(f.player.id).name, /Pip/);
});

test('a shift with no bug does not arm the typing test after a Heeshee sighting', (t) => {
  const f = fixture(t); // no bug
  const s = f.start();
  assert.equal(s.heeshee, true);
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.clock.now += HEESHEE_APPEAR_MS;
  f.mines.quit(f.player, s.shiftId, V);
  assert.notEqual(pendingOf(f)?.kind, 'typing');
});

test('submitting too slowly, with typos, or only a fragment fails and keeps the lock', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const id = pendingOf(f).id;

  f.foreman.startTyping(f.player, id);
  f.clock.now += 60_000;
  const slow = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT, keys(TYPING_PROMPT));
  assert.equal(slow.passed, false);
  assert.equal(slow.fail, 'speed');
  assert.match(slow.jab, /TOO SLOW|eighty/i);
  assert.equal(pendingOf(f)?.kind, 'typing');

  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const typoText = 'X'.repeat(TYPING_PROMPT.length);
  const typo = f.foreman.gradeTyping(f.player, id, typoText, keys(typoText));
  assert.equal(typo.passed, false);
  assert.equal(typo.fail, 'accuracy');
  assert.equal(pendingOf(f)?.kind, 'typing');

  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const short = f.foreman.gradeTyping(f.player, id, 'Tyler', keys('Tyler'));
  assert.equal(short.passed, false);
  assert.equal(short.fail, 'short');
  assert.equal(pendingOf(f)?.kind, 'typing');

  f.foreman.startTyping(f.player, id);
  f.clock.now += 200;
  const early = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT);
  assert.equal(early.passed, false);
  assert.equal(early.fail, 'early');
  assert.equal(pendingOf(f)?.kind, 'typing');
});

test('a clean 80 WPM / 95% pass clears the lock so they can mine again', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const id = pendingOf(f).id;
  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const ok = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT, keys(TYPING_PROMPT));
  assert.equal(ok.passed, true);
  assert.ok(ok.wpm >= 80);
  assert.ok(ok.accuracy >= 0.95);
  assert.equal(ok.line, TYPING_PRAISE);
  assert.equal(pendingOf(f), null);
  const again = f.start();
  assert.ok(again.shiftId);
  assert.notEqual(again.shiftId, s.shiftId);
});

test('the lock is persisted on disk and survives a re-fetch until they pass', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const first = pendingOf(f);
  const disk = JSON.parse(fs.readFileSync(path.join(f.dir, 'foreman.json'), 'utf8'));
  assert.equal(disk.pending[f.player.id].kind, 'typing');
  assert.equal(disk.pending[f.player.id].prompt, TYPING_PROMPT);
  assert.equal(disk.pending[f.player.id].id, first.id);
  // A new Foreman instance reading the same store still holds the lock.
  const again = new Foreman({ store: f.store, accounts: f.mines.accounts, now: () => f.clock.now, randInt: () => 0 });
  const view = again.view(f.player.id).pending;
  assert.equal(view.kind, 'typing');
  assert.equal(view.id, first.id);
  assert.equal(view.started, false);
});

test('gradeTyping ignores a client-supplied elapsed time and requires a server start', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const id = pendingOf(f).id;
  assert.throws(() => f.foreman.gradeTyping(f.player, id, TYPING_PROMPT), /Start typing first/);
  f.foreman.startTyping(f.player, id);
  // Immediate submit: even if a client wanted to claim elapsedMs: 1000, the server uses its clock.
  const early = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT);
  assert.equal(early.passed, false);
  assert.equal(early.fail, 'early');
});

async function boot(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-fm-type-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const clock = { t: 1_700_000_000_000 };
  const r = createApp({ dataDir, now: () => clock.t, devLogin: true, vein: () => ({ veinMs: 60000, cells: 7 }) });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  t.after(async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, clock, dataDir, service: r.service };
}

async function login(base, email = 'digger@type.test') {
  const r = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Digger', email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const req = async (m, u, b) => {
    const x = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    return { status: x.status, body: await x.json() };
  };
  return {
    cookie,
    post: (u, b) => req('POST', u, { ...(/\/api\/mines\/(start|quit|finish)$/.test(u) ? V : {}), ...b }),
    get: (u) => req('GET', u),
  };
}

function plantBug(service, playerId) {
  const now = service.now();
  service.barn.doc.pens[playerId] = {
    stage: 'creature', species: 'candela', name: 'Pip', speciesName: 'candela',
    xp: 40, bornAt: now, fedAt: now,
  };
  service.barn.save();
  service.mines.heesheeForce = true;
}

test('HTTP: seeing Heeshee and quitting locks clock-in across a re-fetch until a passing attempt', async (t) => {
  const s = await boot(t);
  const d = await login(s.base);
  const me = await d.get('/api/me');
  plantBug(s.service, me.body.id);

  const start = await d.post('/api/mines/start');
  assert.equal(start.status, 200);
  assert.equal(start.body.heeshee, true);
  const shiftId = start.body.shiftId;
  const seen = await d.post('/api/mines/heeshee/seen', { shiftId });
  assert.equal(seen.status, 200);
  const quit = await d.post('/api/mines/quit', { shiftId });
  assert.equal(quit.status, 200);
  assert.equal(quit.body.pending?.kind, 'typing');

  const refetch = await d.get('/api/mines/foreman');
  assert.equal(refetch.body.pending?.id, quit.body.pending.id);
  const prompt = refetch.body.pending.prompt;
  assert.ok(TYPING_PROMPTS.includes(prompt), prompt);

  const blocked = await d.post('/api/mines/start');
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'foreman');

  const id = refetch.body.pending.id;
  const began = await d.post('/api/mines/foreman/typing/start', { id });
  assert.equal(began.status, 200);
  // A forged elapsedMs in the body is ignored: still too early on the server clock.
  const instant = await d.post('/api/mines/foreman/typing/submit', { id, text: prompt, elapsedMs: 1000 });
  assert.equal(instant.status, 200);
  assert.equal(instant.body.passed, false);
  assert.equal(instant.body.fail, 'early');
  assert.equal((await d.get('/api/mines/foreman')).body.pending?.kind, 'typing');

  const again = await d.post('/api/mines/foreman/typing/start', { id });
  assert.equal(again.status, 200);
  s.clock.t += minTypingMs();
  const pass = await d.post('/api/mines/foreman/typing/submit', { id, text: prompt, trace: keys(prompt) });
  assert.equal(pass.status, 200, JSON.stringify(pass.body));
  assert.equal(pass.body.passed, true);
  assert.equal((await d.get('/api/mines/foreman')).body.pending, null);
  const disk = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'foreman.json'), 'utf8'));
  const submits = (disk.typingLog || []).filter((r) => r.k === 'submit');
  assert.ok(submits.some((r) => r.passed === false && r.fail === 'early'));
  assert.ok(submits.some((r) => r.passed === true && r.prompt === prompt));

  const next = await d.post('/api/mines/start');
  assert.equal(next.status, 200);
  assert.ok(next.body.shiftId);
  assert.notEqual(next.body.shiftId, shiftId);
});

test('the Foreman typing UI blocks paste, turns off autocomplete, and stays on a mines screen for Work Mode', () => {
  const jsx = read('client/src/mines/Foreman.jsx');
  assert.match(jsx, /data-test="fm-type-input"/);
  assert.match(jsx, /addEventListener\('beforeinput'/);
  assert.doesNotMatch(jsx, /onBeforeInput=\{onBeforeInput\}/);
  assert.match(jsx, /textInput\/keypress/);
  assert.match(jsx, /onPaste=\{blockPaste\}/);
  assert.match(jsx, /onDrop=\{blockPaste\}/);
  assert.match(jsx, /onContextMenu=\{blockPaste\}/);
  assert.match(jsx, /autoComplete="off"/);
  assert.match(jsx, /autoCorrect="off"/);
  assert.match(jsx, /autoCapitalize="off"/);
  assert.match(jsx, /spellCheck=\{false\}/);
  assert.match(jsx, /data-test=\{typingTest \? 'fm-typing' : undefined\}/);
  const modes = read('client/src/modes/store.js');
  assert.match(modes, /data-test=fm-typing/);
  const css = read('client/src/mines/foreman.css');
  assert.match(css, /data-stage=typing/);
  assert.match(css, /iPhone 15/);
  const mines = read('client/src/mines/Mines.jsx');
  assert.match(mines, /\/mines\/heeshee\/seen/);
  assert.match(mines, /pagehide/);
  assert.match(mines, /keepalive: true/);
});

test('every lock picks a stored prompt from the pool, and grading uses that line', (t) => {
  const calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-type-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  const accounts = new Accounts({ store, now: () => clock.now });
  // First draw is the rant (n === 3), second is the prompt pool.
  const foreman = new Foreman({
    store, accounts, now: () => clock.now,
    randInt: (n) => { calls.push(n); return n === TYPING_PROMPTS.length ? 3 : 0; },
  });
  foreman.scoldTyping('miner');
  const pend = foreman.view('miner').pending;
  assert.equal(pend.prompt, TYPING_PROMPTS[3]);
  assert.notEqual(pend.prompt, TYPING_PROMPT);
  const disk = JSON.parse(fs.readFileSync(path.join(dir, 'foreman.json'), 'utf8'));
  assert.equal(disk.pending.miner.prompt, TYPING_PROMPTS[3]);
  assert.equal(disk.pending.miner.promptIndex, 3);

  const player = { id: 'miner', name: 'Miner', bankroll: 0 };
  foreman.startTyping(player, pend.id);
  clock.now += minTypingMs(pend.prompt);
  const wrongLine = foreman.gradeTyping(player, pend.id, TYPING_PROMPT, keys(TYPING_PROMPT));
  assert.equal(wrongLine.passed, false);
  assert.equal(wrongLine.fail, 'accuracy');
  foreman.startTyping(player, pend.id);
  clock.now += minTypingMs(pend.prompt);
  const ok = foreman.gradeTyping(player, pend.id, TYPING_PROMPTS[3], keys(TYPING_PROMPTS[3]));
  assert.equal(ok.passed, true);
});

test('shouldBlockTypingInput catches paste, drop, replacement, and a big insert', () => {
  assert.equal(shouldBlockTypingInput('insertFromPaste', 'hello'), true);
  assert.equal(shouldBlockTypingInput('insertReplacementText', 'Tyler'), true);
  assert.equal(shouldBlockTypingInput('insertFromDrop', 'x'), true);
  assert.equal(shouldBlockTypingInput('insertText', 'abc'), true);
  assert.equal(shouldBlockTypingInput('insertText', 'ab'), false);
  assert.equal(shouldBlockTypingInput('insertText', 'T'), false);
  assert.equal(shouldBlockTypingInput('deleteContentBackward', ''), false);
  const tr = emptyTypingTrace();
  assert.equal(recordTypingInput(tr, 'insertFromPaste', TYPING_PROMPT).blocked, true);
  assert.equal(tr.blocked, 1);
  assert.equal(tr.inserts, 0);
  assert.equal(recordTypingInput(tr, 'insertText', 'T').blocked, false);
  assert.equal(tr.inserts, 1);
  assert.equal(tr.chars, 1);
});

test('verifyTypingTrace rejects a missing, thin, or one-shot trace and accepts honest typing', () => {
  assert.equal(verifyTypingTrace(TYPING_PROMPT, null).ok, false);
  assert.equal(verifyTypingTrace(TYPING_PROMPT, null).fail, 'keys');
  assert.equal(verifyTypingTrace(TYPING_PROMPT, { inserts: 1, chars: TYPING_PROMPT.length, deletes: 0, maxInsert: TYPING_PROMPT.length }).ok, false);
  assert.equal(verifyTypingTrace(TYPING_PROMPT, { inserts: TYPING_PROMPT.length, chars: TYPING_PROMPT.length, deletes: 0, maxInsert: TYPING_MAX_INSERT + 1 }).ok, false);
  assert.equal(verifyTypingTrace(TYPING_PROMPT, { inserts: Math.ceil(TYPING_PROMPT.length * TYPING_TRACE_MIN) - 1, chars: TYPING_PROMPT.length, deletes: 0, maxInsert: 1 }).ok, false);
  assert.equal(verifyTypingTrace(TYPING_PROMPT, typingTraceFor(TYPING_PROMPT)).ok, true);
  assert.equal(pickTypingPrompt(() => 0).prompt, TYPING_PROMPT);
  assert.equal(pickTypingPrompt(() => 5).prompt, TYPING_PROMPTS[5]);
});

test('a perfect line without a keystroke trace, or with one big insert, stays locked', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const id = pendingOf(f).id;

  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const missing = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT);
  assert.equal(missing.passed, false);
  assert.equal(missing.fail, 'keys');
  assert.match(missing.jab, /keystrokes/i);
  assert.notEqual(missing.jab, TYPING_JABS.early);
  assert.equal(pendingOf(f)?.kind, 'typing');

  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const dumped = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT, {
    inserts: 1, chars: TYPING_PROMPT.length, deletes: 0, maxInsert: TYPING_PROMPT.length,
  });
  assert.equal(dumped.passed, false);
  assert.equal(dumped.fail, 'keys');
  assert.equal(pendingOf(f)?.kind, 'typing');
});

test('start and submit rows stay in the typing log after a pass', (t) => {
  const f = heesheeBug(t);
  const s = f.start();
  f.mines.seeHeeshee(f.player, s.shiftId);
  f.mines.quit(f.player, s.shiftId, V);
  const id = pendingOf(f).id;
  f.foreman.startTyping(f.player, id);
  f.clock.now += 200;
  f.foreman.gradeTyping(f.player, id, TYPING_PROMPT, keys(TYPING_PROMPT));
  f.foreman.startTyping(f.player, id);
  f.clock.now += minTypingMs();
  const ok = f.foreman.gradeTyping(f.player, id, TYPING_PROMPT, keys(TYPING_PROMPT));
  assert.equal(ok.passed, true);
  assert.equal(pendingOf(f), null);

  const disk = JSON.parse(fs.readFileSync(path.join(f.dir, 'foreman.json'), 'utf8'));
  assert.ok(Array.isArray(disk.typingLog));
  assert.equal(disk.pending[f.player.id], undefined);
  const rows = disk.typingLog.filter((r) => r.p === f.player.id);
  const starts = rows.filter((r) => r.k === 'start');
  const submits = rows.filter((r) => r.k === 'submit');
  assert.equal(starts.length, 2);
  assert.equal(submits.length, 2);
  assert.equal(submits[0].passed, false);
  assert.equal(submits[0].fail, 'early');
  assert.equal(submits[0].textLen, TYPING_PROMPT.length);
  assert.ok(Number.isFinite(submits[0].startedAt) && Number.isFinite(submits[0].submittedAt));
  assert.equal(submits[0].elapsedMs, 200);
  assert.equal(submits[1].passed, true);
  assert.equal(submits[1].fail, null);
  assert.ok(submits[1].wpm >= 80);
  assert.ok(submits[1].accuracy >= 0.95);
  assert.equal(submits[1].inserts, TYPING_PROMPT.length);
  const again = new Foreman({ store: f.store, accounts: f.mines.accounts, now: () => f.clock.now, randInt: () => 0 });
  assert.equal(again.doc.typingLog.length, rows.length);
});

test('e2e types the prompt keystroke by keystroke at about 100 WPM in a real browser', () => {
  const e2e = read('scripts/e2e-foreman-typing.mjs');
  assert.match(e2e, /pressSequentially/);
  assert.match(e2e, /wpm = 100/);
  assert.match(e2e, /beforeinput/);
  assert.match(e2e, /chromium/);
  assert.match(e2e, /webkit/);
  assert.doesNotMatch(e2e, /\.fill\(|insertFromPaste/);
});
