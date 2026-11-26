// Gym gear from the General Store: per-bug, weeks long, server-enforced, every boost inside the caps; creatine's 12h lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { ITEM } from '../server/catalog/index.js';
import { GEAR, FIT_CAP, gymAt, gymView, trainStep, nextGymMidnight } from '../server/engine/gym.js';

const HOUR = 3600e3, DAY = 24 * HOUR;

function fixture(t, { gymInt } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-gear-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2031-06-15T18:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), gymInt: gymInt || (() => 0) });
  const shop = new Shop({ store, accounts, barn, now });
  const player = store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * DAY };
  accounts.ensure(player); player.bankroll = 50000; store.savePlayers();
  barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
  barn.doc.pens.ann.xp = 40 * (12 - 1) ** 2;
  for (const k of ['hunger', 'mood', 'clean']) barn.doc.pens.ann.stats[k] = { v: 90, at: clock.now };
  barn.save();
  const pen = () => barn.doc.pens.ann, bug = () => barn.view('ann').pen;
  const feed = () => { for (const k of ['hunger', 'mood', 'clean']) barn.doc.pens.ann.stats[k] = { v: 90, at: clock.now }; barn.save(); };
  const buy = (g, bugId) => shop.buy(player, `gym-${g}`, { confirm: true, ...(bugId != null ? { bug: bugId } : {}) });
  const train = (p) => { feed(); delete barn.doc.pens.ann.gymLastAt; delete barn.doc.pens.ann.gymShort; return barn.train('ann', p).gym; }; // effect tests: skip the daily lock
  return { clock, store, accounts, barn, shop, player, pen, bug, buy, train, feed };
}
const workout = (path, gear = {}, extra = {}) => trainStep(path, { gym: { gear, ...extra }, needs: { hunger: 90, mood: 90, clean: 90 }, now: 1000, roll: extra.roll || (() => 0) });
const on = (...ids) => Object.fromEntries(ids.map((id) => [id, 1e15]));

test('gym gear is sold in the store, pricey, for a few weeks, on the Bug Gear shelf once hatched', (t) => {
  const f = fixture(t);
  const items = f.shop.view(f.player).items.filter((x) => x.cat === 'gymgear');
  assert.deepEqual(items.map((x) => x.id).sort(), ['gym-banana', 'gym-brace', 'gym-creatine', 'gym-glp1', 'gym-mask', 'gym-prework', 'gym-salts', 'gym-sweatband']);
  for (const x of items) {
    assert.ok(x.price >= 1200, `${x.id} is pricey: $${x.price}`);
    if (x.gym !== 'creatine') assert.ok(x.days >= 14 && x.days <= 28, `${x.id} lasts ${x.days} days`);
  }
  assert.ok(f.shop.view(f.player).tabs.some((tb) => tb.id === 'gymgear'));
});

test('buying debits the ledger, goes on the chosen bug with an expiry, and cannot be doubled up', (t) => {
  const f = fixture(t);
  assert.throws(() => f.shop.buy(f.player, 'gym-salts'), (e) => e.status === 428, 'over $1,000 needs a confirm');
  assert.equal(f.player.bankroll, 50000);
  const r = f.buy('salts');
  assert.equal(r.gymGear.note, 'on');
  assert.equal(f.player.bankroll, 50000 - 1800);
  const tx = f.player.txns.at(-1);
  assert.equal(tx.amount, -1800); assert.equal(tx.type, 'shop'); assert.match(tx.note, /Smelling Salts for /);
  assert.equal(f.pen().gym.gear.salts, f.clock.now + 14 * DAY);
  assert.equal(f.bug().gym.gear.salts, 14 * DAY, 'the barn view shows time left');
  assert.equal(f.shop.view(f.player).own['gym-salts'], undefined, 'it lives on the bug, not in the bag');
  f.clock.now += 3 * DAY;
  assert.throws(() => f.buy('salts'), (e) => e.status === 409 && /11 days left/.test(e.message));
  assert.equal(f.player.bankroll, 50000 - 1800, 'a refused buy costs nothing');
  f.player.bankroll = 100; f.store.savePlayers();
  const before = structuredClone(f.pen());
  assert.throws(() => f.buy('glp1'), /\$|fund|afford|enough/i);
  assert.equal(f.player.bankroll, 100); assert.deepEqual(f.pen(), before, 'no cash, no gear');
  assert.throws(() => f.shop.buy(f.player, 'gym-salts', { confirm: true, bug: 12345 }), (e) => e.status === 404);
});

test('gear expires: it stops working on the day and can be bought again', (t) => {
  const f = fixture(t, { gymInt: () => 70 }); // a roll of 70: rough without salts, sharp with them
  f.buy('salts');
  assert.equal(f.train('spar').outcome, 'sharp');
  f.clock.now += 14 * DAY;
  assert.deepEqual(f.bug().gym.gear, {}, 'gone from the view');
  const r = f.train('spar');
  assert.equal(r.outcome, 'rough'); assert.deepEqual(r.helped, []);
  f.buy('salts');
  assert.equal(f.pen().gym.gear.salts, f.clock.now + 14 * DAY, 'a fresh 14 days');
  f.clock.now += HOUR; // the pit's own 45 minute rest
  assert.equal(f.train('spar').outcome, 'sharp');
});

test('each piece of gear does its one job, inside the caps', () => {
  // salts: sharp odds 60 -> 85
  assert.equal(workout('spar', {}, { roll: () => 70 }).outcome, 'rough');
  assert.equal(workout('spar', on('salts'), { roll: () => 70 }).outcome, 'sharp');
  assert.equal(workout('spar', on('salts'), { roll: () => 85 }).outcome, 'rough');
  // pre-workout: +50% power on the clean paths; never on the vial; clean cap unchanged
  assert.equal(workout('clean').gym.fit, 0.01);
  assert.equal(workout('clean', on('prework')).gym.fit, 0.015);
  assert.equal(workout('overwork', on('prework')).gym.fit, 0.035 * 1.5);
  assert.equal(workout('roids', on('prework')).change.power, workout('roids').change.power);
  assert.equal(workout('overwork', on('prework'), { fit: FIT_CAP - 0.01 }).gym.fit, FIT_CAP, 'still tops out at +20%');
  // mask: +50% XP, and Cardio +1.5% power
  assert.equal(workout('clean', on('mask')).xp, Math.round(9 * 1.5));
  assert.equal(workout('clean', on('mask')).gym.fit, 0.015);
  assert.equal(workout('spar', on('mask')).xp, 21);
  // banana: half the mood loss, but not the vial
  assert.equal(workout('overwork').delta.mood, -20);
  assert.equal(workout('overwork', on('banana')).delta.mood, -10);
  assert.equal(workout('roids', on('banana')).delta.mood, -40, 'nothing fixes the vial');
  assert.equal(workout('clean', on('banana')).delta.mood, 6, 'gains are untouched');
  // knee brace: Double Shift +18 strain and lifts past 90
  assert.equal(workout('overwork', on('brace')).gym.strain, 18);
  assert.throws(() => workout('overwork', {}, { strain: 95 }), /will not lift/);
  assert.ok(workout('overwork', on('brace'), { strain: 95 }));
  assert.throws(() => workout('overwork', on('brace'), { strain: 100 }), /will not lift/);
  // sweatband: Cool Down flushes 50% more
  const cool = workout('cooldown', on('sweatband'), { roid: 80, strain: 80, at: 1000 }).gym;
  assert.equal(cool.roid, 50); assert.equal(cool.strain, 80 - 52);
  // GLP-1: +5% HP (inside +20%), twice the fade, and it sulks
  assert.equal(gymView({ gear: on('glp1') }, 0).bulk, 0.05);
  assert.equal(gymView({ roid: 100, at: 0, gear: on('glp1') }, 0).bulk, 0.2, 'HP ceiling unchanged');
  assert.equal(gymAt({ roid: 40, at: 1 }, 10 * HOUR + 1).roid, 32.5);
  assert.equal(gymAt({ roid: 40, at: 1, gear: { glp1: 1e15 } }, 10 * HOUR + 1).roid, 25);
  assert.equal(gymAt({ roid: 40, at: 1, gear: { glp1: 4 * HOUR + 1 } }, 10 * HOUR + 1).roid, 40 - 0.75 * 14, 'only while it was on');
  assert.equal(workout('clean', on('glp1')).delta.mood, 6 - 3);
  // the result card names what helped
  const r = workout('spar', on('salts', 'prework', 'mask', 'banana', 'glp1'));
  assert.deepEqual(r.helped.map((h) => h.id).sort(), ['banana', 'glp1', 'mask', 'prework', 'salts']);
  assert.deepEqual(workout('roids', on('salts', 'brace', 'sweatband')).helped, [], 'gear that did nothing is not mentioned');
});

test('GLP-1 only fades loads from when it went on, and the barn result card lists gear', (t) => {
  const f = fixture(t);
  f.train('roids');
  f.clock.now += 10 * HOUR;
  const before = f.bug().gym.roid;
  f.buy('glp1');
  assert.equal(f.bug().gym.roid, before, 'no fade backwards in time');
  f.clock.now += 10 * HOUR;
  assert.equal(f.bug().gym.roid, Math.round(40 - 7.5 - 15));
  f.buy('banana');
  const r = f.train('overwork');
  assert.deepEqual(r.helped.map((h) => h.id).sort(), ['banana', 'glp1']);
  assert.equal(r.delta.mood, -10 - 3);
});

test('gear is per bug: a stall mate does not share it', (t) => {
  const f = fixture(t);
  const p = f.pen();
  f.barn.doc.bench.ann = [{ ...structuredClone(p), bornAt: p.bornAt + 1, eggAt: (p.eggAt || p.bornAt) + 1, name: 'Spare', gym: undefined }];
  f.barn.save();
  const [one, two] = f.barn.view('ann').stable.bugs.map((b) => b.id);
  f.buy('prework', two);
  const bugs = Object.fromEntries(f.barn.view('ann').stable.bugs.map((b) => [b.id, b]));
  assert.deepEqual(bugs[one].gym.gear, {});
  assert.ok(bugs[two].gym.gear.prework > 0);
  f.buy('prework', one); // the other bug can have its own
  assert.equal(f.player.bankroll, 50000 - 7000);
});

test('creatine: one scoop, used on the next workout, which then locks for 12h if that is before midnight PT', (t) => {
  const f = fixture(t);
  const r = f.buy('creatine');
  assert.equal(r.gymGear.note, 'held'); assert.equal(f.player.bankroll, 48000);
  assert.equal(f.bug().gym.creatine, true);
  assert.throws(() => f.buy('creatine'), (e) => e.status === 409 && /already has a scoop/.test(e.message));
  assert.equal(f.player.bankroll, 48000);
  const start = f.clock.now, midnight = nextGymMidnight(start);
  assert.ok(start + 12 * HOUR < midnight, 'fixture is early enough in the Pacific day that 12h beats midnight');
  f.feed(); const res = f.barn.train('ann', 'clean').gym;
  assert.ok(res.helped.some((h) => h.id === 'creatine' && h.what === 'next workout in 12h'));
  assert.equal(f.pen().gymCreatine, undefined, 'used up');
  assert.equal(f.bug().gym.readyAt, start + 12 * HOUR);
  f.clock.now = start + 12 * HOUR - 1;
  assert.throws(() => f.barn.train('ann', 'spar'), (e) => e.code === 'gym_cooldown');
  f.clock.now = start + 12 * HOUR;
  f.feed(); f.barn.train('ann', 'spar'); // no scoop this time: wait until midnight PT
  assert.equal(f.bug().gym.readyAt, nextGymMidnight(f.clock.now));
  assert.equal(f.bug().gym.readyAt, midnight, '11pm PT unlocks at the coming midnight, not 24h later');
});

test('creatine bought while the bug is resting cuts today\'s lock to 12h from that workout, or midnight if sooner', (t) => {
  const f = fixture(t);
  const start = f.clock.now, midnight = nextGymMidnight(start);
  f.feed(); f.barn.train('ann', 'clean');
  f.clock.now = start + 5 * HOUR;
  assert.equal(f.bug().gym.readyAt, midnight);
  const r = f.buy('creatine');
  assert.equal(r.gymGear.note, 'locked');
  assert.equal(f.bug().gym.readyAt, start + 12 * HOUR, '12h is still sooner than midnight from a morning workout');
  assert.equal(f.bug().gym.creatine, false, 'the scoop went into today');
  assert.throws(() => f.buy('creatine'), /already on the 12 hour clock/);
  f.clock.now = start + 12 * HOUR;
  f.feed(); f.barn.train('ann', 'spar');
  assert.equal(f.bug().gym.readyAt, midnight, 'the next lock is midnight PT again');
  // jump to the next Pacific morning and train, then buy creatine 13h later (before midnight): free to train
  f.clock.now = midnight + 10 * HOUR; // 10am PT the next day
  assert.equal(f.bug().gym.readyIn, 0, 'a new Pacific day, ready without creatine');
  f.feed(); f.barn.train('ann', 'clean');
  const second = f.clock.now, nextMid = nextGymMidnight(second);
  assert.equal(f.bug().gym.readyAt, nextMid);
  f.clock.now = second + 13 * HOUR; // 11pm PT, 12h has passed, midnight has not
  assert.ok(f.clock.now < nextMid);
  assert.equal(f.buy('creatine').gymGear.note, 'ready');
  assert.equal(f.bug().gym.readyIn, 0);
  f.feed(); f.barn.train('ann', 'clean');
  assert.equal(f.bug().gym.readyAt, nextGymMidnight(f.clock.now));
  // and once that lock is over, a new scoop waits for the next workout instead of being wasted
  f.clock.now = nextGymMidnight(f.clock.now);
  assert.equal(f.buy('creatine').gymGear.note, 'held');
});
