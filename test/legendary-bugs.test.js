import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Mines, LEGEND_DAYS, LEGEND_LEVEL, legendToday, legendChance, wildOdds, stickToday, isHardTier, HARD_TIERS, STICK_ID, STICK_LEVEL, STICK_DAY_CHANCE } from '../server/mines.js';
import { ROSTER } from '../server/engine/creatures.js';
import { rarityOf, LEGENDARY, RARITY, RARE_TIER } from '../server/engine/bug-types.js';

const LEGENDS = ROSTER.filter((bug) => rarityOf(bug.id) === LEGENDARY).map((bug) => bug.id);
const dayOf = (n) => `2031-${String(1 + Math.floor(n / 28)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-legend-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = () => 1_800_000_000_000, store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1 });
  const mines = new Mines({ store, accounts, now, barn });
  store.players.a = { id: 'a', name: 'Connor', bankroll: 100 };
  return { barn, mines, shift: (day, shaft = '7', tier = 3) => ({ rulesVersion: 2, seed: 7, cells: 7, tier, pools: [], startedAt: now(), day, shaft }) };
}

test('there are legendary species, and each is down the mine only a few days a year, likelier on a rough day', () => {
  assert.deepEqual(LEGENDS, ['dryococelus', 'megachile', 'meganeura']);
  assert.equal(RARITY[LEGENDARY].name, 'Legendary');
  assert.ok(Math.abs(1 / legendChance(1, 0) - LEGEND_DAYS) < 1e-9, 'Shaft 7 on the easiest day: one day in 120');
  assert.ok(Math.abs(1 / legendChance(5, 3) - 7) < 0.1, "Earl's Level on the hardest day: about one day in seven");
  const days = Array.from({ length: 6000 }, (_, n) => `d${n}`), seen = (tier, depth) => days.filter((day) => legendToday(day, tier, depth));
  assert.ok(seen(1, 0).length > 20 && seen(1, 0).length < 90, `${seen(1, 0).length} days in 6000 at the easiest`);
  assert.ok(seen(5, 3).length > 700 && seen(5, 3).length < 1000);
  const deep = new Set(seen(3, 2));
  assert.ok(seen(3, 0).every((day) => deep.has(day)), 'a day with one in a shallow shaft has it in every deeper one');
});

test('a legendary roams at level 10 with every miner seeing it, and not while somebody holds one', (t) => {
  const { barn, mines, shift } = setup(t);
  let day = null;
  for (let n = 0; n < 5000 && !day; n++) if (legendToday(`L${n}`, 3, 0)) day = `L${n}`;
  assert.ok(day, 'a legendary day exists');
  const wild = mines.wildsFor(shift(day)).find((w) => rarityOf(w.species) === LEGENDARY), species = wild.species;
  assert.deepEqual([wild.level, wild.id], [LEGEND_LEVEL, `legend:${species}:${day}`]);
  assert.ok(mines.wildsFor(shift(day, 'earl')).some((w) => w.id === wild.id), 'the same one, down every deeper shaft');
  barn.adopt('a', { wildId: wild.id, battleId: 'jar', species, level: 8 });
  assert.equal(barn.holds(species), true);
  mines.wildRosters.clear();
  assert.equal(mines.wildsFor(shift(day)).some((w) => w.species === species), false, 'the only one is in a barn: another legendary, or none');
  assert.throws(() => barn.release('a'), /cannot be let go/);
});

test('rarer bugs are likelier on a rougher day, and each deeper shaft holds one more bug', (t) => {
  const { mines, shift } = setup(t);
  const [easy, mid, hard] = [1, RARE_TIER, 5].map(wildOdds);
  assert.equal(easy[3], 0);
  assert.ok(mid[3] > 0 && hard[3] > mid[3] && hard[2] > easy[2] && hard[1] === easy[1]);
  const day = '2031-03-03', top = mines.wildsFor(shift(day, '7'));
  ['8', '12', 'earl'].forEach((shaft, k) => {
    const wilds = mines.wildsFor(shift(day, shaft));
    assert.deepEqual(wilds.slice(0, top.length), top, `Shaft ${shaft} has every bug Shaft 7 has`);
    assert.equal(wilds.length, top.length + k + 1);
    assert.ok(wilds.at(-1).level >= 1 + Math.floor((3 + k) / 2), 'and its own runs a little stronger');
  });
});

test('the stick insect only rolls on hard days, half of them, on its own seed', () => {
  assert.deepEqual(HARD_TIERS, [4, 5]);
  assert.equal(isHardTier(3), false);
  assert.equal(isHardTier(4), true);
  assert.equal(isHardTier(5), true);
  assert.equal(STICK_DAY_CHANCE, 0.5);
  const days = Array.from({ length: 4000 }, (_, n) => dayOf(n));
  for (const tier of [1, 2, 3]) assert.equal(days.filter((d) => stickToday(d, tier)).length, 0, `never on tier ${tier}`);
  for (const tier of HARD_TIERS) {
    const hit = days.filter((d) => stickToday(d, tier));
    assert.ok(hit.length > 1800 && hit.length < 2200, `tier ${tier}: ${hit.length} of 4000`);
    assert.ok(hit.every((d) => stickToday(d, tier)), 'the same date always agrees');
  }
  // The hard-day roll is the same on The Badlands and Dead Man's Dig, and it is not the bee/Meganeura roll.
  const d = days[100];
  assert.equal(stickToday(d, 4), stickToday(d, 5));
  assert.equal(stickToday(d, 5), stickToday(d, 5));
});

test('on a hard legendary day the stick roams at level 30 in every shaft, and not while somebody holds it', (t) => {
  const { barn, mines, shift } = setup(t);
  let day = null;
  for (let n = 0; n < 500 && !day; n++) if (stickToday(dayOf(n), 5)) day = dayOf(n);
  assert.ok(day);
  const wild = mines.wildsFor(shift(day, '7', 5)).find((w) => w.species === STICK_ID);
  assert.ok(wild);
  assert.deepEqual([wild.level, wild.id], [STICK_LEVEL, `legend:${STICK_ID}:${day}`]);
  assert.ok(mines.wildsFor(shift(day, 'earl', 5)).some((w) => w.id === wild.id), 'the same one, down every deeper shaft');
  assert.equal(mines.wildsFor(shift(day, '7', 3)).some((w) => w.species === STICK_ID), false, 'an Honest Work day never has it');
  barn.adopt('a', { wildId: wild.id, battleId: 'jar', species: STICK_ID, level: 12 });
  mines.wildRosters.clear();
  assert.equal(mines.wildsFor(shift(day, '7', 5)).some((w) => w.species === STICK_ID), false, 'the only one is in a barn');
});

test('a forced stick is only in that miner\'s tunnels and cannot be jarred', (t) => {
  const { mines, shift, barn } = setup(t);
  const day = '2031-01-01';
  const easy = shift(day, '7', 1);
  assert.equal(mines.wildsFor(easy).some((w) => w.species === STICK_ID), false);
  mines.forceStick('a', true);
  const forA = mines.wildsFor(easy, 'a').find((w) => w.species === STICK_ID);
  assert.ok(forA?.force && forA.level === STICK_LEVEL);
  assert.equal(mines.wildsFor(easy, 'b').some((w) => w.species === STICK_ID), false, 'the other miner is unaffected');
  assert.equal(mines.wildsFor(easy).some((w) => w.species === STICK_ID), false, 'the shared roster is untouched');
  const info = mines.stickDayInfo({ day, tier: 1 });
  assert.equal(info.hard, false);
  assert.equal(info.rolled, false);
  assert.equal(info.present, false);
});
