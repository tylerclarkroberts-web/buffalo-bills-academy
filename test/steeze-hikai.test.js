// After STEEZE is healed at the Bug Center, the heal itself is unchanged, but Nurse Hikari
// shows a flushed portrait and one bashful line. Other species are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, RECOVER_MS, FAST_HEAL_COST } from '../server/barn.js';
import { STEEZE_ID } from '../server/engine/steeze.js';
import {
  done, allHealed, greeting, healRequest,
  STEEZE_AFTERCARE, steezeAftercare, isSteezePatient, STEEZE_WHO,
} from '../client/src/bugcenter/script.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-hikai-steeze-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-27T19:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) });
  const player = (id) => {
    const p = store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    accounts.ensure(p); p.bankroll = 2000; p.mining.shifts = 10; store.savePlayers();
    return p;
  };
  const catchBug = (id, species, tag) => barn.adopt(id, { wildId: `w-${tag}`, battleId: `b-${tag}`, species, level: 5 });
  return { dir, clock, store, accounts, barn, player, catchBug };
}

function faint(f, playerId) {
  const pen = f.barn.doc.pens[playerId];
  pen.faintedAt = f.clock.now;
  f.barn.save();
  return pen;
}

test('STEEZE aftercare is a short PG-13 pool of four to six bashful lines, one picked at random', () => {
  assert.ok(STEEZE_AFTERCARE.length >= 4 && STEEZE_AFTERCARE.length <= 6);
  const jp = /[\u3040-\u30ff\u4e00-\u9faf]/;
  const explicit = /sex|nude|naked|penis|weiner|breast|bed|kiss|undress|horny/i;
  for (const line of STEEZE_AFTERCARE) {
    assert.ok(jp.test(line.ja) && line.en && line.en.length < 90 && line.ja.length < 40);
    assert.doesNotMatch(line.ja + line.en, explicit);
  }
  assert.ok(STEEZE_AFTERCARE.some((l) => l.who === 'steeze'));
  assert.ok(STEEZE_AFTERCARE.some((l) => !l.who));
  assert.equal(STEEZE_WHO.en, 'STEEZE');
  assert.equal(steezeAftercare(() => 0), STEEZE_AFTERCARE[0]);
  assert.equal(steezeAftercare(() => 0.99), STEEZE_AFTERCARE[STEEZE_AFTERCARE.length - 1]);
});

test('done() and allHealed() add a flushed aftercare line only for STEEZE; the ordinary heal lines stay', () => {
  const sagra = { species: 'sagra', name: 'Sagra II' };
  const him = { species: STEEZE_ID, name: 'STEEZE' };
  const ordinary = done(sagra, true, 0);
  const paid = done(sagra, true, 50);
  assert.equal(ordinary.length, 3);
  assert.equal(isSteezePatient(sagra), false);
  assert.match(ordinary[0].en, /fully healed/);
  assert.match(ordinary[1].en, /no charge/);
  assert.match(ordinary[2].en, /Come back any time/);
  assert.match(paid[1].en, /\$50/);
  assert.ok(!ordinary.some((l) => STEEZE_AFTERCARE.includes(l) || l.who === 'steeze'));

  const wink = done(him, true, 0, () => 0);
  assert.equal(isSteezePatient(him), true);
  assert.equal(wink.length, 4, 'one extra line, the closer stays last');
  assert.match(wink[0].en, /STEEZE is fully healed/);
  assert.match(wink[1].en, /no charge/);
  assert.equal(wink[2], STEEZE_AFTERCARE[0]);
  assert.match(wink[3].en, /Come back any time/);
  assert.ok(wink[3].end);

  const paidHim = done(him, true, 50, () => 0);
  assert.match(paidHim[1].en, /\$50/);
  assert.equal(paidHim[2], STEEZE_AFTERCARE[0]);

  const healthy = done(him, false, 0, () => 0);
  assert.match(healthy[0].en, /Perfectly healthy/);
  assert.equal(healthy[2], STEEZE_AFTERCARE[0]);

  const room = allHealed([{ name: 'A', species: 'empusa' }, { name: 'B', species: 'halobates' }], 100);
  assert.ok(!room.some((l) => STEEZE_AFTERCARE.includes(l)));
  assert.match(room[0].en, /everyone/i);

  const withHim = allHealed([{ name: 'A', species: 'empusa' }, him], 100, [], () => 0);
  assert.ok(withHim.includes(STEEZE_AFTERCARE[0]));
  assert.match(withHim.at(-1).en, /Come back any time/);
});

test('greeting and healRequest for STEEZE are the same as for any other fainted bug', () => {
  const him = { id: 'p1', stage: 'creature', species: STEEZE_ID, name: 'STEEZE', fainted: true };
  const other = { id: 'p2', stage: 'creature', species: 'onymacris', name: 'Onymacris I', fainted: true };
  const a = greeting(him), b = greeting(other);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l) => l.ask || l.pay || l.end), b.map((l) => l.ask || l.pay || l.end));
  assert.deepEqual(healRequest(him, { pay: true }), { bug: 'p1', mode: 'heal', pay: true });
  assert.deepEqual(healRequest(other, { pay: true }), { bug: 'p2', mode: 'heal', pay: true });
  assert.deepEqual(healRequest(him, {}), { bug: 'p1', mode: 'heal' });
});

test('healing STEEZE costs, waits, and recovers the same as any other bug; the flavor is client-only', (t) => {
  const f = fixture(t);
  f.player('ann');
  f.player('bob');
  f.catchBug('ann', STEEZE_ID, 'steeze');
  f.catchBug('bob', 'onymacris', 'ony');
  faint(f, 'ann');
  faint(f, 'bob');

  const moneyA = f.store.players.ann.bankroll, moneyB = f.store.players.bob.bankroll;
  const viewA = f.barn.view('ann').pen, viewB = f.barn.view('bob').pen;
  assert.equal(viewA.species, STEEZE_ID);
  assert.equal(viewA.recoverMs, viewB.recoverMs);
  assert.equal(viewA.healCost, viewB.healCost);
  assert.equal(viewA.healCost, FAST_HEAL_COST);
  assert.throws(() => f.barn.heal('ann'), (e) => e.status === 409 && /60 more minutes/.test(e.message));
  assert.throws(() => f.barn.heal('bob'), (e) => e.status === 409 && /60 more minutes/.test(e.message));
  assert.ok(f.barn.doc.pens.ann.faintedAt);
  assert.ok(f.barn.doc.pens.bob.faintedAt);
  assert.equal(f.store.players.ann.bankroll, moneyA);
  assert.equal(f.store.players.bob.bankroll, moneyB);

  const paidA = f.barn.heal('ann', { pay: true });
  const paidB = f.barn.heal('bob', { pay: true });
  assert.deepEqual(
    { healed: paidA.healed, cost: paidA.cost, fainted: paidA.pen.fainted, health: paidA.pen.health },
    { healed: paidB.healed, cost: paidB.cost, fainted: paidB.pen.fainted, health: paidB.pen.health },
  );
  assert.equal(paidA.healed, true);
  assert.equal(paidA.cost, FAST_HEAL_COST);
  assert.equal(paidA.pen.fainted, false);
  assert.equal(paidA.pen.health, 100);
  assert.equal(f.store.players.ann.bankroll, moneyA - FAST_HEAL_COST);
  assert.equal(f.store.players.bob.bankroll, moneyB - FAST_HEAL_COST);
  assert.equal(f.barn.doc.pens.ann.heals, 1);
  assert.equal(f.barn.doc.pens.bob.heals, 1);
  assert.equal(f.barn.doc.pens.ann.faintedAt, undefined);
  assert.equal('flushed' in paidA, false, 'the server heal result has no flavor flag');
  assert.equal('aftercare' in paidA, false);

  // A second, already-healthy visit is a no-op for both, same as usual.
  assert.deepEqual(
    { healed: f.barn.heal('ann').healed, cost: f.barn.heal('ann').cost, heals: f.barn.doc.pens.ann.heals },
    { healed: false, cost: 0, heals: 1 },
  );
  assert.deepEqual(
    { healed: f.barn.heal('bob').healed, cost: f.barn.heal('bob').cost, heals: f.barn.doc.pens.bob.heals },
    { healed: false, cost: 0, heals: 1 },
  );

  // Free path after an hour of rest is also the same.
  faint(f, 'ann'); faint(f, 'bob');
  f.clock.now += RECOVER_MS;
  const freeA = f.barn.heal('ann'), freeB = f.barn.heal('bob');
  assert.deepEqual(
    { healed: freeA.healed, cost: freeA.cost, fainted: freeA.pen.fainted, bankroll: f.store.players.ann.bankroll },
    { healed: true, cost: 0, fainted: false, bankroll: moneyA - FAST_HEAL_COST },
  );
  assert.deepEqual(
    { healed: freeB.healed, cost: freeB.cost, fainted: freeB.pen.fainted, bankroll: f.store.players.bob.bankroll },
    { healed: true, cost: 0, fainted: false, bankroll: moneyB - FAST_HEAL_COST },
  );
  assert.equal(f.barn.doc.pens.ann.heals, 2);
  assert.equal(f.barn.doc.pens.bob.heals, 2);
});

test('the flushed portrait and sprite are used only after a STEEZE heal', () => {
  const jsx = fs.readFileSync(path.join(root, 'client/src/bugcenter/BugCenter.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'client/src/bugcenter/bugcenter.css'), 'utf8');
  const art = path.join(root, 'client/public/bugcenter/hikari-flushed.webp');
  const usual = path.join(root, 'client/public/bugcenter/hikari.webp');
  assert.ok(fs.existsSync(art));
  assert.ok(fs.existsSync(usual));
  assert.notEqual(fs.readFileSync(art).equals(fs.readFileSync(usual)), true, 'variant is not a copy of the usual portrait');
  assert.match(jsx, /PORTRAIT_FLUSHED = '\/bugcenter\/hikari-flushed\.webp'/);
  assert.match(jsx, /talk\.flushed \? PORTRAIT_FLUSHED : PORTRAIT/);
  assert.match(jsx, /data-flushed=\{talk\.flushed \? '1' : undefined\}/);
  assert.match(jsx, /flushed: isSteezePatient\(patient\)/);
  assert.match(jsx, /function NurseSprite\(\{ bow, flushed \}\)/);
  assert.match(jsx, /data-test="bc-nurse-flushed"/);
  assert.match(jsx, /shown\.some\(isSteezePatient\)/);
  assert.doesNotMatch(jsx, /setTalk\(\{ lines: done\([^)]+\), i: 0, mode: 'talk' \}\)/);
  assert.match(css, /\.bc-who-steeze/);
  // The usual greeting still uses the ordinary portrait; flushed is gated on talk.flushed.
  const start = jsx.slice(jsx.indexOf('const start ='), jsx.indexOf('const next ='));
  assert.doesNotMatch(start, /flushed:\s*true/);
});
