import { ABSURD_ITEMS, FURNITURE_ITEMS } from './gags.js';

export const ROOM_ANCHORS = [
  { id: 'wall-left', label: 'Wall display 1', type: 'wall' },
  { id: 'wall-right', label: 'Wall display 2', type: 'wall' },
  ...[3, 4, 5, 6].map(n => ({ id: `wall-${n}`, label: `Wall display ${n}`, type: 'wall' })),
  { id: 'shelf-left', label: 'Shelf 1', type: 'shelf' },
  { id: 'shelf-right', label: 'Shelf 2', type: 'shelf' },
  { id: 'shelf-3', label: 'Shelf 3', type: 'shelf' },
  { id: 'shelf-4', label: 'Shelf 4', type: 'shelf' },
  { id: 'shelf-5', label: 'Shelf 5', type: 'shelf' },
  { id: 'shelf-6', label: 'Shelf 6', type: 'shelf' },
  { id: 'desk', label: 'Writing desk', type: 'desk' },
  { id: 'floor', label: 'Floor', type: 'floor' },
  { id: 'floor-2', label: 'Floor display 2', type: 'floor' },
  { id: 'floor-3', label: 'Floor display 3', type: 'floor' },
  { id: 'sill', label: 'Window sill', type: 'shelf' },
  // `on` names the furniture a spot rides on: it moves with that piece and goes away when the piece is stored.
  { id: 'wardrobe-top', label: 'Top of the wardrobe', type: 'shelf', on: 'wardrobe' },
  ...[1, 2, 3].map(n => ({ id: n > 1 ? `case-${n}` : 'case', label: `Display case · ${n}`, type: 'shelf', on: 'case' })),
  { id: 'window', label: 'Yard', type: 'outdoor' },
];
/** The furniture a display spot rides on; most spots are their own piece. */
export const anchorHost = id => ROOM_ANCHORS.find(anchor => anchor.id === id)?.on || id;
export const ROOM_THEMES = [
  { id: 'bunkhouse-timber', name: 'Warm timber' },
  { id: 'bunkhouse-sage', name: 'Sage wash' },
  { id: 'bunkhouse-clay', name: 'Clay walls' },
];
export const ROOM_SHELF_IDS = ['shelf-left', 'shelf-right', 'shelf-3', 'shelf-4', 'shelf-5', 'shelf-6'];
export const ROOM_SHELF_SIZES = {
  standard: { label: 'Standard', width: 1.25, depth: 0.8, capacity: 1 },
  wide: { label: 'Wide', width: 1.25, depth: 2.4, capacity: 3 },
};
export function shelfSlots(shelf) {
  if (!shelf || !ROOM_SHELF_IDS.includes(shelf.id)) return [];
  const label = ROOM_ANCHORS.find(anchor => anchor.id === shelf.id).label, wide = shelf.sizeId === 'wide';
  return (wide ? [0, -0.8, 0.8] : [0]).map((offset, i) => ({ id: i ? `${shelf.id}-slot-${i + 1}` : shelf.id, offset, label: wide ? `${label} · ${i + 1}` : label }));
}
export const shelfForAnchor = (shelves, anchorId) => shelves.find(shelf => shelfSlots(shelf).some(slot => slot.id === anchorId));
const wallMountGrid = (kind, wallSide, coordinates, heights) => heights.flatMap((y, row) => coordinates.map((along, column) => ({
  id: `${wallSide}-${kind}-${row + 1}-${column + 1}`, label: `${wallSide === 'left' ? 'Left' : 'Back'} wall · row ${row + 1}, position ${column + 1}`, wallSide,
  position: wallSide === 'left' ? [kind === 'shelf' ? -3.25 : -3.81, y, along] : [along, y, kind === 'shelf' ? -2.25 : -2.81],
})));
const LEFT_MOUNTS = [-2.5, -1.9, -1.25, -0.6, 0.05, 0.7, 1.35, 1.6, 2, 2.3, 2.55];
const BACK_MOUNTS = [-3.3, -2.65, -2, -1.35, -0.7, -0.05, 0.5, 1.15, 1.8, 2.35, 3, 3.4];
export const ROOM_SHELF_SPOTS = [
  { id: 'left-low-back', label: 'Left wall · back lower', wallSide: 'left', position: [-3.25, 1.22, -1.7] },
  { id: 'left-low-front', label: 'Left wall · middle lower', wallSide: 'left', position: [-3.25, 1.22, -0.4] },
  { id: 'left-high-back', label: 'Left wall · back upper', wallSide: 'left', position: [-3.25, 2.25, -1.7] },
  { id: 'left-high-front', label: 'Left wall · middle upper', wallSide: 'left', position: [-3.25, 2.25, -0.4] },
  { id: 'left-low-door', label: 'Left wall · front lower', wallSide: 'left', position: [-3.25, 1.22, 0.9] },
  { id: 'left-high-door', label: 'Left wall · front upper', wallSide: 'left', position: [-3.25, 2.25, 0.9] },
  { id: 'left-low-corner', label: 'Left wall · corner lower', wallSide: 'left', position: [-3.25, 1.22, -2.55] },
  { id: 'left-high-corner', label: 'Left wall · corner upper', wallSide: 'left', position: [-3.25, 2.25, -2.55] },
  { id: 'back-low-left', label: 'Back wall · left lower', wallSide: 'back', position: [-2.5, 1.22, -2.25] },
  { id: 'back-high-left', label: 'Back wall · left upper', wallSide: 'back', position: [-2.5, 2.25, -2.25] },
  { id: 'back-low-right', label: 'Back wall · right lower', wallSide: 'back', position: [-1.3, 1.22, -2.25] },
  { id: 'back-high-right', label: 'Back wall · right upper', wallSide: 'back', position: [-1.3, 2.25, -2.25] },
  ...wallMountGrid('shelf', 'left', LEFT_MOUNTS, [0.4, 1.22, 1.75, 2.25]),
  ...wallMountGrid('shelf', 'back', BACK_MOUNTS, [0.4, 1.22, 1.75, 2.25]),
];
export const ROOM_WALL_SPOTS = [
  { id: 'back-high-left', label: 'Back wall · left upper', wallSide: 'back', position: [-2.9, 2.55, -2.81] },
  { id: 'back-high-right', label: 'Back wall · right upper', wallSide: 'back', position: [-1.25, 2.55, -2.81] },
  { id: 'back-low-left', label: 'Back wall · left lower', wallSide: 'back', position: [-2.9, 1.15, -2.81] },
  { id: 'back-low-right', label: 'Back wall · right lower', wallSide: 'back', position: [-1.25, 1.15, -2.81] },
  { id: 'left-low-corner', label: 'Left wall · corner lower', wallSide: 'left', position: [-3.81, 1.15, -2.55] },
  { id: 'left-high-corner', label: 'Left wall · corner upper', wallSide: 'left', position: [-3.81, 2.4, -2.55] },
  { id: 'left-low-front', label: 'Left wall · front lower', wallSide: 'left', position: [-3.81, 1.15, 0.9] },
  { id: 'left-high-front', label: 'Left wall · front upper', wallSide: 'left', position: [-3.81, 2.4, 0.9] },
  ...wallMountGrid('display', 'left', LEFT_MOUNTS, [0.1, 0.7, 1.5, 2.4]),
  ...wallMountGrid('display', 'back', BACK_MOUNTS, [0.1, 0.7, 1.5, 2.4]),
];
/** The first two wall displays are always up; the rest are hung and taken down by the owner. */
export const ROOM_WALL_IDS = ROOM_ANCHORS.filter(anchor => anchor.type === 'wall').map(anchor => anchor.id);
export const defaultWallDisplays = () => ({ 'wall-left': 'back-high-left', 'wall-right': 'back-high-right' });
export function roomWallDisplays(value, shelves = []) {
  const result = {};
  for (const [id, fallback] of Object.entries(defaultWallDisplays())) {
    const candidates = [value?.[id], fallback, ...ROOM_WALL_SPOTS.map(spot => spot.id)];
    result[id] = candidates.find(spotId => ROOM_WALL_SPOTS.some(spot => spot.id === spotId)
      && wallMountsFit(shelves, { ...result, [id]: spotId })) || fallback;
  }
  for (const id of ROOM_WALL_IDS) {
    if (!result[id] && ROOM_WALL_SPOTS.some(spot => spot.id === value?.[id]) && wallMountsFit(shelves, { ...result, [id]: value[id] })) result[id] = value[id];
  }
  return result;
}
/** Fixed wall footprints keep shelves, their contents and framed displays clear, including corners. */
export function wallMountsFit(shelves, wallDisplays, furniture, couchScale) {
  const scale = ROOM_FLOOR_SCALE;
  const bounds = (spot, shelf) => {
    const [x, y, z] = spot.position, half = shelf ? (shelf.sizeId === 'wide' ? 1.25 : 0.45) : 0.6;
    const depth = shelf ? [0.1, 1.4] : [0.15, 0.3], height = shelf ? [-0.3, 0.7] : [-0.15, 0.95];
    return spot.wallSide === 'left'
      ? [[-4 * scale + depth[0], y + height[0], z * scale - half], [-4 * scale + depth[1], y + height[1], z * scale + half]]
      : [[x * scale - half, y + height[0], -3 * scale + depth[0]], [x * scale + half, y + height[1], -3 * scale + depth[1]]];
  };
  const mounts = [...shelves.map(shelf => [ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId), shelf]),
    ...Object.values(wallDisplays).map(id => [ROOM_WALL_SPOTS.find(spot => spot.id === id), null])];
  if (mounts.some(([spot]) => !spot)) return false;
  const boxes = mounts.map(([spot, shelf]) => bounds(spot, shelf));
  const intersects = (a, b) => a[0].every((min, axis) => min < b[1][axis] - 0.01 && b[0][axis] < a[1][axis] - 0.01);
  // Include the lower window apron and projecting sill, not just its glass opening.
  const window = [[-0.45 * scale, 1.15, -3 * scale], [1.95 * scale, 2.98, -3 * scale + 0.65]];
  if (boxes.some(box => box[0][0] < -4 * scale + 0.08 || box[1][0] > 4 * scale - 0.08
    || box[0][2] < -3 * scale + 0.08 || box[1][2] > 3 * scale - 0.08 || intersects(box, window))) return false;
  const furnitureBoxes = furniture ? Object.entries(ROOM_FURNITURE).filter(([id, piece]) => !piece.yard && !furniture[id].off).map(([id]) => {
    const place = furniture[id], rect = id === 'rug' ? residentRect(furniture) : furnitureRect(id, place, couchScale);
    // Include wardrobe trim/handles, desk decorations and the taller resident's hat, regardless of current styling.
    const pad = id === 'wardrobe' ? [0.075, 0.175] : id === 'desk' ? [0, 0.075] : [0, 0];
    if (place.r % 2) pad.reverse();
    const height = { wardrobe: 2.6, pet: 1.8, wealth: 1.8, desk: 1.7, rug: 2.95, couch: 1.15 * (couchScale?.[1] ?? 1), case: 1.85, poker: 1.4 }[id] ?? 0.9;
    return [[rect[0] - pad[0], 0, rect[1] - pad[1]], [rect[2] + pad[0], height, rect[3] + pad[1]]];
  }) : [];
  return boxes.every((a, i) => boxes.slice(i + 1).every(b => !intersects(a, b)) && furnitureBoxes.every(b => !intersects(a, b)));
}
export const wallSpotAvailable = (shelves, wallDisplays, id, spotId, furniture) => ROOM_WALL_IDS.includes(id)
  && ROOM_WALL_SPOTS.some(spot => spot.id === spotId) && wallMountsFit(shelves, { ...wallDisplays, [id]: spotId }, furniture);
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
  couch: {
    types: [{ id: 'settee', name: 'Tufted settee' }, { id: 'bench', name: 'Bunkhouse bench' }],
    colors: [{ id: 'oxblood', name: 'Oxblood', color: '#7c3a3a' }, { id: 'sage', name: 'Sage', color: '#66755a' }, { id: 'indigo', name: 'Indigo', color: '#3d5273' }, { id: 'saddle', name: 'Saddle tan', color: '#a8743f' }],
    default: { typeId: 'settee', colorId: 'oxblood' },
  },
  fence: {
    types: [{ id: 'splitrail', name: 'Split rail' }, { id: 'picket', name: 'Pickets' }, { id: 'wire', name: 'Ranch wire' }],
    colors: [{ id: 'weathered', name: 'Weathered wood', color: '#ae956b' }, { id: 'walnut', name: 'Walnut', color: '#77563d' }, { id: 'whitewash', name: 'Whitewash', color: '#dfd9b9' }],
    default: { typeId: 'splitrail', colorId: 'weathered' },
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
    return [{ id: shelf.id, spotId: shelf.spotId, ...finishOf('shelf', shelf), ...(typeof shelf.sizeId === 'string' && Object.hasOwn(ROOM_SHELF_SIZES, shelf.sizeId) ? { sizeId: shelf.sizeId } : {}) }];
  });
}
export const roomFinishes = value => Object.fromEntries(['floor', 'rug', 'wardrobe', 'couch', 'fence'].map(kind => [kind, finishOf(kind, value?.[kind])]));

const swatches = {
  sage: ['Sage', '#81977d'], clay: ['Clay', '#b98168'], blue: ['Sky blue', '#8aabba'],
  rust: ['Rust', '#b2684e'], indigo: ['Indigo', '#515b7c'], honey: ['Honey', '#bd976b'],
  walnut: ['Walnut', '#795d48'], slate: ['Slate', '#6c7b80'], ivory: ['Ivory', '#eee1c5'],
};
function homesteadChoices(label, area, materials, colors, classic, alternate) {
  const types = Object.entries(materials).map(([id, name]) => ({ id, name }));
  return { label, area, types, colors: colors.map(id => ({ id, name: swatches[id][0], color: swatches[id][1] })),
    layouts: [{ id: 'classic', name: classic }, { id: 'alternate', name: alternate }],
    default: { typeId: types[0].id, colorId: colors[0], layoutId: 'classic' } };
}
export const ROOM_HOMESTEAD = {
  bathroom: homesteadChoices('Bathroom', 'bathroom', { checker: 'Checker tile', stone: 'Stone tile' }, ['sage', 'clay', 'blue'], 'Cupboard by the bedroom wall', 'Cupboard by the parlor wall'),
  bedroom: homesteadChoices('Bedroom', 'bunk', { planks: 'Floorboards', parquet: 'Parquet' }, ['rust', 'sage', 'indigo'], 'Nightstand left of bed', 'Nightstand right of bed'),
  kitchen: homesteadChoices('Kitchen', 'kitchen', { timber: 'Timber', enamel: 'Enamel' }, ['honey', 'sage', 'slate'], 'Range at the front', 'Range at the rear'),
  porch: homesteadChoices('Porch', 'porch', { pine: 'Pine', cedar: 'Cedar' }, ['honey', 'walnut', 'sage'], 'Plant by the house', 'Plant by the steps'),
  bed: homesteadChoices('Bed', 'bunk', { quilt: 'Patchwork quilt', striped: 'Striped blanket' }, ['rust', 'sage', 'indigo'], 'Side window', 'Porch window'),
  tub: homesteadChoices('Bathtub', 'bathroom', { enamel: 'Enamel', copper: 'Copper' }, ['ivory', 'sage', 'slate'], 'Under the side window', 'Along the rear wall'),
  porchChair: homesteadChoices('Porch chair', 'porch', { wood: 'Wood', painted: 'Painted wood' }, ['sage', 'honey', 'indigo'], 'By the steps', 'By the house'),
};
export const roomHomestead = value => Object.fromEntries(Object.entries(ROOM_HOMESTEAD).map(([id, choices]) => {
  const pick = (field, options) => choices[options].some(option => option.id === value?.[id]?.[field]) ? value[id][field] : choices.default[field];
  return [id, { typeId: pick('typeId', 'types'), colorId: pick('colorId', 'colors'), layoutId: pick('layoutId', 'layouts') }];
}));

/** Saved furniture coordinates use the expanded parlor and yard floor plan. */
export const ROOM_FLOOR_SCALE = Math.sqrt(3.15);
/** Saved rooms carry this marker. Plan 2 was the 2.1x floor; records without one were arranged on the 1.75x floor. */
export const ROOM_PLAN = 3;
const PLAN_SCALE = { 2: Math.sqrt(2.1) };
const S = ROOM_FLOOR_SCALE, cm = n => Math.round(n * 100) / 100;
/**
 * Movable furniture in scene units: footprint [width, depth] and default centre [x, z].
 * `floor`, `window` and `desk` share their display-spot IDs. Flat pieces may sit under others.
 */
export const ROOM_FURNITURE = {
  desk: { label: 'Writing desk', size: [1.8, 0.9], home: [cm(0.75 * S), cm(-3 * S + 1.1)], removable: true },
  pet: { label: 'Terrarium', size: [1.9, 1.3], home: [cm(-2.15 * S), cm(1.25 * S)] },
  wardrobe: { label: 'Wardrobe', size: [1.5, 0.85], home: [cm(4 * S - 0.75), cm(-3 * S + 0.5)], removable: true },
  wealth: { label: 'Cash table', size: [2.2, 1.3], home: [cm(2.25 * S), cm(1.45 * S)] },
  rug: { label: 'Rug', size: [3.5, 2.1], home: [cm(0.2 * S), cm(1.3 * S)], flat: true },
  floor: { label: 'Floor display', size: [1.3, 0.9], home: [cm(-0.55 * S), cm(-0.65 * S)] },
  // `stored` pieces start put away; Add brings them out.
  'floor-2': { label: 'Floor display 2', size: [1.3, 0.9], home: [cm(1.6 * S), cm(-0.3 * S)], removable: true, stored: true },
  'floor-3': { label: 'Floor display 3', size: [1.3, 0.9], home: [cm(-2.6 * S), cm(-0.4 * S)], removable: true, stored: true },
  window: { label: 'Yard display', size: [2.8, 2.05], home: [cm(6.2 * S), cm(-0.3 * S)], yard: true },
  couch: { label: 'Couch', size: [2.4, 1], home: [cm(-1.5 * S), cm(-3 * S + 0.75)], removable: true },
  // `item` pieces are sold at the General Store and stay stored until their owner has bought one.
  case: { label: 'Display case', size: [1.96, 0.86], home: [cm(-2.4 * S), cm(-0.9 * S)], removable: true, stored: true, item: 'furn-case' },
  poker: { label: 'Poker table', size: [2.4, 1.56], home: [cm(1.2 * S), cm(-0.4 * S)], removable: true, stored: true, item: 'furn-pokertable' },
};
// Rectangles are [minX, minZ, maxX, maxZ]. The wagon stays in its paddock, clear of the deck.
const INDOORS = [-4 * S + 0.1, -3 * S + 0.06, 4 * S, 3.25 * S], YARD = [4.3 * S, -2.8 * S, 8.4 * S, 1.4 * S];
const KEEP_CLEAR = [
  [-4 * S, -1.7 * S - 0.45, -4 * S + 1.4, -0.4 * S + 0.45], // under the shelf mounts
  [4 * S - 0.8, 0.8 * S, 4 * S, 2.25 * S], // the yard doorway
];
const SLACK = 0.011;
/** The resident stands at the centre of the rug spot, wherever that is moved (even with no rug laid). */
export const residentRect = furniture => [furniture.rug.x - 0.45, furniture.rug.z - 0.35, furniture.rug.x + 0.45, furniture.rug.z + 0.35];
const overlaps = (a, b) => a[0] < b[2] - SLACK && b[0] < a[2] - SLACK && a[1] < b[3] - SLACK && b[1] < a[3] - SLACK;
export function furnitureRect(id, place, couchScale) {
  let [w, d] = ROOM_FURNITURE[id].size;
  if (id === 'couch' && couchScale) { w *= couchScale[0]; d *= couchScale[2]; }
  const hw = (place.r % 2 ? d : w) / 2, hd = (place.r % 2 ? w : d) / 2;
  return [place.x - hw, place.z - hd, place.x + hw, place.z + hd];
}
/** Whether one piece stays inside its floor, clear of reserved space and of every other solid piece. */
export function furnitureFits(furniture, id, couchScale) {
  const piece = ROOM_FURNITURE[id], place = furniture[id];
  if (place.off) return true;
  const rect = furnitureRect(id, place, couchScale), area = piece.yard ? YARD : INDOORS;
  if (rect[0] < area[0] - SLACK || rect[1] < area[1] - SLACK || rect[2] > area[2] + SLACK || rect[3] > area[3] + SLACK) return false;
  if (piece.yard) return true;
  const solid = Object.entries(ROOM_FURNITURE).filter(([other, { flat, yard }]) => other !== id && !flat && !yard && !furniture[other].off)
    .map(([other]) => furnitureRect(other, furniture[other], couchScale));
  // A rug may lie under furniture, but the resident standing on it needs clear floor.
  if (piece.flat) return !solid.some(other => overlaps(residentRect(furniture), other));
  return ![...KEEP_CLEAR, residentRect(furniture), ...solid].some(zone => overlaps(rect, zone));
}
/** Grow the settee where it fits. Older rooms may have a wall shelf or another piece right up against it. */
export function roomCouchScale(furniture, shelves = defaultShelves(), wallDisplays = roomWallDisplays(undefined, shelves)) {
  for (const scale of [[1.3, 1.16, 1.25], [1.3, 1.16, 1.05]]) {
    if (furnitureFits(furniture, 'couch', scale) && wallMountsFit(shelves, wallDisplays, furniture, scale)) return scale;
  }
  return [1, 1, 1];
}
export const defaultFurniture = () => Object.fromEntries(Object.entries(ROOM_FURNITURE).map(([id, piece]) => [id, { x: piece.home[0], z: piece.home[1], r: 0, ...(piece.stored ? { off: true } : {}) }]));
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
/** Nearest free quarter-unit spot to a piece's default position (or `near`), for putting stored furniture back. */
export function freeSpot(furniture, id, shelves, wallDisplays, near = ROOM_FURNITURE[id].home) {
  const [homeX, homeZ] = near, reach = Math.ceil(4 * S * 4) / 4;
  let best = null;
  for (let x = -reach; x <= reach; x += 0.25) for (let z = -reach; z <= reach; z += 0.25) {
    const distance = Math.hypot(x - homeX, z - homeZ);
    const candidate = { ...furniture, [id]: { ...furniture[id], x, z } };
    if ((!best || distance < best.distance) && furnitureFits(candidate, id) && wallMountsFit(shelves, wallDisplays, candidate)) best = { x, z, distance };
  }
  return best && { x: best.x, z: best.z };
}
/** A room arranged on the earlier floor: spread its furniture over the larger one and find the new couch a clear spot. */
export function upgradeFurniture(value, shelves, wallDisplays, plan) {
  const k = S / (PLAN_SCALE[plan] || Math.sqrt(1.75)), spread = {};
  for (const [id, place] of Object.entries(value && typeof value === 'object' ? value : {})) spread[id] = place && typeof place === 'object' ? { ...place, x: place.x * k, z: place.z * k } : place;
  const [x, z] = ROOM_FURNITURE.couch.home, furniture = furnitureValid(spread);
  if (furniture && wallMountsFit(shelves, wallDisplays, furniture)) return furniture;
  let stored = furnitureValid({ ...spread, couch: { x, z, r: 0, off: true } });
  if (!stored && Number.isFinite(spread.pet?.x) && Number.isFinite(spread.pet?.z)) {
    // The terrarium is wider than it was: shuffle it to the nearest clear floor rather than resetting the room.
    const rest = furnitureValid({ ...spread, couch: { x, z, r: 0, off: true }, pet: undefined });
    const spot = rest && freeSpot(rest, 'pet', shelves, wallDisplays, [spread.pet.x, spread.pet.z]);
    if (spot) stored = { ...rest, pet: { ...rest.pet, ...spot } };
  }
  if (!stored) return defaultFurniture();
  const spot = freeSpot({ ...stored, couch: { x, z, r: 0 } }, 'couch', shelves, wallDisplays);
  return spot ? { ...stored, couch: { ...spot, r: 0 } } : stored;
}
export const roomAnchors = (shelves = defaultShelves(), furniture = defaultFurniture(), wallDisplays = defaultWallDisplays()) => ROOM_ANCHORS.flatMap(anchor => {
  if (furniture[anchor.on || anchor.id]?.off || (anchor.type === 'wall' && !wallDisplays[anchor.id])) return [];
  if (!ROOM_SHELF_IDS.includes(anchor.id)) return [anchor];
  const shelf = shelves.find(shelf => shelf.id === anchor.id);
  return shelfSlots(shelf).map((slot, slotIndex) => ({ id: slot.id, label: slot.label, type: 'shelf', shelfId: shelf.id, slotIndex }));
});
const TYPES = {
  lamp: 'shelf', wagon: 'outdoor', vaccine: 'shelf', anvil: 'floor', deed: 'wall', spittoon: 'floor',
  rock: 'shelf', telegraph: 'desk', snakeoil: 'shelf', piano: 'shelf', horseshoe: 'wall', sheriffbadge: 'wall',
  bigrock: 'floor', railroad: 'wall', charter: 'wall', skull: 'wall', pickaxe: 'floor',
  jackolantern: 'shelf', ghost: 'floor', cornucopia: 'shelf', turkey: 'floor', stocking: 'wall', tumbletree: 'floor',
  medal: 'wall', flipflop: 'shelf', drone: 'shelf', abalone: 'shelf', boardingpass: 'wall',
};
// Anything small enough for a shelf also sits on the desk.
const SURFACES = { telegraph: ['desk', 'shelf'], turkey: ['floor', 'desk'], tumbletree: ['floor', 'desk'] };
/** Store items that are furniture rather than something to display. */
export const ROOM_FURNITURE_ITEMS = FURNITURE_ITEMS.map(item => item.id);
/** Stored pieces the owner has not bought stay stored, along with anything saved on them. */
export const ownedFurniture = (furniture, owned) => Object.fromEntries(Object.entries(furniture).map(([id, place]) => [id, ROOM_FURNITURE[id].item && !owned.has(ROOM_FURNITURE[id].item) ? { ...place, off: true } : place]));
export const ROOM_ITEMS = ABSURD_ITEMS.map(item => ({ ...item, roomType: TYPES[item.pix], roomTypes: SURFACES[item.pix] || (TYPES[item.pix] === 'shelf' ? ['shelf', 'desk'] : [TYPES[item.pix]]) }));
export const ROOM_ITEM = Object.fromEntries(ROOM_ITEMS.map(item => [item.id, item]));

export const roomItemFits = (item, anchor) => !!anchor && Array.isArray(item?.roomTypes) && item.roomTypes.includes(anchor.type);

/** A broad stage of total wealth. The tray draws exact cash and chips; it uses this only to tell known from unknown. */
export function wealthStage(total) {
  if (!Number.isFinite(total)) return null;
  if (total <= 0) return 0;
  if (total < 1000) return 1;
  if (total < 10000) return 2;
  if (total < 100000) return 3;
  if (total < 1000000) return 4;
  return 5;
}
