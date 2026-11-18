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
  // Around the rest of the house. Each rides on the fitting of the same name.
  { id: 'range', label: 'Kitchen counter', type: 'shelf' },
  { id: 'worktable', label: 'Kitchen worktable', type: 'shelf' },
  { id: 'nightstand', label: 'Nightstand', type: 'shelf' },
  { id: 'bed', label: 'Foot of the bed', type: 'floor' },
  { id: 'toilet', label: 'Toilet tank', type: 'shelf' },
  { id: 'linen', label: 'Top of the linen cupboard', type: 'shelf' },
  ...[['kitchen', 'Kitchen'], ['bedroom', 'Bedroom'], ['bath', 'Bathroom'], ['porch', 'Porch']].map(([id, room]) => ({ id: `floor-${id}`, label: `${room} floor display`, type: 'floor' })),
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
/**
 * The parlor's four walls in floor-plan units: the plane each stands on, which way its face points, and
 * its openings as [from, to, bottom, top] (windows include the projecting sill, doors their trim).
 */
export const ROOM_WALLS = {
  left: { at: -4, facing: 1, alongZ: true, openings: [] },
  back: { at: -3, facing: 1, alongZ: false, openings: [[-0.45, 1.95, 1.15, 2.98]] },
  right: { at: 4, facing: -1, alongZ: true, openings: [[-1.5, -0.22, 1.2, 2.8], [1.38, 2.34, 0, 9]] },
  front: { at: 3.27, facing: -1, alongZ: false, openings: [[-3.8, -2.6, 1.65, 3.3], [1.35, 2.65, 0, 9]] },
};
/** Scene point `out` units off a wall's face, `along` plan units along it. */
export const wallPoint = (side, along, y, out) => {
  const wall = ROOM_WALLS[side], across = wall.at * ROOM_FLOOR_SCALE + wall.facing * out;
  return wall.alongZ ? [across, y, along * ROOM_FLOOR_SCALE] : [along * ROOM_FLOOR_SCALE, y, across];
};
export const spotAlong = spot => ROOM_WALLS[spot.wallSide].alongZ ? spot.position[2] : spot.position[0];
const WALL_NAMES = { left: 'Left', back: 'Back', right: 'Right', front: 'Front' };
const wallMountGrid = (kind, wallSide, coordinates, heights) => heights.flatMap((y, row) => coordinates.map((along, column) => ({
  id: `${wallSide}-${kind}-${row + 1}-${column + 1}`, label: `${WALL_NAMES[wallSide]} wall · row ${row + 1}, position ${column + 1}`, wallSide,
  position: ROOM_WALLS[wallSide].alongZ ? [ROOM_WALLS[wallSide].at, y, along] : [along, y, ROOM_WALLS[wallSide].at],
})));
const LEFT_MOUNTS = [-2.5, -1.9, -1.25, -0.6, 0.05, 0.7, 1.35, 1.6, 2, 2.3, 2.55];
const BACK_MOUNTS = [-3.3, -2.65, -2, -1.35, -0.7, -0.05, 0.5, 1.15, 1.8, 2.35, 3, 3.4];
const RIGHT_MOUNTS = [-2.5, -1.9, -1.25, -0.6, 0.05, 0.7, 2.75];
const FRONT_MOUNTS = [-3.35, -2.05, -1.4, -0.75, -0.1, 0.55, 3, 3.45];
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
  ...wallMountGrid('shelf', 'right', RIGHT_MOUNTS, [0.4, 1.22, 1.75, 2.25]),
  ...wallMountGrid('shelf', 'front', FRONT_MOUNTS, [0.4, 1.22, 1.75, 2.25]),
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
  ...wallMountGrid('display', 'right', RIGHT_MOUNTS, [0.1, 0.7, 1.5, 2.4]),
  ...wallMountGrid('display', 'front', FRONT_MOUNTS, [0.1, 0.7, 1.5, 2.4]),
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
  // A box standing off a wall: `from`..`to` plan units along it, `depth` scene units out from its face.
  const slab = (side, from, to, [bottom, top], [near, far]) => {
    const a = wallPoint(side, from, bottom, near), b = wallPoint(side, to, top, far);
    return [a.map((v, axis) => Math.min(v, b[axis])), a.map((v, axis) => Math.max(v, b[axis]))];
  };
  const bounds = (spot, shelf) => {
    const y = spot.position[1], along = spotAlong(spot), half = (shelf ? (shelf.sizeId === 'wide' ? 1.25 : 0.45) : 0.6) / scale;
    return slab(spot.wallSide, along - half, along + half, shelf ? [y - 0.3, y + 0.7] : [y - 0.15, y + 0.95], shelf ? [0.1, 1.4] : [0.15, 0.3]);
  };
  const mounts = [...shelves.map(shelf => [ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId), shelf]),
    ...Object.values(wallDisplays).map(id => [ROOM_WALL_SPOTS.find(spot => spot.id === id), null])];
  if (mounts.some(([spot]) => !spot)) return false;
  const boxes = mounts.map(([spot, shelf]) => bounds(spot, shelf));
  const intersects = (a, b) => a[0].every((min, axis) => min < b[1][axis] - 0.01 && b[0][axis] < a[1][axis] - 0.01);
  const openings = Object.entries(ROOM_WALLS).flatMap(([side, wall]) => wall.openings.map(([from, to, bottom, top]) => slab(side, from, to, [bottom, top], [-0.1, 0.65])));
  // Side-wall mounts keep clear of the front corner; the front wall's own mounts stand on its face.
  if (boxes.some((box, i) => box[0][0] < -4 * scale + 0.08 || box[1][0] > 4 * scale - 0.08 || box[0][2] < -3 * scale + 0.08
    || box[1][2] > (mounts[i][0].wallSide === 'front' ? ROOM_WALLS.front.at : 3) * scale - 0.08 || openings.some(opening => intersects(box, opening)))) return false;
  const furnitureBoxes = furniture ? Object.keys(ROOM_FURNITURE).filter(id => !furniture[id].off && pieceArea(furniture, id) === 'parlor').map(id => {
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
  // The parlor's own walls are the room theme. Each other room paints its side of every wall it shares.
  ...Object.fromEntries([['kitchenWalls', 'butter'], ['bedroomWalls', 'rose'], ['bathroomWalls', 'sage']].map(([kind, colorId]) => [kind, {
    types: [{ id: 'wainscot', name: 'Wainscot' }, { id: 'plain', name: 'Plain plaster' }],
    colors: [{ id: 'cream', name: 'Cream', color: '#eee5cd' }, { id: 'butter', name: 'Butter', color: '#ead6ae' }, { id: 'rose', name: 'Rose', color: '#e8c9b4' },
      { id: 'sage', name: 'Sage', color: '#d6dcc1' }, { id: 'sky', name: 'Sky', color: '#cddde0' }, { id: 'clay', name: 'Clay', color: '#cf9f86' }],
    default: { typeId: 'wainscot', colorId },
  }])),
  outside: {
    types: [{ id: 'boards', name: 'Painted boards' }],
    colors: [{ id: 'weathered', name: 'Weathered pine', color: '#c4a47a' }, { id: 'barn', name: 'Barn red', color: '#9a4a3c' }, { id: 'whitewash', name: 'Whitewash', color: '#e4dcc6' },
      { id: 'sage', name: 'Sage', color: '#8d9a78' }, { id: 'sky', name: 'Faded blue', color: '#8ea6b0' }, { id: 'adobe', name: 'Adobe', color: '#c58b62' }],
    default: { typeId: 'boards', colorId: 'weathered' },
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
/** Every finish saved with the room; shelves carry their own. */
export const ROOM_FINISH_KINDS = Object.keys(ROOM_FINISHES).filter(kind => kind !== 'shelf');
export const roomFinishes = value => Object.fromEntries(ROOM_FINISH_KINDS.map(kind => [kind, finishOf(kind, value?.[kind])]));

const swatches = {
  sage: ['Sage', '#81977d'], clay: ['Clay', '#b98168'], blue: ['Sky blue', '#8aabba'],
  rust: ['Rust', '#b2684e'], indigo: ['Indigo', '#515b7c'], honey: ['Honey', '#bd976b'],
  walnut: ['Walnut', '#795d48'], slate: ['Slate', '#6c7b80'], ivory: ['Ivory', '#eee1c5'],
};
function homesteadChoices(label, area, materials, colors) {
  const types = Object.entries(materials).map(([id, name]) => ({ id, name }));
  return { label, area, types, colors: colors.map(id => ({ id, name: swatches[id][0], color: swatches[id][1] })),
    default: { typeId: types[0].id, colorId: colors[0] } };
}
/** Finishes for the rest of the house. Where each fitting stands lives with the movable furniture. */
export const ROOM_HOMESTEAD = {
  bathroom: homesteadChoices('Bathroom', 'bathroom', { checker: 'Checker tile', stone: 'Stone tile' }, ['sage', 'clay', 'blue']),
  bedroom: homesteadChoices('Bedroom', 'bunk', { planks: 'Floorboards', parquet: 'Parquet' }, ['rust', 'sage', 'indigo']),
  kitchen: homesteadChoices('Kitchen', 'kitchen', { timber: 'Timber', enamel: 'Enamel' }, ['honey', 'sage', 'slate']),
  porch: homesteadChoices('Porch', 'porch', { pine: 'Pine', cedar: 'Cedar' }, ['honey', 'walnut', 'sage']),
  bed: homesteadChoices('Bed', 'bunk', { quilt: 'Patchwork quilt', striped: 'Striped blanket' }, ['rust', 'sage', 'indigo']),
  tub: homesteadChoices('Bathtub', 'bathroom', { enamel: 'Enamel', copper: 'Copper' }, ['ivory', 'sage', 'slate']),
  porchChair: homesteadChoices('Porch chair', 'porch', { wood: 'Wood', painted: 'Painted wood' }, ['sage', 'honey', 'indigo']),
};
export const roomHomestead = value => Object.fromEntries(Object.entries(ROOM_HOMESTEAD).map(([id, choices]) => {
  const pick = (field, options) => choices[options].some(option => option.id === value?.[id]?.[field]) ? value[id][field] : choices.default[field];
  return [id, { typeId: pick('typeId', 'types'), colorId: pick('colorId', 'colors') }];
}));

/** Saved furniture coordinates use the expanded parlor and yard floor plan. */
export const ROOM_FLOOR_SCALE = Math.sqrt(3.15);
/**
 * Saved rooms carry this marker. Plan 2 was the 2.1x floor; records without one were arranged on the 1.75x floor.
 * Plan 3 had today's floor with a square deck and a paddock where the front porch and its yard are now.
 */
export const ROOM_PLAN = 4;
const PLAN_SCALE = { 2: Math.sqrt(2.1), 3: ROOM_FLOOR_SCALE };
const S = ROOM_FLOOR_SCALE, cm = n => Math.round(n * 100) / 100;
/** One inch in scene units: the 5 ft 11 in resident is 1.94 x 1.4 units tall. */
const INCH = 1.94 * 1.4 / 71;
/**
 * Movable furniture in scene units: footprint [width, depth] and default centre [x, z].
 * `floor`, `window` and `desk` share their display-spot IDs. Flat pieces may sit under others.
 */
export const ROOM_FURNITURE = {
  desk: { label: 'Writing desk', size: [1.8, 0.9], home: [cm(0.75 * S), cm(-3 * S + 1.1)], removable: true },
  pet: { label: 'Terrarium', size: [1.9, 1.3], home: [cm(-2.15 * S), cm(1.25 * S)] },
  // `also` names the other rooms a piece may be moved into, each with the spot [x, z, r] it is carried to.
  // The wardrobe stands with its back to the living room wall; the case beside the bedroom's porch window, clear of the door in.
  wardrobe: { label: 'Wardrobe', size: [1.5, 0.85], home: [cm(4 * S - 0.75), cm(-3 * S + 0.5)], removable: true, also: { bathroom: [-4, -5.9, 2] } },
  wealth: { label: 'Cash table', size: [2.2, 1.3], home: [cm(2.25 * S), cm(1.45 * S)] },
  rug: { label: 'Rug', size: [3.5, 2.1], home: [cm(0.2 * S), cm(1.3 * S)], flat: true },
  floor: { label: 'Floor display', size: [1.3, 0.9], home: [cm(-0.55 * S), cm(-0.65 * S)] },
  // `stored` pieces start put away; Add brings them out.
  'floor-2': { label: 'Floor display 2', size: [1.3, 0.9], home: [cm(1.6 * S), cm(-0.3 * S)], removable: true, stored: true },
  'floor-3': { label: 'Floor display 3', size: [1.3, 0.9], home: [cm(-2.6 * S), cm(-0.4 * S)], removable: true, stored: true },
  window: { label: 'Yard display', size: [2.8, 2.05], home: [cm(7.4 * S), cm(-0.6 * S)], yard: true },
  couch: { label: 'Couch', size: [2.4, 1], home: [cm(-1.5 * S), cm(-3 * S + 0.75)], removable: true },
  // `item` pieces are sold at the General Store and stay stored until their owner has bought one.
  case: { label: 'Display case', size: [1.96, 0.86], home: [cm(-2.4 * S), cm(-0.9 * S)], removable: true, stored: true, item: 'furn-case', also: { bunk: [5.5, -7.5, 3] } },
  poker: { label: 'Poker table', size: [2.4, 1.56], home: [cm(1.2 * S), cm(-0.4 * S)], removable: true, stored: true, item: 'furn-pokertable' },
  // The rest of the house: each fitting stays in its own `area` and takes its finish from the `style` it belongs to.
  range: { label: 'Stove & counter', size: [60 * INCH, 28 * INCH], home: [cm(1.17 * S + 15 * INCH), cm(7.05 * S - 14 * INCH)], area: 'kitchen', style: 'kitchen' },
  worktable: { label: 'Kitchen worktable', size: [42 * INCH, 24 * INCH], home: [cm(-0.61 * S), cm(5 * S)], area: 'kitchen', style: 'kitchen', removable: true },
  'floor-kitchen': { label: 'Kitchen floor display', size: [1.3, 0.9], home: [-3, 11.6], area: 'kitchen', removable: true, stored: true },
  bed: { label: 'Bed', size: [61 * INCH, 90 * INCH], home: [cm(1.15 * S), cm(-5.92 * S)], area: 'bunk', style: 'bed' },
  nightstand: { label: 'Nightstand', size: [0.41 * S, 0.44 * S], home: [cm(0.13 * S), cm(-6.62 * S)], area: 'bunk', style: 'bedroom', removable: true },
  'floor-bedroom': { label: 'Bedroom floor display', size: [1.3, 0.9], home: [5, -6.5], area: 'bunk', removable: true, stored: true },
  tub: { label: 'Bathtub', size: [72 * INCH, 36 * INCH], home: [cm(-2.24 * S), cm(-6.54 * S)], area: 'bathroom', style: 'tub' },
  toilet: { label: 'Toilet', size: [19 * INCH, 29 * INCH], home: [cm(-0.96 * S), cm(-6.62 * S)], area: 'bathroom', style: 'bathroom' },
  sink: { label: 'Washstand', size: [18 * INCH, 22 * INCH], home: [cm(-3.69 * S), cm(-3.98 * S)], area: 'bathroom', style: 'bathroom' },
  linen: { label: 'Linen cupboard', size: [19 * INCH, 42 * INCH], home: [cm(-0.79 * S), cm(-5.42 * S)], area: 'bathroom', style: 'bathroom', removable: true },
  'floor-bath': { label: 'Bathroom floor display', size: [1.3, 0.9], home: [-5, -6.6], area: 'bathroom', removable: true, stored: true },
  // Both chairs face out over the yard. The resident takes his coffee in the first; the second stands on rockers, which make it longer.
  porchChair: { label: 'Porch chair', size: [21 * INCH, 19.5 * INCH], home: [cm(4.8 * S), cm(-0.3 * S)], area: 'porch', style: 'porchChair' },
  porchChair2: { label: 'Rocking chair', size: [28 * INCH, 19.5 * INCH], home: [cm(4.8 * S), cm(-1.5 * S)], area: 'porch', style: 'porchChair', removable: true },
  plant: { label: 'Potted plant', size: [14 * INCH, 16 * INCH], home: [cm(4.45 * S), cm(3 * S)], area: 'porch', style: 'porch', removable: true },
  'floor-porch': { label: 'Porch floor display', size: [1.3, 0.9], home: [cm(4.8 * S), cm(-2.55 * S)], area: 'porch', removable: true, stored: true },
};
// Rectangles are [minX, minZ, maxX, maxZ]. The wagon stays on the lawn between the porch and the front fence, clear of the footpath.
export const ROOM_YARD = [6.4 * S, -2.8 * S, 8.4 * S, 1.6 * S];
const INDOORS = [-4 * S + 0.1, -3 * S + 0.06, 4 * S, 3.25 * S], YARD = ROOM_YARD;
const KEEP_CLEAR = [
  [-4 * S, -1.7 * S - 0.45, -4 * S + 1.4, -0.4 * S + 0.45], // under the shelf mounts
  [4 * S - 0.8, 0.8 * S, 4 * S, 2.25 * S], // the yard doorway
];
/** Inside each other room's walls, and the doorways kept clear there. */
const AREAS = {
  kitchen: { floor: [-2.35 * S + 0.15, 3.35 * S + 0.15, 3.25 * S - 0.15, 7.15 * S - 0.15], clear: [[1.41 * S, 3.35 * S, 2.59 * S, 3.35 * S + 1]] },
  bathroom: { floor: [-4 * S + 0.15, -7.05 * S + 0.15, -0.45 * S - 0.12, -3 * S - 0.12], clear: [[-0.45 * S - 1, -4.69 * S, -0.45 * S, -3.51 * S]] },
  bunk: { floor: [-0.45 * S + 0.12, -7.05 * S + 0.15, 3.55 * S - 0.15, -3 * S - 0.12], clear: [[-0.45 * S, -4.69 * S, -0.45 * S + 1, -3.51 * S]] },
  // Inside the porch rails; the swing of the yard door and the head of the steps stay clear.
  porch: { floor: [4.25 * S, -3.08 * S, 5.95 * S, 3.25 * S], clear: [[4.13 * S, 1.35 * S, 4.95 * S, 2.35 * S], [6.1 * S - 1.2, 2.38 * S, 6.1 * S, 3.28 * S]] },
};
const FLOORS = { parlor: INDOORS, ...Object.fromEntries(Object.entries(AREAS).map(([id, { floor }]) => [id, floor])) };
/** The rooms a piece may stand in, its own first. */
export const furnitureRooms = id => [ROOM_FURNITURE[id].area || 'parlor', ...Object.keys(ROOM_FURNITURE[id].also || {})];
/** The room a piece is standing in now: whichever of its rooms holds its centre. */
export function pieceArea(furniture, id) {
  if (ROOM_FURNITURE[id].yard) return 'yard';
  const { x, z } = furniture[id], rooms = furnitureRooms(id);
  return rooms.find(area => x >= FLOORS[area][0] && x <= FLOORS[area][2] && z >= FLOORS[area][1] && z <= FLOORS[area][3]) || rooms[0];
}
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
  const rect = furnitureRect(id, place, couchScale), room = pieceArea(furniture, id), area = piece.yard ? YARD : FLOORS[room];
  if (rect[0] < area[0] - SLACK || rect[1] < area[1] - SLACK || rect[2] > area[2] + SLACK || rect[3] > area[3] + SLACK) return false;
  if (piece.yard) return true;
  const solid = Object.entries(ROOM_FURNITURE).filter(([other, { flat, yard }]) => other !== id && !flat && !yard && !furniture[other].off && pieceArea(furniture, other) === room)
    .map(([other]) => furnitureRect(other, furniture[other], couchScale));
  if (room !== 'parlor') return ![...AREAS[room].clear, ...solid].some(zone => overlaps(rect, zone));
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
  // Searched round the piece's own home so the kitchen, bedroom, bathroom and porch are in reach too.
  const cx = Math.round(homeX * 4) / 4, cz = Math.round(homeZ * 4) / 4;
  for (let x = cx - reach; x <= cx + reach; x += 0.25) for (let z = cz - reach; z <= cz + reach; z += 0.25) {
    const distance = Math.hypot(x - homeX, z - homeZ);
    const candidate = { ...furniture, [id]: { ...furniture[id], x, z } };
    if ((!best || distance < best.distance) && furnitureFits(candidate, id) && wallMountsFit(shelves, wallDisplays, candidate)) best = { x, z, distance };
  }
  return best && { x: best.x, z: best.z };
}
/** A room arranged on the earlier floor: spread its furniture over the larger one and find the new couch a clear spot. */
export function upgradeFurniture(value, shelves, wallDisplays, plan) {
  const k = S / (PLAN_SCALE[plan] || Math.sqrt(1.75)), spread = {};
  for (const [id, place] of Object.entries(value && typeof value === 'object' ? value : {})) {
    const piece = ROOM_FURNITURE[id], outdoors = piece?.yard || piece?.area === 'porch';
    // The porch and yard were rebuilt: whatever stood on the old deck or in the paddock goes to its new home, still out or put away.
    if (outdoors && place && typeof place === 'object') spread[id] = { ...place, x: piece.home[0], z: piece.home[1], r: piece.yard ? place.r : 0 };
    else spread[id] = place && typeof place === 'object' ? { ...place, x: place.x * k, z: place.z * k } : place;
  }
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
  medal: 'wall', ribbonrack: 'wall', bugposter: 'wall', flipflop: 'shelf', drone: 'shelf', abalone: 'shelf', boardingpass: 'wall',
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
