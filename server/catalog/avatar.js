// General Store catalog (v34), part 1: things you wear. Data only: every item is { id, name, cat, slot, price, desc, look }.
// `look.shape` picks a drawing in client/src/avatar/wear.js; `c`/`c2` are its colours. All cosmetic.
const T = { cheap: [25, 60, 90, 120, 150], medium: [300, 450, 600, 750, 900], expensive: [1500, 2500, 4000, 6000], crazy: [20000] };
const items = [];
const add = (o) => items.push({ kind: 'avatar', ...o });

// ---- hats: each shape in a few colourways ----
const HATS = [
  ['cowboy', 'Cowboy Hat', [['Sand', '#c8a26a', '#6a4a2a', 90], ['Black', '#2a2420', '#a08060', 120], ['White', '#efe8d8', '#8a6a4a', 150]], 'Wide brim, sweat band, a dent you didn\'t put there.'],
  ['tengallon', 'Ten-Gallon Hat', [['Tan', '#b88a50', '#4a2e16', 450], ['Ivory', '#f4ecd6', '#c03020', 750]], 'Holds no water. Holds a great deal of attitude.'],
  ['tophat', 'Top Hat', [['Black', '#1c1a1c', '#8a1a2a', 300], ['Grey', '#8a8a90', '#2a2a30', 300], ['Ringmaster Red', '#b0202a', '#f2c65a', 900]], 'Adds eight inches and a whiff of old money.'],
  ['bowler', 'Bowler', [['Black', '#222022', '#555', 60], ['Brown', '#5a3a20', '#2a1a0c', 60]], 'Round, firm, faintly suspicious.'],
  ['beanie', 'Beanie', [['Rust', '#c0502a', '#f0c080', 25], ['Teal', '#21a7a0', '#e8f8f0', 25], ['Mustard', '#d8a020', '#5a3a10', 25]], 'Warm ears, cold heart.'],
  ['crown', 'Crown', [['Brass', '#d8a820', '#c03040', 2500], ['Solid Gold (allegedly)', '#ffd040', '#3080ff', 20000]], 'Heavy is the head. Mostly because of the crown.'],
  ['umbrella', 'Umbrella Hat', [['Rainbow', '#e04040', '#40a0e0', 120], ['Polka Dot', '#f2e8d5', '#d6336c', 120]], 'Hands-free shelter from rain, sun and squirt guns (cosmetically).'],
  ['propeller', 'Propeller Beanie', [['Classic', '#2060d0', '#f0d020', 150]], 'Does not fly. We checked.'],
  ['sombrero', 'Sombrero', [['Straw', '#e0c070', '#c03020', 300]], 'Shade for you and two neighbours.'],
  ['chef', 'Chef\'s Toque', [['White', '#f8f8f4', '#d8d8d0', 90]], 'Forty-eight pleats, zero recipes.'],
  ['tricorn', 'Pirate Tricorn', [['Black', '#1e1a18', '#e8d8a0', 450]], 'Arr. Also: arr.'],
  ['fez', 'Fez', [['Red', '#b02028', '#1a1a1a', 120]], 'Tassel included. Tassel mandatory.'],
  ['viking', 'Horned Helmet', [['Iron', '#8a8f96', '#f0e8d0', 600]], 'Historically inaccurate and proud of it.'],
  ['party', 'Party Hat', [['Pink', '#ff5fa0', '#ffe060', 25], ['Blue', '#40a0ff', '#ffffff', 25]], 'It\'s somebody\'s birthday somewhere.'],
  ['halo', 'Halo', [['Gold', '#ffe070', '#fff8c0', 1500]], 'Floats. Smugly.'],
  ['antlers', 'Antlers', [['Velvet', '#8a5a30', '#5a3a1a', 300]], 'Clip-on. The deer wants them back.'],
  ['bucket', 'Bucket Hat', [['Olive', '#6a7a3a', '#3a4a1a', 60], ['Denim', '#4a6a9a', '#2a3a5a', 60]], 'Fishing optional.'],
  ['wizard', 'Wizard Hat', [['Midnight', '#2a2a7a', '#f2d050', 600]], 'Stars sold separately. Just kidding, they\'re on it.'],
  ['crownflowers', 'Flower Crown', [['Meadow', '#f080a0', '#60c060', 150]], 'Picked fresh this morning by someone else.'],
  ['hardhat', 'Miner\'s Helmet', [['Yellow', '#f0c020', '#fff8b0', 300]], 'With a lamp that never needs a battery. Or works.'],
];
for (const [shape, base, ways, desc] of HATS) for (const [w, c, c2, price] of ways) add({ id: `hat-${shape}-${w.toLowerCase().replace(/[^a-z]+/g, '')}`, name: ways.length > 1 ? `${base} (${w})` : base, cat: 'hats', slot: 'hat', price, desc, look: { shape, c, c2 } });

// ---- eyes ----
const EYES = [
  ['round', 'Round Specs', '#2a2a2a', '#bfe8ff', 60, 'For reading the river card very closely.'],
  ['aviator', 'Aviators', '#c8a040', '#3a2a1a', 300, 'Mirrored. Nobody can see you look at your cards.'],
  ['star', 'Star Glasses', '#ff5fa0', '#ffe060', 90, 'Superstar energy, dollar-store frames.'],
  ['heart', 'Heart Glasses', '#e02040', '#ff90b0', 90, 'You love this hand. Or you want them to think so.'],
  ['patchl', 'Eye Patch (left)', '#141414', '#141414', 60, 'Arr. Depth perception sold separately.'],
  ['patchr', 'Eye Patch (right)', '#141414', '#141414', 60, 'The other eye, for the ambidextrous pirate.'],
  ['monocle', 'Monocle', '#d8b040', '#d8f0ff', 450, 'Drop it in shock when someone shoves all in.'],
  ['3d', '3-D Glasses', '#f8f8f8', '#e03030', 25, 'Red and blue, as nature intended.'],
  ['goggles', 'Welding Goggles', '#4a4a4a', '#30a040', 300, 'Protects against sparks and bad beats.'],
  ['shades', 'Shutter Shades', '#f0e020', '#1a1a1a', 120, 'You can see out. Mostly.'],
  ['nerd', 'Taped Glasses', '#1a1a1a', '#f8f8f8', 25, 'Held together by tape and optimism.'],
  ['visor', 'Dealer Visor', '#2a8a4a', '#bff0c0', 150, 'Green, translucent, deeply professional.'],
];
for (const [shape, name, c, c2, price, desc] of EYES) add({ id: `eyes-${shape}`, name, cat: 'face', slot: 'eyes', price, desc, look: { shape, c, c2 } });

// ---- face ----
const FACE = [
  ['handlebar', 'Handlebar Mustache', '#3a2416', 60, 'Twirl it while you think.'],
  ['walrus', 'Walrus Mustache', '#6a4a2a', 60, 'Catches soup, crumbs and secrets.'],
  ['pencil', 'Pencil Mustache', '#1a1410', 25, 'Thin, precise, slightly villainous.'],
  ['bandana', 'Outlaw Bandana', '#b02a2a', 120, 'Covers the face. Not the tell.'],
  ['clown', 'Clown Nose', '#e02020', 25, 'Honk.'],
  ['beardfake', 'Fake Beard', '#8a6a4a', 90, 'Glue-on. Fools nobody. Wear it anyway.'],
  ['blush', 'Rosy Cheeks', '#ff7090', 25, 'Looks like you just won a big pot.'],
  ['pipe', 'Corncob Pipe', '#c8a060', 300, 'Unlit. This is a family saloon.'],
];
for (const [shape, name, c, price, desc] of FACE) add({ id: `face-${shape}`, name, cat: 'face', slot: 'face', price, desc, look: { shape, c } });

// ---- neck ----
const NECK = [
  ['bowtie', 'Bow Tie (Red)', '#c02030', 60], ['bowtie', 'Bow Tie (Polka)', '#2a4a9a', 60], ['bolo', 'Bolo Tie', '#c8b070', 150],
  ['scarf', 'Wool Scarf', '#2a8a7a', 90], ['bandneck', 'Neckerchief', '#d8a020', 25], ['pearls', 'Pearl Necklace', '#f4f0e8', 900],
  ['medal', 'Participation Medal', '#d8a820', 120], ['chain', 'Gold Chain', '#f0c030', 1500], ['lei', 'Flower Lei', '#ff70a0', 90],
  ['cravat', 'Silk Cravat', '#7a2a8a', 450],
];
const NECKDESC = { bowtie: 'Clip-on, but no one needs to know.', bolo: 'Turquoise slide, leather cord, pure frontier.', scarf: 'Knitted by a grandmother of unknown origin.', bandneck: 'Wipe your brow after a big bluff.', pearls: 'Real-ish.', medal: 'For showing up. You did great.', chain: 'Heavier than your stack.', lei: 'Aloha from the high desert.', cravat: 'For when a bow tie is too casual.' };
NECK.forEach(([shape, name, c, price], i) => add({ id: `neck-${shape}-${i}`, name, cat: 'clothes', slot: 'neck', price, desc: NECKDESC[shape], look: { shape, c } }));

// ---- clothes (body) ----
const BODY = [
  ['vest', 'Gambler\'s Vest', '#5a1a1a', '#d8b050', 300, 'Brocade. Pockets for aces you definitely don\'t have.'],
  ['vest', 'Denim Vest', '#3a5a8a', '#c8d8f0', 150, 'Faded from honest work. Or a washing machine.'],
  ['suspenders', 'Suspenders', '#8a1a1a', '#f2e8d5', 60, 'Keeps your trousers up during big swings.'],
  ['poncho', 'Striped Poncho', '#c84a2a', '#f0c050', 450, 'Squint into the distance. Mandatory.'],
  ['sheriff', 'Sheriff\'s Star', '#d8b040', '#8a6a1a', 600, 'Purely decorative. You are not the law.'],
  ['tux', 'Tuxedo Front', '#1a1a1e', '#f8f8f8', 900, 'For the high-roller in you.'],
  ['hawaiian', 'Hawaiian Shirt', '#20a0a0', '#ff6080', 120, 'Vacation mode, permanently.'],
  ['plaid', 'Flannel Shirt', '#a02a2a', '#2a1a1a', 90, 'Lumberjack chic.'],
  ['duster', 'Trail Duster', '#8a6a40', '#5a4020', 1500, 'Long coat, longer stare.'],
  ['armor', 'Tin Armour', '#9aa0a8', '#5a6068', 2500, 'Clanks when you check.'],
  ['cape', 'Velvet Cape', '#6a1a8a', '#f2c65a', 4000, 'Swish dramatically after every win.'],
  ['sequin', 'Sequin Jacket', '#e0c030', '#ff60a0', 6000, 'Visible from orbit.'],
];
BODY.forEach(([shape, name, c, c2, price, desc], i) => add({ id: `body-${shape}-${i}`, name, cat: 'clothes', slot: 'body', price, desc, look: { shape, c, c2 } }));

// ---- skins: shirt colours / patterns and a frame ----
const SKINS = [
  ['solid', 'Shirt: Cactus Green', '#3a8a3a', 25], ['solid', 'Shirt: Sunset Orange', '#f07a30', 25], ['solid', 'Shirt: Midnight', '#20203a', 25],
  ['solid', 'Shirt: Lavender', '#a080d0', 25], ['stripes', 'Shirt: Barber Stripes', '#c02030', 60], ['stripes', 'Shirt: Jailbird', '#202020', 60],
  ['checks', 'Shirt: Picnic Check', '#d03030', 90], ['stars', 'Shirt: Star-Spangled', '#20307a', 150], ['gold', 'Shirt: Gold Lamé', '#e8c040', 2500],
  ['rainbow', 'Shirt: Rainbow', '#e04040', 900], ['camo', 'Shirt: Desert Camo', '#b89a6a', 300], ['neon', 'Shirt: Neon Sign', '#ff3fa0', 1500],
];
SKINS.forEach(([shape, name, c, price], i) => add({ id: `skin-${shape}-${i}`, name, cat: 'skins', slot: 'skin', price, desc: 'Changes the colour of your shirt. Nothing else. We promise.', look: { shape, c } }));

// ---- accessories ----
const ACC = [
  ['parrot', 'Shoulder Parrot', '#30b040', 1500, 'Repeats nothing. Very discreet.'], ['flower', 'Lapel Flower', '#ff5080', 60, 'A carnation for luck.'],
  ['badge', '"I ♥ Poker" Pin', '#e02040', 25, 'Tasteful? No. Sincere? Yes.'], ['feather', 'Hat Feather', '#40a0ff', 90, 'Sticks out of nothing in particular.'],
  ['cigar', 'Chocolate Cigar', '#5a3a1a', 120, 'Chocolate. Tastes like victory.'], ['bee', 'Pet Bee', '#f0c020', 300, 'Follows you around. Doesn\'t sting. Much.'],
  ['star', 'Gold Star Sticker', '#ffd040', 25, 'You get a gold star.'], ['balloon', 'Balloon on a String', '#ff4060', 150, 'It floats above your seat. Pop-proof.'],
];
for (const [shape, name, c, price, desc] of ACC) add({ id: `acc-${shape}`, name, cat: 'extras', slot: 'acc', price, desc, look: { shape, c } });

export const AVATAR_ITEMS = items;
export { T as PRICE_TIERS };
