import * as THREE from 'three';
import { BY_ID } from '../../../server/engine/creatures.js';
import { ROOM_ITEM, ROOM_FINISHES, ROOM_SHELF_SPOTS, ROOM_SHELF_SIZES, ROOM_WALL_SPOTS, ROOM_FURNITURE, roomShelves, shelfSlots, shelfForAnchor, roomWallDisplays, wallMountsFit, wallSpotAvailable, roomFinishes, roomFurniture, furnitureFits } from '../../../server/catalog/room.js';
import { furnitureOf } from './layout.js';
import { coveredWagon } from './wagon.js';
import { roomFaun } from './faun.js';
import { RoomActivity, residentPose, faunPose } from './activity.js';
import { setupRoomLighting, configureShadowObjects, animateRoomLighting } from './lighting.js';
import { pixGrid } from '../store/pixart.js';
import { spriteCanvas, drawGrave } from '../barn/sprite.js';
import { drawEgg } from '../barn/draw.js';
import { headParts, looks } from '../avatar/genbust.js';
import { makeRoomCamera, wealthLayout, roomPositions, nearestShelfSpot, nearestWallSpot, floorPoint, nudgeAxes, roomRenderSize, roomView, roomWallVisibility, ROOM_FLOOR_SCALE, ROOM_WALL_HEIGHT, ROOM_DOOR_HEIGHT, RESIDENT_HEIGHT_SCALE, ROOM_FIXTURES, roomShelfPosition, wallDisplayPosition, residentStep, faunVisitRoute } from './scene-model.js';

const PAINT = { 'bunkhouse-timber': '#8c6243', 'bunkhouse-sage': '#6d785b', 'bunkhouse-clay': '#9a6650' };
const material = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (parent, geometry, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); parent.add(m); return m;
};
const box = (p, w, h, d, color, x = 0, y = 0, z = 0) => mesh(p, new THREE.BoxGeometry(w, h, d), material(color), x, y, z);
const cylinder = (p, rt, rb, h, color, x = 0, y = 0, z = 0, sides = 12) => mesh(p, new THREE.CylinderGeometry(rt, rb, h, sides), material(color), x, y, z);
const finishColor = (kind, style) => ROOM_FINISHES[kind].colors.find(color => color.id === style.colorId)?.color || ROOM_FINISHES[kind].colors[0].color;
const shade = (color, amount) => new THREE.Color(color).multiplyScalar(amount).getStyle();
const shown = object => {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};
function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
function paintedTexture(w, h, paint, pixel = false) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  const texture = canvasTexture(canvas);
  if (!pixel) { texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4; }
  return texture;
}
function pixelTexture(name) {
  const grid = pixGrid(name);
  return paintedTexture(grid.w, grid.h, ctx => grid.px.forEach((color, i) => {
    if (color) { ctx.fillStyle = color; ctx.fillRect(i % grid.w, Math.floor(i / grid.w), 1, 1); }
  }), true);
}
function disposeObjects(root) {
  const geometry = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry) geometry.add(o.geometry);
    for (const mat of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometry.forEach(g => g.dispose());
}
function frame(parent, pix, w = 0.8, h = 0.8) {
  box(parent, w + 0.12, h + 0.12, 0.08, '#805c30', 0, 0.45, 0);
  box(parent, w + 0.04, h + 0.04, 0.09, '#c39b52', 0, 0.45, 0.01);
  const map = paintedTexture(512, Math.round(512 * h / w), (ctx, width, height) => {
    const ink = pix === 'railroad' ? '#385d47' : pix === 'sheriffbadge' ? '#345d80' : '#76572d';
    ctx.fillStyle = pix === 'railroad' ? '#e5e8ce' : '#efe0b7'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.lineWidth = 1; ctx.strokeRect(24, 24, width - 48, height - 48);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = 'bold 28px Georgia';
    ctx.fillText({ deed: 'DEED TO THE MOON', sheriffbadge: 'FISHING LICENCE', railroad: 'RAILROAD SHARE' }[pix], width / 2, 68);
    ctx.font = '15px Georgia'; ctx.fillText({ deed: 'LUNAR LAND REGISTRY', sheriffbadge: 'TERRITORY ANGLING OFFICE', railroad: 'GREAT BASIN & PACIFIC' }[pix], width / 2, 94);
    const cy = height * 0.47;
    if (pix === 'deed') {
      ctx.fillStyle = '#cfb96f'; ctx.beginPath(); ctx.arc(256, cy, 55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b39a56';
      for (const [x, y, r] of [[238, -20, 11], [278, 12, 16], [241, 27, 7]]) { ctx.beginPath(); ctx.arc(x, cy + y, r, 0, Math.PI * 2); ctx.fill(); }
    } else if (pix === 'sheriffbadge') {
      ctx.beginPath(); ctx.ellipse(250, cy, 68, 25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(300, cy); ctx.lineTo(345, cy - 31); ctx.lineTo(345, cy + 31); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#efe0b7'; ctx.beginPath(); ctx.arc(211, cy - 6, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(190, cy - 20, 95, 35); ctx.fillRect(270, cy - 52, 46, 67); ctx.fillRect(200, cy - 43, 13, 23);
      for (const x of [210, 245, 289]) { ctx.beginPath(); ctx.arc(x, cy + 22, 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e5e8ce'; ctx.fillRect(279, cy - 43, 26, 22);
    }
    ctx.fillStyle = ink; ctx.font = '18px Georgia';
    ctx.fillText({ deed: 'One very impressive acre.', sheriffbadge: 'Valid for the season of 1887.', railroad: 'One share. No railroad.' }[pix], width / 2, height * 0.72);
    ctx.font = 'italic 15px Georgia'; ctx.fillText('Buffalo Bill\'s Academy', width / 2, height * 0.8);
    ctx.fillStyle = '#9d3935'; ctx.beginPath(); ctx.arc(width - 69, height - 66, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#edcf8a'; ctx.font = 'bold 13px Georgia'; ctx.fillText(pix === 'deed' ? 'SEAL' : 'VOID', width - 69, height - 61);
    ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.font = '13px Georgia'; ctx.fillText('No. 000001', 43, height - 43);
  });
  mesh(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }), 0, 0.45, 0.06);
}
function oddity(id) {
  const group = new THREE.Group(); group.name = id;
  switch (id) {
    case 'odd-deed': frame(group, 'deed'); break;
    case 'odd-sheriffbadge': frame(group, 'sheriffbadge', 0.9, 0.65); break;
    case 'odd-horseshoe': {
      const arc = mesh(group, new THREE.TorusGeometry(0.24, 0.055, 6, 16, Math.PI), material('#b5a77f'), 0, 0.35, 0);
      arc.rotation.z = Math.PI;
      box(group, 0.11, 0.3, 0.1, '#b5a77f', -0.24, 0.5); box(group, 0.11, 0.3, 0.1, '#b5a77f', 0.24, 0.5);
      const nails = new THREE.InstancedMesh(new THREE.CircleGeometry(0.016, 8), material('#544d3c'), 6);
      let index = 0;
      for (const x of [-0.24, 0.24]) for (const y of [0.4, 0.5, 0.6]) nails.setMatrixAt(index++, new THREE.Matrix4().makeTranslation(x, y, 0.051));
      group.add(nails);
      break;
    }
    case 'odd-lamp': {
      const body = mesh(group, new THREE.SphereGeometry(0.25, 12, 8), material('#c7a04a'), 0, 0.2, 0); body.scale.set(1.2, 0.55, 0.75);
      cylinder(group, 0.12, 0.18, 0.08, '#9e762e', 0, 0.06);
      const spout = mesh(group, new THREE.ConeGeometry(0.08, 0.4, 8), material('#c7a04a'), 0.36, 0.24); spout.rotation.z = -1.1;
      mesh(group, new THREE.TorusGeometry(0.12, 0.025, 6, 12), material('#9e762e'), -0.3, 0.2);
      cylinder(group, 0.13, 0.16, 0.035, '#ecd184', 0, 0.325);
      cylinder(group, 0.045, 0.06, 0.065, '#9e762e', 0, 0.365);
      break;
    }
    case 'odd-wagon': return coveredWagon();
    case 'odd-vaccine': {
      const syringe = new THREE.Group(); group.add(syringe); syringe.rotation.z = -0.5;
      cylinder(syringe, 0.07, 0.07, 0.4, '#c3d7cd', 0, 0.3);
      cylinder(syringe, 0.072, 0.072, 0.12, '#963c38', 0, 0.29);
      cylinder(syringe, 0.015, 0.015, 0.2, '#a5acaa', 0, 0.02);
      box(syringe, 0.18, 0.035, 0.08, '#a5acaa', 0, 0.55);
      const scale = paintedTexture(128, 256, ctx => {
        ctx.fillStyle = '#45615e';
        for (let i = 0; i < 8; i++) ctx.fillRect(15, 22 + i * 29, i % 2 ? 28 : 52, 5);
      });
      mesh(syringe, new THREE.PlaneGeometry(0.12, 0.34), new THREE.MeshBasicMaterial({ map: scale, transparent: true, depthWrite: false }), 0, 0.3, 0.074);
      break;
    }
    case 'odd-anvil': {
      box(group, 0.8, 0.16, 0.55, '#46494c', 0, 0.08);
      box(group, 0.38, 0.46, 0.32, '#55595e', 0, 0.36);
      box(group, 0.9, 0.2, 0.38, '#7b7f83', 0, 0.66);
      const horn = mesh(group, new THREE.ConeGeometry(0.2, 0.48, 4), material('#7b7f83'), 0.64, 0.66); horn.rotation.z = -Math.PI / 2;
      const hardy = mesh(group, new THREE.PlaneGeometry(0.08, 0.08), material('#33363a'), -0.27, 0.761, 0.06); hardy.rotation.x = -Math.PI / 2;
      // Center the horn and heel inside the floor display's 1.3-unit footprint.
      group.children.forEach(part => { part.position.x -= 0.215; }); group.scale.setScalar(0.95);
      break;
    }
    case 'odd-spittoon': {
      cylinder(group, 0.16, 0.24, 0.34, '#bc9146', 0, 0.2);
      cylinder(group, 0.32, 0.15, 0.16, '#cba652', 0, 0.45);
      cylinder(group, 0.22, 0.22, 0.01, '#493423', 0, 0.54);
      const rim = mesh(group, new THREE.TorusGeometry(0.29, 0.018, 6, 20), material('#efd28a'), 0, 0.53); rim.rotation.x = Math.PI / 2;
      break;
    }
    case 'odd-rock': case 'odd-bigrock': {
      const big = id === 'odd-bigrock', geometry = new THREE.DodecahedronGeometry(big ? 0.5 : 0.28, 0), colors = [];
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        const color = new THREE.Color(big ? '#7a7a82' : '#858080').multiplyScalar(0.87 + (Math.floor(i / 3) % 5) * 0.055);
        colors.push(color.r, color.g, color.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const rock = mesh(group, geometry, material('#ffffff', { vertexColors: true }), 0, big ? 0.38 : 0.23); rock.scale.set(big ? 1.15 : 1.1, 0.8, big ? 0.9 : 0.8);
      break;
    }
    case 'odd-telegraph': {
      box(group, 0.62, 0.09, 0.38, '#9d6739', 0, 0.05);
      box(group, 0.06, 0.22, 0.06, '#c49a4f', -0.16, 0.18);
      const lever = box(group, 0.45, 0.04, 0.06, '#c49a4f', 0.02, 0.29); lever.rotation.z = 0.13;
      cylinder(group, 0.09, 0.09, 0.06, '#2d2724', 0.22, 0.33);
      cylinder(group, 0.035, 0.035, 0.075, '#e0c47b', -0.16, 0.335);
      cylinder(group, 0.04, 0.055, 0.1, '#b5b6aa', 0.12, 0.14);
      break;
    }
    case 'odd-snakeoil': {
      cylinder(group, 0.14, 0.16, 0.4, '#427951', 0, 0.22);
      cylinder(group, 0.07, 0.1, 0.14, '#427951', 0, 0.48);
      cylinder(group, 0.075, 0.075, 0.08, '#a97b48', 0, 0.59);
      const label = paintedTexture(256, 256, ctx => {
        ctx.fillStyle = '#eee0b9'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = '#704d2e'; ctx.lineWidth = 7; ctx.strokeRect(10, 10, 236, 236);
        ctx.fillStyle = '#864139'; ctx.textAlign = 'center'; ctx.font = 'bold 38px Georgia'; ctx.fillText('SNAKE OIL', 128, 68);
        ctx.font = '24px Georgia'; ctx.fillText('TONIC', 128, 105); ctx.font = 'italic 20px Georgia'; ctx.fillText('Trust the label.', 128, 215);
        ctx.strokeStyle = '#4a7048'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(65, 165); ctx.bezierCurveTo(95, 115, 150, 205, 194, 143); ctx.stroke();
      });
      mesh(group, new THREE.PlaneGeometry(0.2, 0.18), new THREE.MeshBasicMaterial({ map: label }), 0, 0.25, 0.154);
      cylinder(group, 0.09, 0.09, 0.035, '#b8a875', 0, 0.535);
      break;
    }
    case 'odd-piano': {
      const roll = cylinder(group, 0.13, 0.13, 0.65, '#e8dbc1', 0, 0.2); roll.rotation.z = Math.PI / 2;
      for (const x of [-0.35, 0.35]) { const cap = cylinder(group, 0.17, 0.17, 0.05, '#76502c', x, 0.2); cap.rotation.z = Math.PI / 2; }
      box(group, 0.5, 0.012, 0.3, '#e8dbc1', 0, 0.07, 0.2);
      const notes = paintedTexture(512, 256, ctx => {
        ctx.fillStyle = '#e8dbc1'; ctx.fillRect(0, 0, 512, 256); ctx.fillStyle = '#735d41';
        for (let i = 0; i < 24; i++) ctx.fillRect(20 + i * 20, 30 + (i * 47) % 180, 9, 14 + (i % 3) * 8);
      });
      const paper = mesh(group, new THREE.PlaneGeometry(0.49, 0.29), new THREE.MeshBasicMaterial({ map: notes }), 0, 0.077, 0.2); paper.rotation.x = -Math.PI / 2;
      break;
    }
  }
  return group;
}

/** A clickable cutaway. React owns the controls; room activity is cosmetic. */
export class RoomScene {
  constructor(canvas, { onSelect, onMoveShelf, onMoveWall, onMoveFurniture, onWealthHover, onSpeech, onSpeechPosition, onError } = {}) {
    this.canvas = canvas; this.onSelect = onSelect; this.onMoveShelf = onMoveShelf; this.onMoveFurniture = onMoveFurniture; this.onWealthHover = onWealthHover; this.onError = onError; this.generation = 0;
    this.onMoveWall = onMoveWall; this.onSpeechPosition = onSpeechPosition;
    this.onSpeech = onSpeech; this.activity = new RoomActivity();
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.lighting = setupRoomLighting(this.scene, this.renderer);
    this.view = roomView(); this.camera = makeRoomCamera(1, this.view);
    this.static = new THREE.Group(); this.dynamic = new THREE.Group(); this.highlights = new THREE.Group(); this.dragPreview = new THREE.Group(); this.scene.add(this.static, this.dynamic, this.highlights, this.dragPreview);
    this.picks = []; this.raycaster = new THREE.Raycaster();
    this.buildRoom();
    this.faun = roomFaun(); this.faun.position.set(6.65 * ROOM_FLOOR_SCALE, 0.02, 2.25 * ROOM_FLOOR_SCALE); this.faun.rotation.y = -0.45;
    this.faun.scale.y = 1.25; this.faunHead = this.faun.getObjectByName('faun-head'); this.faunLegs = this.faun.children.filter(part => part.name === 'faun-goat-leg');
    this.faun.visible = false; this.scene.add(this.faun);
    configureShadowObjects(this.static); configureShadowObjects(this.faun);
    this.resize = this.resize.bind(this);
    this.down = this.pointerDown.bind(this); this.up = this.pointerUp.bind(this); this.move = this.pointerMove.bind(this);
    this.cancel = e => { if (e?.pointerId === undefined || this.pointerId === undefined || e.pointerId === this.pointerId) this.cancelPointer(); };
    this.keys = e => {
      if (e.key === 'Escape') this.cancelPointer();
      else if (e.target === this.canvas && this.editing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); this.moveSelected(e.key); }
    };
    this.lost = e => { e.preventDefault(); this.cancelPointer(); this.failed = true; this.stopActivity(); this.onError?.(new Error('The 3D view is unavailable. Use the room controls below.')); };
    this.visible = () => this.visibilityChanged();
    this.motionChange = () => this.render();
    this.motion.addEventListener('change', this.motionChange);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerleave', this.cancel);
    canvas.addEventListener('webglcontextlost', this.lost); document.addEventListener('visibilitychange', this.visible);
    window.addEventListener('blur', this.cancel); document.addEventListener('keydown', this.keys);
    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.inViewport = entry.isIntersecting;
        this.visibilityChanged();
      });
      this.intersectionObserver.observe(canvas);
    }
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas); this.resize();
  }
  resize() {
    if (this.disposed) return;
    this.cancelPointer();
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    const size = roomRenderSize(w, h, window.devicePixelRatio);
    this.renderer.setSize(size.width, size.height, false);
    this.camera = makeRoomCamera(w / h, this.view); this.applyCutaway(); this.render();
  }
  setView(view) {
    if (this.disposed) return;
    this.view = roomView(view);
    this.hovered = false; this.onWealthHover?.(false);
    this.resize();
  }
  pointerDown(e) {
    if (e.isPrimary === false || e.button !== 0 || this.disposed || this.failed) return;
    this.cancelPointer();
    if (this.editing) this.canvas.focus?.({ preventScroll: true });
    this.pointerStart = [e.clientX, e.clientY]; this.pointerId = e.pointerId;
    const target = this.targetAt(e.clientX, e.clientY);
    const shelf = this.editing && this.onMoveShelf && target?.kind === 'anchor' && shelfForAnchor(this.shelves || [], target.anchorId);
    const piece = !shelf && this.editing && this.onMoveFurniture && furnitureOf(target);
    const wall = this.editing && this.onMoveWall && target?.kind === 'anchor' && this.wallDisplays?.[target.anchorId];
    if (wall) this.dragCandidate = { id: target.anchorId, wall: true, originalSpotId: wall, target };
    else if (shelf) this.dragCandidate = { id: shelf.id, originalSpotId: shelf.spotId, target };
    else if (piece) {
      const rect = this.canvas.getBoundingClientRect(), origin = new THREE.Vector3(this.furniture[piece].x, 0, this.furniture[piece].z).project(this.camera);
      const grab = { x: e.clientX - rect.left - (origin.x + 1) * rect.width / 2, y: e.clientY - rect.top - (1 - origin.y) * rect.height / 2 };
      this.dragCandidate = { furniture: piece, grab, target };
    }
    if (shelf || wall) {
      const spot = (wall ? ROOM_WALL_SPOTS : ROOM_SHELF_SPOTS).find(spot => spot.id === (wall || shelf.spotId));
      const point = new THREE.Vector3(...(wall ? wallDisplayPosition(spot) : roomShelfPosition(spot)));
      if (wall) point.y += 0.4;
      point.project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      this.dragCandidate.grab = { x: e.clientX - rect.left - (point.x + 1) * rect.width / 2, y: e.clientY - rect.top - (1 - point.y) * rect.height / 2 };
    }
  }
  /** Keep the grabbed point under the pointer, even when picking the top of tall furniture. */
  dragPlace(e) {
    const { furniture: id, grab } = this.dragging, rect = this.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.left + rect.width || e.clientY < rect.top || e.clientY > rect.top + rect.height) return null;
    const place = floorPoint(this.camera, rect, e.clientX - grab.x, e.clientY - grab.y);
    const moved = place && { ...this.furniture, [id]: { ...this.furniture[id], ...place } };
    return place && { ...place, fits: furnitureFits(moved, id) && wallMountsFit(this.shelves, this.wallDisplays, moved) };
  }
  moveDragObjects(offset = new THREE.Vector3()) {
    for (const { object, position, rotation } of this.dragging?.objects || []) { object.position.copy(position).add(offset); if (rotation) object.rotation.copy(rotation); }
    if (this.dragging) this.lighting?.invalidate();
  }
  showDragPlace(place, fits) {
    const key = place ? `${place.x},${place.z},${fits}` : '';
    if (this.dragging.key === key) return;
    this.dragging.key = key;
    const current = this.furniture[this.dragging.furniture];
    this.moveDragObjects(place ? new THREE.Vector3(place.x - current.x, 0, place.z - current.z) : undefined);
    disposeObjects(this.dragPreview); this.dragPreview.clear();
    if (place) {
      const id = this.dragging.furniture, [w, d] = ROOM_FURNITURE[id].size, geometry = new THREE.BoxGeometry(w, 0.1, d);
      const marker = mesh(this.dragPreview, geometry, new THREE.MeshBasicMaterial({ color: fits ? '#b9df83' : '#d8604f', transparent: true, opacity: 0.4, depthWrite: false }), place.x, 0.08, place.z);
      marker.rotation.y = this.furniture[id].r * Math.PI / 2; marker.renderOrder = 5;
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: fits ? '#ffdc83' : '#d8604f', transparent: true, opacity: 0.75 }));
      outline.position.copy(marker.position); outline.rotation.copy(marker.rotation); this.dragPreview.add(outline);
    }
    this.render();
  }
  pointerMove(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    if (this.dragCandidate && this.pointerStart && Math.hypot(e.clientX - this.pointerStart[0], e.clientY - this.pointerStart[1]) > 6) {
      if (!this.editing || this.disposed || this.failed) { this.cancelPointer(); return; }
      this.dragging = this.dragCandidate; this.dragCandidate = null;
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch { this.cancelPointer(); return; }
      const id = this.dragging.furniture || this.dragging.id;
      const fixture = { ...this.fixtures, wardrobe: this.wardrobe, rug: this.rug }[id];
      this.dragging.objects = [fixture, ...this.dynamic.children.filter(object => object.userData.dragId === id)].filter(Boolean)
        .map(object => ({ object, position: object.position.clone(), rotation: object.rotation.clone() }));
      this.highlights.visible = false;
      this.canvas.style.cursor = 'grabbing'; this.hovered = false; this.onWealthHover?.(false);
      this.onSelect?.(this.dragging.target);
    }
    if (this.dragging?.furniture) { const place = this.dragPlace(e); this.showDragPlace(place, !!place?.fits); return; }
    if (this.dragging) {
      const spot = this.dragSpot(e);
      this.showDragSpot(spot?.id || null); return;
    }
    if (e.pointerType === 'touch') return;
    const target = this.targetAt(e.clientX, e.clientY), hovered = target?.kind === 'wealth';
    this.canvas.style.cursor = this.editing && (furnitureOf(target) || this.wallDisplays?.[target?.anchorId] || shelfForAnchor(this.shelves || [], target?.anchorId)) ? 'grab' : '';
    if (this.hovered !== hovered) { this.hovered = hovered; this.onWealthHover?.(hovered); }
  }
  pointerUp(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    const start = this.pointerStart, dragging = this.dragging;
    const live = dragging && this.editing && !this.failed && !this.disposed;
    if (live && dragging.furniture) {
      const place = this.dragPlace(e), current = this.furniture[dragging.furniture];
      this.cancelPointer();
      if (place?.fits && (place.x !== current.x || place.z !== current.z)) this.onMoveFurniture?.(dragging.furniture, { x: place.x, z: place.z });
      return;
    }
    const spot = live && !dragging.furniture && this.dragSpot(e);
    this.cancelPointer();
    if (dragging) {
      if (spot && spot.id !== dragging.originalSpotId) (dragging.wall ? this.onMoveWall : this.onMoveShelf)?.(dragging.id, spot.id);
      return;
    }
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8 || this.disposed || this.failed) return;
    const selection = this.targetAt(e.clientX, e.clientY);
    if (selection) this.onSelect?.(selection);
  }
  cancelPointer() {
    this.moveDragObjects();
    if (this.highlights) this.highlights.visible = true;
    if (this.pointerId !== undefined && this.canvas?.hasPointerCapture?.(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.pointerStart = null; this.pointerId = undefined; this.dragging = null; this.dragCandidate = null;
    if (this.canvas?.style) this.canvas.style.cursor = '';
    if (this.dragPreview?.children.length) { disposeObjects(this.dragPreview); this.dragPreview.clear(); this.render(); }
    this.hovered = false; this.onWealthHover?.(false);
  }
  dragSpot(e) {
    const rect = this.canvas.getBoundingClientRect(), { id, wall, grab } = this.dragging;
    return wall ? nearestWallSpot(this.camera, rect, e.clientX, e.clientY, this.shelves, this.wallDisplays, id, this.furniture, grab)
      : nearestShelfSpot(this.camera, rect, e.clientX, e.clientY, this.shelves, id, this.wallDisplays, this.furniture, grab);
  }
  /** Move a selected object with the same clearance rules, without a wall-location menu. */
  moveSelected(key) {
    if (!this.editing || this.disposed || this.failed || !this.selection) return;
    this.cancelPointer();
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }, direction = directions[key];
    if (!direction) return;
    const id = furnitureOf(this.selection);
    if (id) {
      const axes = nudgeAxes(this.view?.rotation), axis = direction[0] ? axes.right : axes.away, sign = direction[0] || direction[1];
      const current = this.furniture[id], place = { x: current.x + axis[0] * sign * 0.25, z: current.z + axis[1] * sign * 0.25 };
      const moved = { ...this.furniture, [id]: { ...current, ...place } };
      if (furnitureFits(moved, id) && wallMountsFit(this.shelves, this.wallDisplays, moved)) this.onMoveFurniture?.(id, place);
      return;
    }
    const shelf = shelfForAnchor(this.shelves, this.selection.anchorId), wall = this.wallDisplays[this.selection.anchorId];
    if (!shelf && !wall) return;
    const spots = shelf ? ROOM_SHELF_SPOTS : ROOM_WALL_SPOTS, position = shelf ? roomShelfPosition : wallDisplayPosition;
    const current = spots.find(spot => spot.id === (shelf?.spotId || wall)), origin = new THREE.Vector3(...position(current)).project(this.camera);
    let closest = null, score = Infinity;
    for (const spot of spots) {
      if (spot.id === current.id) continue;
      const fits = shelf ? wallMountsFit(this.shelves.map(value => value.id === shelf.id ? { ...value, spotId: spot.id } : value), this.wallDisplays, this.furniture)
        : wallSpotAvailable(this.shelves, this.wallDisplays, this.selection.anchorId, spot.id, this.furniture);
      if (!fits) continue;
      const point = new THREE.Vector3(...position(spot)).project(this.camera).sub(origin);
      const forward = point.x * direction[0] + point.y * direction[1], sideways = Math.abs(point.x * direction[1] - point.y * direction[0]);
      if (forward <= 0.015) continue;
      const distance = Math.hypot(point.x, point.y) * (1 + sideways / forward);
      if (distance < score) { closest = spot; score = distance; }
    }
    if (closest) (shelf ? this.onMoveShelf : this.onMoveWall)?.(shelf?.id || this.selection.anchorId, closest.id);
  }
  showDragSpot(spotId) {
    if (!this.dragPreview || this.dragging?.spotId === spotId) return;
    this.dragging.spotId = spotId;
    const { wall, id } = this.dragging, spots = wall ? ROOM_WALL_SPOTS : ROOM_SHELF_SPOTS, position = wall ? wallDisplayPosition : roomShelfPosition;
    const origin = spots.find(spot => spot.id === this.dragging.originalSpotId), destination = spots.find(spot => spot.id === spotId);
    this.moveDragObjects(destination ? new THREE.Vector3(...position(destination)).sub(new THREE.Vector3(...position(origin))) : undefined);
    if (destination) for (const { object, rotation } of this.dragging.objects || []) object.rotation.y = rotation.y + ((destination.wallSide === 'left') - (origin.wallSide === 'left')) * Math.PI / 2;
    disposeObjects(this.dragPreview); this.dragPreview.clear();
    const spot = destination || origin, size = ROOM_SHELF_SIZES[this.shelves.find(shelf => shelf.id === id)?.sizeId || 'standard'];
    if (spot) {
      const geometry = new THREE.BoxGeometry(...(wall ? [1.2, 1.1, 0.12] : [size.width + 0.05, 0.12, size.depth + 0.05]));
      const marker = mesh(this.dragPreview, geometry, new THREE.MeshBasicMaterial({ color: destination ? '#b9df83' : '#d8604f', transparent: true, opacity: 0.3, depthWrite: false }), ...position(spot));
      marker.rotation.y = (spot.wallSide === (wall ? 'left' : 'back')) ? (wall ? 1 : -1) * Math.PI / 2 : 0;
      if (wall) marker.position.y += 0.4;
      marker.renderOrder = 5;
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: destination ? '#ffdc83' : '#d8604f', transparent: true, opacity: 0.85 }));
      outline.position.copy(marker.position); outline.rotation.copy(marker.rotation); this.dragPreview.add(outline);
    }
    this.render();
  }
  targetAt(x, y) {
    if (this.disposed || this.failed) return null;
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    this.raycaster.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), this.camera);
    const picks = [...this.picks, ...(this.shelfItemPicks || [])];
    const targets = this.editing ? [...picks, ...this.walls] : picks.filter(target => target.userData.selection.kind !== 'surface');
    const hit = this.raycaster.intersectObjects(targets.filter(target => shown(target) && !(this.wagon && target.userData.selection.anchorId === 'window')), false)[0];
    const wagonHit = this.wagon && this.raycaster.intersectObject(this.wagon, true)[0];
    if (wagonHit && (!hit || wagonHit.distance < hit.distance)) return { kind: 'anchor', anchorId: 'window' };
    return hit?.object.userData.selection || null;
  }
  applyCutaway() {
    if (!this.camera) return;
    const visible = roomWallVisibility(this.camera.position);
    if (this.backWall) this.backWall.visible = visible.back;
    if (this.leftWall) this.leftWall.visible = visible.left;
    if (this.cornerPost) this.cornerPost.visible = visible.back || visible.left;
    for (const group of [this.dynamic, this.highlights]) for (const object of group?.children || []) {
      if (object.userData.wallSide) object.visible = visible[object.userData.wallSide];
    }
    this.lighting?.invalidate();
  }
  setEditing(active, selection) {
    if (this.disposed) return;
    if (active && !this.editing) this.stopActivity();
    this.editing = !!active; this.selection = selection;
    if (!this.editing) this.cancelPointer();
    if (this.canvas?.style) this.canvas.style.touchAction = this.editing ? 'none' : 'pan-y';
    disposeObjects(this.highlights); this.highlights.clear();
    this.wallMaterial.emissive.set(this.editing ? '#8b6529' : '#000000');
    this.wallMaterial.emissiveIntensity = this.editing ? (selection?.kind === 'finish' ? 0.35 : 0.12) : 0;
    if (this.editing) for (const target of this.picks) {
      const chosen = target.userData.selection;
      if (!['anchor', 'wardrobe', 'pet', 'wealth', 'surface'].includes(chosen.kind)) continue;
      const selected = chosen.kind === selection?.kind && (chosen.kind !== 'anchor' || chosen.anchorId === selection.anchorId) && (chosen.kind !== 'surface' || chosen.surface === selection.surface);
      const glow = new THREE.Group(); glow.position.copy(target.position); glow.rotation.copy(target.rotation); glow.scale.copy(target.scale);
      glow.userData.selection = chosen; glow.userData.wallSide = target.userData.wallSide;
      const geometry = target.geometry.clone();
      mesh(glow, geometry, new THREE.MeshBasicMaterial({ color: '#f2c65a', transparent: true, opacity: selected ? 0.08 : 0.025, depthWrite: false }));
      glow.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#ffdc83', transparent: true, opacity: selected ? 0.9 : 0.38, depthWrite: false })));
      this.highlights.add(glow);
    }
    this.applyCutaway(); this.render();
  }
  buildRoom() {
    this.structure = new THREE.Group(); this.structure.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE); this.static.add(this.structure);
    const p = this.structure;
    const floorMap = paintedTexture(128, 128, ctx => {
      ctx.fillStyle = '#815a38'; ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#936b43' : '#a0794e'; ctx.fillRect(1, i * 16 + 1, 126, 14);
        ctx.fillStyle = '#8b623c';
        for (let j = 0; j < 3; j++) ctx.fillRect(5 + (i * 13 + j * 19) % 45, i * 16 + 4 + j * 3, 35 + (i + j) % 20, 1);
        ctx.fillStyle = '#62432b'; ctx.fillRect((i * 34) % 96 + 16, i * 16 + 1, 1, 14);
      }
    });
    floorMap.magFilter = THREE.LinearFilter; floorMap.minFilter = THREE.LinearMipmapLinearFilter; floorMap.generateMipmaps = true;
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping; floorMap.repeat.set(4 * ROOM_FLOOR_SCALE, 3 * ROOM_FLOOR_SCALE);
    const stoneMap = paintedTexture(128, 128, ctx => {
      ctx.fillStyle = '#56534a'; ctx.fillRect(0, 0, 128, 128);
      for (let row = 0; row < 4; row++) for (let col = -1; col < 5; col++) {
        const x = col * 36 + row % 2 * 18;
        ctx.fillStyle = ['#aaa69b', '#92958b', '#b5b0a0'][(col + row + 6) % 3];
        ctx.fillRect(x + 1, row * 32 + 1, 34, 30);
        ctx.fillStyle = '#89877f'; ctx.fillRect(x + 4, row * 32 + 6, 17, 1);
      }
    });
    stoneMap.magFilter = THREE.LinearFilter; stoneMap.minFilter = THREE.LinearMipmapLinearFilter; stoneMap.generateMipmaps = true;
    stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping; stoneMap.repeat.set(3 * ROOM_FLOOR_SCALE, 2 * ROOM_FLOOR_SCALE);
    this.floorMaps = { planks: floorMap, stone: stoneMap };
    this.floor = mesh(p, new THREE.BoxGeometry(8.5, 0.2, 6.5), material('#f0d4a2', { map: floorMap }), 0, -0.1, 0);
    this.wallMaterial = material('#8c6243'); this.walls = [];
    this.backWall = new THREE.Group(); this.leftWall = new THREE.Group(); p.add(this.backWall, this.leftWall);
    const wall = (parent, w, h, d, x, y, z) => {
      const panel = mesh(parent, new THREE.BoxGeometry(w, h, d), this.wallMaterial, x, y, z);
      panel.userData.selection = { kind: 'finish' }; this.walls.push(panel); return panel;
    };
    const opening = { left: -0.3, right: 1.8, bottom: 1.4, top: 2.85 };
    const openingWidth = opening.right - opening.left, openingHeight = opening.top - opening.bottom;
    const windowX = (opening.left + opening.right) / 2, windowY = (opening.bottom + opening.top) / 2;
    wall(this.backWall, opening.left + 4, ROOM_WALL_HEIGHT, 0.16, (opening.left - 4) / 2, ROOM_WALL_HEIGHT / 2, -3);
    wall(this.backWall, 4 - opening.right, ROOM_WALL_HEIGHT, 0.16, (opening.right + 4) / 2, ROOM_WALL_HEIGHT / 2, -3);
    wall(this.backWall, openingWidth, opening.bottom, 0.16, windowX, opening.bottom / 2, -3);
    wall(this.backWall, openingWidth, ROOM_WALL_HEIGHT - opening.top, 0.16, windowX, (opening.top + ROOM_WALL_HEIGHT) / 2, -3);
    wall(this.leftWall, 0.16, ROOM_WALL_HEIGHT, 6, -4, ROOM_WALL_HEIGHT / 2, 0);
    this.cornerPost = box(p, 0.11, ROOM_WALL_HEIGHT + 0.1, 0.25, '#49321f', -4, ROOM_WALL_HEIGHT / 2 + 0.02, -2.9);
    box(this.backWall, 0.11, ROOM_WALL_HEIGHT + 0.1, 0.25, '#49321f', 4, ROOM_WALL_HEIGHT / 2 + 0.02, -2.9);
    box(this.backWall, 8.25, 0.15, 0.26, '#49321f', 0, ROOM_WALL_HEIGHT + 0.02, -2.91);
    box(this.leftWall, 0.26, 0.15, 6.2, '#49321f', -3.97, ROOM_WALL_HEIGHT + 0.02);
    for (let y = 0.4; y < ROOM_WALL_HEIGHT; y += 0.5) {
      if (y > opening.bottom && y < opening.top) {
        box(this.backWall, opening.left + 4, 0.025, 0.02, '#735238', (opening.left - 4) / 2, y, -2.9);
        box(this.backWall, 4 - opening.right, 0.025, 0.02, '#735238', (opening.right + 4) / 2, y, -2.9);
      } else box(this.backWall, 8, 0.025, 0.02, '#735238', 0, y, -2.9);
    }
    // A recessed landscape, four glass panes and a projecting sill make this read as an exterior window.
    const landscape = paintedTexture(256, 192, ctx => {
      const sky = ctx.createLinearGradient(0, 0, 0, 192); sky.addColorStop(0, '#91b7c0'); sky.addColorStop(1, '#f0d2a0');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 192);
      ctx.fillStyle = '#f6dfab'; ctx.beginPath(); ctx.arc(193, 42, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9b987c'; ctx.beginPath(); ctx.moveTo(0, 122); ctx.lineTo(48, 87); ctx.lineTo(91, 103); ctx.lineTo(151, 76); ctx.lineTo(210, 108); ctx.lineTo(256, 96); ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
      ctx.fillStyle = '#778363'; ctx.beginPath(); ctx.moveTo(0, 148); ctx.lineTo(83, 119); ctx.lineTo(166, 143); ctx.lineTo(256, 121); ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
      ctx.fillStyle = '#b4a174'; ctx.fillRect(0, 168, 256, 24);
      ctx.strokeStyle = '#786447'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 161); ctx.lineTo(256, 170);
      for (let x = 15; x < 256; x += 38) { ctx.moveTo(x, 151); ctx.lineTo(x, 175); } ctx.stroke();
    });
    landscape.magFilter = landscape.minFilter = THREE.LinearFilter;
    mesh(this.backWall, new THREE.PlaneGeometry(openingWidth, openingHeight), new THREE.MeshBasicMaterial({ map: landscape }), windowX, windowY, -3.14);
    const pane = new THREE.MeshBasicMaterial({ color: '#d0e6e2', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    mesh(this.backWall, new THREE.PlaneGeometry(openingWidth - 0.12, openingHeight - 0.12), pane, windowX, windowY, -2.91);
    for (const x of [opening.left, opening.right]) box(this.backWall, 0.13, openingHeight + 0.18, 0.23, '#a47a43', x, windowY, -2.94);
    for (const y of [opening.bottom, opening.top]) box(this.backWall, openingWidth + 0.2, 0.13, 0.23, '#c39b58', windowX, y, -2.92);
    box(this.backWall, 0.065, openingHeight - 0.08, 0.08, '#bb995f', windowX, windowY, -2.84);
    box(this.backWall, openingWidth - 0.08, 0.065, 0.08, '#bb995f', windowX, windowY, -2.84);
    box(this.backWall, openingWidth + 0.3, 0.11, 0.46, '#cea96e', windowX, opening.bottom - 0.04, -2.77);
    box(this.backWall, openingWidth + 0.06, 0.16, 0.09, '#987047', windowX, opening.bottom - 0.17, -2.88);
    box(this.backWall, 0.12, 0.035, 0.055, '#6b5735', windowX + 0.06, windowY - 0.05, -2.77);
    // A ground-level side yard keeps large outdoor possessions visible beyond the room's edge.
    box(p, 4.2, 0.16, 6, '#78805a', 6.35, -0.08, 0);
    box(p, 4.1, 0.015, 0.95, '#ab9569', 6.35, 0.01, 1.9);
    box(p, 0.4, 0.08, 1.05, '#ad8657', 4.45, 0.04, 1.9);
    for (const x of [4.4, 6.35, 8.35]) box(p, 0.12, 0.78, 0.12, '#80603c', x, 0.39, -2.9);
    for (const y of [0.28, 0.58]) box(p, 3.95, 0.1, 0.09, '#a58656', 6.375, y, -2.9);
    for (const z of [-2.9, -1.45]) box(p, 0.12, 0.78, 0.12, '#80603c', 8.35, 0.39, z);
    for (const y of [0.28, 0.58]) box(p, 0.09, 0.1, 1.45, '#a58656', 8.35, y, -2.175);
    this.buildSideDoor();
    // Furnishings keep their original size while their origins spread across the larger floor.
    const desk = this.fixture();
    this.table(desk, 0, 0, 1.8, 0.9, 0.9);
    box(desk, 1.5, 0.3, 0.07, '#65462e', 0, 0.67, 0.41);
    cylinder(desk, 0.035, 0.035, 0.06, '#c4a05d', 0, 0.67, 0.47).rotation.x = Math.PI / 2;
    const terrarium = this.fixture();
    this.table(terrarium, 0, 0, 1.5, 1.05, 0.85);
    box(terrarium, 1.55, 0.07, 1.1, '#a5a16d', 0, 0.97);
    const glass = material('#b3d2b7', { transparent: true, opacity: 0.13, depthWrite: false });
    mesh(terrarium, new THREE.BoxGeometry(1.5, 1.05, 1.05), glass, 0, 1.55);
    for (const x of [-0.75, 0.75]) for (const z of [-0.525, 0.525]) box(terrarium, 0.045, 1.08, 0.045, '#c7a66b', x, 1.55, z);
    box(terrarium, 1.6, 0.12, 1.15, '#5c5537', 0, 2.12);
    this.wardrobe = this.fixture();
    this.rug = this.fixture();
    const moneyTable = this.fixture();
    this.fixtures = { desk, pet: terrarium, wealth: moneyTable };
    this.table(moneyTable, 0, 0, 2.2, 1.3, 0.95);
    box(moneyTable, 2.05, 0.08, 1.13, '#4a3526', 0, 1.04);
    for (const z of [-0.58, 0.58]) box(moneyTable, 2.12, 0.08, 0.04, '#b08b4d', 0, 1.12, z);
    for (const x of [-1.05, 1.05]) box(moneyTable, 0.04, 0.08, 1.2, '#b08b4d', x, 1.12);
    cylinder(this.leftWall, 0.22, 0.22, 0.14, '#c39b58', -3.62, 2.7, 1.9);
  }
  /** Furniture is built around its own origin; update() places it from the saved layout. */
  fixture() {
    const group = new THREE.Group(); this.static.add(group); return group;
  }
  buildSideDoor() {
    const side = new THREE.Group(); side.name = 'yard-partition'; (this.structure || this.static).add(side);
    const trim = '#956c42', dark = '#59422e', doorTop = ROOM_DOOR_HEIGHT + 0.06;
    // Clear glazing keeps the full-height yard wall from obscuring the cutaway room.
    for (const [from, to] of [[-3, 0.8], [2.25, 3]]) {
      const length = to - from, z = (from + to) / 2;
      const panel = mesh(side, new THREE.BoxGeometry(0.14, 0.58, length), this.wallMaterial, 4.08, 0.29, z);
      panel.userData.selection = { kind: 'finish' }; this.walls.push(panel);
      box(side, 0.24, 0.09, length, trim, 4.08, 0.63, z);
      for (let y = 0.18; y < 0.55; y += 0.18) box(side, 0.16, 0.018, length, dark, 4.08, y, z);
    }
    const glass = new THREE.MeshBasicMaterial({ color: '#c1d5cb', transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide });
    for (const [from, to] of [[-2.98, -1.15], [-1.15, 0.78]]) {
      const z = (from + to) / 2, length = to - from;
      mesh(side, new THREE.BoxGeometry(0.02, doorTop - 0.72, length - 0.12), glass, 4.08, (doorTop + 0.72) / 2, z);
      for (const y of [0.72, (doorTop + 0.72) / 2, doorTop]) box(side, 0.1, 0.06, length, trim, 4.08, y, z);
    }
    for (const z of [-3, -1.15, 0.8, 2.25, 3]) box(side, 0.12, ROOM_WALL_HEIGHT + 0.1, 0.12, trim, 4.08, ROOM_WALL_HEIGHT / 2 + 0.02, z);
    box(side, 0.18, 0.15, 6.2, dark, 4.08, ROOM_WALL_HEIGHT + 0.02, 0);
    box(side, 0.14, 0.12, 6, trim, 4.08, doorTop + 0.08, 0);
    const clerestoryBottom = doorTop + 0.14, clerestoryTop = ROOM_WALL_HEIGHT - 0.08;
    mesh(side, new THREE.BoxGeometry(0.02, clerestoryTop - clerestoryBottom, 5.88), glass, 4.08, (clerestoryTop + clerestoryBottom) / 2, 0);
    box(side, 0.48, 0.1, 1.48, '#bda079', 4.18, 0.025, 1.525);
    // Door leaf swings out into the clear walkway, away from the parked wagon.
    const door = new THREE.Group(); door.name = 'open-yard-door'; door.position.set(4.08, 0.06, 2.2); door.rotation.y = -Math.PI / 2.7; side.add(door);
    door.scale.y = ROOM_DOOR_HEIGHT / 2.45;
    for (const z of [0, -1.3]) box(door, 0.08, 2.45, 0.1, trim, 0, 1.225, z);
    for (const y of [0.05, 0.85, 2.4]) box(door, 0.08, 0.1, 1.4, trim, 0, y, -0.65);
    box(door, 0.055, 0.7, 1.2, '#785332', 0, 0.45, -0.65);
    mesh(door, new THREE.BoxGeometry(0.018, 1.4, 1.2), glass, 0, 1.62, -0.65);
    const handle = cylinder(door, 0.035, 0.035, 0.12, '#d2ae65', 0.09, 1.02, -1.17); handle.rotation.z = Math.PI / 2;
    for (const y of [0.3, 2.15]) box(door, 0.09, 0.13, 0.18, '#4f4b40', 0, y, -0.02);
    for (let i = 0; i < 6; i++) {
      const step = box(this.structure || this.static, 0.5, 0.035, 0.65, i % 2 ? '#b2a082' : '#c1ae8b', 4.6 + i * 0.67, 0.035, 1.52 + (i % 2) * 0.12); step.rotation.y = i % 2 ? 0.08 : -0.09;
    }
  }
  table(parent, x, z, w, d, h) {
    box(parent, w, 0.14, d, '#93633c', x, h, z);
    for (const part of [-0.25, 0.25]) box(parent, w - 0.08, 0.006, 0.012, '#62432c', x, h + 0.073, z + part * d);
    for (const side of [-1, 1]) box(parent, w - 0.2, 0.16, 0.07, '#765033', x, h - 0.14, z + side * (d / 2 - 0.12));
    for (const dx of [-w / 2 + 0.12, w / 2 - 0.12]) for (const dz of [-d / 2 + 0.12, d / 2 - 0.12]) box(parent, 0.12, h, 0.12, '#59402a', x + dx, h / 2, z + dz);
  }
  furnishings(finishes) {
    if (this.floor) {
      this.floor.material.color.set(finishColor('floor', finishes.floor));
      const map = this.floorMaps[finishes.floor.typeId];
      if (this.floor.material.map !== map) { this.floor.material.map = map; this.floor.material.needsUpdate = true; }
    }
    const wardrobeKey = JSON.stringify(finishes.wardrobe);
    if (this.wardrobe && this.wardrobe.userData.finishKey !== wardrobeKey) {
      disposeObjects(this.wardrobe); this.wardrobe.clear(); this.wardrobe.userData.finishKey = wardrobeKey;
      const color = finishColor('wardrobe', finishes.wardrobe);
      box(this.wardrobe, 1.5, 2.5, 0.85, shade(color, 0.65), 0, 1.25, 0);
      for (const x of [-0.35, 0.35]) {
        box(this.wardrobe, 0.63, 2.22, 0.08, color, x, 1.25, 0.47);
        cylinder(this.wardrobe, 0.035, 0.035, 0.07, '#c4a05d', x + (x < 0 ? 0.18 : -0.18), 1.25, 0.56).rotation.x = Math.PI / 2;
        if (finishes.wardrobe.typeId === 'paneled') for (const y of [0.7, 1.8]) box(this.wardrobe, 0.48, 0.8, 0.04, shade(color, 0.82), x, y, 0.53);
        for (const y of [0.45, 2.05]) box(this.wardrobe, 0.045, 0.14, 0.035, '#514b40', x + Math.sign(x) * 0.29, y, 0.525);
      }
      if (finishes.wardrobe.typeId === 'classic') box(this.wardrobe, 0.54, 0.85, 0.025, '#a8b5a2', -0.35, 1.65, 0.53);
      else { box(this.wardrobe, 1.65, 0.12, 0.96, color, 0, 2.52); box(this.wardrobe, 1.6, 0.1, 0.93, color, 0, 0.04); }
    }
    const rugKey = JSON.stringify(finishes.rug);
    if (this.rug && this.rug.userData.finishKey !== rugKey) {
      disposeObjects(this.rug); this.rug.clear(); this.rug.userData.finishKey = rugKey;
      if (finishes.rug.typeId !== 'none') {
        const color = finishColor('rug', finishes.rug);
        box(this.rug, 3.5, 0.025, 2.1, color);
        if (finishes.rug.typeId === 'striped') for (const z of [-0.8, -0.4, 0, 0.4, 0.8]) box(this.rug, 3.42, 0.008, 0.11, '#cbb68d', 0, 0.02, z);
        else for (const z of [-0.96, 0.96]) box(this.rug, 3.34, 0.008, 0.035, shade(color, 1.4), 0, 0.02, z);
        for (const x of [-1.69, 1.69]) box(this.rug, 0.025, 0.008, 1.94, '#cbb68d', x, 0.02);
      }
    }
  }
  shelf(shelf, position) {
    const group = new THREE.Group(); group.position.set(...position); this.dynamic.add(group);
    if (ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId)?.wallSide === 'back') group.rotation.y = -Math.PI / 2;
    group.userData.dragId = shelf.id;
    const color = finishColor('shelf', shelf), size = ROOM_SHELF_SIZES[shelf.sizeId || 'standard'];
    box(group, size.width, 0.14, size.depth, shade(color, 0.58), 0, -0.08, 0);
    box(group, size.width, 0.08, size.depth, color, 0, 0.02, 0);
    for (const slot of shelfSlots(shelf)) for (const z of [-0.21, 0.21]) box(group, 1.17, 0.004, 0.009, shade(color, 0.65), 0, 0.063, slot.offset + z);
    if (shelf.typeId === 'braced') for (const z of [-size.depth / 2 + 0.13, size.depth / 2 - 0.13]) {
      box(group, 0.08, 0.25, 0.08, shade(color, 0.65), -0.48, -0.16, z);
      const brace = box(group, 0.65, 0.06, 0.06, shade(color, 0.65), -0.22, -0.16, z); brace.rotation.z = 0.3;
    }
    return group;
  }
  pick(position, size, selection, turn = 0) {
    const target = mesh(this.dynamic, new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), ...position);
    target.rotation.y = turn;
    if (selection.kind === 'anchor' && selection.anchorId.startsWith('wall-')) target.userData.wallSide = ROOM_WALL_SPOTS.find(spot => spot.id === this.wallDisplays?.[selection.anchorId])?.wallSide || 'back';
    target.userData.selection = selection; this.picks.push(target);
    return target;
  }
  update(view) {
    if (this.disposed) return;
    this.cancelPointer();
    const generation = ++this.generation;
    disposeObjects(this.dynamic); this.dynamic.clear(); this.picks = []; this.shelfItemPicks = []; this.wagon = null;
    this.shelves = roomShelves(view.shelves);
    this.wallDisplays = roomWallDisplays(view.wallDisplays, this.shelves);
    const furniture = this.furniture = roomFurniture(view.furniture), turn = id => furniture[id].r * Math.PI / 2;
    for (const [id, group] of Object.entries({ ...this.fixtures, wardrobe: this.wardrobe, rug: this.rug })) {
      if (!group) continue;
      group.position.set(furniture[id].x, id === 'rug' ? ROOM_FIXTURES.rug[1] : 0, furniture[id].z);
      group.rotation.y = turn(id); group.visible = !furniture[id].off;
    }
    this.furnishings(roomFinishes(view.finishes));
    this.wallMaterial.color.set(PAINT[view.themeId] || PAINT['bunkhouse-timber']);
    const shelfGroups = new Map();
    for (const [anchorId, position] of Object.entries(roomPositions(this.shelves, furniture, this.wallDisplays))) {
      const shelf = shelfForAnchor(this.shelves, anchorId);
      if (shelf && !shelfGroups.has(shelf.id)) shelfGroups.set(shelf.id, this.shelf(shelf, roomShelfPosition(ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId))));
      const holder = shelf ? shelfGroups.get(shelf.id) : null;
      const wallSpot = ROOM_WALL_SPOTS.find(spot => spot.id === this.wallDisplays[anchorId]);
      const rotation = wallSpot?.wallSide === 'left' ? Math.PI / 2 : holder ? holder.rotation.y : furniture[anchorId] ? turn(anchorId) : 0;
      const itemId = view.placements?.find(p => p.anchorId === anchorId)?.itemId;
      if (ROOM_ITEM[itemId]) {
        const prop = oddity(itemId); if (!holder) { prop.position.set(...position); prop.rotation.y = rotation; }
        else prop.position.z = shelfSlots(shelf).find(slot => slot.id === anchorId).offset;
        if (!holder && (furniture[anchorId] || wallSpot)) prop.userData.dragId = anchorId;
        if (wallSpot) prop.userData.wallSide = wallSpot.wallSide;
        if (anchorId === 'window') { prop.scale.setScalar(1.65); prop.rotation.y -= 0.16; this.wagon = prop; }
        if (holder) prop.traverse(part => { if (part.isMesh) { part.userData.selection = { kind: 'anchor', anchorId }; this.shelfItemPicks.push(part); } });
        (holder || this.dynamic).add(prop);
      }
      const wall = anchorId.startsWith('wall');
      const height = anchorId === 'window' ? 1.125 : wall ? 0.4 : shelf ? -0.04 : 0.3;
      // Pick shelf boards and visible items separately so neighboring slots cannot cover each other.
      const size = anchorId === 'window' ? [2.8, 2.25, 2.05] : anchorId === 'desk' ? [1.9, 0.9, 1.1] : wall ? [1.2, 1.1, 0.3] : [1.25, shelf ? 0.22 : 0.9, 0.8];
      this.pick([position[0], position[1] + height, position[2]], size, { kind: 'anchor', anchorId }, rotation);
    }
    this.pet(view.pet);
    this.resident(view.owner, generation);
    this.wealth(view.wealthStage);
    this.pick([furniture.pet.x, 1.5, furniture.pet.z], [1.65, 1.35, 1.2], { kind: 'pet' }, turn('pet'));
    if (!furniture.wardrobe.off) this.pick([furniture.wardrobe.x, 1.3, furniture.wardrobe.z], [1.7, 2.6, 1], { kind: 'wardrobe' }, turn('wardrobe'));
    this.pick([furniture.wealth.x, 1.4, furniture.wealth.z], [2.1, 1, 1.25], { kind: 'wealth' }, turn('wealth'));
    this.pick([0, -0.08, 0], [8.5 * ROOM_FLOOR_SCALE, 0.14, 6.5 * ROOM_FLOOR_SCALE], { kind: 'surface', surface: 'floor' });
    this.pick([furniture.rug.x, 0.045, furniture.rug.z], [3.5, 0.02, 2.1], { kind: 'surface', surface: 'rug' }, turn('rug'));
    configureShadowObjects(this.static); configureShadowObjects(this.dynamic); this.lighting?.invalidate();
    this.setEditing(this.editing, this.selection);
  }
  pet(pet) {
    if (!pet) return;
    let map;
    if (pet.stage === 'creature' && BY_ID[pet.species]) map = canvasTexture(spriteCanvas(BY_ID[pet.species], pet.style));
    else if (pet.stage === 'egg' || pet.stage === 'dead') map = paintedTexture(128, 128, ctx => {
      if (pet.stage === 'egg') drawEgg(ctx, { w: 128, h: 128, still: true }); else drawGrave(ctx, { w: 128, h: 128 });
    }, true);
    if (map) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      sprite.position.set(this.furniture.pet.x, 1.56, this.furniture.pet.z); sprite.scale.set(0.95, 0.95, 1); this.dynamic.add(sprite);
      sprite.userData.dragId = 'pet';
    }
  }
  resident(owner, generation) {
    const group = new THREE.Group(); group.position.set(this.furniture?.rug.x ?? ROOM_FIXTURES.resident[0], ROOM_FIXTURES.resident[1], this.furniture?.rug.z ?? ROOM_FIXTURES.resident[2]); group.rotation.y = 0.35; this.dynamic.add(group);
    group.userData.dragId = 'rug';
    this.residentGroup = group; this.residentHome = group.position.clone(); this.residentRoute = residentStep(this.furniture, this.shelves, this.wallDisplays);
    const avatar = owner?.avatar, seed = avatar?.seed || owner?.id || 'room-resident', look = looks(seed);
    const shirt = avatar?.wear?.body?.c || avatar?.wear?.skin?.c || look.shirt;
    this.residentLegs = [-0.14, 0.14].map(x => {
      const leg = new THREE.Group(); leg.position.set(x, 0.73, 0); group.add(leg);
      box(leg, 0.2, 0.58, 0.24, '#3f4552', 0, -0.29); box(leg, 0.23, 0.14, 0.38, '#30231e', 0, -0.63, 0.07);
      box(leg, 0.235, 0.035, 0.39, '#1c1c1d', 0, -0.69, 0.07); return leg;
    });
    const body = cylinder(group, 0.33, 0.28, 0.67, shirt, 0, 1.02); body.scale.z = 0.72;
    this.residentArms = [-1, 1].map(side => {
      const arm = new THREE.Group(); arm.position.set(side * 0.35, 1.27, 0); group.add(arm);
      cylinder(arm, 0.1, 0.085, 0.5, shirt, side * 0.03, -0.25);
      cylinder(arm, 0.089, 0.085, 0.05, shade(shirt, 0.75), side * 0.03, -0.49);
      mesh(arm, new THREE.IcosahedronGeometry(0.1, 1), material(look.skin), side * 0.03, -0.58); return arm;
    });
    box(group, 0.52, 0.075, 0.41, '#493526', 0, 0.75); box(group, 0.1, 0.075, 0.025, '#bda475', 0, 0.75, 0.22);
    for (const y of [0.9, 1.04, 1.18]) box(group, 0.025, 0.025, 0.02, '#d9c8a7', 0, y, 0.235);
    for (const side of [-1, 1]) { const collar = box(group, 0.13, 0.13, 0.03, shade(shirt, 1.2), side * 0.07, 1.3, 0.19); collar.rotation.z = side * 0.45; }
    cylinder(group, 0.08, 0.1, 0.18, look.skin, 0, 1.4);
    const headGroup = this.residentHead = new THREE.Group(); group.add(headGroup);
    const head = mesh(headGroup, new THREE.SphereGeometry(0.25, 12, 8), material(look.skin), 0, 1.65); head.scale.set(0.9, 1.16, 0.9);
    const faceMap = paintedTexture(256, 320, ctx => {
      ctx.scale(256 / 68, 320 / 84); ctx.translate(4, 12);
      const h = headParts(seed);
      for (const piece of [...h.ears, ...h.skin, ...h.beard, ...h.hair]) { ctx.fillStyle = piece.fill; ctx.fill(new Path2D(piece.d)); }
      ctx.fillStyle = '#281c18'; ctx.fillRect(h.cx - 8, h.cy, 3, 3); ctx.fillRect(h.cx + 5, h.cy, 3, 3);
      ctx.fillRect(h.cx - 4, h.cy + 13, 8, 1);
    });
    const faceMat = new THREE.MeshBasicMaterial({ map: faceMap, transparent: true, depthWrite: false });
    mesh(headGroup, new THREE.PlaneGeometry(0.5, 0.62), faceMat, 0, 1.65, 0.23);
    if (avatar?.kind === 'photo' && owner?.id) {
      const texture = new THREE.TextureLoader().load(`/api/avatars/${encodeURIComponent(owner.id)}.png?v=${encodeURIComponent(avatar.v || 0)}`, () => {
        if (this.disposed || generation !== this.generation) { texture.dispose(); return; }
        faceMap.dispose(); faceMat.map = texture; faceMat.needsUpdate = true; this.render();
      }, undefined, () => texture.dispose());
      texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
    }
    const hat = avatar?.wear?.hat;
    if (hat) {
      cylinder(headGroup, 0.35, 0.35, 0.04, hat.c || '#b89052', 0, 1.9);
      cylinder(headGroup, 0.2, 0.22, 0.2, hat.c || '#b89052', 0, 2);
      cylinder(headGroup, 0.222, 0.224, 0.04, '#4a3528', 0, 1.94);
    }
  }
  wealth(stage) {
    const table = new THREE.Group(), group = new THREE.Group(); group.position.x = -0.15; table.add(group); this.dynamic.add(table);
    table.userData.dragId = 'wealth';
    table.position.set(this.furniture.wealth.x, 1.1, this.furniture.wealth.z); table.rotation.y = this.furniture.wealth.r * Math.PI / 2;
    const layout = wealthLayout(stage);
    if (layout.neutral) { box(group, 1.3, 0.22, 0.8, '#805636', 0.1, 0.12); box(group, 0.13, 0.12, 0.03, '#c5a25b', 0.1, 0.12, 0.42); return; }
    const chipGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.038, 16);
    for (let color = 0; color < 3; color++) {
      const chips = layout.chips.filter(c => c.color === color); if (!chips.length) continue;
      const stack = new THREE.InstancedMesh(chipGeometry, material(['#923f43', '#d1b66c', '#385b51'][color]), chips.length);
      const transform = new THREE.Matrix4(); chips.forEach((p, i) => { transform.makeTranslation(p.x, p.y, p.z); stack.setMatrixAt(i, transform); }); group.add(stack);
    }
    if (!layout.chips.length) chipGeometry.dispose();
    for (const bundle of layout.bundles) { box(group, 0.38, 0.08, 0.24, '#b3b48a', bundle.x, bundle.y, bundle.z); box(group, 0.07, 0.085, 0.245, '#dfcead', bundle.x, bundle.y, bundle.z); }
  }
  isVisible() { return !document.hidden && this.inViewport !== false; }
  visibilityChanged(now = performance.now()) {
    if (this.disposed || this.failed) return;
    if (this.isVisible()) { this.render(); return; }
    // Reduced motion may leave a long interval between renders; retain time already spent viewing.
    if (this.lastFrame != null) this.activity.advance(now - this.lastFrame);
    this.lastFrame = null; clearTimeout(this.activityTimer);
    this.cancelPointer(); cancelAnimationFrame(this.raf); this.raf = 0;
  }
  setActivityPaused(paused) {
    if (this.disposed || this.activityPaused === paused) return;
    this.activityPaused = paused;
    if (paused) this.stopActivity();
    this.render();
  }
  stopActivity() {
    clearTimeout(this.activityTimer); this.lastFrame = null;
    this.activity?.quiet();
    if (this.faun) this.faun.visible = false;
    this.lighting?.invalidate();
    this.speechKey = ''; this.onSpeech?.(null);
  }
  animateActivity(now) {
    const active = this.isVisible() && !this.editing && !this.activityPaused && !!this.residentGroup;
    if (active && this.lastFrame != null) this.activity.advance(now - this.lastFrame);
    this.lastFrame = active ? now : null;
    const state = active ? this.activity.state() : { text: null, faun: false };
    const t = active && !this.motion.matches ? this.activity.time / 1000 : 0;
    if (this.residentGroup) {
      const pose = residentPose(t), route = this.residentRoute || { x: 0, z: 0 }, walking = !!(route.x || route.z);
      if (this.residentHome && !this.dragging) this.residentGroup.position.set(this.residentHome.x + route.x * pose.offset, this.residentHome.y, this.residentHome.z + route.z * pose.offset);
      this.residentGroup.scale.y = RESIDENT_HEIGHT_SCALE * (1 + Math.sin(t * 1.5) * 0.008);
      this.residentGroup.rotation.set(0, 0.35 + Math.sin(t * 0.35) * 0.06 + (walking ? pose.facing * 0.65 : 0), Math.sin(t * 0.7) * 0.008);
      this.residentHead.rotation.y = pose.glance;
      this.residentHead.rotation.x = Math.sin(t * 0.6) * 0.025;
      this.residentLegs?.forEach((leg, i) => { leg.rotation.x = walking ? pose.stride * (i ? 1 : -1) : 0; });
      this.residentArms?.forEach((arm, i) => { arm.rotation.x = (walking ? pose.stride * (i ? -1 : 1) : 0) + Math.sin(t * 1.1) * 0.035; arm.rotation.z = i ? -pose.wave * 0.65 : 0.04 * Math.sin(t * 0.8); });
    }
    if (this.faun.visible !== state.faun) this.lighting?.invalidate();
    this.faun.visible = state.faun;
    if (state.faun) {
      if (this.faunVisitKey !== this.activity.faunUntil) {
        this.faunVisitKey = this.activity.faunUntil;
        this.faunRoute = faunVisitRoute(this.furniture, this.shelves, this.wallDisplays, this.faunVisits || 0);
        this.faunVisits = (this.faunVisits || 0) + 1;
      }
      const pose = faunPose(this.motion.matches ? 6 : state.faunAge / 1000), { from, to, facing } = this.faunRoute;
      this.faun.position.set(from.x + (to.x - from.x) * pose.peek, 0.02, from.z + (to.z - from.z) * pose.peek);
      this.faun.rotation.set(0, facing + pose.turn, pose.lean);
      if (this.faunHead) this.faunHead.rotation.y = pose.glance;
      this.faunLegs?.forEach((leg, i) => { leg.rotation.x = pose.stride * (i ? 1 : -1); });
    }
    let speech = null;
    if (state.text) {
      const speaker = state.speaker === 'faun' ? this.faun : this.residentGroup;
      const anchor = new THREE.Vector3(speaker.position.x, speaker.position.y + (state.speaker === 'faun' ? 2.8 : 2.3 * RESIDENT_HEIGHT_SCALE), speaker.position.z).project(this.camera);
      if (Math.abs(anchor.x) < 1 && Math.abs(anchor.y) < 1 && Math.abs(anchor.z) < 1) {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight, edge = Math.min(126, w / 2);
        speech = { text: state.text, speaker: state.speaker, x: Math.round(Math.max(edge, Math.min(w - edge, (anchor.x + 1) * w / 2))), y: Math.round(Math.max(115, Math.min(h - 15, (1 - anchor.y) * h / 2))) };
      }
    }
    if (speech) this.onSpeechPosition?.(speech.x, speech.y);
    const key = speech ? `${speech.speaker}:${speech.text}` : '';
    if (key !== this.speechKey) { this.speechKey = key; this.onSpeech?.(speech); }
    return active;
  }
  render() {
    if (this.disposed || this.failed || this.raf || !this.isVisible()) return;
    clearTimeout(this.activityTimer);
    this.raf = requestAnimationFrame(now => {
      this.raf = 0;
      if (!this.disposed && !this.failed && this.isVisible()) {
        try {
          const active = this.animateActivity(now);
          if (this.lighting) animateRoomLighting(this.lighting, this.activity.time, active && !this.motion.matches);
          this.renderer.render(this.scene, this.camera);
          if (active) this.activityTimer = setTimeout(() => this.render(), this.motion.matches ? this.activity.untilChange() : 1000 / 24);
        } catch (error) { this.failed = true; this.stopActivity(); this.onError?.(error); }
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.cancelPointer();
    this.disposed = true; this.generation++;
    this.stopActivity(); this.motion.removeEventListener('change', this.motionChange);
    cancelAnimationFrame(this.raf); this.observer.disconnect(); this.intersectionObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerleave', this.cancel);
    this.canvas.removeEventListener('webglcontextlost', this.lost); document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('blur', this.cancel); document.removeEventListener('keydown', this.keys);
    for (const map of Object.values(this.floorMaps || {})) if (map !== this.floor?.material.map) map.dispose();
    this.lighting?.dispose(); disposeObjects(this.scene); this.renderer.dispose();
  }
}
