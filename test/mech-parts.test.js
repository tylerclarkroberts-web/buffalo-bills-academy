// Mech parts: sold by the specialist, fitted to an evolved bug, and read by the mine at clock-in from the partner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines } from '../server/mines.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { TABS, ITEM } from '../server/catalog/index.js';
import { PART_ITEMS } from '../server/catalog/mine.js';
import { xpFor } from '../server/engine/creatures.js';

const version = { rulesVersion: 2 };
// payout roll 20000 = an ordinary bucket ($80 per 100 units with these pinned rolls)
function fixture(t, { part = null, evo = 1, own = {}, pool = 99999, cave = 99 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-parts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir); const accounts = new Accounts({ store, now: () => clock.now });
  const pens = { miner: { evo } };
  const barn = { fit: () => true, doc: { pens }, styleOf: () => (part ? { part: `part-${part}` } : {}), rollEgg: () => false, view: () => ({ pen: null }) };
  const mines = new Mines({ store, accounts, barn, now: () => clock.now, owned: () => own,
    randInt: (n) => (n === 100000 ? 20000 : 0), scareInt: (n) => n - 1, poolInt: () => pool, caveInt: () => cave, twinInt: () => 99, vein: () => ({ veinMs: 60000, cells: 7 }) });
  const player = store.players.miner = { id: 'miner', name: 'Miner' }; accounts.ensure(player);
  const call = (fn, s, extra) => mines[fn](player, s.shiftId, { ...version, poolId: s.currentPoolId, ...extra });
  const drain = (s) => { const id = s.currentPoolId; while (!s.result && s.currentPoolId === id && s.pools.find((p) => p.id === id).remaining !== 0) { call('extract', s, { action: 'start' }); clock.now += 500; s = call('extract', s, { action: 'continue' }); } return s; };
  return { clock, mines, player, call, drain, pens, start: (extra) => mines.start(player, { ...version, ...extra }) };
}

test('the four parts are in the catalog but not on a store tab, and say what they do', () => {
  assert.deepEqual(PART_ITEMS.map((x) => [x.part, x.price]), [['lamp', 5000], ['plunger', 10000], ['hoist', 15000], ['drill', 25000]]);
  for (const x of PART_ITEMS) assert.equal(ITEM[x.id].slot, 'part');
  assert.equal(TABS.find((tab) => tab.id === 'parts').hidden, true);
  assert.match(ITEM['part-plunger'].desc, /Once a shift.*half a bucket/);
  assert.match(ITEM['part-drill'].desc, /a tenth more/);
  assert.match(ITEM['part-hoist'].desc, /Shaft 8 and deeper/);
});

test('the mine reads the partner\'s part at clock-in, and only from an evolved bug', (t) => {
  assert.equal(fixture(t, { part: 'drill' }).start().part, 'drill');
  assert.equal(fixture(t, { part: 'drill', evo: 0 }).start().part, undefined, 'a part on a stage one bug does nothing');
  assert.equal(fixture(t).start().part, undefined);
});

test('drill arm: every unit of acid is worth a tenth more', (t) => {
  const plain = fixture(t); let s = plain.call('probe', plain.start());
  assert.equal(plain.drain(s).result.amount, 80);
  const f = fixture(t, { part: 'drill' }); s = f.call('probe', f.start());
  assert.equal(f.drain(s).result.amount, 88);
});

test('lamp eye: the next pool\'s amount shows before it is inspected, and only then', (t) => {
  const f = fixture(t, { part: 'lamp', pool: 30000 });
  let s = f.start();
  assert.equal(s.peek, 50); assert.equal(s.pools[0].quantity, null, 'the pool itself is still unread');
  s = f.call('probe', s);
  assert.equal(s.peek, undefined, 'once inspected the pool says it itself');
  assert.equal(fixture(t, { pool: 30000 }).start().peek, undefined, 'no lamp, no peek');
});

test('plunger arm: once a shift, a nearly dry pool gives half a bucket', (t) => {
  const dry = fixture(t, { pool: 0 }); // every pool rolls 1% of the bucket
  assert.equal(dry.call('probe', dry.start()).pools[0].quantity, 1);
  const f = fixture(t, { part: 'plunger', pool: 0 });
  let s = f.call('probe', f.start());
  assert.deepEqual([s.pools[0].quantity, s.plunged], [50, 'p0']);
  s = f.call('probe', f.drain(s));
  assert.equal(s.pools[1].quantity, 1, 'the second dry pool stays dry');
  const full = fixture(t, { part: 'plunger', pool: 10000 }); // every pool fills the bucket
  assert.equal(full.call('probe', full.start()).plunged, undefined, 'it is kept for a pool that needs it');
});

test('hoist claw: a cave-in spills nothing', (t) => {
  const own = { 'mine-permit8': 1 };
  const f = fixture(t, { part: 'hoist', own, cave: 0, pool: 30000 });
  let s = f.drain(f.call('probe', f.start({ shaft: '8' })));
  assert.equal(s.collected, 50);
  s = f.call('probe', s);
  assert.deepEqual([s.spill, s.caught, s.collected], [undefined, 'p1', 50]);
});

test('he sells parts only for a bug he has rebuilt, and a part comes off like any gear', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-partshop-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-23T19:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) });
  const shop = new Shop({ store, accounts, barn, now }); barn.styleOf = (id, bug) => shop.bugStyle(id, bug);
  const p = store.players.ann = { id: 'ann', name: 'ANN' }; accounts.ensure(p); p.bankroll = 40000;
  barn.layEgg('ann'); clock.now += 2000; barn.view('ann'); barn.doc.pens.ann.xp = xpFor(12);
  assert.throws(() => shop.buy(p, 'part-drill', { confirm: true }), /already worked on/);
  assert.equal(p.bankroll, 40000, 'and nothing was charged');
  barn.doc.pens.ann.evo = 1;
  assert.throws(() => shop.buy(p, 'part-drill'), /Please confirm/);
  shop.buy(p, 'part-drill', { confirm: true });
  assert.equal(p.bankroll, 15000);
  assert.equal(shop.bugStyle('ann').part, 'part-drill', 'bought, it goes straight on the partner');
  shop.buy(p, 'part-lamp', { confirm: true });
  assert.equal(shop.bugStyle('ann').part, 'part-drill', 'a second part waits in the bag');
  shop.equip(p, { id: 'part-lamp' });
  assert.equal(shop.bugStyle('ann').part, 'part-lamp', 'one part a bug: fitting one takes the other off');
  shop.equip(p, { id: null, slot: 'part' });
  assert.equal(shop.bugStyle('ann').part, undefined);
  assert.equal(shop.view(p).tabs.some((tab) => tab.id === 'parts'), false, 'the General Store has no parts tab');
});
