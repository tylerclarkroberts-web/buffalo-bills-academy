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

/** The room and yard keep their original furniture sizes on floors scaled to 1.75x their first area. */
export const ROOM_FLOOR_SCALE = Math.sqrt(1.75);
const S = ROOM_FLOOR_SCALE, cm = n => Math.round(n * 100) / 100;
/**
 * Movable furniture in scene units: footprint [width, depth] and default centre [x, z].
 * `floor`, `window` and `desk` share their display-spot IDs. Flat pieces may sit under others.
 */
export const ROOM_FURNITURE = {
  desk: { label: 'Writing desk', size: [1.8, 0.9], home: [cm(-0.55 * S), cm(-3 * S + 1.1)], removable: true },
  pet: { label: 'Terrarium', size: [1.6, 1.15], home: [cm(-2.15 * S), cm(1.25 * S)] },
  wardrobe: { label: 'Wardrobe', size: [1.5, 0.85], home: [cm(4 * S - 0.75), cm(-3 * S + 0.5)], removable: true },
  wealth: { label: 'Cash table', size: [2.2, 1.3], home: [cm(2.25 * S), cm(1.45 * S)] },
  rug: { label: 'Rug', size: [3.5, 2.1], home: [cm(0.2 * S), cm(1.3 * S)], flat: true },
  floor: { label: 'Floor display', size: [1.3, 0.9], home: [cm(-0.55 * S), cm(-0.65 * S)] },
  window: { label: 'Yard display', size: [2.8, 2.05], home: [cm(6.2 * S), cm(-0.3 * S)], yard: true },
};
// Rectangles are [minX, minZ, maxX, maxZ]. The yard area stops short of the fence and the stepping-stone path.
const INDOORS = [-4 * S + 0.1, -3 * S + 0.06, 4 * S, 3.25 * S], YARD = [4.3 * S, -2.8 * S, 8.4 * S, 1.4 * S];
const KEEP_CLEAR = [
  [-4 * S, -1.7 * S - 0.45, -4 * S + 1.4, -0.4 * S + 0.45], // under the shelf mounts
  [4 * S - 0.8, 0.8 * S, 4 * S, 2.25 * S], // the yard doorway
];
const SLACK = 0.011;
/** The resident stands at the centre of the rug spot, wherever that is moved (even with no rug laid). */
export const residentRect = furniture => [furniture.rug.x - 0.45, furniture.rug.z - 0.35, furniture.rug.x + 0.45, furniture.rug.z + 0.35];
const overlaps = (a, b) => a[0] < b[2] - SLACK && b[0] < a[2] - SLACK && a[1] < b[3] - SLACK && b[1] < a[3] - SLACK;
export function furnitureRect(id, place) {
  const [w, d] = ROOM_FURNITURE[id].size, hw = (place.r % 2 ? d : w) / 2, hd = (place.r % 2 ? w : d) / 2;
  return [place.x - hw, place.z - hd, place.x + hw, place.z + hd];
}
/** Whether one piece stays inside its floor, clear of reserved space and of every other solid piece. */
export function furnitureFits(furniture, id) {
  const piece = ROOM_FURNITURE[id], place = furniture[id];
  if (place.off) return true;
  const rect = furnitureRect(id, place), area = piece.yard ? YARD : INDOORS;
  if (rect[0] < area[0] - SLACK || rect[1] < area[1] - SLACK || rect[2] > area[2] + SLACK || rect[3] > area[3] + SLACK) return false;
  if (piece.yard) return true;
  const solid = Object.entries(ROOM_FURNITURE).filter(([other, { flat, yard }]) => other !== id && !flat && !yard && !furniture[other].off)
    .map(([other]) => furnitureRect(other, furniture[other]));
  // A rug may lie under furniture, but the resident standing on it needs clear floor.
  if (piece.flat) return !solid.some(other => overlaps(residentRect(furniture), other));
  return ![...KEEP_CLEAR, residentRect(furniture), ...solid].some(zone => overlaps(rect, zone));
}
export const defaultFurniture = () => Object.fromEntries(Object.entries(ROOM_FURNITURE).map(([id, piece]) => [id, { x: piece.home[0], z: piece.home[1], r: 0 }]));
/** A complete, valid furniture map with defaults for omitted pieces, or null when anything supplied is unusable. */
export function furnitureValid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = defaultFurniture();
  for (const id of Object.keys(out)) {
    const place = value[id];
    if (place === undefined) continue;
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.z) || ![0, 1, 2, 3].includes(place.r)
      || !['undefined', 'boolean'].includes(typeof place.off) || (place.off && !ROOM_FURNITURE[id].removable)) return null;
    out[id] = { x: cm(place.x), z: cm(place.z), r: place.r, ...(place.off ? { off: true } : {}) };
  }
  return Object.keys(out).every(id => furnitureFits(out, id)) ? out : null;
}
export const roomFurniture = value => furnitureValid(value) || defaultFurniture();
export const roomAnchors = (shelves = defaultShelves(), furniture) => ROOM_ANCHORS.filter(anchor =>
  (anchor.type !== 'shelf' || shelves.some(shelf => shelf.id === anchor.id)) && !furniture?.[anchor.id]?.off);
const TYPES = {
  lamp: 'shelf', wagon: 'outdoor', vaccine: 'shelf', anvil: 'floor', deed: 'wall', spittoon: 'floor',
  rock: 'shelf', telegraph: 'desk', snakeoil: 'shelf', piano: 'shelf', horseshoe: 'wall', sheriffbadge: 'wall',
  bigrock: 'floor', railroad: 'wall',
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
