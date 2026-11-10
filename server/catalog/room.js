import { ABSURD_ITEMS } from './gags.js';

export const ROOM_ANCHORS = [
  { id: 'wall-left', label: 'Left wall', type: 'wall' },
  { id: 'wall-right', label: 'Right wall', type: 'wall' },
  { id: 'shelf-left', label: 'Shelf 1', type: 'shelf' },
  { id: 'shelf-right', label: 'Shelf 2', type: 'shelf' },
  { id: 'shelf-3', label: 'Shelf 3', type: 'shelf' },
  { id: 'shelf-4', label: 'Shelf 4', type: 'shelf' },
  { id: 'desk', label: 'Writing desk', type: 'desk' },
  { id: 'floor', label: 'Floor', type: 'floor' },
  { id: 'window', label: 'Yard', type: 'outdoor' },
];
export const ROOM_THEMES = [
  { id: 'bunkhouse-timber', name: 'Warm timber' },
  { id: 'bunkhouse-sage', name: 'Sage wash' },
  { id: 'bunkhouse-clay', name: 'Clay walls' },
];
export const ROOM_SHELF_IDS = ['shelf-left', 'shelf-right', 'shelf-3', 'shelf-4'];
export const ROOM_SHELF_SPOTS = [
  { id: 'left-low-back', label: 'Back lower', position: [-3.25, 1.22, -1.7] },
  { id: 'left-low-front', label: 'Front lower', position: [-3.25, 1.22, -0.4] },
  { id: 'left-high-back', label: 'Back upper', position: [-3.25, 2.25, -1.7] },
  { id: 'left-high-front', label: 'Front upper', position: [-3.25, 2.25, -0.4] },
];
export const ROOM_FINISHES = {
  floor: {
    types: [{ id: 'planks', name: 'Wood planks' }, { id: 'stone', name: 'Stone slabs' }],
    colors: [{ id: 'honey', name: 'Honey pine', color: '#f0d4a2' }, { id: 'walnut', name: 'Walnut', color: '#b38c67' }, { id: 'slate', name: 'Slate', color: '#b8c0bf' }, { id: 'sage', name: 'Sage', color: '#b6c3a1' }],
    default: { typeId: 'planks', colorId: 'honey' },
  },
  rug: {
    types: [{ id: 'woven', name: 'Woven rug' }, { id: 'striped', name: 'Striped rug' }, { id: 'none', name: 'No rug' }],
    colors: [{ id: 'maroon', name: 'Maroon', color: '#6b3036' }, { id: 'sage', name: 'Sage', color: '#55684b' }, { id: 'indigo', name: 'Indigo', color: '#354a67' }, { id: 'gold', name: 'Gold', color: '#aa813f' }],
    default: { typeId: 'woven', colorId: 'maroon' },
  },
  wardrobe: {
    types: [{ id: 'classic', name: 'Classic wardrobe' }, { id: 'paneled', name: 'Paneled wardrobe' }],
    colors: [{ id: 'walnut', name: 'Walnut', color: '#805637' }, { id: 'honey', name: 'Honey pine', color: '#ba8951' }, { id: 'sage', name: 'Sage', color: '#6d785b' }, { id: 'clay', name: 'Clay', color: '#9a6650' }],
    default: { typeId: 'classic', colorId: 'walnut' },
  },
  shelf: {
    types: [{ id: 'plank', name: 'Plain shelf' }, { id: 'braced', name: 'Braced shelf' }],
    colors: [{ id: 'honey', name: 'Honey pine', color: '#c39b58' }, { id: 'walnut', name: 'Walnut', color: '#805637' }, { id: 'sage', name: 'Sage', color: '#6d785b' }, { id: 'clay', name: 'Clay', color: '#9a6650' }],
    default: { typeId: 'plank', colorId: 'honey' },
  },
};
const finishOf = (kind, value) => {
  const choices = ROOM_FINISHES[kind];
  return {
    typeId: choices.types.some(type => type.id === value?.typeId) ? value.typeId : choices.default.typeId,
    colorId: choices.colors.some(color => color.id === value?.colorId) ? value.colorId : choices.default.colorId,
  };
};
export const defaultShelves = () => ROOM_SHELF_IDS.slice(0, 2).map((id, i) => ({ id, spotId: ROOM_SHELF_SPOTS[i].id, ...ROOM_FINISHES.shelf.default }));
export function roomShelves(value) {
  if (!Array.isArray(value)) return defaultShelves();
  const ids = new Set(), spots = new Set();
  return value.flatMap(shelf => {
    if (!shelf || !ROOM_SHELF_IDS.includes(shelf.id) || !ROOM_SHELF_SPOTS.some(spot => spot.id === shelf.spotId)
      || ids.has(shelf.id) || spots.has(shelf.spotId)) return [];
    ids.add(shelf.id); spots.add(shelf.spotId);
    return [{ id: shelf.id, spotId: shelf.spotId, ...finishOf('shelf', shelf) }];
  });
}
export const roomFinishes = value => Object.fromEntries(['floor', 'rug', 'wardrobe'].map(kind => [kind, finishOf(kind, value?.[kind])]));
export const roomAnchors = (shelves = defaultShelves()) => ROOM_ANCHORS.filter(anchor => anchor.type !== 'shelf' || shelves.some(shelf => shelf.id === anchor.id));
const TYPES = {
  lamp: 'shelf', wagon: 'outdoor', vaccine: 'shelf', anvil: 'floor', deed: 'wall', spittoon: 'floor',
  rock: 'shelf', telegraph: 'desk', snakeoil: 'shelf', piano: 'shelf', horseshoe: 'wall', sheriffbadge: 'wall',
};
const SURFACES = { lamp: ['shelf', 'desk'], telegraph: ['desk', 'shelf'], piano: ['shelf', 'desk'] };
export const ROOM_ITEMS = ABSURD_ITEMS.map(item => ({ ...item, roomType: TYPES[item.pix], roomTypes: SURFACES[item.pix] || [TYPES[item.pix]] }));
export const ROOM_ITEM = Object.fromEntries(ROOM_ITEMS.map(item => [item.id, item]));

export const roomItemFits = (item, anchor) => !!anchor && Array.isArray(item?.roomTypes) && item.roomTypes.includes(anchor.type);

/** The pile uses broad visual stages; room details carry exact current amounts. */
export function wealthStage(total) {
  if (!Number.isFinite(total)) return null;
  if (total <= 0) return 0;
  if (total < 1000) return 1;
  if (total < 10000) return 2;
  if (total < 100000) return 3;
  if (total < 1000000) return 4;
  return 5;
}
