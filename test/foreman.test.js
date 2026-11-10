// v45 the Foreman: farmer-swears only, server-held math problem gates clock-in, quit and mud both trigger it,
// wrong answers jab and re-roll, first-try bonus capped per hour, deletion clears it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../server/app.js';
import { RANTS, CLOSERS, ESCALATION, JABS, PRAISE, makeProblem, makeScene, sceneLength, GENERATORS, BONUS, BONUS_PER_HOUR } from '../server/foreman.js';
import { PAID_RANTS, paidFarewell } from '../client/src/mines/paidFarewell.js';
async function boot(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-foreman-'));
  const clock = { t: 1_700_000_000_000 };
  const r = createApp({ dataDir, now: () => clock.t, devLogin: true, vein: () => ({ veinMs: 0, cells: 7 }), ...opts });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); };
  return { base, clock, stop, dataDir };
}
async function login(base, email) {
  const r = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Digger', email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const req = async (m, u, b) => { const x = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); return { status: x.status, body: await x.json() }; };
  return { post: (u, b) => req('POST', u, b || {}), get: (u) => req('GET', u), del: (u, b) => req('DELETE', u, b) };
}
// v48: problems are word/multi-step, so tests read the held answer from the server's own doc (never sent to clients)
let DATA = null; const held = (pendId) => { const d = JSON.parse(fs.readFileSync(DATA + '/foreman.json', 'utf8')); return Object.values(d.pending).find((x) => x.id === pendId).problem.answer; };

test('lines: farmer swears only, no real profanity anywhere', () => {
  const all = [...Object.values(RANTS).flat(2), ...ESCALATION, ...CLOSERS, ...JABS, ...PRAISE, ...PAID_RANTS.flat()].join(' \n ').toLowerCase();
  for (const w of ['fuck', 'shit', 'damn', 'hell', 'bitch', 'ass ', 'bastard', 'crap', 'piss', 'goddam', 'dick', 'cock']) assert.ok(!all.includes(w), w);
  for (const w of ['dad-gummit', 'biscuit-eatin', 'cow-patties', 'horse apples', 'dagnabbit', 'sack of feed corn']) assert.ok(all.includes(w), w);
});
test('paid departures: short, quieter scenes without a problem for normal pay and jackpots', () => {
  for (const outcome of ['normal', 'motherlode', 'aliens', 'diamonds']) {
    const result = { outcome, amount: outcome === 'normal' ? 100 : 10000, bankroll: 12000 };
    const before = structuredClone(result);
    for (let i = 0; i < PAID_RANTS.length; i++) {
      const scene = paidFarewell(result, () => (i + 0.5) / PAID_RANTS.length);
      assert.equal(scene.reason, 'paid');
      assert.deepEqual(scene.lines, PAID_RANTS[i]);
      assert.equal(scene.lines.length, 3);
      assert.equal(new Set(scene.lines).size, 3);
      assert.ok(!('problem' in scene));
      for (const line of scene.lines) assert.doesNotMatch(line, /[A-Z]{4,}|[!?]{2,}/, 'no shouted tirade');
    }
    assert.deepEqual(result, before, 'farewells do not change payout data');
  }
});
test('paid departures do not replace mud lectures or run without a payout', () => {
  for (const result of [null, undefined, { outcome: 'dud', amount: 10 }, { outcome: 'normal', amount: 0 }]) {
    assert.equal(paidFarewell(result), null);
  }
});
// independent re-derivation of every generator's answer from its text
const derive = (t) => {
  const n = (t.match(/\d+/g) || []).map(Number);
  if (/crates/.test(t)) return n[0] * 12 - n[1];
  if (/Feed's/.test(t)) return n[2] - n[0] * n[1];
  if (/mules/.test(t)) return n[0] * n[1] + n[2];
  if (/% of/.test(t)) return (n[0] * n[1]) / 100;
  if (/\/\d+ of/.test(t)) return (n[0] * n[2]) / n[1];
  return Function(`return ${t.replace(/×/g, '*').replace(/−/g, '-')}`)();
};
test('problems (v48): every generator, integer answers, positive, checked independently, a bit harder', () => {
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const p = makeProblem(); seen.add(p.kind);
    assert.ok(Number.isInteger(p.answer) && p.answer > 0 && p.answer < 1000, `${p.text} = ${p.answer}`);
    assert.equal(p.answer, derive(p.text), p.text);
    assert.ok(!/^\d+ [+×] \d+$/.test(p.text), 'no plain one-step sums any more');
  }
  assert.deepEqual([...seen].sort(), Object.keys(GENERATORS).sort());
  for (const [k, g] of Object.entries(GENERATORS)) for (let i = 0; i < 500; i++) { const p = g((n) => Math.floor(Math.random() * n)); assert.ok(Number.isInteger(p.answer), k); }
});
test('scenes (v48): 4..20 lines, weighted spread, no repeats, closer last, 60+ distinct lines', () => {
  const r = (n) => Math.floor(Math.random() * n); const h = { s: 0, m: 0, l: 0 }; const lens = new Set();
  for (let i = 0; i < 6000; i++) {
    const L = makeScene(i % 2 ? 'quit' : 'mud', r); lens.add(L.length);
    assert.ok(L.length >= 4 && L.length <= 20); assert.equal(new Set(L).size, L.length, 'no line twice');
    assert.ok(CLOSERS.includes(L.at(-1)), 'last line leads into the math');
    h[L.length <= 6 ? 's' : L.length <= 12 ? 'm' : 'l']++;
  }
  assert.equal(lens.size, 17, 'every length 4..20 happens');
  assert.ok(h.s > 2000 && h.s < 2800 && h.m > 1700 && h.m < 2500 && h.l > 1100 && h.l < 1900, JSON.stringify(h));
  assert.ok(new Set([...Object.values(RANTS).flat(2), ...ESCALATION, ...CLOSERS]).size >= 60);
  for (let i = 0; i < 300; i++) assert.ok(sceneLength(r) >= 4);
});
test('quit: no pay, the foreman blocks clock-in until a right answer; wrong answers jab with a new problem', async () => {
  const s = await boot(); DATA = s.dataDir; try {
    const u = await login(s.base, 'q@example.com');
    const bank0 = (await u.get('/api/me')).body.bankroll;
    const sh = (await u.post('/api/mines/start')).body;
    assert.equal((await u.post('/api/mines/quit', { shiftId: 'nope' })).status, 409);
    const q = await u.post('/api/mines/quit', { shiftId: sh.shiftId }); assert.equal(q.status, 200);
    const pend = q.body.pending; assert.equal(pend.reason, 'quit'); assert.ok(pend.lines.length >= 4 && pend.lines.length <= 20); assert.ok(!('answer' in pend.problem));
    assert.equal((await u.get('/api/me')).body.bankroll, bank0, 'quitting pays nothing');
    const st = await u.post('/api/mines/start'); assert.equal(st.status, 409); assert.equal(st.body.code, 'foreman');
    assert.equal((await u.post('/api/mines/finish', { shiftId: sh.shiftId })).status, 409, 'the quit shift cannot be paid later');
    assert.equal((await u.post('/api/mines/foreman/answer', { id: pend.id, answer: 'twelve' })).status, 400);
    assert.equal((await u.post('/api/mines/foreman/answer', { id: 'x', answer: 1 })).status, 409);
    const w = await u.post('/api/mines/foreman/answer', { id: pend.id, answer: held(pend.id) + 1 });
    assert.equal(w.body.correct, false); assert.ok(JABS.includes(w.body.jab)); assert.equal(w.body.misses, 1);
    assert.equal((await u.get('/api/mines/foreman')).body.pending.problem.text, w.body.problem.text, 'the new problem is the one the server holds');
    assert.equal((await u.post('/api/mines/start')).status, 409, 'still blocked');
    const ok = await u.post('/api/mines/foreman/answer', { id: pend.id, answer: String(held(pend.id)) });
    assert.equal(ok.body.correct, true); assert.equal(ok.body.bonus, 0, 'no bonus after a miss');
    assert.equal((await u.get('/api/mines/foreman')).body.pending, null);
    assert.equal((await u.post('/api/mines/start')).status, 200, 'clock-in allowed again');
  } finally { await s.stop(); }
});
test('bonus: first-try right pays $5, at most 3 an hour', async () => {
  const s = await boot(); DATA = s.dataDir; try {
    const u = await login(s.base, 'b@example.com'); let bank = (await u.get('/api/me')).body.bankroll;
    const pays = [];
    for (let i = 0; i < 4; i++) {
      const sh = (await u.post('/api/mines/start')).body; const p = (await u.post('/api/mines/quit', { shiftId: sh.shiftId })).body.pending;
      const r = (await u.post('/api/mines/foreman/answer', { id: p.id, answer: held(p.id) })).body; pays.push(r.bonus);
      assert.equal(r.bankroll, bank + r.bonus); bank = r.bankroll;
    }
    assert.deepEqual(pays, [BONUS, BONUS, BONUS, 0]); assert.equal(BONUS_PER_HOUR, 3);
    s.clock.t += 3600e3 + 1;
    const sh = (await u.post('/api/mines/start')).body; const p = (await u.post('/api/mines/quit', { shiftId: sh.shiftId })).body.pending;
    assert.equal((await u.post('/api/mines/foreman/answer', { id: p.id, answer: held(p.id) })).body.bonus, BONUS, 'resets after an hour');
  } finally { await s.stop(); }
});
test('mud: a dud shift pays its $10 and then the foreman wants a word; delete clears him', async () => {
  const s = await boot({ randInt: (n) => (n === 100000 ? 50 * 3 : 0) }); try {
    const u = await login(s.base, 'm@example.com');
    const sh = (await u.post('/api/mines/start')).body; s.clock.t += 21000;
    const f = await u.post('/api/mines/finish', { shiftId: sh.shiftId });
    assert.equal(f.body.outcome, 'dud'); assert.equal(f.body.amount, 10); assert.equal(f.body.foreman.reason, 'mud');
    assert.equal((await u.post('/api/mines/start')).status, 409);
    assert.equal((await u.del('/api/me', { confirm: 'DELETE' })).status, 200);
    const doc = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'foreman.json'), 'utf8')); assert.deepEqual(doc.pending, {});
  } finally { await s.stop(); }
});
