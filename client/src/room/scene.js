import * as THREE from 'three';
import { BY_ID } from '../../../server/engine/creatures.js';
import { ROOM_ITEM, ROOM_FINISHES, ROOM_SHELF_SPOTS, roomShelves, roomFinishes } from '../../../server/catalog/room.js';
import { coveredWagon } from './wagon.js';
import { pixGrid } from '../store/pixart.js';
import { spriteCanvas, drawGrave } from '../barn/sprite.js';
import { drawEgg } from '../barn/draw.js';
import { headParts, looks } from '../avatar/genbust.js';
import { makeRoomCamera, wealthLayout, roomPositions, nearestShelfSpot, roomRenderSize, roomView, roomWallVisibility } from './scene-model.js';

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
function paintedTexture(w, h, paint) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  return canvasTexture(canvas);
}
function pixelTexture(name) {
  const grid = pixGrid(name);
  return paintedTexture(grid.w, grid.h, ctx => grid.px.forEach((color, i) => {
    if (color) { ctx.fillStyle = color; ctx.fillRect(i % grid.w, Math.floor(i / grid.w), 1, 1); }
  }));
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
  mesh(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: pixelTexture(pix), transparent: true }), 0, 0.45, 0.06);
}
function oddity(id) {
  const group = new THREE.Group();
  switch (id) {
    case 'odd-deed': frame(group, 'deed'); break;
    case 'odd-sheriffbadge': frame(group, 'sheriffbadge', 0.9, 0.65); break;
    case 'odd-horseshoe': {
      const arc = mesh(group, new THREE.TorusGeometry(0.24, 0.055, 6, 16, Math.PI), material('#b5a77f'), 0, 0.35, 0);
      arc.rotation.z = Math.PI;
      box(group, 0.11, 0.3, 0.1, '#b5a77f', -0.24, 0.5); box(group, 0.11, 0.3, 0.1, '#b5a77f', 0.24, 0.5);
      break;
    }
    case 'odd-lamp': {
      const body = mesh(group, new THREE.SphereGeometry(0.25, 12, 8), material('#c7a04a'), 0, 0.2, 0); body.scale.set(1.2, 0.55, 0.75);
      cylinder(group, 0.12, 0.18, 0.08, '#9e762e', 0, 0.06);
      const spout = mesh(group, new THREE.ConeGeometry(0.08, 0.4, 8), material('#c7a04a'), 0.36, 0.24); spout.rotation.z = -1.1;
      mesh(group, new THREE.TorusGeometry(0.12, 0.025, 6, 12), material('#9e762e'), -0.3, 0.2);
      break;
    }
    case 'odd-wagon': return coveredWagon();
    case 'odd-vaccine': {
      const syringe = new THREE.Group(); group.add(syringe); syringe.rotation.z = -0.5;
      cylinder(syringe, 0.07, 0.07, 0.4, '#c3d7cd', 0, 0.3);
      cylinder(syringe, 0.072, 0.072, 0.12, '#963c38', 0, 0.29);
      cylinder(syringe, 0.015, 0.015, 0.2, '#a5acaa', 0, 0.02);
      box(syringe, 0.18, 0.035, 0.08, '#a5acaa', 0, 0.55);
      break;
    }
    case 'odd-anvil': {
      box(group, 0.8, 0.16, 0.55, '#46494c', 0, 0.08);
      box(group, 0.38, 0.46, 0.32, '#55595e', 0, 0.36);
      box(group, 0.9, 0.2, 0.38, '#7b7f83', 0, 0.66);
      const horn = mesh(group, new THREE.ConeGeometry(0.2, 0.48, 4), material('#7b7f83'), 0.64, 0.66); horn.rotation.z = -Math.PI / 2;
      break;
    }
    case 'odd-spittoon': {
      cylinder(group, 0.16, 0.24, 0.34, '#bc9146', 0, 0.2);
      cylinder(group, 0.32, 0.15, 0.16, '#cba652', 0, 0.45);
      cylinder(group, 0.22, 0.22, 0.01, '#493423', 0, 0.54);
      break;
    }
    case 'odd-rock': {
      const rock = mesh(group, new THREE.DodecahedronGeometry(0.28, 0), material('#858080'), 0, 0.23); rock.scale.set(1.1, 0.8, 0.8);
      break;
    }
    case 'odd-telegraph': {
      box(group, 0.62, 0.09, 0.38, '#9d6739', 0, 0.05);
      box(group, 0.06, 0.22, 0.06, '#c49a4f', -0.16, 0.18);
      const lever = box(group, 0.45, 0.04, 0.06, '#c49a4f', 0.02, 0.29); lever.rotation.z = 0.13;
      cylinder(group, 0.09, 0.09, 0.06, '#2d2724', 0.22, 0.33);
      break;
    }
    case 'odd-snakeoil': {
      cylinder(group, 0.14, 0.16, 0.4, '#427951', 0, 0.22);
      cylinder(group, 0.07, 0.1, 0.14, '#427951', 0, 0.48);
      cylinder(group, 0.075, 0.075, 0.08, '#a97b48', 0, 0.59);
      box(group, 0.2, 0.18, 0.025, '#eee0b9', 0, 0.25, 0.14);
      break;
    }
    case 'odd-piano': {
      const roll = cylinder(group, 0.13, 0.13, 0.65, '#e8dbc1', 0, 0.2); roll.rotation.z = Math.PI / 2;
      for (const x of [-0.35, 0.35]) { const cap = cylinder(group, 0.17, 0.17, 0.05, '#76502c', x, 0.2); cap.rotation.z = Math.PI / 2; }
      box(group, 0.5, 0.012, 0.3, '#e8dbc1', 0, 0.07, 0.2);
      for (let i = 0; i < 5; i++) box(group, 0.025, 0.015, 0.05, '#614b37', -0.18 + i * 0.08, 0.08, 0.16 + (i % 2) * 0.1);
      break;
    }
  }
  return group;
}

/** A stationary, clickable cutaway. React owns the controls and all game actions. */
export class RoomScene {
  constructor(canvas, { onSelect, onMoveShelf, onWealthHover, onError } = {}) {
    this.canvas = canvas; this.onSelect = onSelect; this.onMoveShelf = onMoveShelf; this.onWealthHover = onWealthHover; this.onError = onError; this.generation = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffe8bd', '#503740', 2.1));
    const sun = new THREE.DirectionalLight('#ffdb9c', 2.2); sun.position.set(1, 6, 4); this.scene.add(sun);
    this.view = roomView(); this.camera = makeRoomCamera(1, this.view);
    this.static = new THREE.Group(); this.dynamic = new THREE.Group(); this.highlights = new THREE.Group(); this.dragPreview = new THREE.Group(); this.scene.add(this.static, this.dynamic, this.highlights, this.dragPreview);
    this.picks = []; this.raycaster = new THREE.Raycaster();
    this.buildRoom();
    this.resize = this.resize.bind(this);
    this.down = this.pointerDown.bind(this); this.up = this.pointerUp.bind(this); this.move = this.pointerMove.bind(this);
    this.cancel = e => { if (e?.pointerId === undefined || this.pointerId === undefined || e.pointerId === this.pointerId) this.cancelPointer(); };
    this.keys = e => { if (e.key === 'Escape') this.cancelPointer(); };
    this.lost = e => { e.preventDefault(); this.cancelPointer(); this.failed = true; this.onError?.(new Error('The 3D view is unavailable. Use the room controls below.')); };
    this.visible = () => { if (document.hidden) this.cancelPointer(); else this.render(); };
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerleave', this.cancel);
    canvas.addEventListener('webglcontextlost', this.lost); document.addEventListener('visibilitychange', this.visible);
    window.addEventListener('blur', this.cancel); document.addEventListener('keydown', this.keys);
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
    this.pointerStart = [e.clientX, e.clientY]; this.pointerId = e.pointerId;
    const target = this.targetAt(e.clientX, e.clientY);
    const shelf = this.editing && this.onMoveShelf && target?.kind === 'anchor' && this.shelves?.find(shelf => shelf.id === target.anchorId);
    if (shelf) this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (!this.editing || !this.pointerStart || this.disposed || this.failed) return;
      this.dragging = { id: shelf.id, originalSpotId: shelf.spotId };
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch { this.cancelPointer(); return; }
      this.canvas.style.cursor = 'grabbing';
      this.onSelect?.(target); this.showDragSpot(shelf.spotId);
    }, 450);
  }
  pointerMove(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    if (this.dragging) {
      const spot = nearestShelfSpot(this.camera, this.canvas.getBoundingClientRect(), e.clientX, e.clientY, this.shelves, this.dragging.id);
      this.showDragSpot(spot?.id || null); return;
    }
    if (this.pointerStart && Math.hypot(e.clientX - this.pointerStart[0], e.clientY - this.pointerStart[1]) > 8) {
      clearTimeout(this.holdTimer); this.holdTimer = null;
    }
    if (e.pointerType === 'touch') return;
    const hovered = this.targetAt(e.clientX, e.clientY)?.kind === 'wealth';
    if (this.hovered !== hovered) { this.hovered = hovered; this.onWealthHover?.(hovered); }
  }
  pointerUp(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    const start = this.pointerStart, dragging = this.dragging;
    const spot = dragging && this.editing && !this.failed && !this.disposed && nearestShelfSpot(this.camera, this.canvas.getBoundingClientRect(), e.clientX, e.clientY, this.shelves, dragging.id);
    this.cancelPointer();
    if (dragging) {
      if (spot && spot.id !== dragging.originalSpotId) this.onMoveShelf?.(dragging.id, spot.id);
      return;
    }
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8 || this.disposed || this.failed) return;
    const selection = this.targetAt(e.clientX, e.clientY);
    if (selection) this.onSelect?.(selection);
  }
  cancelPointer() {
    clearTimeout(this.holdTimer); this.holdTimer = null;
    if (this.pointerId !== undefined && this.canvas?.hasPointerCapture?.(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.pointerStart = null; this.pointerId = undefined; this.dragging = null;
    if (this.canvas?.style) this.canvas.style.cursor = '';
    if (this.dragPreview?.children.length) { disposeObjects(this.dragPreview); this.dragPreview.clear(); this.render(); }
    this.hovered = false; this.onWealthHover?.(false);
  }
  showDragSpot(spotId) {
    if (!this.dragPreview || this.dragging?.spotId === spotId) return;
    this.dragging.spotId = spotId;
    disposeObjects(this.dragPreview); this.dragPreview.clear();
    const occupied = new Set(this.shelves.filter(shelf => shelf.id !== this.dragging.id).map(shelf => shelf.spotId));
    for (const spot of ROOM_SHELF_SPOTS) {
      if (occupied.has(spot.id)) continue;
      const geometry = new THREE.BoxGeometry(1.3, 0.12, 0.85);
      const marker = mesh(this.dragPreview, geometry, new THREE.MeshBasicMaterial({ color: spot.id === spotId ? '#b9df83' : '#f2c65a', transparent: true, opacity: spot.id === spotId ? 0.4 : 0.1, depthWrite: false }), ...spot.position);
      marker.renderOrder = 5;
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#ffdc83', transparent: true, opacity: 0.75 }));
      outline.position.copy(marker.position); this.dragPreview.add(outline);
    }
    this.render();
  }
  targetAt(x, y) {
    if (this.disposed || this.failed) return null;
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    this.raycaster.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), this.camera);
    const targets = this.editing ? [...this.picks, ...this.walls] : this.picks.filter(target => target.userData.selection.kind !== 'surface');
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
  }
  setEditing(active, selection) {
    if (this.disposed) return;
    this.editing = !!active; this.selection = selection;
    if (!this.editing) this.cancelPointer();
    if (this.canvas?.style) this.canvas.style.touchAction = this.editing ? 'none' : 'pan-y';
    disposeObjects(this.highlights); this.highlights.clear();
    this.wallMaterial.emissive.set(this.editing ? '#8b6529' : '#000000');
    this.wallMaterial.emissiveIntensity = this.editing ? (selection?.kind === 'finish' ? 0.35 : 0.12) : 0;
    if (this.editing) for (const target of this.picks) {
      const chosen = target.userData.selection;
      if (!['anchor', 'wardrobe', 'pet', 'surface'].includes(chosen.kind)) continue;
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
    const p = this.static;
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
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping; floorMap.repeat.set(4, 3);
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
    stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping; stoneMap.repeat.set(3, 2);
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
    wall(this.backWall, opening.left + 4, 3.4, 0.16, (opening.left - 4) / 2, 1.7, -3);
    wall(this.backWall, 4 - opening.right, 3.4, 0.16, (opening.right + 4) / 2, 1.7, -3);
    wall(this.backWall, openingWidth, opening.bottom, 0.16, windowX, opening.bottom / 2, -3);
    wall(this.backWall, openingWidth, 3.4 - opening.top, 0.16, windowX, (opening.top + 3.4) / 2, -3);
    wall(this.leftWall, 0.16, 3.4, 6, -4, 1.7, 0);
    this.cornerPost = box(p, 0.11, 3.5, 0.25, '#49321f', -4, 1.72, -2.9);
    box(this.backWall, 0.11, 3.5, 0.25, '#49321f', 4, 1.72, -2.9);
    box(this.backWall, 8.25, 0.15, 0.26, '#49321f', 0, 3.42, -2.91);
    box(this.leftWall, 0.26, 0.15, 6.2, '#49321f', -3.97, 3.42);
    for (let y = 0.4; y < 3.4; y += 0.5) {
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
    // Shelf instances are rebuilt with their displayed items in update().
    this.table(p, -0.55, -1.9, 1.8, 0.9, 0.9);
    box(p, 1.5, 0.3, 0.07, '#65462e', -0.55, 0.67, -1.49);
    cylinder(p, 0.035, 0.035, 0.06, '#c4a05d', -0.55, 0.67, -1.43).rotation.x = Math.PI / 2;
    this.table(p, -2.15, 1.25, 1.5, 1.05, 0.85);
    box(p, 1.55, 0.07, 1.1, '#a5a16d', -2.15, 0.97, 1.25);
    const glass = material('#b3d2b7', { transparent: true, opacity: 0.13, depthWrite: false });
    mesh(p, new THREE.BoxGeometry(1.5, 1.05, 1.05), glass, -2.15, 1.55, 1.25);
    for (const x of [-2.9, -1.4]) for (const z of [0.725, 1.775]) box(p, 0.045, 1.08, 0.045, '#c7a66b', x, 1.55, z);
    box(p, 1.6, 0.12, 1.15, '#5c5537', -2.15, 2.12, 1.25);
    // Keep the wardrobe against the back corner, clear of the window and writing desk.
    this.wardrobe = new THREE.Group(); this.wardrobe.position.set(3.25, 0, -2.5); p.add(this.wardrobe);
    // Maroon rug and a desk with the wealth tray.
    this.rug = new THREE.Group(); this.rug.position.set(0.2, 0.03, 1.3); p.add(this.rug);
    this.table(p, 2.25, 1.45, 2.2, 1.3, 0.95);
    box(p, 2.05, 0.08, 1.13, '#4a3526', 2.25, 1.04, 1.45);
    for (const z of [0.87, 2.03]) box(p, 2.12, 0.08, 0.04, '#b08b4d', 2.25, 1.12, z);
    for (const x of [1.2, 3.3]) box(p, 0.04, 0.08, 1.2, '#b08b4d', x, 1.12, 1.45);
    const light = new THREE.PointLight('#ffd28c', 6, 7, 2); light.position.set(-2.6, 2.7, 0.9); this.scene.add(light);
    cylinder(this.leftWall, 0.22, 0.22, 0.14, '#c39b58', -3.62, 2.7, 1.9);
  }
  buildSideDoor() {
    const side = new THREE.Group(); side.name = 'yard-partition'; this.static.add(side);
    const trim = '#956c42', dark = '#59422e';
    // Low cutaway siding and clear upper panes divide the yard without obscuring the room.
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
      mesh(side, new THREE.BoxGeometry(0.02, 1.48, length - 0.12), glass, 4.08, 1.46, z);
      for (const y of [0.72, 1.46, 2.2]) box(side, 0.1, 0.06, length, trim, 4.08, y, z);
    }
    for (const z of [-3, -1.15, 0.8, 2.25, 3]) box(side, 0.12, z === 3 ? 0.72 : 2.75, 0.12, trim, 4.08, z === 3 ? 0.36 : 1.375, z);
    box(side, 0.18, 0.15, 5.35, dark, 4.08, 2.75, -0.375);
    box(side, 0.48, 0.1, 1.48, '#bda079', 4.18, 0.025, 1.525);
    // Door leaf swings out into the clear walkway, away from the parked wagon.
    const door = new THREE.Group(); door.name = 'open-yard-door'; door.position.set(4.08, 0.06, 2.2); door.rotation.y = -Math.PI / 2.7; side.add(door);
    for (const z of [0, -1.3]) box(door, 0.08, 2.45, 0.1, trim, 0, 1.225, z);
    for (const y of [0.05, 0.85, 2.4]) box(door, 0.08, 0.1, 1.4, trim, 0, y, -0.65);
    box(door, 0.055, 0.7, 1.2, '#785332', 0, 0.45, -0.65);
    mesh(door, new THREE.BoxGeometry(0.018, 1.4, 1.2), glass, 0, 1.62, -0.65);
    const handle = cylinder(door, 0.035, 0.035, 0.12, '#d2ae65', 0.09, 1.02, -1.17); handle.rotation.z = Math.PI / 2;
    for (const y of [0.3, 2.15]) box(door, 0.09, 0.13, 0.18, '#4f4b40', 0, y, -0.02);
    for (let i = 0; i < 6; i++) {
      const step = box(this.static, 0.5, 0.035, 0.65, i % 2 ? '#b2a082' : '#c1ae8b', 4.6 + i * 0.67, 0.035, 1.52 + (i % 2) * 0.12); step.rotation.y = i % 2 ? 0.08 : -0.09;
    }
  }
  table(parent, x, z, w, d, h) {
    box(parent, w, 0.14, d, '#93633c', x, h, z);
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
      }
    }
  }
  shelf(shelf, position) {
    const group = new THREE.Group(); group.position.set(...position); this.dynamic.add(group);
    const color = finishColor('shelf', shelf);
    box(group, 1.25, 0.14, 0.8, shade(color, 0.58), 0, -0.08, 0);
    box(group, 1.25, 0.08, 0.8, color, 0, 0.02, 0);
    if (shelf.typeId === 'braced') for (const z of [-0.27, 0.27]) {
      box(group, 0.08, 0.25, 0.08, shade(color, 0.65), -0.48, -0.16, z);
      const brace = box(group, 0.65, 0.06, 0.06, shade(color, 0.65), -0.22, -0.16, z); brace.rotation.z = 0.3;
    }
    return group;
  }
  pick(position, size, selection) {
    const target = mesh(this.dynamic, new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), ...position);
    if (selection.kind === 'anchor' && selection.anchorId.startsWith('wall-')) target.userData.wallSide = 'back';
    target.userData.selection = selection; this.picks.push(target);
  }
  update(view) {
    if (this.disposed) return;
    this.cancelPointer();
    const generation = ++this.generation;
    disposeObjects(this.dynamic); this.dynamic.clear(); this.picks = []; this.wagon = null;
    this.shelves = roomShelves(view.shelves);
    this.furnishings(roomFinishes(view.finishes));
    this.wallMaterial.color.set(PAINT[view.themeId] || PAINT['bunkhouse-timber']);
    for (const [anchorId, position] of Object.entries(roomPositions(this.shelves))) {
      const shelf = this.shelves.find(shelf => shelf.id === anchorId);
      const holder = shelf ? this.shelf(shelf, position) : null;
      const itemId = view.placements?.find(p => p.anchorId === anchorId)?.itemId;
      if (ROOM_ITEM[itemId]) {
        const prop = oddity(itemId); if (!holder) prop.position.set(...position);
        if (anchorId.startsWith('wall-')) prop.userData.wallSide = 'back';
        if (anchorId === 'window') { prop.scale.setScalar(1.65); prop.rotation.y = -0.16; this.wagon = prop; }
        (holder || this.dynamic).add(prop);
      }
      const wall = anchorId.startsWith('wall');
      const height = anchorId === 'window' ? 1.125 : wall ? 0.4 : 0.3;
      const size = anchorId === 'window' ? [2.8, 2.25, 2.05] : anchorId === 'desk' ? [1.9, 0.9, 1.1] : wall ? [1.2, 1.1, 0.3] : [1.25, 0.9, 0.9];
      this.pick([position[0], position[1] + height, position[2]], size, { kind: 'anchor', anchorId });
    }
    this.pet(view.pet);
    this.resident(view.owner, generation);
    this.wealth(view.wealthStage);
    this.pick([-2.15, 1.5, 1.25], [1.65, 1.35, 1.2], { kind: 'pet' });
    this.pick([this.wardrobe.position.x, 1.3, this.wardrobe.position.z], [1.7, 2.6, 1], { kind: 'wardrobe' });
    this.pick([2.25, 1.4, 1.45], [2.1, 1, 1.25], { kind: 'wealth' });
    this.pick([0, -0.08, 0], [8.5, 0.14, 6.5], { kind: 'surface', surface: 'floor' });
    this.pick([0.2, 0.045, 1.3], [3.5, 0.02, 2.1], { kind: 'surface', surface: 'rug' });
    this.setEditing(this.editing, this.selection);
  }
  pet(pet) {
    if (!pet) return;
    let map;
    if (pet.stage === 'creature' && BY_ID[pet.species]) map = canvasTexture(spriteCanvas(BY_ID[pet.species], pet.style));
    else if (pet.stage === 'egg' || pet.stage === 'dead') map = paintedTexture(128, 128, ctx => {
      if (pet.stage === 'egg') drawEgg(ctx, { w: 128, h: 128, still: true }); else drawGrave(ctx, { w: 128, h: 128 });
    });
    if (map) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      sprite.position.set(-2.15, 1.56, 1.25); sprite.scale.set(0.95, 0.95, 1); this.dynamic.add(sprite);
    }
  }
  resident(owner, generation) {
    const group = new THREE.Group(); group.position.set(0.2, 0.05, 1.25); group.rotation.y = 0.35; this.dynamic.add(group);
    const avatar = owner?.avatar, seed = avatar?.seed || owner?.id || 'room-resident', look = looks(seed);
    const shirt = avatar?.wear?.body?.c || avatar?.wear?.skin?.c || look.shirt;
    for (const x of [-0.14, 0.14]) { box(group, 0.2, 0.62, 0.24, '#3f4552', x, 0.42); box(group, 0.23, 0.14, 0.38, '#30231e', x, 0.1, 0.07); }
    const body = cylinder(group, 0.33, 0.28, 0.67, shirt, 0, 1.02); body.scale.z = 0.72;
    for (const side of [-1, 1]) { cylinder(group, 0.095, 0.085, 0.55, shirt, side * 0.38, 0.99); mesh(group, new THREE.IcosahedronGeometry(0.1, 0), material(look.skin), side * 0.38, 0.68); }
    cylinder(group, 0.08, 0.1, 0.18, look.skin, 0, 1.4);
    const head = mesh(group, new THREE.SphereGeometry(0.25, 12, 8), material(look.skin), 0, 1.65); head.scale.set(0.9, 1.16, 0.9);
    const faceMap = paintedTexture(128, 160, ctx => {
      ctx.scale(128 / 68, 160 / 84); ctx.translate(4, 12);
      const h = headParts(seed);
      for (const piece of [...h.ears, ...h.skin, ...h.beard, ...h.hair]) { ctx.fillStyle = piece.fill; ctx.fill(new Path2D(piece.d)); }
      ctx.fillStyle = '#281c18'; ctx.fillRect(h.cx - 8, h.cy, 3, 3); ctx.fillRect(h.cx + 5, h.cy, 3, 3);
      ctx.fillRect(h.cx - 4, h.cy + 13, 8, 1);
    });
    const faceMat = new THREE.MeshBasicMaterial({ map: faceMap, transparent: true, depthWrite: false });
    mesh(group, new THREE.PlaneGeometry(0.5, 0.62), faceMat, 0, 1.65, 0.23);
    if (avatar?.kind === 'photo' && owner?.id) {
      const texture = new THREE.TextureLoader().load(`/api/avatars/${encodeURIComponent(owner.id)}.png?v=${encodeURIComponent(avatar.v || 0)}`, () => {
        if (this.disposed || generation !== this.generation) { texture.dispose(); return; }
        faceMap.dispose(); faceMat.map = texture; faceMat.needsUpdate = true; this.render();
      }, undefined, () => texture.dispose());
      texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
    }
    const hat = avatar?.wear?.hat;
    if (hat) {
      cylinder(group, 0.35, 0.35, 0.04, hat.c || '#b89052', 0, 1.9);
      cylinder(group, 0.2, 0.22, 0.2, hat.c || '#b89052', 0, 2);
    }
  }
  wealth(stage) {
    const group = new THREE.Group(); group.position.set(2.1, 1.1, 1.45); this.dynamic.add(group);
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
  render() {
    if (this.disposed || this.failed || this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.disposed && !this.failed && !document.hidden) {
        try { this.renderer.render(this.scene, this.camera); }
        catch (error) { this.failed = true; this.onError?.(error); }
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.cancelPointer();
    this.disposed = true; this.generation++;
    cancelAnimationFrame(this.raf); this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerleave', this.cancel);
    this.canvas.removeEventListener('webglcontextlost', this.lost); document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('blur', this.cancel); document.removeEventListener('keydown', this.keys);
    for (const map of Object.values(this.floorMaps || {})) if (map !== this.floor?.material.map) map.dispose();
    disposeObjects(this.scene); this.renderer.dispose();
  }
}
