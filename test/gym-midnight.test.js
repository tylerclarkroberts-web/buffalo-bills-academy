// The Bug Gym's daily allowance resets at midnight America/Los_Angeles, not on a rolling 24-hour clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { PATH_IDS, CREATINE_MS, GYM_TZ, gymDay, gymMidnight, nextGymMidnight, gymReadyAt } from '../server/engine/gym.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;

test('GYM_TZ is Pacific Time', () => {
  assert.equal(GYM_TZ, 'America/Los_Angeles');
});

test('gym days roll over at midnight Pacific, through both daylight-saving changes', () => {
  // 2026 winter (PST, UTC-8)
  assert.equal(gymDay(Date.parse('2026-01-15T07:59:59Z')), '2026-01-14'); // 11:59:59 pm PST
  assert.equal(gymDay(Date.parse('2026-01-15T08:00:00Z')), '2026-01-15');
  assert.equal(gymMidnight('2026-01-15'), Date.parse('2026-01-15T08:00:00Z'));

  // 2026 summer (PDT, UTC-7)
  assert.equal(gymDay(Date.parse('2026-07-15T06:59:59Z')), '2026-07-14'); // 11:59:59 pm PDT
  assert.equal(gymDay(Date.parse('2026-07-15T07:00:00Z')), '2026-07-15');
  assert.equal(gymMidnight('2026-07-15'), Date.parse('2026-07-15T07:00:00Z'));

  // Spring forward: 2026-03-08 2:00 AM PST -> 3:00 AM PDT. Midnight that morning is still PST.
  assert.equal(gymMidnight('2026-03-08'), Date.parse('2026-03-08T08:00:00Z'));
  assert.equal(gymMidnight('2026-03-09'), Date.parse('2026-03-09T07:00:00Z'));
  assert.equal(nextGymMidnight(Date.parse('2026-03-08T08:00:00Z')) - gymMidnight('2026-03-08'), 23 * HOUR);
  assert.equal(gymDay(Date.parse('2026-03-08T07:59:59Z')), '2026-03-07');
  assert.equal(gymDay(Date.parse('2026-03-08T08:00:00Z')), '2026-03-08');

  // Fall back: 2026-11-01 2:00 AM PDT -> 1:00 AM PST. Midnight that morning is still PDT.
  assert.equal(gymMidnight('2026-11-01'), Date.parse('2026-11-01T07:00:00Z'));
  assert.equal(gymMidnight('2026-11-02'), Date.parse('2026-11-02T08:00:00Z'));
  assert.equal(nextGymMidnight(Date.parse('2026-11-01T07:00:00Z')) - gymMidnight('2026-11-01'), 25 * HOUR);
  assert.equal(gymDay(Date.parse('2026-11-01T06:59:59Z')), '2026-10-31');
  assert.equal(gymDay(Date.parse('2026-11-01T07:00:00Z')), '2026-11-01');
});

test('every Pacific midnight for two years is 00:00:00 local, and gaps are 23, 24 or 25 hours', () => {
  const gaps = new Set();
  let prev = gymMidnight('2026-01-01');
  for (let i = 1; i <= 730; i++) {
    const next = nextGymMidnight(prev);
    const part = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: GYM_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(next)).map((x) => [x.type, x.value]));
    assert.equal(`${part.hour}:${part.minute}:${part.second}`, '00:00:00', gymDay(next));
    assert.equal(gymDay(next - 1), gymDay(prev), 'the last millisecond of the day is still that Pacific day');
    assert.equal(gymDay(next), gymDay(next + 1));
    const gap = next - prev;
    gaps.add(gap);
    assert.ok([23 * HOUR, 24 * HOUR, 25 * HOUR].includes(gap), `${gymDay(prev)} -> ${gymDay(next)} gap ${gap / HOUR}h`);
    prev = next;
  }
  assert.deepEqual([...gaps].sort((a, b) => a - b), [23 * HOUR, 24 * HOUR, 25 * HOUR]);
});

test('gymReadyAt: midnight PT, just before and after, and creatine takes the sooner of 12h or midnight', () => {
  const mid = gymMidnight('2026-06-15'); // 2026-06-15T07:00:00Z, PDT
  assert.equal(gymReadyAt(0), 0);
  assert.equal(gymReadyAt(undefined), 0);
  assert.equal(gymReadyAt(null), 0);

  // A workout just after midnight waits until the following midnight.
  assert.equal(gymReadyAt(mid), gymMidnight('2026-06-16'));
  assert.equal(gymReadyAt(mid + 1), gymMidnight('2026-06-16'));

  // A workout one millisecond before midnight waits only that millisecond.
  assert.equal(gymReadyAt(mid - 1), mid);
  assert.equal(gymReadyAt(mid - 2 * HOUR), mid);

  // Creatine: morning workout unlocks at +12h; evening workout unlocks at midnight.
  const tenAm = mid + 10 * HOUR;
  assert.equal(gymReadyAt(tenAm, true), tenAm + CREATINE_MS);
  assert.ok(gymReadyAt(tenAm, true) < gymReadyAt(tenAm));
  const eightPm = mid + 20 * HOUR;
  assert.equal(gymReadyAt(eightPm, true), gymMidnight('2026-06-16'));
  assert.equal(gymReadyAt(eightPm, true), gymReadyAt(eightPm), 'midnight is sooner than 12h, so creatine does not lengthen the wait');
});

test('existing stamps migrate in place: a prior Pacific day is ready, today stays locked until midnight', () => {
  const mid = gymMidnight('2026-06-15');
  // Trained 20 hours ago, but that was yesterday PT (8pm the previous evening): unlocked, not locked out for 4 more hours.
  const yesterdayEvening = mid - 4 * HOUR;
  assert.equal(gymDay(yesterdayEvening), '2026-06-14');
  assert.equal(gymReadyAt(yesterdayEvening), mid);
  assert.ok(gymReadyAt(yesterdayEvening) <= mid, 'already past midnight, so ready now if now >= mid');
  assert.equal(Math.max(0, gymReadyAt(yesterdayEvening) - mid), 0);

  // Trained 2 hours ago today: still locked until midnight, not immediately given a second workout.
  const todayMorning = mid + 2 * HOUR;
  const now = mid + 4 * HOUR;
  assert.equal(gymDay(todayMorning), '2026-06-15');
  assert.equal(gymReadyAt(todayMorning), gymMidnight('2026-06-16'));
  assert.ok(gymReadyAt(todayMorning) > now);

  // Old rolling-24h would still lock a 20-hour-old yesterday workout; the new rule does not.
  assert.ok(yesterdayEvening + DAY > mid, 'less than 24h old at midnight');
  assert.equal(Math.max(0, gymReadyAt(yesterdayEvening) - mid), 0);
});

function fixture(t, start) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-gym-pt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: start }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), gymInt: () => 0 });
  const player = store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * DAY };
  accounts.ensure(player); player.bankroll = 2000; store.savePlayers();
  barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
  barn.doc.pens.ann.xp = 40 * (12 - 1) ** 2;
  const feed = () => { for (const k of ['hunger', 'mood', 'clean']) barn.doc.pens.ann.stats[k] = { v: 90, at: clock.now }; barn.save(); };
  feed();
  return { clock, barn, feed };
}

test('a workout 1ms before midnight PT is locked, and the next millisecond it is free', (t) => {
  const mid = gymMidnight('2026-11-01'); // fall-back morning, 25-hour day
  const f = fixture(t, mid - 3 * HOUR);
  // fixture advances 2s while hatching; land just before midnight
  f.clock.now = mid - 1;
  f.feed();
  f.barn.train('ann', 'clean');
  assert.equal(f.barn.doc.pens.ann.gymLastAt, mid - 1);
  assert.equal(f.barn.view('ann').pen.gym.readyAt, mid);
  assert.throws(() => f.barn.train('ann', 'spar'), (e) => e.code === 'gym_cooldown' && e.data.readyIn === 1 && e.data.readyAt === mid);
  f.clock.now = mid;
  f.feed();
  const r = f.barn.train('ann', 'spar');
  assert.equal(r.gym.path, 'spar');
  assert.equal(f.barn.doc.pens.ann.gymLastAt, mid);
  assert.equal(f.barn.view('ann').pen.gym.readyAt, nextGymMidnight(mid));
});

test('spring-forward midnight: a late workout unlocks 23 hours later, not 24', (t) => {
  const mid = gymMidnight('2026-03-08');
  const f = fixture(t, mid - HOUR);
  f.clock.now = mid - 1;
  f.feed();
  f.barn.train('ann', 'clean');
  f.clock.now = mid;
  f.feed();
  f.barn.train('ann', 'spar');
  assert.equal(f.barn.view('ann').pen.gym.readyAt, gymMidnight('2026-03-09'));
  assert.equal(f.barn.view('ann').pen.gym.readyIn, 23 * HOUR);
  f.clock.now = gymMidnight('2026-03-09') - 1;
  assert.throws(() => f.barn.train('ann', 'overwork'), (e) => e.code === 'gym_cooldown');
  f.clock.now = gymMidnight('2026-03-09');
  f.feed();
  f.barn.train('ann', 'overwork');
});

test('a leftover rolling-24h stamp from yesterday PT is ready at deploy, and today is not double-credited', (t) => {
  const mid = gymMidnight('2026-06-15');
  const f = fixture(t, mid - 5 * HOUR);
  // Simulate a pre-deploy workout 20 hours ago (yesterday evening PT). Old rule: locked for 4 more hours. New: ready.
  f.barn.doc.pens.ann.gymLastAt = mid - 4 * HOUR;
  f.barn.save();
  f.clock.now = mid + HOUR; // 1am PT
  f.feed();
  f.barn.train('ann', 'clean');
  assert.equal(f.barn.doc.pens.ann.gymLastAt, mid + HOUR);
  // Same Pacific day: a second try is refused, so the deploy did not grant an extra workout.
  assert.throws(() => f.barn.train('ann', 'spar'), (e) => e.code === 'gym_cooldown' && e.data.readyAt === gymMidnight('2026-06-16'));
  for (const path of PATH_IDS) {
    assert.throws(() => f.barn.train('ann', path), (e) => e.code === 'gym_cooldown', path);
  }
});
