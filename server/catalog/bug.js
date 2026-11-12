// General Store catalog (v34), part 3: for your bug. Only shown, and only sold, once your egg has hatched.
// Effects are server-side and capped (server/shop.js). Nothing here touches poker or chips at the table.
const items = [];
const add = (o) => items.push({ kind: 'bug', ...o });

// food: consumable; using one is a feed (resets the hunger clock), +hunger, small XP still inside the daily cap
const FOOD = [
  ['leaf', 'Fresh Leaf Litter', 25, '🍂', 20, 'Damp, crunchy, delicious if you are a bug.'],
  ['fruit', 'Overripe Fruit', 60, '🍌', 35, 'Bruised to perfection.'],
  ['nectar', 'Flower Nectar', 90, '🌸', 40, 'Straight from the petal.'],
  ['sap', 'Tree Sap Drip', 120, '🍯', 45, 'Sticky, sweet, sold by the drop.'],
  ['crickets', 'Cricket Snacks', 150, '🦗', 50, 'For the meat-eaters in the barn.'],
  ['mealworms', 'Mealworm Bucket', 300, '🪱', 60, 'Wriggly. Nutritious. Don\'t ask.'],
  ['dung', 'Premium Dung Ball', 450, '🟤', 70, 'Hand-rolled. For connoisseurs only.'],
  ['moss', 'Artisan Moss', 600, '🌿', 75, 'Grown in a terrarium by a man named Gil.'],
  ['banquet', 'Bug Banquet', 2500, '🍱', 100, 'A full spread. Your bug will be insufferable about it.'],
  ['ambrosia', 'Golden Ambrosia', 20000, '✨', 100, 'A lavish, golden meal. Your bug stays full for 7 days afterwards, like an automatic feeder.', 7],
];
for (const [id, name, price, emoji, food, desc, days] of FOOD) add({ id: `food-${id}`, name, price, emoji, ...(days ? { days } : {}),
  desc: `Single use: press Use for +${food} Fed now (max 100), a fresh starvation clock and up to 12 care XP within the shared 120 XP/day cap. Wait 15 minutes between store foods. Fed normally falls 0.6/hour. ${desc}`,
  cat: 'food', slot: null, use: 'food', food });

// toys: owned and equipped in the bug's toy slot; Play then lifts mood a little more (capped)
const TOYS = [
  ['twig', 'Climbing Twig', 25, '🪵', 4], ['pebble', 'Shiny Pebble', 60, '🪨', 5], ['ball', 'Tiny Dung Ball', 90, '⚽', 6],
  ['maze', 'Leaf Maze', 300, '🌀', 8], ['mirror', 'Little Mirror', 450, '🪞', 10], ['wheel', 'Bug Wheel', 900, '🎡', 12],
  ['castle', 'Bark Castle', 2500, '🏰', 15], ['disco', 'Disco Ball (tiny)', 6000, '🪩', 20],
];
for (const [id, name, price, emoji, mood] of TOYS) add({ id: `toy-${id}`, name, price, emoji,
  desc: `Reusable: equip one toy at a time. Each free Play action adds +${mood} extra Mood to the usual +30 (max 100). Play has a 20-minute cooldown; Mood then falls 1.6/hour. Keep the toy and swap it whenever you like.`,
  cat: 'toys', slot: 'toy', mood });

// skins: recolour the sprite (cosmetic)
const SKINS = [
  ['ruby', 'Ruby Shell', ['#1a0606', '#6a1020', '#b02030', '#f05060', '#ffd0d0'], 300], ['sapphire', 'Sapphire Shell', ['#04081a', '#10205a', '#2050b0', '#60a0ff', '#e0f0ff'], 300],
  ['emerald', 'Emerald Shell', ['#04140a', '#0a4020', '#18904a', '#60e090', '#e0ffe8'], 300], ['gold', 'Gilded Shell', ['#1a1004', '#6a4a08', '#c09018', '#f8d850', '#fff8d0'], 2500],
  ['ghost', 'Ghost White', ['#202028', '#80808a', '#c0c0c8', '#e8e8f0', '#ffffff'], 600], ['night', 'Midnight', ['#000000', '#10101a', '#20203a', '#4040a0', '#9090ff'], 450],
  ['neon', 'Neon Sign', ['#0a0010', '#3a0060', '#a020c0', '#ff40e0', '#ffd0ff'], 1500], ['candy', 'Candy Stripe', ['#2a0010', '#d03060', '#f0f0f0', '#ff90b0', '#ffffff'], 900],
  ['camo', 'Desert Camo', ['#1a1408', '#5a4a2a', '#8a7a4a', '#c0a870', '#e8dcb0'], 150], ['rainbow', 'Prism', ['#100818', '#3040c0', '#20b080', '#f0c020', '#ff5050'], 20000],
  ['lava', 'Lava Shell', ['#100400', '#3a0a04', '#8a1a08', '#ff5a10', '#ffd040'], 8000],
];
for (const [id, name, pal, price] of SKINS) add({ id: `bugskin-${id}`, name, price, desc: 'Permanent cosmetic: change your bug\'s colour until you swap it or take it off. One shell colour at a time, alongside a hat and accessory. No change to species, needs, XP or battle strength.', cat: 'bugstyle', slot: 'bugskin', pal });

// clothes and accessories: tiny pixel overlays (cosmetic)
const WEAR = [
  ['tophat', 'Tiny Top Hat', 150, 'bughat'], ['cowboy', 'Tiny Cowboy Hat', 120, 'bughat'], ['crown', 'Tiny Crown', 2500, 'bughat'], ['party', 'Tiny Party Hat', 25, 'bughat'],
  ['bow', 'Bow', 60, 'bugacc'], ['monocle', 'Monocle', 450, 'bugacc'], ['shades', 'Sunglasses', 90, 'bugacc'], ['bandana', 'Bandana', 60, 'bugacc'],
  ['cape', 'Superhero Cape', 600, 'bugacc'], ['scarf', 'Scarf', 90, 'bugacc'], ['dapper', 'Monocle & Moustache Set', 5000, 'bugacc'],
];
for (const [id, name, price, slot] of WEAR) add({ id: `bugwear-${id}`, name, price,
  desc: `Permanent cosmetic: equip one ${slot === 'bughat' ? 'hat' : 'accessory'} at a time, alongside a shell colour and ${slot === 'bughat' ? 'accessory' : 'hat'}. Stays on until swapped or taken off. No change to needs, XP or battle strength.`,
  cat: 'bugstyle', slot, shape: id });

// the automatic feeder: consumable, each one keeps the bowl full and pauses the starvation clock for 14 days
add({ id: 'feeder', name: 'Automatic Feeder (14 days)', price: 2500, emoji: '🥣', cat: 'bugcare', slot: null, use: 'feeder', days: 14,
  desc: 'Single use: press Use to fill Fed to 100 and keep it full for 14 days, with the starvation clock paused. Your bug earns 12 XP for each full day the feeder runs. Use another to add 14 days to the remaining time, up to 60 days ahead. Mood and Clean still fall normally. Check the Barn for the end date.' });
add({ id: 'mister', name: 'Auto-Mister', price: 150, emoji: '💧', cat: 'bugcare', slot: null, use: 'clean', desc: 'Single use: press Use for +40 Clean now (max 100) and up to 6 care XP within the shared 120 XP/day cap. Clean then falls 1.4/hour; a full 40-point boost takes about 28 hours 34 minutes to decay. One instant mist, with a 30-minute cooldown between misters.' });
add({ id: 'heatlamp', name: 'Cosy Heat Lamp', price: 90, emoji: '💡', cat: 'bugcare', slot: null, use: 'mood', desc: 'Single use: press Use for +40 Mood now (max 100) and up to 6 care XP within the shared 120 XP/day cap. Mood then falls 1.6/hour; a full 40-point boost takes 25 hours to decay. One instant boost, with a 30-minute cooldown between lamps.' });

// battle gear: one gear slot; bouts get +1% to +6% damage (GEAR_CAP). Bouts never wager anything.
const GEAR = [
  ['shell', 'Polished Shell Wax', 300, 0.01], ['claws', 'Claw Sharpener', 600, 0.02], ['boots', 'Six Tiny Boots', 900, 0.025],
  ['helmet', 'Acorn Helmet', 1500, 0.03], ['shield', 'Leaf Shield', 2500, 0.04], ['mandibles', 'Gilded Mandibles', 6000, 0.05],
  ['armor', 'Beetle Plate Armour', 20000, 0.06], ['bandage', 'Lucky Bandage', 60, 0.01],
];
for (const [id, name, price, gear] of GEAR) add({ id: `gear-${id}`, name, price, emoji: '🛡️', desc: `Reusable: equip one battle item at a time for +${+(gear * 100).toFixed(1)}% damage in Barn bouts (max +6%). Stays equipped until swapped or taken off. Bouts unlock at level 5, once an hour, with no money or XP at stake. No effect on poker.`, cat: 'gear', slot: 'gear', gear });

export const BUG_ITEMS = items;
