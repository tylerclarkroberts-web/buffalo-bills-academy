import { ROOM_FINISHES, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_SHELF_SIZES, ROOM_FURNITURE, shelfSlots, roomShelves, roomFinishes, roomFurniture, furnitureFits, freeSpot, roomWallDisplays, wallMountsFit, wallSpotAvailable } from '../../../server/catalog/room.js';

export const layoutOf = room => ({ layoutRevision: room.layoutRevision, themeId: room.themeId,
  placements: room.placements.map(place => ({ ...place })), shelves: roomShelves(room.shelves), wallDisplays: roomWallDisplays(room.wallDisplays, roomShelves(room.shelves)), finishes: roomFinishes(room.finishes), furniture: roomFurniture(room.furniture) });
export const layoutKey = room => JSON.stringify([room.themeId,
  [...room.placements].sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
  [...room.shelves].sort((a, b) => a.id.localeCompare(b.id)), roomWallDisplays(room.wallDisplays, room.shelves), room.finishes,
  Object.entries(roomFurniture(room.furniture)).map(([id, place]) => [id, place.x, place.z, place.r, !!place.off])]);

export function addShelf(layout, spotId, sizeId = 'standard') {
  if (!layout || typeof sizeId !== 'string' || !Object.hasOwn(ROOM_SHELF_SIZES, sizeId)) return layout;
  const id = ROOM_SHELF_IDS.find(value => !layout.shelves.some(shelf => shelf.id === value));
  if (id && spotId === undefined) spotId = ROOM_SHELF_SPOTS.find(spot => wallMountsFit([...layout.shelves,
    { id, spotId: spot.id, sizeId }], roomWallDisplays(layout.wallDisplays, layout.shelves), layout.furniture))?.id;
  if (!id || !ROOM_SHELF_SPOTS.some(spot => spot.id === spotId) || layout.shelves.some(shelf => shelf.spotId === spotId)) return layout;
  const shelves = [...layout.shelves, { id, spotId, ...ROOM_FINISHES.shelf.default, sizeId }];
  return wallMountsFit(shelves, roomWallDisplays(layout.wallDisplays, layout.shelves), layout.furniture) ? { ...layout, shelves } : layout;
}
export function resizeShelf(layout, id, sizeId) {
  const shelf = layout?.shelves.find(shelf => shelf.id === id);
  if (!shelf || typeof sizeId !== 'string' || !Object.hasOwn(ROOM_SHELF_SIZES, sizeId) || (shelf.sizeId || 'standard') === sizeId) return layout;
  const resized = { ...shelf, sizeId }, shelves = layout.shelves.map(value => value.id === id ? resized : value);
  if (!wallMountsFit(shelves, roomWallDisplays(layout.wallDisplays, layout.shelves), layout.furniture)) return layout;
  const removedSlots = shelfSlots(shelf).filter(slot => !shelfSlots(resized).some(next => next.id === slot.id)).map(slot => slot.id);
  return { ...layout, shelves, placements: layout.placements.filter(place => !removedSlots.includes(place.anchorId)) };
}
export function moveShelf(layout, id, spotId) {
  if (!layout?.shelves.some(shelf => shelf.id === id && shelf.spotId !== spotId)
    || !ROOM_SHELF_SPOTS.some(spot => spot.id === spotId) || layout.shelves.some(shelf => shelf.spotId === spotId)) return layout;
  const shelves = layout.shelves.map(shelf => shelf.id === id ? { ...shelf, spotId } : shelf);
  return wallMountsFit(shelves, roomWallDisplays(layout.wallDisplays, layout.shelves), layout.furniture) ? { ...layout, shelves } : layout;
}
export function moveWallDisplay(layout, id, spotId) {
  if (!layout) return layout;
  const wallDisplays = roomWallDisplays(layout.wallDisplays, layout.shelves);
  if (wallDisplays[id] === spotId || !wallSpotAvailable(layout.shelves, wallDisplays, id, spotId, layout.furniture)) return layout;
  return { ...layout, wallDisplays: { ...wallDisplays, [id]: spotId } };
}
export function removeShelf(layout, id) {
  const shelf = layout.shelves.find(shelf => shelf.id === id);
  if (!shelf) return layout;
  const slots = shelfSlots(shelf).map(slot => slot.id);
  return { ...layout, shelves: layout.shelves.filter(shelf => shelf.id !== id), placements: layout.placements.filter(place => !slots.includes(place.anchorId)) };
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
/** Move, turn (`r`), store (`off: true`) or restore (`off: false`) one piece; unchanged when it would not fit. */
export function placeFurniture(layout, id, change) {
  if (!layout?.furniture || !Object.hasOwn(ROOM_FURNITURE, id) || (change.off && !ROOM_FURNITURE[id].removable)) return layout;
  const { off, ...place } = { ...layout.furniture[id], ...change };
  let furniture = { ...layout.furniture, [id]: off ? { ...place, off: true } : place };
  const wallDisplays = roomWallDisplays(layout.wallDisplays, layout.shelves);
  if (!furnitureFits(furniture, id) || !wallMountsFit(layout.shelves, wallDisplays, furniture)) {
    const spot = change.off === false && freeSpot(furniture, id, layout.shelves, wallDisplays);
    if (!spot) return layout;
    furniture = { ...furniture, [id]: { ...place, ...spot } };
  }
  return { ...layout, furniture, placements: off ? layout.placements.filter(item => item.anchorId !== id) : layout.placements };
}
