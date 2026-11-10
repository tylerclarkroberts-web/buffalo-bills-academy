import { ROOM_FINISHES, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, roomShelves, roomFinishes } from '../../../server/catalog/room.js';

export const layoutOf = room => ({ layoutRevision: room.layoutRevision, themeId: room.themeId,
  placements: room.placements.map(place => ({ ...place })), shelves: roomShelves(room.shelves), finishes: roomFinishes(room.finishes) });
export const layoutKey = room => JSON.stringify([room.themeId,
  [...room.placements].sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
  [...room.shelves].sort((a, b) => a.id.localeCompare(b.id)), room.finishes]);

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
