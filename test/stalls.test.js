// Stalls: a barn keeps several bugs, one of them the partner. A stalled bug lives BENCH_SLOW times slower, still
// needs looking after and still earns XP for it. Any standing bug can be sent to a bout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, STALLS, STALL_COSTS, BENCH_SLOW, CARE_XP, DAY_XP, DECAY_PER_HOUR, STARVE_MS, BOUT_XP } from '../server/barn.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-stalls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-16T12:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: () => 0 });
  const player = (id, cash = 0) => { const p = store.players[id] = { id, name: id, kind: 'password', login: { username: id }, createdAt: clock.now }; accounts.ensure(p); p.bankroll = cash; store.savePlayers(); return id; };
  /** Pick an egg up and wait for it to hatch. Returns the owner's bugs as the page sees them, partner first. */
  const hatch = (id) => { barn.layEgg(id); clock.now += 2000; return barn.view(id).stable.bugs; };
  let catches = 0;
  const catchWild = (id) => {
    catches++;
    barn.adopt(id, { wildId: `wild-${catches}`, battleId: `fight-${catches}`, species: 'onymacris', level: 1, health: 25 });
    return barn.view(id).stable.bugs;
  };
  return { clock, store, barn, player, hatch, catchWild };
}

test('a barn holds three, the first is the partner, and a paid stall makes room for a fourth', t => {
  const { barn, store, player, hatch, catchWild } = fixture(t), ann = player('ann', 2000);
  hatch(ann);
  assert.equal(barn.rollEgg(ann), false, 'even with two empty stalls');
  assert.throws(() => barn.layEgg(ann), /empty barn/);
  catchWild(ann);
  const bugs = catchWild(ann);
  assert.equal(bugs.length, STALLS);
  assert.deepEqual(bugs.map(b => b.partner), [true, false, false]);
  assert.equal(new Set(bugs.map(b => b.id)).size, 3, 'each has its own id');
  assert.equal(barn.view(ann).pen.id, bugs[0].id, 'pages that know one bug get the partner');
  assert.throws(() => barn.layEgg(ann), /empty barn/);
  assert.throws(() => catchWild(ann), /Every stall is taken/);
  const view = barn.buildStall(ann);
  assert.deepEqual([view.stable.stalls, view.stable.nextStall, store.players[ann].bankroll], [STALLS + 1, STALL_COSTS[1], 2000 - STALL_COSTS[0]]);
  assert.throws(() => barn.buildStall(ann), /need \$4,000/, 'the next one costs more than is left');
  assert.equal(barn.stalls(ann), STALLS + 1, 'and nothing was built');
  assert.equal(catchWild(ann).length, 4);
});

test('a stalled bug gets hungry five times slower, and care still counts for it', t => {
  const { barn, clock, player, hatch, catchWild } = fixture(t), ann = player('ann');
  hatch(ann); const [, stalled] = catchWild(ann);
  const before = barn.view(ann).stable.bugs;
  clock.now += 50 * HOUR;
  const [partner, slow] = barn.view(ann).stable.bugs;
  const lost = (was, is) => was.needs.mood - is.needs.mood;
  assert.equal(lost(before[0], partner), Math.round(DECAY_PER_HOUR.mood * 50));
  assert.equal(lost(before[1], slow), Math.round((DECAY_PER_HOUR.mood * 50) / BENCH_SLOW));
  // Looked after in its stall: the need goes up, the XP is its own, and the partner's cooldown is untouched.
  const xp = slow.xp, cared = barn.care(ann, 'play', stalled.id).stable.bugs;
  assert.equal(cared[1].xp, xp + CARE_XP);
  assert.ok(cared[1].needs.mood > slow.needs.mood);
  assert.ok(cared[1].cool.play > 0 && cared[0].cool.play === 0);
  assert.throws(() => barn.care(ann, 'play', 12345), /not in your barn/);
  // Its days are five long too: one day bonus for five days in the stall, kept fed.
  const fed = barn.care(ann, 'feed', stalled.id).stable.bugs[1].xp;
  clock.now += BENCH_SLOW * DAY;
  assert.equal(barn.view(ann).stable.bugs[1].xp, fed + DAY_XP);
});

test('choosing a partner swaps the two without a jump in either bug\'s needs, and their clocks trade pace', t => {
  const { barn, clock, player, hatch, catchWild } = fixture(t), ann = player('ann');
  hatch(ann); catchWild(ann);
  clock.now += 40 * HOUR;
  const [first, second] = barn.view(ann).stable.bugs;
  const after = barn.setPartner(ann, second.id);
  assert.equal(after.pen.id, second.id);
  assert.deepEqual(after.stable.bugs.map(b => [b.id, b.partner, b.needs]), [[second.id, true, second.needs], [first.id, false, first.needs]]);
  clock.now += 10 * HOUR;
  const [now1, now2] = barn.view(ann).stable.bugs;
  assert.equal(second.needs.clean - now1.needs.clean, DECAY_PER_HOUR.clean * 10, 'the new partner at full pace');
  assert.ok(Math.abs(first.needs.clean - now2.needs.clean - (DECAY_PER_HOUR.clean * 10) / BENCH_SLOW) <= 1, 'the old one at a fifth (the page gets whole numbers)');
  assert.equal(barn.setPartner(ann, second.id).pen.id, second.id, 'asking twice is harmless');
});

test('a stalled bug starves five times later; laying the partner to rest brings the next bug forward', t => {
  const { barn, clock, player, hatch, catchWild } = fixture(t), ann = player('ann');
  hatch(ann); const [, stalled] = catchWild(ann);
  clock.now += STARVE_MS + DAY;
  let bugs = barn.view(ann).stable.bugs;
  assert.deepEqual(bugs.map(b => b.stage), ['dead', 'creature'], 'three weeks unfed kills the partner; in a stall that is under five days of going hungry');
  const view = barn.bury(ann);
  assert.deepEqual(view.stable.bugs.map(b => [b.id, b.partner]), [[stalled.id, true]]);
  clock.now += STARVE_MS; // now at the partner's pace
  bugs = barn.view(ann).stable.bugs;
  assert.equal(bugs[0].stage, 'dead');
});

test('any standing bug can be sent to a bout, and the fight\'s XP and record land on that bug', t => {
  const { barn, clock, player, hatch, catchWild } = fixture(t), ann = player('ann'), bob = player('bob');
  hatch(ann); const [annPartner, annStalled] = catchWild(ann); const [bobBug] = hatch(bob);
  barn.openBout(ann, { stake: 0, bug: annStalled.id });
  const open = barn.view(bob).bouts[0];
  assert.equal(open.fighter.name, annStalled.name);
  barn.joinBout(bob, open.id, { bug: bobBug.id });
  clock.now += 10 * 60e3; // nobody is watching: it runs to the end
  const [partner, fought] = barn.view(ann).stable.bugs;
  assert.deepEqual([partner.xp, partner.record], [annPartner.xp, { w: 0, l: 0, d: 0 }]);
  assert.ok(fought.xp >= annStalled.xp + BOUT_XP);
  assert.equal(fought.record.w + fought.record.l + fought.record.d, 1);
  assert.equal(barn.view(ann).lastBout.id, open.id, 'the Barn page is handed the newest fight of any of them');
  // A challenge names both bugs.
  clock.now += 2 * HOUR; barn.heal(ann, { bug: annStalled.id }); barn.heal(bob); // the loser has had its hour's rest
  barn.challenge(bob, { to: ann, their: annStalled.id, stake: 0 });
  const sent = barn.view(ann).challenges.incoming[0];
  assert.deepEqual([sent.toBug, sent.toBugName, sent.fromBugName], [annStalled.id, annStalled.name, bobBug.name]);
  barn.acceptChallenge(ann, sent.id);
  clock.now += 10 * 60e3;
  const again = barn.view(ann).stable.bugs[1].record;
  assert.equal(again.w + again.l + again.d, 2);
});
