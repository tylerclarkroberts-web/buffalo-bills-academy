// The General Store catalog: every item, validated once at load. Data lives in avatar.js, gags.js, tobacco.js and bug.js.
import { AVATAR_ITEMS } from './avatar.js';
import { GAG_ITEMS, ABSURD_ITEMS } from './gags.js';
export { GAG_RENAME } from './gags.js';
import { BUG_ITEMS } from './bug.js';
import { TOBACCO_ITEMS } from './tobacco.js';
export { TOBACCO_NOTICE } from './tobacco.js';
import { SPECTACLE_ITEMS } from './spectacles.js';

export const CATALOG = [...AVATAR_ITEMS, ...GAG_ITEMS, ...SPECTACLE_ITEMS, ...ABSURD_ITEMS, ...TOBACCO_ITEMS, ...BUG_ITEMS];
/** The most anything in the store can cost: the Deed to the Moon. */
export const MAX_PRICE = 5000000;
export const ITEM = Object.fromEntries(CATALOG.map((x) => [x.id, x]));
/** Tabs in store order. `bug: true` tabs appear only after your egg hatches. */
export const TABS = [
  { id: 'hats', label: 'Hats' }, { id: 'face', label: 'Eyes & face' }, { id: 'clothes', label: 'Clothes' }, { id: 'skins', label: 'Shirts' },
  { id: 'extras', label: 'Extras' }, { id: 'gags', label: 'Gags' }, { id: 'spectacles', label: 'Spectacles' }, { id: 'oddities', label: 'Oddities' }, { id: 'unique', label: 'One of a kind' }, { id: 'seasonal', label: 'Seasonal' }, { id: 'tobacco', label: 'Smoke Shop', adult: true },
  { id: 'food', label: 'Bug food', bug: true }, { id: 'toys', label: 'Bug toys', bug: true }, { id: 'bugstyle', label: 'Bug style', bug: true },
  { id: 'bugcare', label: 'Bug care', bug: true }, { id: 'gear', label: 'Battle gear', bug: true },
];
export const AVATAR_SLOTS = ['hat', 'eyes', 'face', 'neck', 'body', 'skin', 'acc'];
export const BUG_SLOTS = ['toy', 'bugskin', 'bughat', 'bugacc', 'gear'];
export const tier = (price) => (price >= 20000 ? 'crazy' : price >= 1500 ? 'expensive' : price >= 300 ? 'medium' : 'cheap');

const ids = new Set();
for (const x of CATALOG) {
  if (ids.has(x.id)) throw new Error(`duplicate catalog id ${x.id}`);
  ids.add(x.id);
  if (!(Number.isInteger(x.price) && x.price > 0 && x.price <= MAX_PRICE)) throw new Error(`bad price ${x.id}`);
  if (!TABS.some((t) => t.id === x.cat)) throw new Error(`bad tab ${x.id}`);
  if (x.slot && ![...AVATAR_SLOTS, ...BUG_SLOTS].includes(x.slot)) throw new Error(`bad slot ${x.id}`);
}
