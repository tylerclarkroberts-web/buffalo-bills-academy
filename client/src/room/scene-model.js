import * as THREE from 'three';
import { ROOM_SHELF_SPOTS, ROOM_WALL_SPOTS, ROOM_FLOOR_SCALE, ROOM_FURNITURE, roomShelves, shelfSlots, roomWallDisplays, wallMountsFit, wallSpotAvailable, defaultFurniture, furnitureFits, furnitureRect, residentRect } from '../../../server/catalog/room.js';

export { ROOM_FLOOR_SCALE };
const S = ROOM_FLOOR_SCALE, home = (id, y = 0) => [ROOM_FURNITURE[id].home[0], y, ROOM_FURNITURE[id].home[1]];
/** Heights of the display spots that ride on movable furniture. */
const SPOT_HEIGHT = { desk: 0.97, floor: 0.08, window: 0.02 };
export const RESIDENT_HEIGHT_SCALE = 1.4;
// The stylized, un-hatted 1.94-unit resident represents 5 ft 11 in; walls are 8 ft 6 in.
export const ROOM_WALL_HEIGHT = 1.94 * RESIDENT_HEIGHT_SCALE * 102 / 71;
export const ROOM_DOOR_HEIGHT = ROOM_WALL_HEIGHT * 80 / 102;
export const ROOM_BOUNDS = { min: [-4.35 * S, -0.2, -3.35 * S], max: [8.6 * S, ROOM_WALL_HEIGHT + 0.25, 3.35 * S] };

/** Keep shelf mounts against the wall without changing persisted catalog spots. */
export const roomShelfPosition = spot => spot.wallSide === 'back' ? [spot.position[0] * S, spot.position[1], -3 * S + 0.75] : [-4 * S + 0.75, spot.position[1], spot.position[2] * S];
export const wallDisplayPosition = spot => spot.wallSide === 'left' ? [-4 * S + 0.19, spot.position[1], spot.position[2] * S] : [spot.position[0] * S, spot.position[1], -3 * S + 0.19];

export const ROOM_POSITIONS = {
  'wall-left': [-2.9 * S, 2.55, -3 * S + 0.19], 'wall-right': [-1.25 * S, 2.55, -3 * S + 0.19],
  'shelf-left': [-4 * S + 0.75, 1.22, -1.7 * S], 'shelf-right': [-4 * S + 0.75, 1.22, -0.4 * S],
  floor: home('floor', SPOT_HEIGHT.floor), desk: home('desk', SPOT_HEIGHT.desk), window: home('window', SPOT_HEIGHT.window),
};

export const ROOM_FIXTURES = {
  pet: home('pet'), wardrobe: home('wardrobe'), wealth: home('wealth'), rug: home('rug', 0.03), resident: [0.2 * S, 0.05, 1.25 * S],
};

export function roomPositions(shelves, furniture = defaultFurniture(), wallDisplays) {
  const positions = Object.fromEntries(Object.entries(ROOM_POSITIONS).filter(([id]) => !id.startsWith('shelf-') && !furniture[id]?.off)
    .map(([id, position]) => [id, furniture[id] ? [furniture[id].x, SPOT_HEIGHT[id], furniture[id].z] : position]));
  for (const shelf of roomShelves(shelves)) {
    const spot = ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId);
    if (spot) for (const slot of shelfSlots(shelf)) {
      const point = roomShelfPosition(spot);
      if (spot.wallSide === 'back') point[0] -= slot.offset; else point[2] += slot.offset;
      positions[slot.id] = point;
    }
  }
  for (const [id, spotId] of Object.entries(roomWallDisplays(wallDisplays, roomShelves(shelves)))) positions[id] = wallDisplayPosition(ROOM_WALL_SPOTS.find(spot => spot.id === spotId));
  return positions;
}

export function nearestShelfSpot(camera, rect, x, y, shelves, shelfId, wallDisplays, furniture, grab = { x: 0, y: 0 }) {
  if (!rect.width || !rect.height || x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  const occupied = new Set(shelves.filter(shelf => shelf.id !== shelfId).map(shelf => shelf.spotId));
  let closest = null, distance = Math.max(28, Math.min(80, rect.width * 0.12));
  for (const spot of ROOM_SHELF_SPOTS) {
    if (occupied.has(spot.id) || !wallMountsFit(shelves.map(shelf => shelf.id === shelfId ? { ...shelf, spotId: spot.id } : shelf), roomWallDisplays(wallDisplays, shelves), furniture)) continue;
    const point = new THREE.Vector3(...roomShelfPosition(spot)).project(camera);
    const d = Math.hypot(rect.left + (point.x + 1) * rect.width / 2 - x + grab.x, rect.top + (1 - point.y) * rect.height / 2 - y + grab.y);
    if (d < distance) { closest = spot; distance = d; }
  }
  return closest;
}

export function nearestWallSpot(camera, rect, x, y, shelves, wallDisplays, id, furniture, grab = { x: 0, y: 0 }) {
  if (!rect.width || !rect.height || x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  let closest = null, distance = Math.max(28, Math.min(80, rect.width * 0.12));
  for (const spot of ROOM_WALL_SPOTS) {
    if (!wallSpotAvailable(shelves, wallDisplays, id, spot.id, furniture)) continue;
    const point = new THREE.Vector3(...wallDisplayPosition(spot)); point.y += 0.4; point.project(camera);
    const d = Math.hypot(rect.left + (point.x + 1) * rect.width / 2 - x + grab.x, rect.top + (1 - point.y) * rect.height / 2 - y + grab.y);
    if (d < distance) { closest = spot; distance = d; }
  }
  return closest;
}

/** A short clear route beside the rug; the same footprint rules keep the resident out of furniture. */
export function residentStep(furniture = defaultFurniture(), shelves = [], wallDisplays = roomWallDisplays()) {
  for (const [dx, dz] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]]) {
    if ([0.25, 0.5, 0.75, 1].every(part => {
      const moved = { ...furniture, rug: { ...furniture.rug, x: furniture.rug.x + dx * part, z: furniture.rug.z + dz * part } };
      return furnitureFits(moved, 'rug') && wallMountsFit(shelves, wallDisplays, moved);
    })) return { x: dx, z: dz };
  }
  return { x: 0, z: 0 };
}

/**
 * Places the resident can stroll to from the rug: the couch to sit on, the cash table to raid and furniture to inspect.
 * Each has a `path` of floor points ending at the spot where they stand, found on a quarter-unit grid around the furniture.
 * ponytail: low shelves are not obstacles; add their footprints if the resident starts walking through them.
 */
export function residentErrands(furniture = defaultFurniture()) {
  const home = furniture.rug, live = Object.keys(ROOM_FURNITURE).filter(id => !ROOM_FURNITURE[id].flat && !ROOM_FURNITURE[id].yard && !furniture[id].off);
  const solid = live.map(id => furnitureRect(id, furniture[id]));
  const clear = (x, z) => Math.abs(x) <= 4 * S - 0.5 && Math.abs(z) <= 3 * S - 0.45
    && !solid.some(r => x + 0.35 > r[0] && x - 0.35 < r[2] && z + 0.3 > r[1] && z - 0.3 < r[3]);
  const walk = (from, to) => {
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.2);
    return Array.from({ length: steps + 1 }, (_, i) => i / (steps || 1)).every(part => clear(from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part));
  };
  // Breadth-first over clear floor cells, then keep only the corners a straight walk cannot skip.
  const route = (from, to) => {
    if (walk(from, to)) return [to];
    const key = cell => cell.join(), start = from.map(v => Math.round(v * 4)), goal = to.map(v => Math.round(v * 4));
    const previous = new Map([[key(start), null]]), queue = [start];
    for (let n = 0; n < queue.length && !previous.has(key(goal)); n++) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [queue[n][0] + di, queue[n][1] + dj];
      if (!previous.has(key(next)) && clear(next[0] / 4, next[1] / 4)) { previous.set(key(next), queue[n]); queue.push(next); }
    }
    if (!previous.has(key(goal))) return null;
    const cells = [], path = [];
    for (let at = goal; at; at = previous.get(key(at))) cells.unshift([at[0] / 4, at[1] / 4]);
    for (let n = 2, anchor = from; n < cells.length; n++) if (!walk(anchor, cells[n])) { anchor = cells[n - 1]; path.push(anchor); }
    return [...path, to];
  };
  const errands = [];
  for (const [id, kind] of [['couch', 'sit'], ['pet', 'inspect'], ['wealth', 'cash'], ['desk', 'inspect'], ['floor', 'inspect'], ['wardrobe', 'inspect']]) {
    if (!live.includes(id)) continue;
    const place = furniture[id], rect = furnitureRect(id, place), turn = place.r * Math.PI / 2, front = [Math.round(Math.sin(turn)), Math.round(Math.cos(turn))];
    // Doors, drawers and cushions have a front; tables can be approached from whichever side is nearest.
    const sides = ['pet', 'wealth', 'floor'].includes(id) ? [[0, 1], [1, 0], [-1, 0], [0, -1]] : [front];
    // Inspecting means leaning in, so stand a little further back than when sitting down or reaching for cash.
    const gap = kind === 'inspect' ? 0.75 : 0.5;
    const spot = sides.map(([dx, dz]) => ({ dx, dz, x: place.x + dx * ((rect[2] - rect[0]) / 2 + gap), z: place.z + dz * ((rect[3] - rect[1]) / 2 + gap - 0.05) }))
      .filter(spot => Math.hypot(spot.x - home.x, spot.z - home.z) > 0.5)
      .map(spot => ({ ...spot, path: route([home.x, home.z], [spot.x, spot.z]) })).filter(spot => spot.path)
      .sort((a, b) => a.path.length - b.path.length || Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z))[0];
    if (!spot) continue;
    errands.push(kind === 'sit' ? { kind, path: spot.path, facing: Math.atan2(spot.dx, spot.dz), seat: [place.x + spot.dx * 0.12, place.z + spot.dz * 0.12] }
      : { kind, path: spot.path, facing: Math.atan2(-spot.dx, -spot.dz) });
  }
  return errands;
}

/** Project onto the floor, including cropped furniture origins; the caller bounds the actual pointer. */
export function floorPoint(camera, rect, x, y) {
  if (!rect.width || !rect.height) return null;
  const from = new THREE.Vector3((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2, -1).unproject(camera);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  if (direction.y >= -1e-6) return null;
  const hit = from.addScaledVector(direction, -from.y / direction.y);
  return { x: Math.round(hit.x * 4) / 4, z: Math.round(hit.z * 4) / 4 };
}

/** Floor steps for on-screen "right" and "away" at the current view angle, each along one room axis. */
export function nudgeAxes(rotation = 0) {
  const direction = makeRoomCamera(1, { rotation }).getWorldDirection(new THREE.Vector3());
  const alongX = Math.abs(direction.z) >= Math.abs(direction.x);
  return alongX ? { right: [-Math.sign(direction.z), 0], away: [0, Math.sign(direction.z)] }
    : { right: [0, Math.sign(direction.x)], away: [Math.sign(direction.x), 0] };
}

export const ROOM_VIEW_LIMITS = { minZoom: 0.75, maxZoom: 2.5, minRotation: -180, maxRotation: 180 };

export function roomView(value = {}) {
  return {
    zoom: Number.isFinite(value?.zoom) ? Math.min(ROOM_VIEW_LIMITS.maxZoom, Math.max(ROOM_VIEW_LIMITS.minZoom, value.zoom)) : 1,
    rotation: Number.isFinite(value?.rotation) ? ((value.rotation % 360 + 540) % 360) - 180 : 0,
  };
}

/** Sharpen ordinary screens while bounding the drawing buffer on high-DPI and large displays. */
export function roomRenderSize(width, height, pixelRatio = 1) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const ratio = Number.isFinite(pixelRatio) ? Math.min(2, Math.max(1, pixelRatio)) : 1;
  const scale = Math.min(ratio, 4096 / w, 2160 / h, Math.sqrt(5000000 / (w * h)));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const ROOM_LOOK = [0, 1.1, -0.4 * S];
// The camera has no perspective, so a wall shows its inside only while the camera is on the room's side of the point
// it looks at. Judged by the wall's own line instead, a near wall was drawn from behind, leaning across the room.
export const roomWallVisibility = position => ({ back: position.z >= ROOM_LOOK[2], left: position.x >= ROOM_LOOK[0] });

/** Fit the full room and yard at any angle before applying zoom. */
export function makeRoomCamera(aspect, view = {}, pan = [0, 0]) {
  const { rotation, zoom } = roomView(view);
  const turn = rotation * Math.PI / 180, cos = Math.cos(turn), sin = Math.sin(turn);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  camera.position.set((10 * cos + 12.4 * sin) * S, 1.1 + 7.9 * S, (12.4 * cos - 10 * sin - 0.4) * S);
  camera.lookAt(...ROOM_LOOK);
  camera.updateMatrixWorld();
  const points = [];
  for (const x of [ROOM_BOUNDS.min[0], ROOM_BOUNDS.max[0]]) {
    for (const y of [ROOM_BOUNDS.min[1], ROOM_BOUNDS.max[1]]) {
      for (const z of [ROOM_BOUNDS.min[2], ROOM_BOUNDS.max[2]]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    }
  }
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfH = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * a)) * 1.06;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // Zooming in leaves room to slide the frame; pan is -1..1 of that slack, so 100% always shows everything.
  const slack = 1 - 1 / Math.max(1, zoom), side = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const px = cx + side(pan?.[0]) * halfH * a * slack, py = cy + side(pan?.[1]) * halfH * slack;
  camera.left = px - halfH * a; camera.right = px + halfH * a;
  camera.top = py + halfH; camera.bottom = py - halfH;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  return camera;
}

const scatter = (i, salt) => (Math.imul(i * 4 + salt + 1, 2654435761) >>> 0) / 2 ** 32;
// A loose heap rather than neat stacks: a tall middle column, six around it and four lower ones along the tray.
// Outer columns start late, so a few chips make a small mound in the middle instead of a flat spread.
const CHIP_SLOTS = [[0, 0, 14, 0], ...[0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * Math.PI / 3) * 0.3, Math.sin(i * Math.PI / 3) * 0.3, 10, 0.12]),
  ...[[-0.45, -0.26], [0.45, -0.26], [-0.45, 0.26], [0.45, 0.26]].map(([x, z]) => [x, z, 6, 0.24])]
  .flatMap(([x, z, tall, late]) => Array.from({ length: tall }, (_, level) => ({ x, z, level, fill: (level + 0.5) / tall + late }))).sort((a, b) => a.fill - b.fill);
const BILL = 0.00027; // thickness of one note beside its 0.38-long face, as on a real hundred
/** Casino chip values, highest first: yellow, purple, black, green and red in the usual American colours. */
export const CHIP_VALUES = [1000, 500, 100, 25, 5];

/**
 * What the tray holds, in real amounts: the cash as $100 bills (a banded brick per thousand notes) and the chips at
 * tables as a heap of casino chips. Pass nothing when the amounts are unknown.
 * ponytail: stops at 98 chips (about $100,000) and four bricks ($400,000) so it never makes one mesh per dollar.
 */
export function wealthLayout(worth) {
  if (!worth || typeof worth !== 'object') return { neutral: true, chips: [], bundles: [] };
  const amount = value => Number.isFinite(value) && value > 0 ? value : 0;
  // A working stack, as a dealer would hand it over: up to twenty of each chip before moving up to the next one,
  // so $1,000 is a mixed heap of reds, greens and blacks rather than a single $1,000 chip.
  let left = amount(worth.chips);
  const counts = CHIP_VALUES.map((value, i) => {
    const n = i === CHIP_VALUES.length - 1 ? Math.round(left / value) : Math.max(0, Math.floor((left - 20 * CHIP_VALUES[i + 1]) / value));
    left -= n * value; return n;
  });
  if (amount(worth.chips) && !counts.some(Boolean)) counts[counts.length - 1] = 1;
  // `color` is the chip's place in CHIP_VALUES. Shuffled so the heap is not sorted by value.
  const colors = counts.flatMap((n, color) => Array(Math.min(n, CHIP_SLOTS.length)).fill(color)).slice(0, CHIP_SLOTS.length)
    .map((color, i) => ({ color, order: scatter(i, 0) })).sort((a, b) => a.order - b.order);
  const chips = colors.map(({ color }, i) => {
    const slot = CHIP_SLOTS[i];
    return { x: -0.2 + slot.x + (scatter(i, 1) - 0.5) * 0.04, y: 0.035 + slot.level * 0.045, z: slot.z + (scatter(i, 2) - 0.5) * 0.04, turn: scatter(i, 3) * Math.PI * 2, color };
  });
  const bills = Math.min(4000, Math.round(amount(worth.bankroll) / 100) || (amount(worth.bankroll) >= 1 ? 1 : 0)), piles = Math.ceil(bills / 1000), bundles = [];
  for (let pile = 0; pile < piles; pile++) {
    const count = Math.min(1000, bills - pile * 1000), h = Math.max(0.004, count * BILL), z = (pile - (piles - 1) / 2) * 0.2;
    if (count >= 100) { bundles.push({ x: 0.68, y: h / 2, z, h, turn: 0, band: true }); continue; }
    // Fewer than a strap's worth lies loose: a few slightly skewed layers instead of one card.
    const layers = Math.min(3, count);
    for (let i = 0; i < layers; i++) bundles.push({ x: 0.68, y: (i + 0.5) * h / layers, z, h: h / layers, turn: [-0.1, 0.07, -0.03][i], band: false });
  }
  return { neutral: false, chips, bundles };
}

/**
 * Prepares a head cutout (RGBA bytes) for wrapping round a 3D head. Finds the box the head fills, smears each row's
 * colours across that box so no transparent gap lands on the curve, and samples a hair and a skin colour.
 */
export function faceWrap(data, width, height) {
  const kept = (x, y) => data[(y * width + x) * 4 + 3] >= 128;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (kept(x, y)) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const mean = (left, top, right, bottom) => {
    const sum = [0, 0, 0]; let n = 0;
    for (let y = y0 + Math.floor(top * h); y < y0 + Math.ceil(bottom * h); y++) for (let x = x0 + Math.floor(left * w); x < x0 + Math.ceil(right * w); x++) {
      if (kept(x, y)) { const i = (y * width + x) * 4; sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++; }
    }
    return n ? sum.map(value => Math.round(value / n)) : null;
  };
  const all = mean(0, 0, 1, 1), hair = mean(0.25, 0, 0.75, 0.12) || all, skin = mean(0.35, 0.48, 0.65, 0.66) || all;
  for (let y = y0; y <= y1; y++) {
    let from = -1;
    for (let x = x0; x <= x1 && from < 0; x++) if (kept(x, y)) from = (y * width + x) * 4;
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      if (kept(x, y)) { from = i; continue; }
      // An empty row can only follow a filled one: the box starts on a row with something in it.
      const source = from < 0 ? i - width * 4 : from;
      data[i] = data[source]; data[i + 1] = data[source + 1]; data[i + 2] = data[source + 2]; data[i + 3] = 255;
    }
  }
  return { x: x0, y: y0, w, h, hair, skin };
}

/** Short, deterministic visits that keep the faun's off-centre umbrella clear along the whole route. */
export function faunVisitRoute(furniture = defaultFurniture(), shelves = [], wallDisplays = roomWallDisplays(), visitIndex = 0) {
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const footprint = ({ x, z }, facing) => {
    const cos = Math.cos(facing), sin = Math.sin(facing), corners = [];
    // Envelope includes 1.25x height, the lean, head turns and entrance/retreat yaw.
    for (const dx of [-1.22, 0.62]) for (const dz of [-0.48, 0.75]) corners.push([x + dx * cos + dz * sin, z + dz * cos - dx * sin]);
    return [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
  };
  const clear = (route, area, obstacles) => {
    const a = footprint(route.from, route.facing), b = footprint(route.to, route.facing);
    const swept = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
    return swept[0] >= area[0] && swept[1] >= area[1] && swept[2] <= area[2] && swept[3] <= area[3]
      && obstacles.every(obstacle => !overlaps(swept, obstacle));
  };
  const roomObstacles = Object.entries(ROOM_FURNITURE).filter(([id, piece]) => !piece.flat && !piece.yard && !furniture[id].off).map(([id]) => {
    const rect = furnitureRect(id, furniture[id]), pad = id === 'wardrobe' ? 0.18 : id === 'desk' ? 0.08 : 0;
    return [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
  });
  const resident = residentRect(furniture);
  roomObstacles.push([resident[0] - 0.6, resident[1] - 0.6, resident[2] + 0.6, resident[3] + 0.6]);
  // Treat wall mounts as solid through visitor height, and include the projecting window sill.
  roomObstacles.push([-0.45 * S, -3 * S, 1.95 * S, -3 * S + 0.65]);
  for (const shelf of shelves) {
    const spot = ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId);
    if (!spot) continue;
    const [x, , z] = roomShelfPosition(spot), along = shelf.sizeId === 'wide' ? 1.25 : 0.45;
    roomObstacles.push(spot.wallSide === 'left' ? [x - 0.65, z - along, x + 0.65, z + along] : [x - along, z - 0.65, x + along, z + 0.65]);
  }
  for (const spotId of Object.values(wallDisplays)) {
    const spot = ROOM_WALL_SPOTS.find(spot => spot.id === spotId);
    if (!spot) continue;
    const [x, , z] = wallDisplayPosition(spot);
    roomObstacles.push(spot.wallSide === 'left' ? [x - 0.11, z - 0.6, x + 0.11, z + 0.6] : [x - 0.6, z - 0.11, x + 0.6, z + 0.11]);
  }
  const route = (x, z, dx, dz, facing, location) => ({ from: { x, z }, to: { x: x + dx, z: z + dz }, facing, location });
  const wardrobe = furnitureRect('wardrobe', furniture.wardrobe), wagon = furnitureRect('window', furniture.window);
  const indoors = [
    route(1.8 * S, -0.5 * S, -0.6, 0, 0.35, 'room'),
    route(wardrobe[0] - 1.1, wardrobe[3] + 0.6, 0, 0.6, 0.35, 'room'),
    route(4 * S - 1.25, -0.1 * S, -0.6, 0, 0.35, 'room'),
  ];
  const outside = [
    route(furniture.window.x - 0.3, wagon[1] - 0.6, 0, -0.6, Math.PI, 'yard'),
    route(wagon[2] + 0.6, furniture.window.z - 0.3, 0.6, 0, Math.PI / 2, 'yard'),
    route(furniture.window.x + 0.3, wagon[3] + 0.6, 0, 0.6, 0, 'yard'),
    route(wagon[0] - 0.6, furniture.window.z + 0.3, -0.6, 0, -Math.PI / 2, 'yard'),
  ];
  const groups = [
    [indoors, [-4 * S + 0.15, -3 * S + 0.15, 4 * S - 0.2, 3 * S - 0.15], roomObstacles],
    [outside, [4.3 * S, -2.8 * S, 8.4 * S, 1.4 * S], [wagon]],
  ];
  const index = Number.isFinite(visitIndex) ? Math.max(0, Math.floor(visitIndex)) : 0;
  for (const groupIndex of [index % 2, 1 - index % 2]) {
    const [candidates, area, obstacles] = groups[groupIndex];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(Math.floor(index / 2) + i) % candidates.length];
      if (clear(candidate, area, obstacles)) return candidate;
    }
  }
  return route(6.65 * S, 2.25 * S, 0, 0, 0, 'path');
}
