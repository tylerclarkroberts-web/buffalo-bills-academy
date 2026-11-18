import { ROOM_ANCHORS, anchorHost, ROOM_WALL_IDS, ROOM_WALL_SPOTS, defaultWallDisplays, ROOM_FINISHES, ROOM_HOMESTEAD, roomHomestead, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_SHELF_SIZES, ROOM_FURNITURE, shelfSlots, roomShelves, roomFinishes, roomFurniture, furnitureFits, freeSpot, furnitureRooms, pieceArea, roomWallDisplays, wallMountsFit, wallSpotAvailable } from '../../../server/catalog/room.js';

export const layoutOf = room => ({ layoutRevision: room.layoutRevision, themeId: room.themeId,
  placements: room.placements.map(place => ({ ...place })), shelves: roomShelves(room.shelves), wallDisplays: roomWallDisplays(room.wallDisplays, roomShelves(room.shelves)), finishes: roomFinishes(room.finishes), furniture: roomFurniture(room.furniture), homestead: roomHomestead(room.homestead) });
export const layoutKey = room => JSON.stringify([room.themeId,
  [...room.placements].sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
  [...room.shelves].sort((a, b) => a.id.localeCompare(b.id)), roomWallDisplays(room.wallDisplays, room.shelves), roomFinishes(room.finishes), roomHomestead(room.homestead),
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
/** Hang one more wall display in the first clear spot; unchanged when all six are up or no wall is free. */
export function addWallDisplay(layout) {
  const wallDisplays = roomWallDisplays(layout.wallDisplays, layout.shelves), id = ROOM_WALL_IDS.find(value => !wallDisplays[value]);
  const spot = id && ROOM_WALL_SPOTS.find(spot => wallSpotAvailable(layout.shelves, wallDisplays, id, spot.id, layout.furniture));
  return spot ? { ...layout, wallDisplays: { ...wallDisplays, [id]: spot.id } } : layout;
}
/** Take down an added wall display. The first two stay up. */
export function removeWallDisplay(layout, id) {
  const { [id]: spotId, ...wallDisplays } = roomWallDisplays(layout.wallDisplays, layout.shelves);
  if (!spotId || Object.hasOwn(defaultWallDisplays(), id)) return layout;
  return { ...layout, wallDisplays, placements: layout.placements.filter(place => place.anchorId !== id) };
}
export function removeShelf(layout, id) {
  const shelf = layout.shelves.find(shelf => shelf.id === id);
  if (!shelf) return layout;
  const slots = shelfSlots(shelf).map(slot => slot.id);
  return { ...layout, shelves: layout.shelves.filter(shelf => shelf.id !== id), placements: layout.placements.filter(place => !slots.includes(place.anchorId)) };
}
export function changeStyle(layout, kind, field, value, shelfId) {
  const home = ROOM_HOMESTEAD[kind], options = home || ROOM_FINISHES[kind];
  const choices = { typeId: 'types', colorId: 'colors' }[field];
  if (!options?.[choices]?.some(option => option.id === value)) return layout;
  if (home) return { ...layout, homestead: { ...layout.homestead, [kind]: { ...home.default, ...layout.homestead?.[kind], [field]: value } } };
  if (kind === 'shelf') return { ...layout, shelves: layout.shelves.map(shelf => shelf.id === shelfId ? { ...shelf, [field]: value } : shelf) };
  return { ...layout, finishes: { ...layout.finishes, [kind]: { ...layout.finishes[kind], [field]: value } } };
}

/** The movable piece behind a scene or panel selection, if any. */
export const furnitureOf = selection => {
  const id = selection?.kind === 'anchor' ? anchorHost(selection.anchorId) : selection?.kind === 'surface' ? selection.surface : selection?.kind === 'homestead' ? selection.piece : selection?.kind;
  return id !== 'floor' || selection.kind === 'anchor' ? (Object.hasOwn(ROOM_FURNITURE, id) ? id : null) : null;
};
/** Carry a piece into another of its rooms, to the clear floor nearest its spot there; unchanged when there is none. */
export function moveToRoom(layout, id, area) {
  if (!layout?.furniture || !Object.hasOwn(ROOM_FURNITURE, id) || !furnitureRooms(id).includes(area) || layout.furniture[id].off) return layout;
  const [x, z, r] = area === furnitureRooms(id)[0] ? [...ROOM_FURNITURE[id].home, 0] : ROOM_FURNITURE[id].also[area];
  const turned = { ...layout.furniture, [id]: { ...layout.furniture[id], r } };
  const spot = freeSpot(turned, id, layout.shelves, roomWallDisplays(layout.wallDisplays, layout.shelves), [x, z]);
  return spot && pieceArea({ ...turned, [id]: { ...turned[id], ...spot } }, id) === area ? placeFurniture(layout, id, { ...spot, r }) : layout;
}
/** Move, turn (`r`), store (`off: true`) or restore (`off: false`) one piece; unchanged when it would not fit. */
export function placeFurniture(layout, id, change) {
  if (!layout?.furniture || !Object.hasOwn(ROOM_FURNITURE, id) || (change.off && !ROOM_FURNITURE[id].removable)) return layout;
  const { off, ...place } = { ...layout.furniture[id], ...change };
  let furniture = { ...layout.furniture, [id]: off ? { ...place, off: true } : place };
  const wallDisplays = roomWallDisplays(layout.wallDisplays, layout.shelves);
  if (!furnitureFits(furniture, id) || !wallMountsFit(layout.shelves, wallDisplays, furniture)) {
    // Brought out of storage: the nearest clear floor. Turned against a wall or a neighbour: shuffled the least distance that clears.
    const turnOnly = 'r' in change && !('x' in change) && change.r !== layout.furniture[id].r;
    const spot = (change.off === false || turnOnly) && freeSpot(furniture, id, layout.shelves, wallDisplays, change.off === false ? undefined : [place.x, place.z]);
    if (!spot) return layout;
    furniture = { ...furniture, [id]: { ...place, ...spot } };
  }
  // Storing a piece also stores whatever was displayed on it.
  const gone = off ? ROOM_ANCHORS.filter(anchor => (anchor.on || anchor.id) === id).map(anchor => anchor.id) : [];
  return { ...layout, furniture, placements: layout.placements.filter(item => !gone.includes(item.anchorId)) };
}
