import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Barn, CARE, BOUT_LEVEL, BOUT_XP, BOUT_WIN_XP, MAX_BOUT_STAKE, BENCH_SLOW } from '../server/barn.js';
import { Shop, USE_COOLDOWN_MS } from '../server/shop.js';
import { BUG_ITEMS } from '../server/catalog/bug.js';
import { LUNCH_CAP } from '../server/engine/bout.js';

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

test('the mister, heat lamp and ambrosia are off the shelf; one already held still shows and still works', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  const shelf = () => shop.view(player).items.map((x) => x.id);
  for (const id of ['mister', 'heatlamp', 'food-ambrosia']) {
    assert.ok(item(id).retired && !shelf().includes(id), `${id} is not on the shelf`);
    assert.throws(() => shop.buy(player, id, { confirm: true }), (e) => e.status === 409);
    assert.equal(player.bankroll, 10000, 'and nothing is charged');
  }
  assert.ok(BUG_ITEMS.filter((x) => x.use && !x.retired).every((x) => ['food', 'feeder', 'jar'].includes(x.use)), 'what is sold does something the free buttons cannot');
  setNeeds(20); const fedAt = pen.fedAt, xp = pen.xp;
  for (const [id, stat, use] of [['mister', 'clean', 'clean'], ['heatlamp', 'mood', 'mood']]) {
    assert.match(item(id).desc, /still works: \+40 (Clean|Mood) and 6 XP/);
    own(id, 2); assert.ok(shelf().includes(id), 'the owner still sees theirs');
    shop.use(player, id);
    assert.equal(barn.needs(pen, clock.now)[stat], 60);
    assert.equal(shop.inv(player.id).own[id], 1);
    assert.throws(() => shop.use(player, id), (e) => e.status === 429);
    assert.equal(USE_COOLDOWN_MS[use], 30 * 60e3);
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

test('each food grants its stated Fed amount and packs its stated lunch; food cooldown and care XP are shared', () => {
  for (const food of BUG_ITEMS.filter((x) => x.use === 'food')) {
    const { clock, barn, shop, player, pen, setNeeds, own } = setup();
    setNeeds(0); own(food.id, 2); if (food.id !== 'food-fruit') own('food-fruit');
    pen.fedAt = clock.now - DAY;
    const xp = pen.xp;
    assert.ok(food.desc.includes(`+${food.food} Fed`) && food.desc.includes(`${food.heal} HP`));
    shop.use(player, food.id);
    assert.equal(barn.needs(pen, clock.now).hunger, food.food);
    assert.equal(pen.fedAt, clock.now); assert.equal(pen.xp - xp, 12);
    assert.deepEqual(pen.lunch, { name: food.name, heal: food.heal });
    assert.deepEqual(barn.fighter(player.id, pen).lunch, pen.lunch, 'it goes to the fight');
    assert.deepEqual(barn.view(player.id).pen.lunch, pen.lunch, 'and the Barn can show it');
    assert.throws(() => shop.use(player, 'food-fruit'), (e) => e.status === 429);
    assert.equal(USE_COOLDOWN_MS.food, 15 * 60e3);
    clock.now += 15 * 60e3; shop.use(player, food.id);
    assert.equal(pen.xp - xp, 24, 'no daily cap: every food pays');
    assert.ok(barn.needs(pen, clock.now).hunger <= 100);
  }
  const sold = BUG_ITEMS.filter((x) => x.use === 'food' && !x.retired).sort((a, b) => a.price - b.price);
  assert.ok(sold.every((x, i) => x.heal <= LUNCH_CAP && (!i || x.heal > sold[i - 1].heal)), 'a dearer food packs a bigger lunch, up to the cap');
});

test('a bug carries one lunch and keeps the bigger; eating it in a fight uses it up', () => {
  const { clock, barn, shop, player, pen, own } = setup();
  own('food-banquet'); own('food-leaf');
  shop.use(player, 'food-banquet'); clock.now += USE_COOLDOWN_MS.food;
  shop.use(player, 'food-leaf');
  assert.equal(pen.lunch.name, 'Bug Banquet', 'a snack does not replace the banquet');
  barn.lunchEaten(player.id, pen.bornAt + 1);
  assert.ok(barn.doc.pens[player.id].lunch, 'a different bug\'s fight does not touch it');
  barn.lunchEaten(player.id, pen.bornAt);
  assert.equal(barn.doc.pens[player.id].lunch, undefined);
  assert.equal(barn.view(player.id).pen.lunch, null);
});

test('free and store care have no daily XP cap: every action pays in full', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  for (let i = 0; i < 12; i++) {
    barn.care(player.id, 'feed'); clock.now += CARE.feed.cooldownMs;
  }
  assert.equal(pen.xp, 144, 'past the old 120 a day');
  own('mister'); shop.use(player, 'mister'); assert.equal(pen.xp, 150);
  barn.care(player.id, 'play'); assert.equal(pen.xp, 162);
  setNeeds(20);
  barn.care(player.id, 'clean');
  own('heatlamp'); shop.use(player, 'heatlamp');
  own('food-leaf'); shop.use(player, 'food-leaf');
  assert.deepEqual(barn.needs(pen, clock.now), { hunger: 40, mood: 60, clean: 65 });
  assert.equal(pen.xp, 162 + 12 + 6 + 12);
});

test('feeder XP starts at the next hatch-day checkpoint', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  clock.now += 12 * HOUR; setNeeds(100); own('feeder');
  shop.use(player, 'feeder'); assert.equal(pen.xp, 0, 'using a feeder gives no immediate XP');
  clock.now = pen.bornAt + DAY - 1;
  assert.equal(barn.view(player.id).pen.xp, 0, 'no passive XP before the checkpoint');
  clock.now += 1;
  assert.equal(barn.view(player.id).pen.xp, 10 + 12, 'day and feeder bonuses accrue');
});

test('a Golden Ambrosia still held keeps the bug looked after for 7 days; a feeder pays 12 XP per covered hatch-day checkpoint', () => {
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

test('feeder starts on use, fills and holds all three needs, extends remaining time, and needs fall again when it runs out', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  setNeeds(50); own('feeder', 5);
  assert.equal(pen.feederUntil, undefined, 'inventory alone does not start a feeder');
  assert.match(item('feeder').desc, /Fed, Mood and Clean full for 14 days.*60 days/);
  shop.use(player, 'feeder'); const firstEnd = clock.now + 14 * DAY;
  assert.equal(pen.feederUntil, firstEnd);
  assert.equal(barn.deathAt(pen), firstEnd + 21 * DAY);
  clock.now += DAY;
  assert.deepEqual(barn.needs(pen, clock.now), { hunger: 100, mood: 100, clean: 100 });
  assert.equal(barn.fighter(player.id, pen).mood, 100, 'top fighting condition');
  barn.care(player.id, 'play'); // free care still works, and does not disturb what the feeder holds
  assert.deepEqual(barn.needs(pen, firstEnd), { hunger: 100, mood: 100, clean: 100 });
  const after = barn.needs(pen, firstEnd + 10 * HOUR);
  assert.deepEqual([after.hunger, after.mood, after.clean].map(Math.round), [94, 84, 86], 'ten hours after it runs out');
  shop.use(player, 'feeder'); assert.equal(pen.feederUntil, firstEnd + 14 * DAY);
  shop.use(player, 'feeder'); shop.use(player, 'feeder');
  assert.throws(() => shop.use(player, 'feeder'), (e) => e.status === 409);
  assert.equal(shop.inv(player.id).own.feeder, 1, 'refused extension keeps the item');
});

test('a toy earns the bug XP every day on its own, and only the one that is out', () => {
  const toys = BUG_ITEMS.filter((x) => x.slot === 'toy').sort((a, b) => a.price - b.price);
  assert.ok(toys.every((x, i) => x.xp > 0 && x.xp <= 20 && (!i || x.xp > toys[i - 1].xp)), 'a dearer toy earns more, up to 20 a day');
  for (const toy of toys) assert.ok(toy.desc.includes(`earns ${toy.xp} XP a day`));
  const { clock, barn, shop, player, setNeeds, own } = setup();
  const day = () => { const xp = barn.view(player.id).pen.xp; setNeeds(100); clock.now += DAY; return barn.view(player.id).pen.xp - xp; };
  assert.equal(day(), 10, 'no toy: the day bonus alone');
  own('toy-disco'); own('toy-twig'); shop.equip(player, { id: 'toy-disco' });
  assert.equal(day(), 10 + 20);
  shop.equip(player, { id: 'toy-twig' }); assert.equal(day(), 10 + 2, 'owning the disco ball is not enough: it has to be out');
  const before = barn.view(player.id).pen.xp; setNeeds(0); clock.now += 3 * DAY;
  assert.equal(barn.view(player.id).pen.xp - before, 3 * 2, 'three days away and neglected: the toy still pays, the day bonus does not');
  shop.equip(player, { id: null, slot: 'toy' }); assert.equal(day(), 10);
});

test('with several bugs: food packs a lunch for the partner, the toy pays only the partner, and a lunch eaten by a stalled bug is gone', () => {
  const { clock, barn, shop, player, pen, setNeeds, own } = setup();
  barn.layEgg(player.id); clock.now += 1; barn.view(player.id);
  const stalled = barn.doc.bench[player.id][0];
  own('food-banquet'); shop.use(player, 'food-banquet');
  assert.deepEqual(barn.view(player.id).stable.bugs.map((b) => b.lunch), [{ name: 'Bug Banquet', heal: LUNCH_CAP }, null]);
  // neglected, so there is no day bonus: over five days the partner has five checkpoints and the stalled bug one
  own('toy-disco'); shop.equip(player, { id: 'toy-disco' });
  setNeeds(0); for (const stat of ['hunger', 'mood', 'clean']) stalled.stats[stat] = { v: 0, at: barn.own(stalled, clock.now) };
  const before = barn.view(player.id).stable.bugs.map((b) => b.xp); clock.now += BENCH_SLOW * DAY;
  assert.deepEqual(barn.view(player.id).stable.bugs.map((b, i) => b.xp - before[i]), [BENCH_SLOW * 20, 0]);
  // the fed bug goes to a stall with its lunch, fights from there and eats it
  barn.setPartner(player.id, barn.view(player.id).stable.bugs[1].id);
  assert.deepEqual(barn.view(player.id).stable.bugs.map((b) => !!b.lunch), [false, true]);
  barn.lunchEaten(player.id, pen.bornAt);
  assert.deepEqual(barn.view(player.id).stable.bugs.map((b) => [b.partner, b.lunch]), [[true, null], [false, null]], 'gone, and each bug is still where it was');
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
  // one attack item and one defense item: a second item of a kind replaces the first and leaves the other slot alone
  for (const id of ['gear-armor', 'gear-bandage', 'gear-claws', 'gear-mandibles']) own(id);
  shop.equip(player, { id: 'gear-armor' }); assert.equal(shop.bugStyle(player.id).defenseBonus, 0.06);
  shop.equip(player, { id: 'gear-bandage' }); assert.equal(shop.bugStyle(player.id).defenseBonus, 0.01);
  assert.equal(shop.bugStyle(player.id).gearBonus, 0, 'defense gear adds no attack');
  shop.equip(player, { id: 'gear-claws' }); shop.equip(player, { id: 'gear-mandibles' });
  const kit = shop.bugStyle(player.id);
  assert.deepEqual([kit.gear, kit.gearBonus, kit.defense, kit.defenseBonus], ['gear-mandibles', 0.05, 'gear-bandage', 0.01]);
  assert.deepEqual([barn.fighter(player.id, pen).gear, barn.fighter(player.id, pen).defense], [0.05, 0.01], 'both reach the fight');
  shop.equip(player, { id: null, slot: 'defense' }); assert.equal(shop.bugStyle(player.id).defenseBonus, 0);
  const sold = BUG_ITEMS.filter((x) => x.cat === 'gear');
  assert.ok(sold.every((x) => (x.slot === 'gear') !== (x.slot === 'defense') && x[x.slot] > 0 && x[x.slot] <= 0.06), 'every battle item is attack or defense, within the cap');
  for (const slot of ['gear', 'defense']) { // within a kind, paying more never buys less
    const line = sold.filter((x) => x.slot === slot).sort((a, b) => a.price - b.price);
    assert.ok(line.length > 1 && line.every((x, i) => !i || x[slot] > line[i - 1][slot]), `${slot} items get stronger with price`);
  }
  assert.ok(item('gear-shield').desc.includes('takes 4% less damage from each hit'));
  const gearDesc = item('gear-boots').desc;
  assert.ok(gearDesc.includes('+2.5% attack damage') && gearDesc.includes('one attack item and one defense item'));
  // the bout rules it quotes are the Barn's own: who can fight, the XP, and that a bout can be for money
  assert.equal(BOUT_LEVEL, 1); assert.ok(gearDesc.includes('Any hatched bug can fight'));
  assert.ok(gearDesc.includes(`${BOUT_XP + BOUT_WIN_XP} XP for a win and ${BOUT_XP} for a loss or draw`));
  assert.ok(gearDesc.includes(`a matched stake of up to $${MAX_BOUT_STAKE.toLocaleString('en-US')}`));
  const before = structuredClone(pen);
  for (const id of ['bugskin-ruby', 'bugwear-tophat', 'bugwear-bow']) { own(id); shop.equip(player, { id }); }
  assert.deepEqual(pen, before, 'cosmetics do not change needs, XP or species');
  assert.equal(shop.bugStyle(player.id).bugskin.id, 'bugskin-ruby');
  assert.equal(shop.bugStyle(player.id).bughat.id, 'bugwear-tophat');
  assert.equal(shop.bugStyle(player.id).bugacc.id, 'bugwear-bow');
});

test('gear equipped before attack and defense split moves to its own slot once, and keeps its bonus', () => {
  const docs = new Map([['shop', { inv: {
    helmet: { own: { 'gear-helmet': 1 }, eq: { gear: 'gear-helmet', bughat: 'bugwear-crown' } }, // defense gear in the old shared slot
    claws: { own: { 'gear-claws': 1 }, eq: { gear: 'gear-claws' } },                             // attack gear stays where it is
    both: { own: { 'gear-armor': 1, 'gear-shield': 1 }, eq: { gear: 'gear-armor', defense: 'gear-shield' } }, // never overwrites a filled slot
  } }]]);
  const store = { loadDoc: (id, fallback) => docs.get(id) || fallback, saveDoc: (id, doc) => docs.set(id, structuredClone(doc)) };
  const boot = () => new Shop({ store, accounts: { ensure() {} }, barn: { view: () => ({}) }, now: () => 0 });
  const shop = boot();
  assert.deepEqual(shop.doc.inv.helmet.eq, { bughat: 'bugwear-crown', defense: 'gear-helmet' });
  assert.equal(shop.bugStyle('helmet').defenseBonus, 0.03); assert.equal(shop.bugStyle('helmet').gearBonus, 0);
  assert.deepEqual(shop.doc.inv.claws.eq, { gear: 'gear-claws' });
  assert.deepEqual(shop.doc.inv.both.eq, { defense: 'gear-shield' });
  assert.deepEqual(docs.get('shop').inv.helmet.eq, shop.doc.inv.helmet.eq, 'saved');
  assert.deepEqual(boot().doc.inv, shop.doc.inv, 'a second boot changes nothing');
});
