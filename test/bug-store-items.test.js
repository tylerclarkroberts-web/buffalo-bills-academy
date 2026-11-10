import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Barn, CARE, DECAY_PER_HOUR } from '../server/barn.js';
import { Shop, USE_COOLDOWN_MS } from '../server/shop.js';
import { BUG_ITEMS } from '../server/catalog/bug.js';

const DAY = 86400e3, HOUR = 3600e3;
const item = (id) => BUG_ITEMS.find((x) => x.id === id);

function setup() {
  const clock = { now: 10 * DAY };
  const docs = new Map();
  const store = { loadDoc: (id, fallback) => docs.get(id) || fallback, saveDoc: (id, doc) => docs.set(id, doc) };
  const barn = new Barn({ store, now: () => clock.now, incubateMs: 1, eggInt: () => 0 });
  const shop = new Shop({ store, accounts: { ensure() {} }, barn, now: () => clock.now });
  const player = { id: 'rancher', name: 'Rancher', bankroll: 10000 };
  barn.styleOf = (id) => shop.bugStyle(id); barn.looksOf = () => null;
  barn.layEgg(player.id); clock.now += 1; barn.view(player.id);
  const pen = barn.doc.pens[player.id];
  const setNeeds = (n) => { for (const stat of ['hunger', 'mood', 'clean']) pen.stats[stat] = { v: n, at: clock.now }; };
  const own = (id, count = 1) => { shop.inv(player.id).own[id] = count; };
  return { clock, barn, shop, player, pen, setNeeds, own };
}

test('mister and lamp descriptions match one-use boosts, decay and separate cooldowns', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  setNeeds(20); const fedAt = pen.fedAt, xp = pen.xp;
  for (const [id, stat, use, hours] of [['mister', 'clean', 'clean', 40 / 1.4], ['heatlamp', 'mood', 'mood', 25]]) {
    assert.match(item(id).desc, /Single use.*\+40.*max 100/);
    assert.match(item(id).desc, /30-minute cooldown/);
    own(id, 2); shop.use(player, id);
    assert.equal(barn.needs(pen, clock.now)[stat], 60);
    assert.equal(shop.inv(player.id).own[id], 1);
    assert.throws(() => shop.use(player, id), (e) => e.status === 429);
    assert.equal(USE_COOLDOWN_MS[use], 30 * 60e3);
    assert.ok(Math.abs(DECAY_PER_HOUR[stat] * hours - 40) < 1e-9);
  }
  assert.equal(pen.fedAt, fedAt); assert.equal(pen.xp, xp + 12, 'mister and lamp each give 6 care XP');
  clock.now += 30 * 60e3; setNeeds(95);
  shop.use(player, 'mister'); shop.use(player, 'heatlamp');
  assert.equal(barn.needs(pen, clock.now).clean, 100);
  assert.equal(barn.needs(pen, clock.now).mood, 100);
  clock.now += HOUR;
  assert.equal(barn.needs(pen, clock.now).clean, 98.6);
  assert.equal(barn.needs(pen, clock.now).mood, 98.4);
});

test('each food grants its stated Fed amount; food cooldown and care XP are shared', () => {
  for (const food of BUG_ITEMS.filter((x) => x.use === 'food')) {
    const { clock, barn, shop, player, pen, setNeeds, own } = setup();
    setNeeds(0); own(food.id, 2); if (food.id !== 'food-fruit') own('food-fruit');
    pen.fedAt = clock.now - DAY; pen.xpDay = Math.floor(clock.now / DAY); pen.xpToday = 115;
    const xp = pen.xp;
    assert.ok(food.desc.includes(`+${food.food} Fed`));
    shop.use(player, food.id);
    assert.equal(barn.needs(pen, clock.now).hunger, food.food);
    assert.equal(pen.fedAt, clock.now); assert.equal(pen.xp - xp, 5);
    assert.throws(() => shop.use(player, 'food-fruit'), (e) => e.status === 429);
    assert.equal(USE_COOLDOWN_MS.food, 15 * 60e3);
    clock.now += 15 * 60e3; shop.use(player, food.id);
    assert.equal(pen.xp - xp, 5, 'care XP stays at the daily cap');
    assert.ok(barn.needs(pen, clock.now).hunger <= 100);
  }
});

test('free and store care share 120 XP per UTC day; needs still improve at the cap', () => {
  for (const resetWith of ['free', 'store']) {
    const { clock, barn, shop, player, pen, setNeeds, own } = setup();
    for (let i = 0; i < 9; i++) {
      barn.care(player.id, 'feed'); clock.now += CARE.feed.cooldownMs;
    }
    assert.equal(pen.xp, 108);
    own('mister'); shop.use(player, 'mister'); assert.equal(pen.xp, 114);
    barn.care(player.id, 'play'); assert.equal(pen.xp, 120, 'only the remaining 6 XP are awarded');
    setNeeds(20);
    barn.care(player.id, 'clean');
    own('heatlamp'); shop.use(player, 'heatlamp');
    own('food-leaf', 2); shop.use(player, 'food-leaf');
    assert.deepEqual(barn.needs(pen, clock.now), { hunger: 40, mood: 60, clean: 65 });
    assert.equal(pen.xp, 120); assert.equal(pen.xpToday, 120);
    clock.now = 11 * DAY; // UTC midnight, one millisecond before the first hatch-day bonus
    if (resetWith === 'free') barn.care(player.id, 'feed');
    else shop.use(player, 'food-leaf');
    assert.equal(pen.xp, 132); assert.equal(pen.xpToday, 12);
    assert.equal(pen.xpDay, 11);
  }
});

test('feeder XP starts at the next hatch-day checkpoint and is outside the care cap', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  clock.now += 12 * HOUR; setNeeds(100); own('feeder');
  shop.use(player, 'feeder'); assert.equal(pen.xp, 0, 'using a feeder gives no immediate XP');
  clock.now = pen.bornAt + DAY - 1;
  assert.equal(barn.view(player.id).pen.xp, 0, 'no passive XP before the checkpoint');
  pen.xpDay = Math.floor(clock.now / DAY); pen.xpToday = 120;
  clock.now += 1;
  assert.equal(barn.view(player.id).pen.xp, 10 + 12, 'day and feeder bonuses still accrue at the care cap');
  assert.equal(pen.xpToday, 120, 'passive bonuses do not consume care XP');
});

test('Golden Ambrosia keeps the bowl full for 7 days; a feeder pays 12 XP per covered hatch-day checkpoint', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  setNeeds(10); own('food-ambrosia'); own('feeder');
  assert.match(item('food-ambrosia').desc, /7 days/);
  shop.use(player, 'food-ambrosia');
  assert.equal(pen.feederUntil, clock.now + 7 * DAY);
  clock.now += 3 * DAY; assert.equal(barn.needs(pen, clock.now).hunger, 100);
  const xp = barn.view(player.id).pen.xp; // settle day XP so far
  shop.use(player, 'feeder'); assert.match(item('feeder').desc, /12 XP/);
  setNeeds(100); clock.now += 2 * DAY;
  assert.equal(barn.view(player.id).pen.xp - xp, 2 * (10 + 12), 'two covered days: day XP plus feeder XP');
});

test('feeder starts on use, extends remaining time and preserves other needs decay', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  setNeeds(50); own('feeder', 5);
  assert.equal(pen.feederUntil, undefined, 'inventory alone does not start a feeder');
  assert.match(item('feeder').desc, /14 days.*60 days/);
  shop.use(player, 'feeder'); const firstEnd = clock.now + 14 * DAY;
  assert.equal(pen.feederUntil, firstEnd);
  assert.equal(barn.deathAt(pen), firstEnd + 21 * DAY);
  clock.now += DAY;
  const needs = barn.needs(pen, clock.now);
  assert.equal(needs.hunger, 100); assert.equal(Math.round(needs.mood), 12);
  assert.equal(Math.round(needs.clean), 16);
  shop.use(player, 'feeder'); assert.equal(pen.feederUntil, firstEnd + 14 * DAY);
  shop.use(player, 'feeder'); shop.use(player, 'feeder');
  assert.throws(() => shop.use(player, 'feeder'), (e) => e.status === 409);
  assert.equal(shop.inv(player.id).own.feeder, 1, 'refused extension keeps the item');
});

test('toys are reusable Play bonuses; equipment slots replace rather than stack', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  assert.equal(CARE.play.gain, 30); assert.equal(CARE.play.cooldownMs, 20 * 60e3);
  for (const toy of BUG_ITEMS.filter((x) => x.slot === 'toy')) {
    own(toy.id); shop.equip(player, { id: toy.id });
    setNeeds(0); pen.cool.play = 0;
    assert.ok(toy.desc.includes(`+${toy.mood} extra Mood`));
    barn.care(player.id, 'play');
    assert.equal(barn.needs(pen, clock.now).mood, CARE.play.gain + toy.mood);
    assert.equal(shop.inv(player.id).own[toy.id], 1);
  }
  own('gear-armor'); own('gear-bandage');
  shop.equip(player, { id: 'gear-armor' }); assert.equal(shop.bugStyle(player.id).gearBonus, 0.06);
  shop.equip(player, { id: 'gear-bandage' }); assert.equal(shop.bugStyle(player.id).gearBonus, 0.01);
  assert.ok(item('gear-boots').desc.includes('+2.5% damage'));
  const before = structuredClone(pen);
  for (const id of ['bugskin-ruby', 'bugwear-tophat', 'bugwear-bow']) { own(id); shop.equip(player, { id }); }
  assert.deepEqual(pen, before, 'cosmetics do not change needs, XP or species');
  assert.equal(shop.bugStyle(player.id).bugskin.id, 'bugskin-ruby');
  assert.equal(shop.bugStyle(player.id).bughat.id, 'bugwear-tophat');
  assert.equal(shop.bugStyle(player.id).bugacc.id, 'bugwear-bow');
});
