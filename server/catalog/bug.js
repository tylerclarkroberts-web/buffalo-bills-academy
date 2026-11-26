// General Store catalog (v34), part 3: for your bug. Only shown, and only sold, once your egg has hatched.
// Effects are server-side and capped (server/shop.js). Nothing here touches poker or chips at the table.
import { GEAR as GYM_GEAR } from '../engine/gym.js';

const items = [];
const add = (o) => items.push({ kind: 'bug', ...o });

// A paid bug item does something the free Feed, Play and Mist cannot, and its description says what in one plain line.
// `retired` items are off the shelf for good: only someone still holding one sees it, and it still works (server/shop.js).

// food: consumable. Using one is a feed, the same as the free one (+Fed, a fresh starvation clock, 9 XP), and packs
// a lunch: in its next fight the bug eats it the first time it drops below half health, for `heal` HP (at most
// LUNCH_CAP, server/engine/bout.js). It carries one lunch and keeps the bigger.
const FOOD = [
  ['leaf', 'Fresh Leaf Litter', 25, '🍂', 20, 2, 'Damp, crunchy, delicious if you are a bug.'],
  ['fruit', 'Overripe Fruit', 60, '🍌', 35, 3, 'Bruised to perfection.'],
  ['nectar', 'Flower Nectar', 90, '🌸', 40, 4, 'Straight from the petal.'],
  ['sap', 'Tree Sap Drip', 120, '🍯', 45, 5, 'Sticky, sweet, sold by the drop.'],
  ['crickets', 'Cricket Snacks', 150, '🦗', 50, 6, 'For the meat-eaters in the barn.'],
  ['mealworms', 'Mealworm Bucket', 300, '🪱', 60, 7, 'Wriggly. Nutritious. Don\'t ask.'],
  ['dung', 'Premium Dung Ball', 450, '🟤', 70, 8, 'Hand-rolled. For connoisseurs only.'],
  ['moss', 'Artisan Moss', 600, '🌿', 75, 9, 'Grown in a terrarium by a man named Gil.'],
  ['banquet', 'Bug Banquet', 900, '🍱', 100, 10, 'A full spread. Your bug will be insufferable about it.'],
];
for (const [id, name, price, emoji, food, heal, joke] of FOOD) add({ id: `food-${id}`, name, price, emoji,
  desc: `${joke} Feeds your bug now (+${food} Fed, 9 XP) and packs it a lunch: the first time it drops below half health in its next fight, it eats and gets ${heal} HP back. It carries one lunch and keeps the bigger.`,
  cat: 'food', slot: null, use: 'food', food, heal });
add({ id: 'food-ambrosia', name: 'Golden Ambrosia', price: 3000, emoji: '✨', cat: 'food', slot: null, use: 'food', food: 100, heal: 10, days: 7, retired: true,
  desc: 'The shopkeeper stopped stocking it; nobody could say what it was. Yours still works: a full meal (+100 Fed, 9 XP), a packed lunch worth 10 HP, and 7 days of the Automatic Feeder.' });

// toys: owned and equipped in the bug's toy slot. Left with one, the bug earns `xp` a day on its own (capped at 20);
// Play also lifts Mood a little more (`mood`, capped at 20).
const TOYS = [
  ['twig', 'Climbing Twig', 25, '🪵', 4, 2, 'It climbs it. It comes down. That is the whole show.'],
  ['pebble', 'Shiny Pebble', 60, '🪨', 5, 3, 'It cannot tell you why it loves the pebble.'],
  ['ball', 'Tiny Dung Ball', 90, '⚽', 6, 4, 'Regulation size. Do not ask which regulations.'],
  ['maze', 'Leaf Maze', 300, '🌀', 8, 5, 'It solved it on day one. It pretends it has not.'],
  ['mirror', 'Little Mirror', 450, '🪞', 10, 6, 'It has met a handsome stranger and they are not speaking.'],
  ['wheel', 'Bug Wheel', 900, '🎡', 12, 8, 'Goes nowhere, quickly.'],
  ['castle', 'Bark Castle', 2500, '🏰', 15, 11, 'Comes with a moat. The moat is a jar lid.'],
  ['disco', 'Disco Ball (tiny)', 6000, '🪩', 20, 15, 'The barn has complained about the noise. There is no noise.'],
];
for (const [id, name, price, emoji, mood, xp, joke] of TOYS) add({ id: `toy-${id}`, name, price, emoji,
  desc: `${joke} Left alone with it, your bug earns ${xp} XP a day. Play also gives +${mood} extra Mood. One toy out at a time.`,
  cat: 'toys', slot: 'toy', mood, xp });

// skins: recolour the sprite (cosmetic)
const SKINS = [
  ['ruby', 'Ruby Shell', ['#1a0606', '#6a1020', '#b02030', '#f05060', '#ffd0d0'], 300], ['sapphire', 'Sapphire Shell', ['#04081a', '#10205a', '#2050b0', '#60a0ff', '#e0f0ff'], 300],
  ['emerald', 'Emerald Shell', ['#04140a', '#0a4020', '#18904a', '#60e090', '#e0ffe8'], 300], ['gold', 'Gilded Shell', ['#1a1004', '#6a4a08', '#c09018', '#f8d850', '#fff8d0'], 2500],
  ['ghost', 'Ghost White', ['#202028', '#80808a', '#c0c0c8', '#e8e8f0', '#ffffff'], 600], ['night', 'Midnight', ['#000000', '#10101a', '#20203a', '#4040a0', '#9090ff'], 450],
  ['neon', 'Neon Sign', ['#0a0010', '#3a0060', '#a020c0', '#ff40e0', '#ffd0ff'], 1500], ['candy', 'Candy Stripe', ['#2a0010', '#d03060', '#f0f0f0', '#ff90b0', '#ffffff'], 900],
  ['camo', 'Desert Camo', ['#1a1408', '#5a4a2a', '#8a7a4a', '#c0a870', '#e8dcb0'], 150], ['rainbow', 'Prism', ['#100818', '#3040c0', '#20b080', '#f0c020', '#ff5050'], 20000],
  ['lava', 'Lava Shell', ['#100400', '#3a0a04', '#8a1a08', '#ff5a10', '#ffd040'], 8000],
];
for (const [id, name, pal, price] of SKINS) add({ id: `bugskin-${id}`, name, price, desc: 'Permanent cosmetic for one bug: it changes that bug\'s colour until you swap it or take it off. One shell colour at a time, alongside a hat and accessory. A second bug needs its own, or move this one across. No change to species, needs, XP or battle strength.', cat: 'bugstyle', slot: 'bugskin', pal });

// clothes and accessories: tiny pixel overlays (cosmetic)
const WEAR = [
  ['tophat', 'Tiny Top Hat', 150, 'bughat'], ['cowboy', 'Tiny Cowboy Hat', 120, 'bughat'], ['crown', 'Tiny Crown', 2500, 'bughat'], ['party', 'Tiny Party Hat', 25, 'bughat'],
  ['bow', 'Bow', 60, 'bugacc'], ['monocle', 'Monocle', 450, 'bugacc'], ['shades', 'Sunglasses', 90, 'bugacc'], ['bandana', 'Bandana', 60, 'bugacc'],
  ['cape', 'Superhero Cape', 600, 'bugacc'], ['scarf', 'Scarf', 90, 'bugacc'], ['dapper', 'Monocle & Moustache Set', 5000, 'bugacc'],
];
for (const [id, name, price, slot] of WEAR) add({ id: `bugwear-${id}`, name, price,
  desc: `Permanent cosmetic for one bug: it wears one ${slot === 'bughat' ? 'hat' : 'accessory'} at a time, alongside a shell colour and ${slot === 'bughat' ? 'accessory' : 'hat'}. A second bug needs its own, or move this one across. No change to needs, XP or battle strength.`,
  cat: 'bugstyle', slot, shape: id });

// the automatic feeder: consumable. Each one fills Fed, Mood and Clean, keeps all three full and pauses the starvation
// clock for 14 days, and adds 9 XP at each daily checkpoint it covers.
add({ id: 'feeder', name: 'Automatic Feeder (14 days)', price: 2500, emoji: '🥣', cat: 'bugcare', slot: null, use: 'feeder', days: 14,
  desc: 'A bowl, a sprinkler and a recording of you saying "good bug". Keeps Fed, Mood and Clean full for 14 days, so your bug stays in top fighting condition while you are away, and adds 9 XP a day. Use another to add 14 days, up to 60 days ahead.' });
add({ id: 'jar', name: 'Specimen Jar', price: 150, emoji: '🫙', cat: 'bugcare', slot: null, use: 'jar',
  desc: 'Single use, down the mine. When a wild bug is at a quarter of its health or less, throw this instead of finishing it: it holds 35% of the time at a quarter, more the weaker the bug, never better than 85%. Held or not, the jar is spent. Needs a free stall. Air holes are your problem.' });
// retired: each did less than the free button beside it
add({ id: 'mister', name: 'Auto-Mister', price: 150, emoji: '💧', cat: 'bugcare', slot: null, use: 'clean', retired: true, desc: 'The shopkeeper pulled these after someone noticed the hose is free. Yours still works: +40 Clean and 6 XP.' });
add({ id: 'heatlamp', name: 'Cosy Heat Lamp', price: 90, emoji: '💡', cat: 'bugcare', slot: null, use: 'mood', retired: true, desc: 'The shopkeeper pulled these after someone noticed Play is free and better. Yours still works: +40 Mood and 6 XP.' });

// battle gear: two slots on each bug, one attack item ('gear') and one defense item ('defense'), each worth 1% to 6%
// (GEAR_CAP). An item is on one bug at a time (server/shop.js): buy another for a second bug, or move it across.
// Attack gear raises the damage of the bug's hits; defense gear lowers the damage of the hits it takes. The bonus is
// stored under the slot's own name. Gear is never wagered; a bout's stake is money (server/barn.js).
const GEAR = [
  ['claws', 'Claw Sharpener', 600, 'gear', 0.02], ['boots', 'Six Tiny Boots', 900, 'gear', 0.025], ['mandibles', 'Gilded Mandibles', 6000, 'gear', 0.05],
  ['bandage', 'Lucky Bandage', 60, 'defense', 0.01], ['shell', 'Polished Shell Wax', 300, 'defense', 0.015], ['helmet', 'Acorn Helmet', 1500, 'defense', 0.03],
  ['shield', 'Leaf Shield', 2500, 'defense', 0.04], ['armor', 'Beetle Plate Armour', 20000, 'defense', 0.06],
];
const BOUT_COPY = 'It goes on one bug, which wears one attack item and one defense item at a time. A second bug needs its own, or move this one across. Any hatched bug can fight. A bout awards 23 XP for a win and 15 for a loss or draw, and is fought for free or for a matched stake of up to $10,000. No effect on poker.';
for (const [id, name, price, slot, bonus] of GEAR) {
  const pct = +(bonus * 100).toFixed(1);
  add({ id: `gear-${id}`, name, price, emoji: slot === 'gear' ? '⚔️' : '🛡️', cat: 'gear', slot, [slot]: bonus,
    desc: `${slot === 'gear' ? `Reusable attack gear: +${pct}% attack damage in bug fights.` : `Reusable defense gear: your bug takes ${pct}% less damage from each hit in bug fights.`} ${BOUT_COPY}` });
}

// gym gear (v145): for the Bug Gym behind the Barn (server/engine/gym.js GEAR has the numbers). Each goes on one bug
// for a few weeks and cannot be doubled up; creatine is one scoop. Bought here, it lives on the bug, not in your bag.
const GYM = [
  ['salts', 'Smelling Salts', 1800, '🧂', 'A brown bottle from behind the Peppermill bar. One whiff and it remembers every insult.', 'Sparring Pit: sharp bouts 85% of the time instead of 60%.'],
  ['prework', 'Pre-Workout', 3500, '⚡', 'Blue raspberry. Tastes like a battery licked a Jolly Rancher.', '+50% power gained from Cardio, Sparring and Double Shift (still tops out at +20%).'],
  ['mask', 'Breathing Mask', 2800, '😷', 'A restriction mask that simulates altitude. Wendover is already at altitude. It does not care.', '+50% XP from every workout, and Cardio & Drills gives +1.5% power instead of +1%.'],
  ['banana', 'Banana', 1200, '🍌', 'One banana, flown in. The shopkeeper says that is what bananas cost now.', 'Workouts cost half the mood. Not the vial: nothing fixes the vial.'],
  ['brace', 'Knee Brace', 2400, '🦵', 'Six knees, one brace, a lot of velcro.', 'Double Shift adds +18 strain instead of +30, and it will lift all the way to 100 strain.'],
  ['glp1', 'GLP-1', 6000, '🖊️', 'A pen from a clinic in Elko. Your bug now talks about "food noise".', 'Roid load and strain fade twice as fast, +5% HP in fights (inside the +20% ceiling). Side effect: it sulks, -3 mood a workout.'],
  ['sweatband', 'Sweatband', 1500, '🎽', 'Terrycloth, lime green. It came with a VHS tape.', 'Cool Down & Stretch flushes 50% more roid load and strain.'],
];
for (const [gym, name, price, , joke, what] of GYM) add({ id: `gym-${gym}`, name, price, emoji: GYM_GEAR[gym].emoji, gpix: gym, cat: 'gymgear', slot: null, gym, days: GYM_GEAR[gym].days,
  desc: `${joke} ${what} Lasts ${GYM_GEAR[gym].days} days on one bug; a second one can go on once it runs out.` });
add({ id: 'gym-creatine', name: 'Creatine', price: 2000, emoji: '🥛', gpix: 'creatine', cat: 'gymgear', slot: null, gym: 'creatine',
  desc: 'One scoop, chalky, stirred with a finger. One use: the bug\'s gym lock is 12 hours instead of waiting until midnight Pacific, or until midnight if that comes first. Buy it while the bug is resting and today\'s lock drops to 12 hours from that workout (or midnight PT, whichever is sooner); otherwise it goes into the next one. One scoop at a time.' });

export const BUG_ITEMS = items;
