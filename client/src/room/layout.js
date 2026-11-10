import { ROOM_FINISHES, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_FURNITURE, roomShelves, roomFinishes, roomFurniture, furnitureFits } from '../../../server/catalog/room.js';

export const layoutOf = room => ({ layoutRevision: room.layoutRevision, themeId: room.themeId,
  placements: room.placements.map(place => ({ ...place })), shelves: roomShelves(room.shelves), finishes: roomFinishes(room.finishes), furniture: roomFurniture(room.furniture) });
export const layoutKey = room => JSON.stringify([room.themeId,
  [...room.placements].sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
  [...room.shelves].sort((a, b) => a.id.localeCompare(b.id)), room.finishes,
  Object.entries(roomFurniture(room.furniture)).map(([id, place]) => [id, place.x, place.z, place.r, !!place.off])]);

export function addShelf(layout, spotId) {
  const id = ROOM_SHELF_IDS.find(value => !layout.shelves.some(shelf => shelf.id === value));
  if (!id || !ROOM_SHELF_SPOTS.some(spot => spot.id === spotId) || layout.shelves.some(shelf => shelf.spotId === spotId)) return layout;
  return { ...layout, shelves: [...layout.shelves, { id, spotId, ...ROOM_FINISHES.shelf.default }] };
}
export function moveShelf(layout, id, spotId) {
  if (!layout?.shelves.some(shelf => shelf.id === id && shelf.spotId !== spotId)
    || !ROOM_SHELF_SPOTS.some(spot => spot.id === spotId) || layout.shelves.some(shelf => shelf.spotId === spotId)) return layout;
  return { ...layout, shelves: layout.shelves.map(shelf => shelf.id === id ? { ...shelf, spotId } : shelf) };
}
export function removeShelf(layout, id) {
  if (!layout.shelves.some(shelf => shelf.id === id)) return layout;
  return { ...layout, shelves: layout.shelves.filter(shelf => shelf.id !== id), placements: layout.placements.filter(place => place.anchorId !== id) };
}
export function changeStyle(layout, kind, field, value, shelfId) {
  const options = ROOM_FINISHES[kind];
  if (!options || !['typeId', 'colorId'].includes(field) || !options[field === 'typeId' ? 'types' : 'colors'].some(option => option.id === value)) return layout;
  if (kind === 'shelf') return { ...layout, shelves: layout.shelves.map(shelf => shelf.id === shelfId ? { ...shelf, [field]: value } : shelf) };
  return { ...layout, finishes: { ...layout.finishes, [kind]: { ...layout.finishes[kind], [field]: value } } };
}

/** The movable piece behind a scene or panel selection, if any. */
export const furnitureOf = selection => {
  const id = selection?.kind === 'anchor' ? selection.anchorId : selection?.kind === 'surface' ? selection.surface : selection?.kind;
  return id !== 'floor' || selection.kind === 'anchor' ? (Object.hasOwn(ROOM_FURNITURE, id) ? id : null) : null;
};
/** Nearest free quarter-unit spot to a piece's default position, for putting stored furniture back. */
function freeSpot(furniture, id) {
  const [homeX, homeZ] = ROOM_FURNITURE[id].home;
  let best = null;
  for (let x = -5.25; x <= 5.25; x += 0.25) for (let z = -4; z <= 4.25; z += 0.25) {
    const distance = Math.hypot(x - homeX, z - homeZ);
    if ((!best || distance < best.distance) && furnitureFits({ ...furniture, [id]: { ...furniture[id], x, z } }, id)) best = { x, z, distance };
  }
  return best && { x: best.x, z: best.z };
}
/** Move, turn (`r`), store (`off: true`) or restore (`off: false`) one piece; unchanged when it would not fit. */
export function placeFurniture(layout, id, change) {
  if (!layout?.furniture || !Object.hasOwn(ROOM_FURNITURE, id) || (change.off && !ROOM_FURNITURE[id].removable)) return layout;
  const { off, ...place } = { ...layout.furniture[id], ...change };
  let furniture = { ...layout.furniture, [id]: off ? { ...place, off: true } : place };
  if (!furnitureFits(furniture, id)) {
    const spot = change.off === false && freeSpot(furniture, id);
    if (!spot) return layout;
    furniture = { ...furniture, [id]: { ...place, ...spot } };
  }
  return { ...layout, furniture, placements: off ? layout.placements.filter(item => item.anchorId !== id) : layout.placements };
}
