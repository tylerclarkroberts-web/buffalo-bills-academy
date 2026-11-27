// The Bug Center heals every knocked-out bug at once (Barn.healAll, POST /api/barn/heal-all): rested ones free, the
// rest $FAST_HEAL_COST each only when the owner agreed to the total, in one barn write and one ledger line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, RECOVER_MS, FAST_HEAL_COST } from '../server/barn.js';
import { healPlan, healAllRequest, greetingAll, allHealed } from '../client/src/bugcenter/script.js';

const MIN = 60e3;
function fixture(t, bankroll = 1000) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-healall-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-26T19:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now }), barn = new Barn({ store, accounts, now });
  const p = store.players.ann = { id: 'ann', name: 'Ann', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * 86400e3 };
  accounts.ensure(p); p.bankroll = bankroll; store.savePlayers();
  const add = (species, i) => barn.adopt('ann', { wildId: `w${i}`, battleId: `b${i}`, species, level: 5 });
  add('manticora', 1); add('phanaeus', 2); add('lamprima', 3); add('pyrops', 4);
  const bugs = () => barn.bugs('ann');
  const [a, b, c] = bugs();
  a.faintedAt = clock.now - 2 * RECOVER_MS; a.faintedIn = 'ring'; a.health = 0; // rested: free
  b.faintedAt = clock.now - 10 * MIN; b.faintedIn = 'mines'; b.health = 0;     // fresh: $50
  c.faintedAt = clock.now - 5 * MIN; c.health = 0;                             // fresh: $50
  barn.save();
  const id = (pen) => barn.view('ann').stable.bugs.find((v) => v.name === pen.name).id;
  return { clock, store, accounts, barn, p, bugs, a, b, c, id, heals: () => (store.players.ann.txns || []).filter((x) => x.type === 'barn-heal') };
}

test('heal all: every knocked-out bug up in one tap, one ledger line for the ones paid for', (t) => {
  const f = fixture(t);
  const out = f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 2 * FAST_HEAL_COST });
  assert.equal(out.cost, 100);
  assert.deepEqual(out.healedAll.map((h) => [h.name, h.paid]).sort(), [[f.a.name, false], [f.b.name, true], [f.c.name, true]].sort());
  assert.ok(out.stable.bugs.every((bug) => !bug.fainted), 'nobody left fainted');
  assert.equal(f.store.players.ann.bankroll, 900);
  const lines = f.heals();
  assert.equal(lines.length, 1); assert.equal(lines[0].amount, -100); assert.equal(lines[0].balance, 900);
  assert.match(lines[0].note, /^Bug Center: expedited recovery × 2 \(/);
  assert.ok(lines[0].note.includes(f.b.name) && lines[0].note.includes(f.c.name) && !lines[0].note.includes(f.a.name), 'the free one is not billed');
  const saved = JSON.parse(fs.readFileSync(path.join(f.store.dir, 'barn.json'), 'utf8'));
  const all = [saved.pens.ann, ...(saved.bench.ann || [])];
  assert.ok(all.every((pen) => !pen.faintedAt), 'written to disk');
  assert.equal(all.filter((pen) => pen.healedAt).length, 3);
});

test('heal all: asking again heals and charges nothing', (t) => {
  const f = fixture(t);
  f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 });
  const again = f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 });
  assert.deepEqual(again.healedAll, []); assert.equal(again.cost, 0);
  assert.equal(f.store.players.ann.bankroll, 900); assert.equal(f.heals().length, 1);
});

test('heal all: without paying, the rested ones go free and the rest wait with their price', (t) => {
  const f = fixture(t);
  const out = f.barn.healAll('ann', { pay: [], total: 0 });
  assert.deepEqual(out.healedAll.map((h) => h.name), [f.a.name]); assert.equal(out.cost, 0);
  assert.deepEqual(out.waiting.map((w) => w.cost), [50, 50]);
  assert.equal(f.store.players.ann.bankroll, 1000); assert.equal(f.heals().length, 0);
});

test('heal all: never charges more than the total shown, and changes nothing when it would', (t) => {
  const f = fixture(t);
  assert.throws(() => f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 50 }), /bill changed/);
  assert.ok(f.bugs().filter((pen) => pen.faintedAt).length === 3); assert.equal(f.store.players.ann.bankroll, 1000);
  // a bug that finished its rest since the total was shown is simply free: the bill only goes down
  f.clock.now += RECOVER_MS;
  const out = f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 });
  assert.equal(out.cost, 0); assert.equal(out.healedAll.length, 3);
});

test('heal all: short of money it refuses the lot; paying for what you can afford works', (t) => {
  const f = fixture(t, 60);
  assert.throws(() => f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 }), (e) => e.status === 402);
  assert.equal(f.bugs().filter((pen) => pen.faintedAt).length, 3, 'nobody healed'); assert.equal(f.store.players.ann.bankroll, 60);
  const out = f.barn.healAll('ann', { pay: [f.id(f.b)], total: 50 });
  assert.equal(out.cost, 50); assert.equal(out.healedAll.length, 2); assert.equal(out.waiting.length, 1);
  assert.equal(f.store.players.ann.bankroll, 10);
});

test('heal all: if the money cannot be written, nobody is healed', (t) => {
  const f = fixture(t);
  const real = f.store.commitPlayerDrafts.bind(f.store);
  f.store.commitPlayerDrafts = () => { throw new Error('disk full'); };
  assert.throws(() => f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 }), /disk full/);
  f.store.commitPlayerDrafts = real;
  assert.equal(f.barn.bugs('ann').filter((pen) => pen.faintedAt).length, 3);
  const saved = JSON.parse(fs.readFileSync(path.join(f.store.dir, 'barn.json'), 'utf8'));
  assert.equal([saved.pens.ann, ...(saved.bench.ann || [])].filter((pen) => pen.faintedAt).length, 3, 'the barn on disk was put back');
  assert.equal(f.store.players.ann.bankroll, 1000);
});

test('heal all: leaves the specialist cases and a bug in a live fight alone', (t) => {
  const f = fixture(t);
  f.a.sick = true; f.barn.save();
  const fighting = f.barn.view('ann').stable.bugs.find((v) => v.name === f.c.name);
  f.barn.fights.fightOf = () => ({ players: ['ann', 'bob'], fighters: [{ species: fighting.species, name: fighting.name }, {}] });
  const out = f.barn.healAll('ann', { pay: [f.id(f.b), f.id(f.c)], total: 100 });
  assert.deepEqual(out.healedAll.map((h) => h.name), [f.b.name]); assert.equal(out.cost, 50);
  assert.ok(f.a.faintedAt && f.a.sick && f.c.faintedAt);
});

test('heal all: bad requests are refused', (t) => {
  const f = fixture(t);
  for (const body of [{ pay: 'all' }, { pay: ['x'] }, { pay: [], total: -1 }, { pay: [], total: 'lots' }]) assert.throws(() => f.barn.healAll('ann', body), (e) => e.status === 400);
});

test('the nurse: one question for everyone, the total up front, and what to do when money is short', () => {
  const bug = (id, name, recoverMs, extra = {}) => ({ id, name, stage: 'creature', fainted: true, recoverMs, healCost: 50, ...extra });
  const view = (bugs, bankroll) => ({ bankroll, stable: { bugs: [...bugs, { id: 9, name: 'Fine', stage: 'creature' }] } });
  let plan = healPlan(view([bug(1, 'A', 0), bug(2, 'B', 600e3), bug(3, 'C', 300e3)], 1000));
  assert.deepEqual([plan.free.length, plan.paid.length, plan.total, plan.afford.length], [1, 2, 100, 2]);
  assert.deepEqual(healAllRequest(plan, 'all'), { pay: [2, 3], total: 100 });
  assert.deepEqual(healAllRequest(plan, 'free'), { pay: [], total: 0 });
  const lines = greetingAll(plan); const ask = lines.at(-1);
  assert.ok(ask.choices.some((c) => c.kind === 'all' && /\$100/.test(c.en)), 'the total is on the button');
  plan = healPlan(view([bug(1, 'A', 0), bug(2, 'B', 600e3), bug(3, 'C', 300e3)], 60));
  assert.equal(plan.afford.length, 1, 'one of the two fits $60'); assert.equal(plan.afford[0].id, 2, 'the longest wait first');
  const short = greetingAll(plan).at(-1);
  assert.ok(short.choices.some((c) => c.kind === 'afford' && /\$50/.test(c.en)) && !short.choices.some((c) => c.kind === 'all'));
  assert.ok(greetingAll(plan).some((l) => /\$100/.test(l.en) && /\$60/.test(l.en)), 'says plainly what it costs and what you have');
  assert.deepEqual(healAllRequest(plan, 'afford'), { pay: [2], total: 50 });
  plan = healPlan(view([bug(1, 'A', 0, { partner: true }), bug(2, 'B', 0)], 0));
  assert.equal(plan.total, 0); assert.ok(greetingAll(plan).at(-1).choices.some((c) => c.kind === 'free'));
  assert.equal(healPlan(view([bug(1, 'A', 0, { sick: true })], 0)), null, 'a sick bug is the specialist’s');
  assert.match(allHealed([{ name: 'A' }, { name: 'B' }], 100)[0].en, /everyone/i);
});
