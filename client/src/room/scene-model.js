import * as THREE from 'three';
import { ROOM_SHELF_SPOTS, roomShelves } from '../../../server/catalog/room.js';

export const ROOM_FLOOR_SCALE = Math.sqrt(1.75);
const S = ROOM_FLOOR_SCALE;
export const ROOM_BOUNDS = { min: [-4.35 * S, -0.2, -3.35 * S], max: [8.6 * S, 3.65, 3.35 * S] };

/** Keep shelf mounts against the wall without changing persisted catalog spots. */
export const roomShelfPosition = spot => [-4 * S + 0.75, spot.position[1], spot.position[2] * S];

export const ROOM_POSITIONS = {
  'wall-left': [-2.9 * S, 2.55, -3 * S + 0.19], 'wall-right': [-1.25 * S, 2.55, -3 * S + 0.19],
  'shelf-left': [-4 * S + 0.75, 1.22, -1.7 * S], 'shelf-right': [-4 * S + 0.75, 1.22, -0.4 * S],
  floor: [-0.55 * S, 0.08, -0.65 * S], desk: [-0.55 * S, 0.97, -3 * S + 1.1], window: [6.2 * S, 0.02, -0.3 * S],
};

export const ROOM_FIXTURES = {
  pet: [-2.15 * S, 0, 1.25 * S], wardrobe: [4 * S - 0.75, 0, -3 * S + 0.5],
  wealth: [2.25 * S, 0, 1.45 * S], rug: [0.2 * S, 0.03, 1.3 * S], resident: [0.2 * S, 0.05, 1.25 * S],
};

export function roomPositions(shelves) {
  const positions = Object.fromEntries(Object.entries(ROOM_POSITIONS).filter(([id]) => !id.startsWith('shelf-')));
  for (const shelf of roomShelves(shelves)) {
    const spot = ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId);
    if (spot) positions[shelf.id] = roomShelfPosition(spot);
  }
  return positions;
}

export function nearestShelfSpot(camera, rect, x, y, shelves, shelfId) {
  if (!rect.width || !rect.height || x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  const occupied = new Set(shelves.filter(shelf => shelf.id !== shelfId).map(shelf => shelf.spotId));
  let closest = null, distance = Math.max(28, Math.min(80, rect.width * 0.12));
  for (const spot of ROOM_SHELF_SPOTS) {
    if (occupied.has(spot.id)) continue;
    const point = new THREE.Vector3(...roomShelfPosition(spot)).project(camera);
    const d = Math.hypot(rect.left + (point.x + 1) * rect.width / 2 - x, rect.top + (1 - point.y) * rect.height / 2 - y);
    if (d < distance) { closest = spot; distance = d; }
  }
  return closest;
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
  const ratio = Number.isFinite(pixelRatio) ? Math.min(1.5, Math.max(1, pixelRatio)) : 1;
  const scale = Math.min(ratio, 1600 / w, 1000 / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export const roomWallVisibility = position => ({ back: position.z >= -3 * S, left: position.x >= -4 * S });

/** Fit the full room and yard at any angle before applying zoom. */
export function makeRoomCamera(aspect, view = {}) {
  const { rotation, zoom } = roomView(view);
  const turn = rotation * Math.PI / 180, cos = Math.cos(turn), sin = Math.sin(turn);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  camera.position.set((10 * cos + 12.4 * sin) * S, 1.1 + 7.9 * S, (12.4 * cos - 10 * sin - 0.4) * S);
  camera.lookAt(0, 1.1, -0.4 * S);
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
  camera.left = cx - halfH * a; camera.right = cx + halfH * a;
  camera.top = cy + halfH; camera.bottom = cy - halfH;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  return camera;
}

/** A bounded arrangement: it never creates one mesh per dollar. */
export function wealthLayout(stage) {
  if (!Number.isInteger(stage) || stage < 0 || stage > 5) return { neutral: true, chips: [], bundles: [] };
  const stacks = [0, 1, 3, 5, 7, 9][stage];
  const height = [0, 2, 5, 8, 11, 14][stage];
  const chips = [];
  for (let i = 0; i < stacks; i++) for (let k = 0; k < height; k++) {
    chips.push({ x: (i % 3 - 1) * 0.32, y: 0.035 + k * 0.045, z: Math.floor(i / 3) * 0.31 - 0.32, color: i % 3 });
  }
  const bundles = Array.from({ length: [0, 0, 0, 2, 4, 6][stage] }, (_, i) => ({ x: 0.68, y: 0.045 + Math.floor(i / 2) * 0.09, z: (i % 2) * 0.38 - 0.2 }));
  return { neutral: false, chips, bundles };
}
