import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { ROOM_ITEM, anchorHost, ROOM_FINISHES, ROOM_SHELF_SPOTS, ROOM_SHELF_SIZES, ROOM_WALL_SPOTS, ROOM_FURNITURE, roomShelves, shelfSlots, shelfForAnchor, roomWallDisplays, wallMountsFit, wallSpotAvailable, roomFinishes, roomFurniture, furnitureFits, roomCouchScale } from '../../../server/catalog/room.js';
import { furnitureOf } from './layout.js';
import { coveredWagon } from './wagon.js';
import { roomFaun } from './faun.js';
import { buildHomestead } from './homestead.js';
import { makeWallCutaway } from './cutaway.js';
import { homesteadLandscape, groundLevel } from './landscape.js';
import { RoomActivity, residentPose, faunPose } from './activity.js';
import { TASK_LINES } from './dialogue.js';
import { setupRoomLighting, configureShadowObjects, animateRoomLighting } from './lighting.js';
import { pixGrid } from '../store/pixart.js';
import { bugTexture, drawGrave, bugScale } from '../barn/sprite.js';
import { drawEgg } from '../barn/draw.js';
import { headParts, looks, shade as tint } from '../avatar/genbust.js';
import { makeRoomCamera, wealthLayout, faceWrap, roomPositions, nearestShelfSpot, nearestWallSpot, floorPoint, nudgeAxes, roomRenderSize, roomView, roomWallVisibility, ROOM_FLOOR_SCALE, ROOM_GRADE, ROOM_DESK_TOP, ROOM_WALL_HEIGHT, ROOM_DOOR_HEIGHT, RESIDENT_HEIGHT_SCALE, ROOM_FIXTURES, ROOM_VIEW_LIMITS, roomShelfPosition, wallDisplayPosition, wallTurn, residentStep, residentErrands, residentTasks, ROOM_SIGNPOST, faunVisitRoute } from './scene-model.js';

const PAINT = { 'bunkhouse-timber': '#d3b88c', 'bunkhouse-sage': '#a7b59a', 'bunkhouse-clay': '#c79883' };
/** The rooms that look at a parlor wall from behind, where its shelves and displays stay out of sight. */
const BEHIND_WALL = { back: ['bunk', 'bathroom'], front: ['kitchen'], right: ['porch', 'yard'] };
const material = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (parent, geometry, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); parent.add(m); return m;
};
const box = (p, w, h, d, color, x = 0, y = 0, z = 0) => mesh(p, new THREE.BoxGeometry(w, h, d), material(color), x, y, z);
const cylinder = (p, rt, rb, h, color, x = 0, y = 0, z = 0, sides = 16) => mesh(p, new THREE.CylinderGeometry(rt, rb, h, sides), material(color), x, y, z);
const tube = (p, points, radius, color) => mesh(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 10, radius, 6), material(color));
// [brim radius, crown bottom radius, crown top radius or 'dome', crown height]. Any other hat gets a plain flat crown.
const HAT_SHAPES = { tophat: [0.3, 0.2, 0.21, 0.36], cowboy: [0.42, 0.22, 0.17, 0.24], tengallon: [0.46, 0.23, 0.2, 0.34], sombrero: [0.56, 0.2, 0.08, 0.3], bowler: [0.3, 0.22, 'dome'], hardhat: [0.29, 0.23, 'dome'], beanie: [0, 0.24, 'dome'], fez: [0, 0.19, 0.15, 0.22], chef: [0, 0.2, 0.27, 0.34], wizard: [0.36, 0.2, 0.01, 0.5], party: [0, 0.14, 0.01, 0.36], bucket: [0.3, 0.24, 0.2, 0.2] };
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
// Chip colour, insert colour and face value, in the order of CHIP_VALUES.
const CHIP_ART = [['#d1b66c', '#4a3526', '1K'], ['#5d4279', '#e9dfc6', '500'], ['#2d2b2e', '#e9dfc6', '100'], ['#385b51', '#e9dfc6', '25'], ['#923f43', '#e9dfc6', '5']];
/** Six edge inserts that run over the rim onto both faces, an inlay ring and the value: [side, top, bottom]. */
function chipMaterials(base, insert, value) {
  const face = paintedTexture(64, 64, ctx => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = insert; ctx.lineWidth = 9;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(32, 32, 27.5, i * Math.PI / 3 - 0.2, i * Math.PI / 3 + 0.2); ctx.stroke(); }
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(32, 32, 19, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = insert; ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, 32, 33);
  });
  const edge = paintedTexture(96, 8, ctx => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 96, 8);
    ctx.fillStyle = insert; for (let i = 0; i <= 6; i++) ctx.fillRect(i * 16 - 3, 0, 6, 8);
  });
  const flat = material('#ffffff', { map: face });
  return [material('#ffffff', { map: edge }), flat, flat];
}
/** A hundred in green ink: frame, portrait oval, seals and the value in each corner, plus the layered edge of a stack. */
function billTextures() {
  const paper = '#c2cda8', ink = '#4f6d4c';
  const face = paintedTexture(152, 64, ctx => {
    ctx.fillStyle = paper; ctx.fillRect(0, 0, 152, 64);
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(4.5, 4.5, 143, 55);
    ctx.lineWidth = 1; ctx.strokeRect(9.5, 9.5, 133, 45);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(76, 32, 15, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(76, 27, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(76, 45, 10, 9, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; for (const x of [46, 106]) { ctx.beginPath(); ctx.arc(x, 32, 6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y] of [[25, 19], [127, 19], [25, 46], [127, 46]]) ctx.fillText('100', x, y);
  });
  const edge = paintedTexture(8, 32, ctx => {
    ctx.fillStyle = '#d6dcc0'; ctx.fillRect(0, 0, 8, 32);
    ctx.fillStyle = '#9fae8b'; for (let y = 0; y < 32; y += 4) ctx.fillRect(0, y, 8, 1);
  });
  return { face, edge };
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
    if (pix === 'boardingpass') { // a real one, kept flat under glass: header, stub, barcode
      const x0 = 26, y0 = 58, cw = width - 52, ch = height - 116, tear = x0 + cw * 0.74, dark = '#26303a';
      ctx.fillStyle = '#d9c9a0'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fbf6e6'; ctx.fillRect(x0, y0, cw, ch);
      ctx.fillStyle = '#2f6fb0'; ctx.fillRect(x0, y0, cw, 54);
      ctx.fillStyle = '#fbf6e6'; ctx.textAlign = 'left'; ctx.font = 'bold 28px Georgia'; ctx.fillText('BOARDING PASS', x0 + 14, y0 + 37);
      ctx.fillStyle = dark; ctx.font = 'bold 56px Georgia'; ctx.fillText('SFO', x0 + 16, y0 + 122);
      ctx.fillRect(x0 + 150, y0 + 100, 62, 5); ctx.beginPath(); ctx.moveTo(x0 + 228, y0 + 102); ctx.lineTo(x0 + 206, y0 + 88); ctx.lineTo(x0 + 206, y0 + 116); ctx.closePath(); ctx.fill();
      ctx.font = 'bold 30px Georgia'; ctx.fillText('HOME', x0 + 240, y0 + 113);
      ctx.font = '12px Georgia'; ctx.fillStyle = '#7a8591';
      for (const [label, x] of [['PASSENGER', 16], ['SEATS', 190], ['GATE CLOSES', 258]]) ctx.fillText(label, x0 + x, y0 + 158);
      ctx.fillStyle = dark; ctx.font = 'bold 19px Georgia';
      for (const [value, x] of [['SASQUATCH +11', 16], ['12', 190], ['0:01', 258]]) ctx.fillText(value, x0 + x, y0 + 182);
      ctx.font = 'italic 15px Georgia'; ctx.fillText('San Francisco, Sunday. Twelve seats. One sasquatch.', x0 + 16, y0 + ch - 44);
      ctx.font = '12px Georgia'; ctx.fillStyle = '#7a8591'; ctx.fillText('Buffalo Bill\'s Academy · No. 000001', x0 + 16, y0 + ch - 20);
      ctx.fillStyle = '#b9c0c8'; for (let y = y0 + 58; y < y0 + ch - 4; y += 12) ctx.fillRect(tear, y, 2, 6);
      ctx.fillStyle = dark; for (let i = 0, x = tear + 16; x < x0 + cw - 14; i++) { const bar = 1 + (i * 7) % 4; ctx.fillRect(x, y0 + 72, bar, ch - 130); x += bar + 2 + (i * 5) % 3; }
      ctx.font = 'bold 15px Georgia'; ctx.fillText('SFO', tear + 16, y0 + ch - 34); ctx.font = '12px Georgia'; ctx.fillText('RUN', tear + 16, y0 + ch - 18);
      return;
    }
    const ink = pix === 'railroad' ? '#385d47' : pix === 'sheriffbadge' || pix === 'medal' || pix === 'boardingpass' ? '#345d80' : pix === 'charter' ? '#5a2f2a' : '#76572d';
    ctx.fillStyle = pix === 'railroad' ? '#e5e8ce' : '#efe0b7'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.lineWidth = 1; ctx.strokeRect(24, 24, width - 48, height - 48);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = 'bold 28px Georgia';
    ctx.fillText({ deed: 'DEED TO THE MOON', sheriffbadge: 'FISHING LICENCE', railroad: 'RAILROAD SHARE', medal: 'MEDAL OF FREEDOM', boardingpass: 'BOARDING PASS', charter: 'FOUNDING CHARTER' }[pix], width / 2, 68);
    ctx.font = '15px Georgia'; ctx.fillText({ deed: 'LUNAR LAND REGISTRY', sheriffbadge: 'TERRITORY ANGLING OFFICE', railroad: 'GREAT BASIN & PACIFIC', medal: 'THE EIGHTEENTH AT BLACK HORSE', boardingpass: 'SAN FRANCISCO · SUNDAY', charter: 'EST. EVENTUALLY' }[pix], width / 2, 94);
    const cy = height * 0.47;
    if (pix === 'deed') {
      ctx.fillStyle = '#cfb96f'; ctx.beginPath(); ctx.arc(256, cy, 55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b39a56';
      for (const [x, y, r] of [[238, -20, 11], [278, 12, 16], [241, 27, 7]]) { ctx.beginPath(); ctx.arc(x, cy + y, r, 0, Math.PI * 2); ctx.fill(); }
    } else if (pix === 'charter') {
      // Three clauses nobody finished, Bill's signature, and the witness's hoofprint.
      for (const [y, w] of [[-60, 300], [-36, 330], [-12, 190]]) ctx.fillRect((width - w) / 2, cy + y, w, 4);
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(120, cy + 45); ctx.bezierCurveTo(160, cy, 190, cy + 80, 240, cy + 35); ctx.stroke();
      ctx.beginPath(); ctx.arc(360, cy + 38, 24, Math.PI * 0.85, Math.PI * 2.15); ctx.lineWidth = 11; ctx.stroke();
    } else if (pix === 'boardingpass') { // an aeroplane, more or less
      ctx.fillRect(176, cy - 12, 150, 28); ctx.fillRect(326, cy - 4, 22, 16); ctx.fillRect(170, cy - 42, 22, 44);
      ctx.beginPath(); ctx.moveTo(236, cy + 10); ctx.lineTo(296, cy + 10); ctx.lineTo(250, cy + 50); ctx.lineTo(226, cy + 50); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#efe0b7'; for (let i = 0; i < 8; i++) ctx.fillRect(200 + i * 15, cy - 5, 8, 8);
    } else if (pix === 'medal') { // the medal itself is pinned on in front: see oddity()
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
    ctx.fillText({ deed: 'One very impressive acre.', sheriffbadge: 'Valid for the season of 1887.', railroad: 'One share. No railroad.', medal: 'For golf.', boardingpass: 'Twelve seats. One sasquatch.', charter: 'Witnessed by a horse.' }[pix], width / 2, height * 0.72);
    ctx.font = 'italic 15px Georgia'; ctx.fillText('Buffalo Bill\'s Academy', width / 2, height * 0.8);
    ctx.fillStyle = '#9d3935'; ctx.beginPath(); ctx.arc(width - 69, height - 66, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#edcf8a'; ctx.font = 'bold 13px Georgia'; ctx.fillText(pix === 'deed' || pix === 'medal' || pix === 'charter' ? 'SEAL' : 'VOID', width - 69, height - 61);
    ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.font = '13px Georgia'; ctx.fillText('No. 000001', 43, height - 43);
  });
  mesh(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }), 0, 0.45, 0.06);
}
/** Folds an item's plain painted parts into one mesh, colours on its corners, so detail costs no extra draw calls. */
function bake(group) {
  group.updateMatrixWorld(true);
  const undo = group.matrixWorld.clone().invert(), parts = [];
  group.traverse(part => {
    const paint = part.material;
    if (part.isMesh && !part.isInstancedMesh && paint?.isMeshLambertMaterial && paint.flatShading && !paint.map && !paint.transparent && !paint.wireframe && paint.side === THREE.FrontSide) parts.push(part);
  });
  if (parts.length < 2) return group;
  const merged = mergeGeometries(parts.map(part => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.applyMatrix4(undo.clone().multiply(part.matrixWorld));
    const own = part.material.vertexColors && geometry.attributes.color, { r, g, b } = part.material.color, colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(r * (own ? own.getX(i) : 1), g * (own ? own.getY(i) : 1), b * (own ? own.getZ(i) : 1));
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    return geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }));
  if (!merged) return group;
  for (const part of parts) part.removeFromParent();
  mesh(group, merged, material('#ffffff', { vertexColors: true }));
  return group;
}
// The yard fence runs out from the kitchen corner, along the road with a gap where the footpath leaves, and back to the bedroom corner.
const FENCE = [[[3.4, 7.25], [8.7, 7.25]], [[8.7, 7.25], [8.7, 3.33]], [[8.7, 2.33], [8.7, -7.25]], [[8.7, -7.25], [3.7, -7.25]]];
const FENCE_POST = 0.78, MOON_POST = [8.7, -7.25];
/** Delivered with the deed: tied to the far corner post of the yard fence so it does not wander off again. */
function moon() {
  const group = new THREE.Group(); group.name = 'the-moon';
  const S = ROOM_FLOOR_SCALE, [x, z] = MOON_POST, post = new THREE.Vector3(x * S, groundLevel(x, z) + FENCE_POST, z * S), centre = post.clone().add(new THREE.Vector3(0.5, 2.32, -0.7));
  const geometry = new THREE.IcosahedronGeometry(1.15, 1).toNonIndexed(), colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const face = Math.floor(i / 3), color = new THREE.Color(face % 7 === 3 || face % 11 === 5 ? '#b9b39f' : '#ece7d2').multiplyScalar(0.92 + (face % 4) * 0.027);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh(group, geometry, material('#ffffff', { vertexColors: true }), centre.x, centre.y, centre.z);
  const rope = centre.clone().sub(post), length = rope.length() - 1.1;
  const line = cylinder(group, 0.018, 0.018, length, '#b99a62', 0, 0, 0, 5);
  line.position.copy(post).addScaledVector(rope.clone().normalize(), length / 2);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rope.normalize());
  return group;
}
/** Outside the gate where the footpath leaves for the road: an arm each way, with the distances as far as anyone has checked. */
function signpost() {
  const group = new THREE.Group(); group.name = 'road-signpost';
  const [x, z] = ROOM_SIGNPOST, length = 1.9, height = 0.44, tip = 0.3, wood = '#6f553c', paint = '#e3d5b4';
  group.position.set(x * ROOM_FLOOR_SCALE, groundLevel(x, z), z * ROOM_FLOOR_SCALE);
  box(group, 0.16, 3.85, 0.16, wood, 0, 1.775, 0);
  cylinder(group, 0, 0.13, 0.15, shade(wood, 0.8), 0, 3.775, 0, 4).rotation.y = Math.PI / 4;
  const outline = new THREE.Shape([[-0.25, -height / 2], [length - tip - 0.25, -height / 2], [length - 0.25, 0], [length - tip - 0.25, height / 2], [-0.25, height / 2]].map(point => new THREE.Vector2(...point)));
  // `toward` is +1 for an arm pointing up the road (+z) and -1 for one pointing down it.
  for (const [y, toward, place, miles] of [[3.32, 1, 'BUFFALO BILL’S', '11 MILES'], [2.82, -1, 'THE MINES', '3 MILES, THEN DOWN']]) {
    const arm = new THREE.Group(); arm.position.set(toward > 0 ? 0.14 : 0.08, y, 0); arm.rotation.y = -toward * Math.PI / 2; group.add(arm);
    mesh(arm, new THREE.ExtrudeGeometry(outline, { depth: 0.06, bevelEnabled: false }), material(paint));
    const map = paintedTexture(384, 96, (ctx, w, h) => {
      ctx.fillStyle = paint; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3b2a1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 40px Georgia'; ctx.fillText(place, w / 2, 34, w - 16);
      ctx.font = 'bold 22px Georgia'; ctx.fillText(miles, w / 2, 74, w - 16);
    });
    // The lettering is painted on both faces, so it reads from the road and from the porch.
    for (const [depth, turn] of [[0.062, 0], [-0.002, Math.PI]]) {
      mesh(arm, new THREE.PlaneGeometry(length - tip - 0.1, height - 0.06), material('#ffffff', { map }), (length - tip) / 2 - 0.25, 0, depth).rotation.y = turn;
    }
  }
  // Clicking any of it sends the resident out to read it.
  group.traverse(part => { if (part.isMesh) part.userData.selection = { kind: 'houseAction', action: 'sign' }; });
  return group;
}
function oddity(id) {
  const group = new THREE.Group(); group.name = id;
  switch (id) {
    case 'odd-deed': frame(group, 'deed'); break;
    case 'odd-sheriffbadge': frame(group, 'sheriffbadge', 0.9, 0.65); break;
    case 'odd-railroad': frame(group, 'railroad', 0.9, 0.7); break;
    case 'odd-charter': frame(group, 'charter', 0.75, 0.9); break;
    case 'odd-skull': {
      box(group, 0.7, 0.84, 0.04, '#5c4028', 0, 0.45, -0.03);
      mesh(group, new THREE.SphereGeometry(0.2, 10, 8), material('#e8dfc8'), 0, 0.55, 0.07).scale.set(1, 1.05, 0.55);
      cylinder(group, 0.13, 0.065, 0.36, '#ded3b8', 0, 0.27, 0.06, 8).scale.z = 0.6;
      for (const side of [-1, 1]) {
        mesh(group, new THREE.ConeGeometry(0.05, 0.34, 6), material('#cfc3a4'), side * 0.3, 0.66, 0.05).rotation.z = side * -1.05;
        mesh(group, new THREE.CircleGeometry(0.045, 8), material('#3a2c2c'), side * 0.085, 0.53, 0.182);
      }
      break;
    }
    case 'odd-pickaxe': {
      // Stuck in a rock, awaiting a rightful swinger. It has been pulled out several times. It is put back.
      const stone = mesh(group, new THREE.DodecahedronGeometry(0.36, 0), material('#77797f'), 0, 0.2); stone.scale.set(1.2, 0.6, 0.9);
      const tool = new THREE.Group(); tool.position.set(0.05, 0.26, 0); tool.rotation.z = 0.2; group.add(tool);
      cylinder(tool, 0.03, 0.035, 0.9, '#8a5a2c', 0, 0.45, 0, 8);
      box(tool, 0.14, 0.1, 0.09, '#e8c040', 0, 0.88);
      for (const side of [-1, 1]) mesh(tool, new THREE.ConeGeometry(0.05, 0.34, 6), material('#e8c040'), side * 0.22, 0.86).rotation.z = side * -1.75;
      break;
    }
    case 'odd-medal': { // a ribbon, a gold disc and one star, pinned to the certificate
      frame(group, 'medal', 0.8, 0.9);
      box(group, 0.14, 0.18, 0.012, '#345d80', 0, 0.66, 0.07); box(group, 0.045, 0.182, 0.014, '#f3ecd2', 0, 0.66, 0.07);
      box(group, 0.05, 0.04, 0.012, '#d8a820', 0, 0.56, 0.07);
      cylinder(group, 0.105, 0.105, 0.02, '#d8a820', 0, 0.46, 0.075, 24).rotation.x = Math.PI / 2;
      cylinder(group, 0.085, 0.085, 0.026, '#f0d060', 0, 0.46, 0.075, 24).rotation.x = Math.PI / 2;
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.026 : 0.062; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      mesh(group, new THREE.ShapeGeometry(star), material('#c08a1e'), 0, 0.46, 0.0885);
      break;
    }
    case 'odd-boardingpass': frame(group, 'boardingpass', 0.9, 0.7); break;
    case 'odd-flipflop': { // one flip-flop, in the puddle it came with
      const water = material('#7cc4f0', { transparent: true, opacity: 0.8 });
      for (const [r, x, z] of [[0.3, 0, 0.02], [0.18, 0.24, 0.14], [0.14, -0.26, -0.1], [0.05, 0.36, -0.16]]) mesh(group, new THREE.CylinderGeometry(r, r, 0.006, 18), water, x, 0.003, z);
      for (const [x, z] of [[0.3, 0.3], [-0.34, 0.12], [0.08, 0.4]]) mesh(group, new THREE.SphereGeometry(0.022, 8, 6), water, x, 0.012, z);
      const shoe = new THREE.Group(); shoe.position.y = 0.008; shoe.rotation.y = 0.45; group.add(shoe);
      const sole = new THREE.Shape();
      sole.moveTo(-0.11, -0.3); sole.bezierCurveTo(-0.17, -0.1, -0.2, 0.2, -0.08, 0.32); sole.bezierCurveTo(0.02, 0.38, 0.17, 0.3, 0.16, 0.12);
      sole.bezierCurveTo(0.15, -0.05, 0.14, -0.2, 0.1, -0.3); sole.bezierCurveTo(0.05, -0.36, -0.07, -0.36, -0.11, -0.3);
      // Foam in three layers, like every flip-flop sold beside a swimming pool. The toe points away (-z).
      let top = 0;
      for (const [color, depth] of [['#f6efe0', 0.022], ['#3f8f8f', 0.012], ['#f08ab0', 0.024]]) {
        mesh(shoe, new THREE.ExtrudeGeometry(sole, { depth, bevelEnabled: false, curveSegments: 8 }), material(color), 0, top, 0).rotation.x = -Math.PI / 2; top += depth;
      }
      // Somebody wore it for years: a heel, the ball of a foot and five toes.
      for (const [r, x, z, long] of [[0.07, 0, 0.21, 1.2], [0.08, 0.02, -0.1, 1], [0.024, -0.09, -0.26, 1], [0.02, -0.04, -0.3, 1], [0.019, 0.015, -0.31, 1], [0.018, 0.065, -0.29, 1], [0.016, 0.105, -0.25, 1]]) cylinder(shoe, r, r, 0.003, '#d9739a', x, top + 0.001, z, 12).scale.z = long;
      cylinder(shoe, 0.014, 0.014, 0.07, '#fff6e4', -0.065, top + 0.035, -0.2, 8);
      for (const side of [-1, 1]) tube(shoe, [[-0.065, top + 0.07, -0.2], [side * 0.1 - 0.01, top + 0.1, -0.08], [side * 0.145, top + 0.005, 0.05]], 0.017, '#fff6e4');
      break;
    }
    case 'odd-drone': { // the long pipe off a set of bagpipes, stood on end
      const tartan = paintedTexture(64, 64, ctx => {
        ctx.fillStyle = '#2f5f5a'; ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = 'rgba(20,30,60,0.55)'; for (const at of [8, 40]) { ctx.fillRect(at, 0, 14, 64); ctx.fillRect(0, at, 64, 14); }
        ctx.fillStyle = '#e8c040'; for (const at of [30, 62]) { ctx.fillRect(at, 0, 2, 64); ctx.fillRect(0, at, 64, 2); }
        ctx.fillStyle = '#b3272c'; for (const at of [2, 34]) { ctx.fillRect(at, 0, 2, 64); ctx.fillRect(0, at, 64, 2); }
      }, true);
      mesh(group, new THREE.BoxGeometry(0.46, 0.014, 0.34), material('#ffffff', { map: tartan }), 0, 0.007).rotation.y = 0.2;
      cylinder(group, 0.11, 0.13, 0.05, '#6b4a30', 0, 0.039);
      const pipe = new THREE.Group(); pipe.position.y = 0.06; pipe.rotation.z = 0.05; group.add(pipe);
      const wood = '#24222a', ivory = '#f3ecd2', silver = '#b9bcc4';
      // Two joints of blackwood on a silver tuning slide, each ringed and capped in ivory, with a flared bell on top.
      for (const base of [0, 0.37]) {
        cylinder(pipe, 0.04, 0.046, 0.3, wood, 0, base + 0.15);
        for (const ring of [0.06, 0.1, 0.14]) cylinder(pipe, 0.049, 0.049, 0.008, silver, 0, base + ring);
        cylinder(pipe, 0.058, 0.058, 0.04, ivory, 0, base + 0.29);
      }
      cylinder(pipe, 0.028, 0.028, 0.1, silver, 0, 0.34);
      cylinder(pipe, 0.085, 0.045, 0.1, wood, 0, 0.74);
      cylinder(pipe, 0.092, 0.092, 0.02, ivory, 0, 0.8);
      cylinder(pipe, 0.055, 0.055, 0.004, '#0b0a0c', 0, 0.812);
      // The cord that tied it to its two brothers, and a tassel.
      mesh(pipe, new THREE.TorusGeometry(0.052, 0.012, 6, 14), material('#b3272c'), 0, 0.45).rotation.x = Math.PI / 2;
      tube(pipe, [[0.05, 0.45, 0], [0.13, 0.4, 0.02], [0.12, 0.26, 0.03]], 0.008, '#b3272c');
      mesh(pipe, new THREE.ConeGeometry(0.03, 0.1, 8), material('#b3272c'), 0.12, 0.22, 0.03);
      break;
    }
    case 'odd-abalone': { // rough outside, an oil slick inside, propped up so the good side shows
      box(group, 0.5, 0.03, 0.26, '#5c4028', 0, 0.015, -0.02);
      box(group, 0.36, 0.2, 0.03, '#6b4a30', 0, 0.11, -0.13).rotation.x = -0.35;
      const shell = new THREE.Group(); shell.position.set(0, 0.25, 0.02); shell.rotation.x = 0.95; shell.scale.set(1.3, 0.42, 1); group.add(shell);
      const bowl = new THREE.SphereGeometry(0.27, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), colors = [], at = bowl.attributes.position;
      for (let i = 0; i < at.count; i++) {
        const swirl = Math.atan2(at.getZ(i), at.getX(i)) * 2 + at.getY(i) * 14;
        const color = new THREE.Color().setHSL(0.62 + 0.2 * Math.sin(swirl), 0.6, 0.66 + 0.08 * Math.cos(swirl * 1.7));
        colors.push(color.r, color.g, color.b);
      }
      bowl.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      mesh(shell, bowl, material('#6a5040'));
      mesh(shell, bowl, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })).scale.setScalar(0.96);
      mesh(shell, new THREE.TorusGeometry(0.27, 0.018, 6, 24), material('#4f3a2c')).rotation.x = Math.PI / 2;
      // The row of breathing holes along one edge.
      for (let i = 0; i < 5; i++) { const a = 2.5 + i * 0.24; mesh(shell, new THREE.SphereGeometry(0.016, 6, 4), material('#2a2024'), Math.cos(a) * 0.215, -0.02, Math.sin(a) * 0.215).scale.y = 2; }
      break;
    }
    case 'odd-horseshoe': {
      box(group, 0.8, 0.86, 0.04, '#5c4028', 0, 0.42, -0.03); box(group, 0.7, 0.76, 0.045, '#7d5a38', 0, 0.42, -0.028);
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
      // A velvet-lined cradle, because it is extra prepared.
      box(group, 0.62, 0.05, 0.26, '#6b4a30', 0.1, 0.025); box(group, 0.5, 0.02, 0.16, '#7c3a3a', 0.1, 0.055);
      syringe.position.set(-0.02, 0.05, 0);
      break;
    }
    case 'odd-anvil': {
      box(group, 0.8, 0.16, 0.55, '#46494c', 0, 0.08);
      box(group, 0.38, 0.46, 0.32, '#55595e', 0, 0.36);
      box(group, 0.9, 0.2, 0.38, '#7b7f83', 0, 0.66);
      const horn = mesh(group, new THREE.ConeGeometry(0.2, 0.48, 4), material('#7b7f83'), 0.64, 0.66); horn.rotation.z = -Math.PI / 2;
      const hardy = mesh(group, new THREE.PlaneGeometry(0.08, 0.08), material('#33363a'), -0.27, 0.761, 0.06); hardy.rotation.x = -Math.PI / 2;
      box(group, 0.5, 0.045, 0.05, '#8a623c', 0.02, 0.785, -0.06).rotation.y = 0.5; box(group, 0.1, 0.1, 0.2, '#35383c', 0.22, 0.81, -0.17).rotation.y = 0.5;
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
      const rock = mesh(group, geometry, material('#ffffff', { vertexColors: true }), 0, big ? 0.38 : 0.29); rock.scale.set(big ? 1.05 : 1.1, 0.8, big ? 0.8 : 0.8);
      if (big) {
        // The sibling gets a museum rope. The museum has no other funding.
        for (const x of [-0.6, 0.6]) { cylinder(group, 0.025, 0.035, 0.62, '#c4a05d', x, 0.31, 0.4, 8); mesh(group, new THREE.IcosahedronGeometry(0.045, 0), material('#d9bd7c'), x, 0.64, 0.4); }
        box(group, 1.16, 0.035, 0.035, '#7c3a3a', 0, 0.5, 0.4);
      } else { box(group, 0.62, 0.06, 0.5, '#5c4028', 0, 0.03); box(group, 0.2, 0.05, 0.012, '#d9bd7c', 0, 0.035, 0.251); }
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
    case 'odd-jackolantern': {
      mesh(group, new THREE.SphereGeometry(0.24, 10, 8), material('#e07a28'), 0, 0.2).scale.set(1.15, 0.8, 1);
      cylinder(group, 0.03, 0.045, 0.1, '#5a7a30', 0, 0.42, 0, 6);
      const glow = new THREE.MeshBasicMaterial({ color: '#ffd860' });
      for (const side of [-1, 1]) mesh(group, new THREE.CircleGeometry(0.05, 3), glow, side * 0.09, 0.25, 0.225).rotation.z = Math.PI / 2;
      mesh(group, new THREE.BoxGeometry(0.2, 0.04, 0.02), glow, 0, 0.14, 0.225);
      break;
    }
    case 'odd-ghost': {
      cylinder(group, 0.2, 0.28, 0.6, '#f1eee4', 0, 0.3, 0, 10);
      mesh(group, new THREE.SphereGeometry(0.2, 10, 8), material('#f1eee4'), 0, 0.6);
      for (const side of [-1, 1]) {
        mesh(group, new THREE.CircleGeometry(0.035, 8), material('#2a2430'), side * 0.07, 0.63, 0.19);
        // Nobody is under it. The boots are.
        box(group, 0.1, 0.07, 0.2, '#5c4028', side * 0.1, 0.035, 0.33);
      }
      break;
    }
    case 'odd-cornucopia': {
      mesh(group, new THREE.ConeGeometry(0.17, 0.5, 10), material('#b07a3a'), -0.02, 0.17).rotation.z = Math.PI / 2;
      for (const [r, color, x, z] of [[0.08, '#e07a28', 0.3, 0.05], [0.06, '#d8c040', 0.38, -0.08], [0.065, '#7a9a3a', 0.26, -0.1]]) mesh(group, new THREE.SphereGeometry(r, 8, 6), material(color), x, r, z);
      box(group, 0.08, 0.004, 0.16, '#f6f1e2', 0.34, 0.004, 0.2).rotation.y = 0.3; // the receipt
      break;
    }
    case 'odd-turkey': {
      mesh(group, new THREE.SphereGeometry(0.22, 10, 8), material('#7a4a2a'), 0, 0.34).scale.set(1.25, 0.9, 1);
      mesh(group, new THREE.CircleGeometry(0.3, 10, 0, Math.PI), material('#b8552a', { side: THREE.DoubleSide }), -0.24, 0.36).rotation.y = Math.PI / 2;
      cylinder(group, 0.04, 0.05, 0.22, '#8a5a36', 0.24, 0.52, 0, 6);
      mesh(group, new THREE.SphereGeometry(0.07, 8, 6), material('#8a5a36'), 0.26, 0.66);
      mesh(group, new THREE.ConeGeometry(0.025, 0.08, 5), material('#e8b030'), 0.35, 0.65).rotation.z = -Math.PI / 2;
      box(group, 0.025, 0.07, 0.025, '#c03030', 0.31, 0.59);
      for (const side of [-1, 1]) cylinder(group, 0.012, 0.012, 0.16, '#e8b030', 0.03, 0.08, side * 0.08, 5);
      break;
    }
    case 'odd-stocking': {
      box(group, 0.2, 0.42, 0.06, '#b8362e', 0, 0.5, 0.03);
      box(group, 0.34, 0.16, 0.06, '#b8362e', 0.07, 0.26, 0.03);
      box(group, 0.24, 0.1, 0.075, '#f1eee4', 0, 0.74, 0.03);
      mesh(group, new THREE.DodecahedronGeometry(0.07, 0), material('#2a2a30'), 0.02, 0.8, 0.03); // Shaft 7 coal
      break;
    }
    case 'odd-tumbletree': {
      cylinder(group, 0.14, 0.11, 0.14, '#8a5a36', 0, 0.07, 0, 8);
      mesh(group, new THREE.IcosahedronGeometry(0.3, 1), material('#a08454', { wireframe: true }), 0, 0.44);
      mesh(group, new THREE.IcosahedronGeometry(0.19, 0), material('#6e5a34'), 0, 0.44);
      const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial(), 10);
      for (let i = 0; i < 10; i++) {
        const y = 1 - (2 * (i + 0.5)) / 10, r = Math.sqrt(1 - y * y), turn = i * 2.4;
        lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(turn) * r * 0.3, 0.44 + y * 0.3, Math.sin(turn) * r * 0.3));
        lights.setColorAt(i, new THREE.Color(['#e0483c', '#f0c840', '#4a8ad8', '#58b060'][i % 4]));
      }
      group.add(lights);
      mesh(group, new THREE.OctahedronGeometry(0.07), material('#f0d040'), 0, 0.8);
      group.scale.setScalar(1.3);
      break;
    }
  }
  return bake(group);
}

// The shortest walk to anything he is asked to do, his pace on a longer one, then a moment to settle into it.
const COFFEE_WALK = 5500, WALK_SPEED = 2.6, COFFEE_SIT = 1000, PIPE_DELAY = 650, SPRINKLER_END = 3600;
const TASK_KINDS = Object.keys(TASK_LINES), PORCH_EDGE = 6.1 * ROOM_FLOOR_SCALE;
/** How far below the floors his feet are: nothing indoors or on the porch, then down the two steps to the lawn. */
const stepDown = (x, z) => x <= PORCH_EDGE ? 0 : Math.min(1, (x - PORCH_EDGE) / (0.48 * ROOM_FLOOR_SCALE)) * groundLevel(x / ROOM_FLOOR_SCALE, z / ROOM_FLOOR_SCALE);

/** A clickable cutaway. React owns the controls; room activity is cosmetic. */
export class RoomScene {
  constructor(canvas, { activity = new RoomActivity(), onSelect, onMoveShelf, onMoveWall, onMoveFurniture, onWealthHover, onSpeech, onSpeechPosition, onHouseState, onHouseTasks, onZoom, onViewChange, onError } = {}) {
    this.canvas = canvas; this.onSelect = onSelect; this.onMoveShelf = onMoveShelf; this.onMoveFurniture = onMoveFurniture; this.onWealthHover = onWealthHover; this.onError = onError; this.generation = 0;
    this.onMoveWall = onMoveWall; this.onSpeechPosition = onSpeechPosition; this.onZoom = onZoom; this.onViewChange = onViewChange;
    this.onSpeech = onSpeech; this.onHouseState = onHouseState; this.onHouseTasks = onHouseTasks; this.activity = activity;
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.lighting = setupRoomLighting(this.scene, this.renderer);
    this.view = roomView();
    this.static = new THREE.Group(); this.dynamic = new THREE.Group(); this.highlights = new THREE.Group(); this.dragPreview = new THREE.Group(); this.scene.add(this.static, this.dynamic, this.highlights, this.dragPreview);
    this.picks = []; this.raycaster = new THREE.Raycaster();
    this.buildRoom();
    this.scene.add(homesteadLandscape());
    this.homestead = buildHomestead(this.static, { onReady: () => {
      if (this.editing) this.setEditing(true, this.selection);
      else { this.lighting.invalidate(); this.render(); }
    } });
    this.faun = roomFaun(); this.faun.position.set(7.6 * ROOM_FLOOR_SCALE, ROOM_GRADE + 0.01, 2.83 * ROOM_FLOOR_SCALE); this.faun.rotation.y = -0.45;
    this.faun.scale.y = 1.25; this.faunHead = this.faun.getObjectByName('faun-head'); this.faunLegs = this.faun.children.filter(part => part.name === 'faun-goat-leg');
    this.faun.visible = false; this.scene.add(this.faun);
    configureShadowObjects(this.static); configureShadowObjects(this.faun);
    this.resize = this.resize.bind(this);
    this.down = this.pointerDown.bind(this); this.up = this.pointerUp.bind(this); this.move = this.pointerMove.bind(this);
    this.cancel = e => { if (e?.pointerId === undefined || this.pointerId === undefined || e.pointerId === this.pointerId) this.cancelPointer(); };
    // A Mac's Ctrl-click opens a menu; here it starts a camera drag instead.
    this.contextMenu = e => { if ((e.button === 2 || e.ctrlKey) && !this.failed) e.preventDefault(); };
    this.keys = e => {
      if (e.key === 'Escape') this.cancelPointer();
      else if (e.target === this.canvas && this.stepCamera(e.key)) e.preventDefault();
      else if (e.target === this.canvas && this.editing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        && (furnitureOf(this.selection) || this.wallDisplays?.[this.selection?.anchorId] || shelfForAnchor(this.shelves || [], this.selection?.anchorId))) {
        e.preventDefault(); this.moveSelected(e.key);
      }
    };
    this.lost = e => { e.preventDefault(); this.cancelPointer(); this.failed = true; this.stopActivity(); this.onError?.(new Error('The 3D view is unavailable. Use the room controls below.')); };
    // The wheel zooms only where it cannot be mistaken for scrolling the page; Ctrl-scroll (and trackpad pinch) always zooms the room.
    this.wheel = e => {
      const page = this.canvas.closest?.('.room-page'), step = e.deltaY < 0 ? 0.25 : -0.25, zoom = this.view.zoom + step;
      if (this.failed || (!e.ctrlKey && (zoom < 1 || zoom > ROOM_VIEW_LIMITS.maxZoom || (this.view.zoom <= 1 && page && page.scrollHeight > page.clientHeight + 1)))) return;
      e.preventDefault();
      if (zoom < ROOM_VIEW_LIMITS.minZoom || zoom > ROOM_VIEW_LIMITS.maxZoom) return;
      this.wheelSum = (this.wheelSum || 0) + e.deltaY;
      if (Math.abs(this.wheelSum) >= 60) { this.wheelSum = 0; this.cancelPointer(); this.onZoom?.(step); }
    };
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.visible = () => this.visibilityChanged();
    this.motionChange = () => this.render();
    this.motion.addEventListener('change', this.motionChange);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerleave', this.cancel);
    canvas.addEventListener('contextmenu', this.contextMenu); canvas.addEventListener('lostpointercapture', this.cancel);
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
    this.updateCamera();
  }
  updateCamera() {
    const previous = this.camera, area = this.framedArea;
    this.camera = makeRoomCamera(Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight), this.view);
    const before = previous && roomWallVisibility(previous.position), after = roomWallVisibility(this.camera.position);
    if (!before || before.back !== after.back || before.left !== after.left || area !== this.view?.area) this.applyCutaway();
    this.framedArea = this.view?.area;
    this.render();
  }
  setView(view) {
    if (this.disposed || (view && view === this.view)) return;
    this.cancelPointer(false);
    this.view = roomView(view);
    this.touchMode();
    this.updateCamera();
  }
  setCameraMode(mode) {
    if (this.cameraMode === mode || this.disposed) return;
    this.cancelPointer(); this.cameraMode = mode; this.touchMode();
  }
  stepCamera(key) {
    if (!this.cameraMode || this.failed || this.disposed || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return false;
    const x = Number(key === 'ArrowRight') - Number(key === 'ArrowLeft'), y = Number(key === 'ArrowUp') - Number(key === 'ArrowDown');
    this.cancelPointer(false);
    const view = this.view, step = 0.24 / view.zoom;
    this.view = roomView(this.cameraMode === 'pan'
      ? { ...view, panX: view.panX + x * step, panY: view.panY + y * step }
      : { ...view, rotation: view.rotation + x * 15, tilt: view.tilt + y * 5 });
    this.updateCamera(); this.onViewChange?.(this.view);
    return true;
  }
  touchMode() { if (this.canvas?.style) this.canvas.style.touchAction = this.cameraMode || this.editing || this.view?.zoom > 1 ? 'none' : 'pan-y'; }
  movable() { return { ...this.fixtures, ...this.homestead?.pieces, wardrobe: this.wardrobe, rug: this.rug, couch: this.couch }; }
  pointerDown(e) {
    if (e.isPrimary === false || (e.button !== 0 && e.button !== 2) || this.disposed || this.failed) return;
    this.cancelPointer();
    if (this.editing || this.cameraMode) this.canvas.focus?.({ preventScroll: true });
    this.pointerStart = [e.clientX, e.clientY]; this.pointerId = e.pointerId;
    const forceMode = e.button === 2 || e.shiftKey ? 'pan' : e.ctrlKey ? 'orbit' : this.cameraMode;
    const target = !forceMode && this.editing && this.targetAt(e.clientX, e.clientY);
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
    if (!this.dragCandidate) {
      const mode = forceMode || (this.view?.zoom > 1 ? 'pan' : e.pointerType === 'touch' ? null : 'orbit');
      if (mode) this.cameraDrag = { mode, x: e.clientX, y: e.clientY, moved: false };
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
    const id = this.dragging.furniture;
    const moved = place ? { ...this.furniture, [id]: { ...current, ...place } } : this.furniture;
    const scale = id === 'couch' ? roomCouchScale(moved, this.shelves, this.wallDisplays) : [1, 1, 1];
    if (id === 'couch') this.couch?.scale.fromArray(scale);
    disposeObjects(this.dragPreview); this.dragPreview.clear();
    if (place) {
      const [w, d] = ROOM_FURNITURE[id].size;
      const geometry = new THREE.BoxGeometry(w * scale[0], 0.1, d * scale[2]);
      const marker = mesh(this.dragPreview, geometry, new THREE.MeshBasicMaterial({ color: fits ? '#b9df83' : '#d8604f', transparent: true, opacity: 0.4, depthWrite: false }), place.x, (ROOM_FURNITURE[id].yard ? ROOM_GRADE : 0) + 0.08, place.z);
      marker.rotation.y = this.furniture[id].r * Math.PI / 2; marker.renderOrder = 5;
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: fits ? '#ffdc83' : '#d8604f', transparent: true, opacity: 0.75 }));
      outline.position.copy(marker.position); outline.rotation.copy(marker.rotation); this.dragPreview.add(outline);
    }
    this.render();
  }
  pointerMove(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    const drag = this.cameraDrag;
    if (drag && (drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6)) {
      if (!drag.moved) {
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch { this.cancelPointer(); return; }
        drag.moved = true; this.canvas.style.cursor = 'grabbing'; this.hovered = false; this.onWealthHover?.(false);
      }
      const { width, height } = this.canvas.getBoundingClientRect(), view = this.view || roomView();
      if (!width || !height) return;
      const dx = (e.clientX - drag.x) / width, dy = (e.clientY - drag.y) / height;
      this.view = roomView(drag.mode === 'pan'
        ? { ...view, panX: view.panX - 2 * dx / view.zoom, panY: view.panY + 2 * dy / view.zoom }
        : { ...view, rotation: view.rotation - 180 * dx, tilt: view.tilt + 60 * dy });
      drag.x = e.clientX; drag.y = e.clientY;
      this.updateCamera();
      return;
    }
    if (this.dragCandidate && this.pointerStart && Math.hypot(e.clientX - this.pointerStart[0], e.clientY - this.pointerStart[1]) > 6) {
      if (!this.editing || this.disposed || this.failed) { this.cancelPointer(); return; }
      this.dragging = this.dragCandidate; this.dragCandidate = null;
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch { this.cancelPointer(); return; }
      const id = this.dragging.furniture || this.dragging.id;
      const fixture = this.movable()[id];
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
    const target = this.targetAt(e.clientX, e.clientY), hovered = target?.kind === 'wealth' || target?.kind === 'poker';
    const movable = this.editing && (furnitureOf(target) || this.wallDisplays?.[target?.anchorId] || shelfForAnchor(this.shelves || [], target?.anchorId));
    this.canvas.style.cursor = movable || this.cameraMode ? 'grab' : target ? 'pointer' : '';
    if (this.hovered !== hovered) { this.hovered = hovered; this.onWealthHover?.(hovered); }
  }
  pointerUp(e) {
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    if (this.cameraDrag?.moved || e.button === 2) { this.cancelPointer(); return; }
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
    if (selection?.kind === 'houseAction') this.onHouseAction?.(selection.action);
    else if (selection?.kind === 'resident') this.talk();
    else if (selection) this.onSelect?.(selection);
  }
  cancelPointer(publishView = true) {
    const movedCamera = this.cameraDrag?.moved;
    this.cameraDrag = null;
    this.moveDragObjects();
    if (this.dragging?.furniture === 'couch') this.couch?.scale.fromArray(roomCouchScale(this.furniture, this.shelves, this.wallDisplays));
    if (this.highlights) this.highlights.visible = true;
    if (this.pointerId !== undefined && this.canvas?.hasPointerCapture?.(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.pointerStart = null; this.pointerId = undefined; this.dragging = null; this.dragCandidate = null;
    if (this.canvas?.style) this.canvas.style.cursor = '';
    if (this.dragPreview?.children.length) { disposeObjects(this.dragPreview); this.dragPreview.clear(); this.render(); }
    this.hovered = false; this.onWealthHover?.(false);
    if (publishView && movedCamera) this.onViewChange?.(this.view);
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
    const visible = roomWallVisibility(this.camera.position);
    for (const spot of spots) {
      if (spot.id === current.id || !visible[spot.wallSide]) continue;
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
    if (destination) for (const { object, rotation } of this.dragging.objects || []) object.rotation.y = rotation.y + wallTurn(destination.wallSide) - wallTurn(origin.wallSide);
    disposeObjects(this.dragPreview); this.dragPreview.clear();
    const spot = destination || origin, size = ROOM_SHELF_SIZES[this.shelves.find(shelf => shelf.id === id)?.sizeId || 'standard'];
    if (spot) {
      const geometry = new THREE.BoxGeometry(...(wall ? [1.2, 1.1, 0.12] : [size.width + 0.05, 0.12, size.depth + 0.05]));
      const marker = mesh(this.dragPreview, geometry, new THREE.MeshBasicMaterial({ color: destination ? '#b9df83' : '#d8604f', transparent: true, opacity: 0.3, depthWrite: false }), ...position(spot));
      marker.rotation.y = wallTurn(spot.wallSide) + (wall ? Math.PI / 2 : 0);
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
    if (this.editing) {
      picks.push(...(this.homestead?.editPicks || []));
      if (this.yardFence) picks.push(this.yardFence);
    } else {
      if (this.residentPick && !this.activityPaused) picks.push(this.residentPick);
      if (this.onHouseAction) picks.push(...(this.homestead?.picks || []), ...(this.signPicks || []));
    }
    const targets = this.editing ? [...picks, ...this.walls] : picks.filter(target => !['surface', 'couch'].includes(target.userData.selection.kind));
    const hit = this.raycaster.intersectObjects(targets.filter(target => shown(target) && !(this.wagon && target.userData.selection?.anchorId === 'window')), false)[0];
    const wagonHit = this.wagon && this.raycaster.intersectObject(this.wagon, true)[0];
    if (wagonHit && (!hit || wagonHit.distance < hit.distance)) return { kind: 'anchor', anchorId: 'window' };
    const data = hit?.object.userData;
    return (this.editing && data?.editSelection) || data?.selection || null;
  }
  applyCutaway() {
    if (!this.camera) return;
    const visible = roomWallVisibility(this.camera.position);
    const area = this.view?.area;
    for (const { side, solid, ghost, reverseFor } of [...(this.wallCutaways || []), ...(this.homestead?.walls || [])]) {
      solid.visible = reverseFor?.includes(area) ? !visible[side] : visible[side];
      ghost.visible = !solid.visible;
    }
    if (this.cornerPost) this.cornerPost.visible = visible.back || visible.left;
    for (const group of [this.dynamic, this.highlights]) for (const object of group?.children || []) {
      if (object.userData.wallSide) object.visible = visible[object.userData.wallSide] && !BEHIND_WALL[object.userData.wallSide]?.includes(area);
    }
    this.lighting?.invalidate();
  }
  setEditing(active, selection) {
    if (this.disposed) return;
    if (active && !this.editing) this.stopActivity();
    this.editing = !!active; this.selection = selection;
    if (!this.editing) this.cancelPointer();
    this.touchMode();
    disposeObjects(this.highlights); this.highlights.clear();
    this.wallMaterial.emissive.set(this.editing ? '#8b6529' : '#000000');
    this.wallMaterial.emissiveIntensity = this.editing ? (selection?.kind === 'finish' ? 0.35 : 0.12) : 0;
    if (this.editing) for (const target of this.picks) {
      const chosen = target.userData.selection;
      if (!['anchor', 'wardrobe', 'pet', 'wealth', 'surface', 'couch', 'poker'].includes(chosen.kind)) continue;
      const selected = chosen.kind === selection?.kind && (chosen.kind !== 'anchor' || chosen.anchorId === selection.anchorId) && (chosen.kind !== 'surface' || chosen.surface === selection.surface);
      const glow = new THREE.Group(); glow.position.copy(target.position); glow.rotation.copy(target.rotation); glow.scale.copy(target.scale);
      glow.userData.selection = chosen; glow.userData.wallSide = target.userData.wallSide;
      const geometry = target.geometry.clone();
      mesh(glow, geometry, new THREE.MeshBasicMaterial({ color: '#f2c65a', transparent: true, opacity: selected ? 0.08 : 0.025, depthWrite: false }));
      glow.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#ffdc83', transparent: true, opacity: selected ? 0.9 : 0.38, depthWrite: false })));
      this.highlights.add(glow);
    }
    if (this.editing && (selection?.kind === 'homestead' || selection?.surface === 'fence')) {
      // A picked fitting outlines just itself; a room's finish outlines everything in that style.
      const targets = selection.surface === 'fence' ? [this.yardFence] : (this.homestead?.editPicks || []).filter(object => {
        const picked = object.userData.editSelection || object.userData.selection;
        return selection.piece ? picked?.piece === selection.piece : picked?.id === selection.id;
      });
      const bounds = new THREE.Box3();
      for (const target of targets) if (target && shown(target)) bounds.expandByObject(target);
      if (!bounds.isEmpty()) {
        bounds.min.y = (selection.surface === 'fence' ? ROOM_GRADE : 0) + 0.07; bounds.max.y = bounds.min.y + 0.01;
        this.highlights.add(new THREE.Box3Helper(bounds, '#ffdc83'));
      }
    }
    this.applyCutaway(); this.render();
  }
  buildRoom() {
    this.structure = new THREE.Group(); this.structure.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE); this.static.add(this.structure);
    const p = this.structure;
    const floorMap = paintedTexture(128, 128, ctx => {
      ctx.fillStyle = '#a9937d'; ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#d4c2ac' : '#cbb8a1'; ctx.fillRect(0, i * 16 + 1, 128, 15);
        ctx.fillStyle = '#c5b29d';
        for (let j = 0; j < 3; j++) ctx.fillRect(5 + (i * 13 + j * 19) % 45, i * 16 + 4 + j * 3, 35 + (i + j) % 20, 1);
        ctx.fillStyle = '#ab947d'; ctx.fillRect((i * 34) % 96 + 16, i * 16 + 1, 1, 15);
      }
    });
    floorMap.magFilter = THREE.LinearFilter; floorMap.minFilter = THREE.LinearMipmapLinearFilter; floorMap.generateMipmaps = true;
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping; floorMap.repeat.set(2.5, 2);
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
    // The left edge stops at the wall's outer face; the right edge meets the yard.
    this.floor = mesh(p, new THREE.BoxGeometry(8.33, 0.2, 6.5), material('#f0d4a2', { map: floorMap }), 0.085, -0.1, 0);
    this.wallMaterial = material(PAINT['bunkhouse-timber']); this.walls = []; this.wallCutaways = [];
    this.backWall = new THREE.Group(); this.leftWall = new THREE.Group(); p.add(this.backWall, this.leftWall);
    const wall = (parent, w, h, d, x, y, z) => {
      const panel = mesh(parent, new THREE.BoxGeometry(w, h, d), this.wallMaterial, x, y, z);
      panel.userData.selection = { kind: 'finish' }; this.walls.push(panel); return panel;
    };
    const opening = { left: -0.3, right: 1.8, bottom: 1.4, top: 2.85 };
    const openingWidth = opening.right - opening.left;
    const windowX = (opening.left + opening.right) / 2;
    const doorLeft = 2.30, doorRight = 3.45, base = 0.78;
    const backPanel = (from, to, bottom, top) => wall(this.backWall, to - from, top - bottom, 0.16, (to + from) / 2, (top + bottom) / 2, -3);
    backPanel(-4, opening.left, base, ROOM_WALL_HEIGHT);
    backPanel(opening.left, opening.right, base, opening.bottom);
    backPanel(opening.left, opening.right, opening.top, ROOM_WALL_HEIGHT);
    backPanel(opening.right, doorLeft, base, ROOM_WALL_HEIGHT);
    backPanel(doorLeft, doorRight, ROOM_DOOR_HEIGHT, ROOM_WALL_HEIGHT);
    backPanel(doorRight, 4.08, base, ROOM_WALL_HEIGHT);
    for (const [from, to] of [[-4, doorLeft], [doorRight, 4.08]]) {
      box(p, to - from, base, 0.16, '#9b7957', (from + to) / 2, base / 2, -3);
      box(p, to - from, 0.07, 0.20, '#c09b69', (from + to) / 2, base, -3);
    }
    const leftPanel = (from, to, bottom, top) => wall(this.leftWall, 0.16, top - bottom, to - from, -4, (top + bottom) / 2, (to + from) / 2);
    const sashStart = -1.52, sashEnd = 0.50, sashBottom = 1.94, sashTop = 3.36;
    leftPanel(-3, sashStart, 0, ROOM_WALL_HEIGHT);
    leftPanel(sashEnd, 3.35, 0, ROOM_WALL_HEIGHT);
    leftPanel(sashStart, sashEnd, 0, sashBottom);
    leftPanel(sashStart, sashEnd, sashTop, ROOM_WALL_HEIGHT);
    const bunkDivider = makeWallCutaway('back', this.backWall, this.backWall.children);
    bunkDivider.reverseFor = ['bunk', 'bathroom'];
    this.wallCutaways.push(bunkDivider, makeWallCutaway('left', this.leftWall, this.leftWall.children));

    this.cornerPost = box(p, 0.11, ROOM_WALL_HEIGHT + 0.1, 0.25, '#664730', -4, ROOM_WALL_HEIGHT / 2 + 0.02, -2.9);
    box(this.backWall, 8.18, 0.15, 0.22, '#765237', 0.04, ROOM_WALL_HEIGHT + 0.02, -3);
    box(this.leftWall, 0.22, 0.15, 6.48, '#765237', -4, ROOM_WALL_HEIGHT + 0.02, 0.175);
    for (const x of [doorLeft, doorRight]) box(this.backWall, 0.08, ROOM_DOOR_HEIGHT, 0.22, '#966d47', x, ROOM_DOOR_HEIGHT / 2, -3);
    box(this.backWall, doorRight - doorLeft + 0.12, 0.11, 0.22, '#966d47', (doorLeft + doorRight) / 2, ROOM_DOOR_HEIGHT + 0.055, -3);
    box(p, doorRight - doorLeft, 0.025, 0.24, '#c49d70', (doorLeft + doorRight) / 2, 0.015, -3);
    box(this.leftWall, 0.18, base, 6.35, '#9b7957', -4, base / 2, 0.175);
    box(this.leftWall, 0.20, 0.07, 6.35, '#c09b69', -4, base, 0.175);

    // The saved display sill is now a pass-through into the bunk. The rear sash looks into the yard.
    const windowFrame = (parent, width, bottom, top, x, z, angle) => {
      const frame = new THREE.Group();
      frame.position.set(x, bottom, z); frame.rotation.y = angle; parent.add(frame);
      const h = top - bottom;
      const glass = new THREE.MeshBasicMaterial({ color: '#b7d3cb', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      mesh(frame, new THREE.PlaneGeometry(width, h), glass, 0, h / 2, 0);
      for (const a of [-width / 2, width / 2]) box(frame, 0.1, h + 0.16, 0.22, '#9c744e', a, h / 2, 0);
      box(frame, width + 0.19, 0.11, 0.24, '#c39b68', 0, h, 0);
      box(frame, width + 0.26, 0.12, 0.38, '#c39b68', 0, 0, 0.09);
      box(frame, 0.045, h, 0.075, '#b89c77', 0, h / 2, 0);
      box(frame, width, 0.055, 0.075, '#b89c77', 0, h * 0.57, 0);
    };
    windowFrame(this.backWall, openingWidth, opening.bottom, opening.top, windowX, -3, 0);
    windowFrame(this.leftWall, sashEnd - sashStart, sashBottom, sashTop, -4, (sashStart + sashEnd) / 2, Math.PI / 2);
    this.buildYardFence(roomFinishes().fence);
    const sign = signpost(); this.static.add(sign);
    this.signPicks = []; sign.traverse(part => { if (part.userData.selection) this.signPicks.push(part); });
    this.buildSideDoor();
    // Furnishings keep their original size while their origins spread across the larger floor.
    const desk = this.fixture();
    this.table(desk, 0, 0, 1.8, 0.9, ROOM_DESK_TOP - 0.07);
    box(desk, 1.5, 0.3, 0.07, '#65462e', 0, ROOM_DESK_TOP - 0.30, 0.41);
    cylinder(desk, 0.035, 0.035, 0.06, '#c4a05d', 0, ROOM_DESK_TOP - 0.30, 0.47).rotation.x = Math.PI / 2;
    // A wide, low glass case on a stand: brass frame, glass lid and a little landscaping for the resident.
    const terrarium = this.fixture();
    this.table(terrarium, 0, 0, 1.8, 1.2, 0.5);
    box(terrarium, 1.88, 0.08, 1.27, '#6b6a45', 0, 0.61);
    box(terrarium, 1.8, 0.1, 1.2, '#7a5c3c', 0, 0.7);
    const glass = material('#b3d2b7', { transparent: true, opacity: 0.15, depthWrite: false });
    mesh(terrarium, new THREE.BoxGeometry(1.84, 1, 1.24), glass, 0, 1.15);
    mesh(terrarium, new THREE.BoxGeometry(1.84, 0.02, 1.24), material('#dcefe6', { transparent: true, opacity: 0.3, depthWrite: false }), 0, 1.66);
    for (const x of [-0.92, 0.92]) for (const z of [-0.62, 0.62]) box(terrarium, 0.05, 1.04, 0.05, '#c7a66b', x, 1.15, z);
    for (const y of [0.67, 1.67]) {
      for (const z of [-0.62, 0.62]) box(terrarium, 1.89, 0.05, 0.05, '#c7a66b', 0, y, z);
      for (const x of [-0.92, 0.92]) box(terrarium, 0.05, 0.05, 1.29, '#c7a66b', x, y, 0);
    }
    cylinder(terrarium, 0.05, 0.07, 0.06, '#d9bd7c', 0, 1.71);
    mesh(terrarium, new THREE.DodecahedronGeometry(0.15, 0), material('#8a8780'), -0.68, 0.83, -0.4).scale.y = 0.7;
    cylinder(terrarium, 0.13, 0.11, 0.05, '#8fb4b0', 0.68, 0.775, 0.42);
    for (const [x, y, z, lean] of [[0.6, 0.95, -0.42, 0.7], [0.74, 1.02, -0.38, -0.4], [0.8, 0.9, -0.46, -1]]) mesh(terrarium, new THREE.ConeGeometry(0.08, 0.3, 5), material('#5f7d4a'), x, y, z).rotation.z = lean;
    this.wardrobe = this.fixture();
    this.rug = this.fixture(); this.couch = this.fixture();
    const moneyTable = this.fixture();
    // Bought at the General Store: a waist-high cabinet with three velvet squares under glass.
    const display = this.fixture();
    box(display, 1.9, 0.7, 0.8, '#6b4a30', 0, 0.35); box(display, 1.96, 0.06, 0.86, '#805636', 0, 0.73);
    box(display, 1.84, 0.012, 0.74, '#3d2a1c', 0, 0.766);
    for (const x of [-0.62, 0, 0.62]) { box(display, 0.52, 0.012, 0.56, '#7c3a3a', x, 0.772); box(display, 0.2, 0.05, 0.012, '#d9bd7c', x, 0.62, 0.406); }
    for (const x of [-0.47, 0.47]) { box(display, 0.86, 0.42, 0.02, '#7d5a38', x, 0.3, 0.405); cylinder(display, 0.025, 0.025, 0.04, '#c4a05d', x * 0.2, 0.3, 0.425, 8).rotation.x = Math.PI / 2; }
    mesh(display, new THREE.BoxGeometry(1.88, 1.02, 0.78), material('#b3d2c8', { transparent: true, opacity: 0.13, depthWrite: false }), 0, 1.28);
    for (const x of [-0.94, 0.94]) for (const z of [-0.39, 0.39]) box(display, 0.04, 1.04, 0.04, '#c7a66b', x, 1.28, z);
    for (const y of [0.78, 1.8]) {
      for (const z of [-0.39, 0.39]) box(display, 1.92, 0.04, 0.04, '#c7a66b', 0, y, z);
      for (const x of [-0.94, 0.94]) box(display, 0.04, 0.04, 0.82, '#c7a66b', x, y, 0);
    }
    // Also from the store: an oval of green felt on a pedestal, with a hand nobody is playing.
    const poker = this.fixture();
    cylinder(poker, 0.42, 0.5, 0.06, '#49321f', 0, 0.03, 0, 20).scale.x = 1.4; cylinder(poker, 0.13, 0.18, 0.82, '#59402a', 0, 0.47);
    cylinder(poker, 0.78, 0.74, 0.1, '#5a3a24', 0, 0.93, 0, 28).scale.x = 1.54;
    cylinder(poker, 0.66, 0.66, 0.02, '#2f6b4f', 0, 0.975, 0, 28).scale.x = 1.62;
    mesh(poker, new THREE.TorusGeometry(0.5, 0.006, 4, 28), material('#d9c9a0'), 0, 0.987).rotation.x = Math.PI / 2;
    poker.children[poker.children.length - 1].scale.x = 1.7;
    for (const [x, z, turn, color] of [[0.7, 0.36, 0.3, '#f6f1e2'], [0.78, 0.33, 0.55, '#f6f1e2'], [-0.72, -0.34, -0.4, '#8a2f33'], [-0.64, -0.38, -0.15, '#8a2f33']]) box(poker, 0.1, 0.004, 0.14, color, x, 0.988, z).rotation.y = turn;
    cylinder(poker, 0.05, 0.05, 0.012, '#f6f1e2', 0.5, 0.992, -0.38, 12);
    this.fixtures = { desk, pet: terrarium, wealth: moneyTable, case: display, poker };
    this.table(moneyTable, 0, 0, 2.2, 1.3, 0.95);
    box(moneyTable, 2.05, 0.08, 1.13, '#4a3526', 0, 1.04);
    for (const z of [-0.58, 0.58]) box(moneyTable, 2.12, 0.08, 0.04, '#b08b4d', 0, 1.12, z);
    for (const x of [-1.05, 1.05]) box(moneyTable, 0.04, 0.08, 1.2, '#b08b4d', x, 1.12);
    box(this.leftWall, 0.10, 0.39, 0.20, '#725c42', -3.89, 2.52, 1.9);
    box(this.leftWall, 0.27, 0.07, 0.08, '#866d49', -3.74, 2.4, 1.9);
    cylinder(this.leftWall, 0.13, 0.16, 0.12, '#95764c', -3.62, 2.47, 1.9, 8);
    cylinder(this.leftWall, 0.13, 0.115, 0.35, '#f3dab2', -3.62, 2.70, 1.9, 8);
    cylinder(this.leftWall, 0.07, 0.17, 0.11, '#80674a', -3.62, 2.92, 1.9, 8);
  }
  /** Furniture is built around its own origin; update() places it from the saved layout. */
  fixture() {
    const group = new THREE.Group(); this.static.add(group); return group;
  }
  buildSideDoor() {
    const root = this.structure || this.static;
    const side = this.rightWall = new THREE.Group(); side.name = 'yard-partition'; root.add(side);
    const panels = [], trim = '#956c42', dark = '#59422e';
    const wallX = 4.08, doorTop = ROOM_DOOR_HEIGHT + 0.06, jambLeft = 1.44, jambRight = 2.28;
    const windowLeft = -1.4, windowRight = -0.32, sill = 1.31, lintel = 2.7, windowZ = (windowLeft + windowRight) / 2;
    const casing = new THREE.Group(); side.add(casing);
    const plankWall = (from, to, bottom = 0, top = ROOM_WALL_HEIGHT) => {
      const length = to - from, z = (from + to) / 2;
      const panel = mesh(side, new THREE.BoxGeometry(0.14, top - bottom, length), this.wallMaterial, wallX, (bottom + top) / 2, z);
      panel.userData.selection = { kind: 'finish' }; this.walls.push(panel); panels.push(panel);
      for (let y = 0.4; y < top - 0.02; y += 0.5) {
        if (y > bottom + 0.02) box(casing, 0.15, 0.02, length, '#735238', wallX, y, z);
      }
    };
    plankWall(-3, windowLeft);
    plankWall(windowLeft, windowRight, 0, sill);
    plankWall(windowLeft, windowRight, lintel);
    plankWall(windowRight, jambLeft - 0.06);
    plankWall(jambLeft - 0.06, jambRight + 0.06, doorTop);
    plankWall(jambRight + 0.06, 3.35);
    for (const z of [-3, 3.35]) box(casing, 0.17, ROOM_WALL_HEIGHT + 0.1, 0.09, trim, wallX, ROOM_WALL_HEIGHT / 2 + 0.02, z);
    box(casing, 0.18, 0.15, 6.55, dark, wallX, ROOM_WALL_HEIGHT + 0.02, 0.175);
    const glass = new THREE.MeshBasicMaterial({ color: '#c1d5cb', transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
    const windowWidth = windowRight - windowLeft, windowHeight = lintel - sill, windowY = (lintel + sill) / 2;
    const pane = mesh(side, new THREE.PlaneGeometry(windowWidth, windowHeight), glass, wallX, windowY, windowZ);
    pane.rotation.y = Math.PI / 2;
    for (const z of [windowLeft, windowRight]) box(casing, 0.19, windowHeight + 0.1, 0.05, trim, wallX, windowY, z);
    box(casing, 0.26, 0.08, windowWidth + 0.15, '#c2a071', wallX, sill, windowZ);
    box(casing, 0.19, 0.075, windowWidth + 0.12, trim, wallX, lintel, windowZ);
    box(casing, 0.07, windowHeight, 0.028, trim, wallX, windowY, windowZ);
    box(casing, 0.07, 0.035, windowWidth, trim, wallX, windowY, windowZ);
    // Keep the timber portal and the open door together when the porch wall fades.
    const portal = new THREE.Group(); root.add(portal);
    for (const z of [jambLeft - 0.03, jambRight + 0.03]) box(portal, 0.21, doorTop, 0.06, trim, wallX, doorTop / 2, z);
    box(portal, 0.21, 0.10, jambRight - jambLeft + 0.16, trim, wallX, doorTop + 0.05, (jambLeft + jambRight) / 2);
    bake(portal);
    bake(casing);
    this.wallCutaways ??= [];
    this.wallCutaways.push(makeWallCutaway('right', side, panels));

    // The kitchen steps back from the porch; its partition meets this return wall.
    const corner = new THREE.Group(); corner.name = 'Parlor corner beside kitchen'; root.add(corner);
    const returnWidth = wallX - 3.20, returnX = wallX - returnWidth / 2;
    const returnPanel = mesh(corner, new THREE.BoxGeometry(returnWidth, ROOM_WALL_HEIGHT, 0.14), this.wallMaterial, returnX, ROOM_WALL_HEIGHT / 2, 3.35);
    returnPanel.userData.selection = { kind: 'finish' }; this.walls.push(returnPanel);
    box(corner, returnWidth + 0.09, 0.15, 0.18, dark, returnX, ROOM_WALL_HEIGHT + 0.02, 3.35);
    for (let y = 0.4; y < ROOM_WALL_HEIGHT; y += 0.5) box(corner, returnWidth, 0.02, 0.15, '#735238', returnX, y, 3.35);
    this.wallCutaways.push(makeWallCutaway('front', corner, [returnPanel]));
    box(root, returnWidth + 0.14, 0.18, 0.20, '#805937', returnX, -0.09, 3.35);

    // The 38-inch leaf stays visible when the wall is cut away and swings clear of the wagon lane.
    const width = 0.82, stile = 0.05, centre = -width / 2;
    box(root, 0.31, 0.05, jambRight - jambLeft + 0.12, '#bda079', wallX, 0.018, (jambLeft + jambRight) / 2);
    const door = new THREE.Group(); door.name = 'open-yard-door'; door.position.set(wallX, 0.06, jambRight - 0.02); door.rotation.y = -Math.PI / 2; root.add(door);
    for (const z of [-stile / 2, -width + stile / 2]) box(door, 0.055, ROOM_DOOR_HEIGHT, stile, trim, 0, ROOM_DOOR_HEIGHT / 2, z);
    for (const y of [0.05, 1.22, ROOM_DOOR_HEIGHT - 0.05]) box(door, 0.055, 0.1, width - 2 * stile, trim, 0, y, centre);
    box(door, 0.04, 1.07, width - 2 * stile, '#785332', 0, 0.635, centre);
    const doorGlass = mesh(door, new THREE.PlaneGeometry(width - 2 * stile, ROOM_DOOR_HEIGHT - 1.37), glass, 0, (ROOM_DOOR_HEIGHT + 1.17) / 2, centre);
    doorGlass.rotation.y = Math.PI / 2;
    const handle = cylinder(door, 0.045, 0.045, 0.09, '#d2ae65', 0.065, 1.34, -width + 0.09); handle.rotation.z = Math.PI / 2;
    for (const y of [0.35, ROOM_DOOR_HEIGHT - 0.35]) box(door, 0.07, 0.13, 0.10, '#4f4b40', 0, y, -0.05);
    bake(door);
  }
  table(parent, x, z, w, d, h) {
    box(parent, w, 0.14, d, '#93633c', x, h, z);
    for (const part of [-0.25, 0.25]) box(parent, w - 0.08, 0.006, 0.012, '#62432c', x, h + 0.073, z + part * d);
    for (const side of [-1, 1]) box(parent, w - 0.2, 0.16, 0.07, '#765033', x, h - 0.14, z + side * (d / 2 - 0.12));
    for (const dx of [-w / 2 + 0.12, w / 2 - 0.12]) for (const dz of [-d / 2 + 0.12, d / 2 - 0.12]) box(parent, 0.12, h, 0.12, '#59402a', x + dx, h / 2, z + dz);
  }
  buildYardFence(finish) {
    const key = finish.typeId + '/' + finish.colorId;
    if (this.yardFence?.userData.finishKey === key) return;
    if (this.yardFence) { disposeObjects(this.yardFence); this.yardFence.removeFromParent(); }
    const fence = new THREE.Group(), wood = finishColor('fence', finish), posts = new Set();
    for (const [from, to] of FENCE) for (let dx = to[0] - from[0], dz = to[1] - from[1], bays = Math.ceil(Math.hypot(dx, dz) / 2), i = 0; i <= bays; i++) {
      const x = from[0] + dx * i / bays, z = from[1] + dz * i / bays, y = groundLevel(x, z), spot = `${Math.round(x * 100)},${Math.round(z * 100)}`;
      // Two stretches share each corner post. Every post goes a little way into the ground.
      if (!posts.has(spot)) { posts.add(spot); box(fence, 0.12, FENCE_POST + 0.2, 0.12, shade(wood, 0.7), x, y + FENCE_POST / 2 - 0.1, z); }
      if (i === bays) break;
      // Rails follow the fall of the ground to the next post, with their faces to the outside.
      const length = Math.hypot(dx, dz) / bays, run = new THREE.Group(); run.position.set(x, y, z); fence.add(run);
      run.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(groundLevel(x + dx / bays, z + dz / bays) - y, length));
      if (finish.typeId === 'wire') {
        for (const y of [0.20, 0.43, 0.66]) box(run, length, 0.027, 0.027, '#716f65', length / 2, y, 0.023);
      } else if (finish.typeId === 'picket') {
        for (const y of [0.19, 0.52]) box(run, length, 0.065, 0.055, shade(wood, 0.76), length / 2, y);
        const spacing = length / Math.round(length / 0.23);
        for (let at = spacing / 2; at < length; at += spacing) {
          box(run, 0.11, 0.59, 0.05, wood, at, 0.355, 0.045);
          const tip = cylinder(run, 0, 0.078, 0.105, wood, at, 0.7025, 0.045, 4);
          tip.geometry.rotateY(Math.PI / 4); tip.scale.z = 0.45;
        }
      } else {
        for (const y of [0.28, 0.58]) {
          const rail = cylinder(run, 0.085, 0.07, length, wood, length / 2, y, 0, 5);
          rail.rotation.z = Math.PI / 2;
        }
      }
    }
    bake(fence);
    this.yardFence = fence.children.find(part => part.isMesh);
    this.yardFence.name = 'paddock-fence';
    this.yardFence.userData.finishKey = key;
    this.yardFence.userData.selection = { kind: 'surface', surface: 'fence' };
    this.structure.add(this.yardFence);
  }
  furnishings(finishes) {
    if (this.structure) this.buildYardFence(finishes.fence);
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
      if (finishes.wardrobe.typeId === 'classic') { box(this.wardrobe, 0.54, 0.85, 0.025, '#a8b5a2', -0.35, 1.65, 0.53); box(this.wardrobe, 1.56, 0.08, 0.9, shade(color, 0.8), 0, 2.54); }
      else { box(this.wardrobe, 1.65, 0.12, 0.96, color, 0, 2.52); box(this.wardrobe, 1.6, 0.1, 0.93, color, 0, 0.04); }
    }
    const couchKey = JSON.stringify(finishes.couch);
    if (this.couch && finishes.couch && this.couch.userData.finishKey !== couchKey) {
      disposeObjects(this.couch); this.couch.clear(); this.couch.userData.finishKey = couchKey;
      const c = this.couch, color = finishColor('couch', finishes.couch), bench = finishes.couch.typeId === 'bench', wood = '#6b4a30', frame = bench ? wood : shade(color, 0.7);
      for (const x of [-1.05, 1.05]) for (const z of [-0.38, 0.38]) box(c, 0.1, 0.16, 0.1, '#49321f', x, 0.08, z);
      box(c, 2.3, 0.26, 0.92, frame, 0, 0.29, 0);
      for (const x of [-0.52, 0.52]) box(c, 1.02, 0.18, 0.74, color, x, 0.51, 0.08);
      box(c, bench ? 2.3 : 2.08, 0.62, 0.16, bench ? wood : color, 0, 0.82, -0.4).rotation.x = -0.1;
      for (const side of [-1, 1]) {
        box(c, 0.16, bench ? 0.52 : 0.4, 0.92, frame, side * 1.07, bench ? 0.66 : 0.6, 0);
        if (bench) box(c, 0.2, 0.05, 0.96, shade(wood, 1.25), side * 1.07, 0.94, 0);
        else cylinder(c, 0.13, 0.13, 0.94, color, side * 1.07, 0.82, 0, 10).rotation.x = Math.PI / 2;
      }
      if (bench) box(c, 1.96, 0.36, 0.07, color, 0, 0.84, -0.3).rotation.x = -0.1;
      else for (const x of [-0.72, -0.24, 0.24, 0.72]) for (const y of [0.72, 0.96]) box(c, 0.05, 0.05, 0.02, shade(color, 0.55), x, y, -0.31 - (y - 0.82) * 0.1);
      box(c, 0.42, 0.34, 0.12, '#d2b56f', 0.76, 0.78, -0.22).rotation.set(-0.3, 0, 0.22);
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
    group.userData.wallSide = ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId)?.wallSide;
    group.rotation.y = wallTurn(group.userData.wallSide);
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
  pick(position, size, selection, turn = 0, wallSide) {
    const target = mesh(this.dynamic, new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), ...position);
    target.rotation.y = turn;
    if (wallSide) target.userData.wallSide = wallSide;
    target.userData.selection = selection; this.picks.push(target);
    return target;
  }
  update(view) {
    if (this.disposed) return;
    this.cancelPointer();
    const generation = ++this.generation;
    disposeObjects(this.dynamic); this.dynamic.clear(); this.picks = []; this.shelfItemPicks = []; this.wagon = null; this.spotProps = {};
    this.shelves = roomShelves(view.shelves);
    this.wallDisplays = roomWallDisplays(view.wallDisplays, this.shelves);
    const furniture = this.furniture = roomFurniture(view.furniture), turn = id => furniture[id].r * Math.PI / 2;
    this.homestead?.update(view.homestead, furniture);
    for (const [id, group] of Object.entries(this.movable())) {
      if (!group) continue;
      group.position.set(furniture[id].x, id === 'rug' ? ROOM_FIXTURES.rug[1] : 0, furniture[id].z);
      group.rotation.y = turn(id); group.visible = !furniture[id].off;
    }
    const couchScale = roomCouchScale(furniture, this.shelves, this.wallDisplays);
    this.couch?.scale.fromArray(couchScale);
    this.furnishings(roomFinishes(view.finishes));
    this.wallMaterial.color.set(PAINT[view.themeId] || PAINT['bunkhouse-timber']);
    const shelfGroups = new Map();
    for (const [anchorId, position] of Object.entries(roomPositions(this.shelves, furniture, this.wallDisplays))) {
      const shelf = shelfForAnchor(this.shelves, anchorId);
      if (shelf && !shelfGroups.has(shelf.id)) shelfGroups.set(shelf.id, this.shelf(shelf, roomShelfPosition(ROOM_SHELF_SPOTS.find(spot => spot.id === shelf.spotId))));
      const holder = shelf ? shelfGroups.get(shelf.id) : null;
      const wallSpot = ROOM_WALL_SPOTS.find(spot => spot.id === this.wallDisplays[anchorId]), host = anchorHost(anchorId);
      const wallSide = wallSpot?.wallSide || holder?.userData.wallSide || (anchorId === 'sill' ? 'back' : undefined);
      const rotation = wallSpot ? wallTurn(wallSpot.wallSide) + Math.PI / 2 : holder ? holder.rotation.y : furniture[host] ? turn(host) : 0;
      const placed = view.placements?.find(p => p.anchorId === anchorId), itemId = placed?.itemId, spin = (placed?.r || 0) * Math.PI / 2;
      if (ROOM_ITEM[itemId]) {
        const prop = oddity(itemId); if (!holder) { prop.position.set(...position); prop.rotation.y = rotation + spin; }
        else { prop.position.z = shelfSlots(shelf).find(slot => slot.id === anchorId).offset; prop.rotation.y = spin; }
        if (!holder && (furniture[host] || wallSpot)) prop.userData.dragId = wallSpot ? anchorId : host;
        if (!holder && wallSide) prop.userData.wallSide = wallSide;
        if (anchorId === 'window') { prop.scale.setScalar(1.65); prop.rotation.y -= 0.16; this.wagon = prop; }
        else if (!holder && furniture[host]) this.spotProps[host] ??= prop;
        if (holder) prop.traverse(part => { if (part.isMesh) { part.userData.selection = { kind: 'anchor', anchorId }; this.shelfItemPicks.push(part); } });
        (holder || this.dynamic).add(prop);
      }
      const wall = anchorId.startsWith('wall');
      const height = anchorId === 'window' ? 1.125 : wall ? 0.4 : shelf ? -0.04 : 0.3;
      // Pick shelf boards and visible items separately so neighboring slots cannot cover each other.
      const size = anchorId === 'window' ? [2.8, 2.25, 2.05] : anchorId === 'desk' ? [1.9, 0.9, 1.1] : wall ? [1.2, 1.1, 0.3] : host === 'case' ? [0.6, 0.9, 0.76] : [1.25, shelf ? 0.22 : 0.9, 0.8];
      this.pick([position[0], position[1] + height, position[2]], size, { kind: 'anchor', anchorId }, rotation, wallSide);
    }
    if (view.placements?.some(place => place.itemId === 'odd-deed')) this.dynamic.add(moon());
    this.pet(view.pet);
    this.resident(view.owner, generation);
    this.wealth(Number.isInteger(view.wealthStage) ? view.worth : null);
    this.pick([furniture.pet.x, 1.16, furniture.pet.z], [1.95, 1.2, 1.35], { kind: 'pet' }, turn('pet'));
    if (!furniture.couch.off) this.pick([furniture.couch.x, 0.58 * couchScale[1], furniture.couch.z],
      [2.4 * couchScale[0], 1.1 * couchScale[1], couchScale[2]], { kind: 'couch' }, turn('couch'));
    if (!furniture.wardrobe.off) this.pick([furniture.wardrobe.x, 1.3, furniture.wardrobe.z], [1.7, 2.6, 1], { kind: 'wardrobe' }, turn('wardrobe'));
    this.pick([furniture.wealth.x, 1.4, furniture.wealth.z], [2.1, 1, 1.25], { kind: 'wealth' }, turn('wealth'));
    if (!furniture.poker.off) this.pick([furniture.poker.x, 0.7, furniture.poker.z], [2.4, 1.4, 1.56], { kind: 'poker' }, turn('poker'));
    this.pick([0.085 * ROOM_FLOOR_SCALE, -0.08, 0], [8.33 * ROOM_FLOOR_SCALE, 0.14, 6.5 * ROOM_FLOOR_SCALE], { kind: 'surface', surface: 'floor' });
    this.pick([furniture.rug.x, 0.045, furniture.rug.z], [3.5, 0.02, 2.1], { kind: 'surface', surface: 'rug' }, turn('rug'));
    configureShadowObjects(this.static); configureShadowObjects(this.dynamic); this.lighting?.invalidate();
    this.setEditing(this.editing, this.selection);
  }
  /** What the owner bought for the bug: the toy and battle gear in use, and a feeder while it runs. */
  petThings(pet) {
    const group = new THREE.Group(), place = this.furniture.pet;
    group.position.set(place.x, 0.75, place.z); group.rotation.y = (place.r || 0) * Math.PI / 2; group.userData.dragId = 'pet';
    const toy = new THREE.Group(); toy.position.set(-0.55, 0, 0.36); group.add(toy);
    const ball = (parent, radius, color, x, y, z, detail = 1) => mesh(parent, new THREE.IcosahedronGeometry(radius, detail), material(color), x, y, z);
    switch (pet.toy) {
      case 'toy-twig': cylinder(toy, 0.03, 0.045, 0.6, '#6b4a30', 0, 0.26, 0, 6).rotation.z = 0.7; cylinder(toy, 0.02, 0.03, 0.3, '#6b4a30', 0.08, 0.38, 0, 6).rotation.z = -0.5; break;
      case 'toy-pebble': ball(toy, 0.1, '#c9d6e0', 0, 0.08, 0, 0).scale.y = 0.7; break;
      case 'toy-ball': ball(toy, 0.12, '#6b4a2c', 0, 0.12, 0); break;
      case 'toy-maze': box(toy, 0.5, 0.02, 0.4, '#5f7d4a', 0, 0.01); for (const [x, z, w, d] of [[-0.1, 0, 0.03, 0.3], [0.1, -0.05, 0.03, 0.3], [0, 0.14, 0.24, 0.03]]) box(toy, w, 0.1, d, '#86a35f', x, 0.06, z); break;
      case 'toy-mirror': box(toy, 0.26, 0.34, 0.03, '#c4a05d', 0, 0.2, 0).rotation.y = 0.5; box(toy, 0.2, 0.28, 0.035, '#d6ecee', 0, 0.2, 0).rotation.y = 0.5; break;
      case 'toy-wheel': mesh(toy, new THREE.TorusGeometry(0.2, 0.035, 6, 14), material('#c8553d'), 0, 0.26, 0).rotation.y = 0.5; box(toy, 0.3, 0.05, 0.14, '#6b4a30', 0, 0.025); break;
      case 'toy-castle': box(toy, 0.34, 0.22, 0.26, '#7d5a38', 0, 0.11); for (const x of [-0.17, 0.17]) { cylinder(toy, 0.07, 0.07, 0.34, '#6b4a30', x, 0.17, 0, 7); mesh(toy, new THREE.ConeGeometry(0.09, 0.14, 7), material('#a5433a'), x, 0.41, 0); } break;
      case 'toy-disco': ball(toy, 0.12, '#dfe6f0', 0, 0.6, 0, 0); cylinder(toy, 0.008, 0.008, 0.26, '#8a8780', 0, 0.8, 0, 4); break;
    }
    const kit = []; // the attack item and the defense item lie side by side
    for (const [id, x] of [[pet.gear, 0.05], [pet.defense, 0.5]]) {
      const gear = new THREE.Group(); gear.position.set(x, 0, -0.44); group.add(gear); kit.push(gear);
      switch (id) {
        case 'gear-shell': cylinder(gear, 0.09, 0.09, 0.07, '#d9c8a7', 0, 0.035); cylinder(gear, 0.095, 0.095, 0.02, '#a5433a', 0, 0.08); break;
        case 'gear-claws': box(gear, 0.28, 0.035, 0.07, '#8a8f94', 0, 0.02).rotation.y = 0.4; box(gear, 0.1, 0.045, 0.08, '#6b4a30', -0.13, 0.022, 0.055).rotation.y = 0.4; break;
        case 'gear-boots': for (let i = 0; i < 6; i++) box(gear, 0.05, 0.07, 0.08, '#5c4028', (i % 3 - 1) * 0.09, 0.035, i < 3 ? -0.05 : 0.05); break;
        case 'gear-helmet': ball(gear, 0.11, '#8a623c', 0, 0.05, 0).scale.y = 0.8; cylinder(gear, 0.015, 0.015, 0.06, '#5c4028', 0, 0.16, 0, 5); break;
        case 'gear-shield': ball(gear, 0.15, '#5f8a4a', 0, 0.16, 0).scale.set(0.8, 1, 0.2); break;
        case 'gear-mandibles': mesh(gear, new THREE.TorusGeometry(0.1, 0.022, 5, 10, Math.PI), material('#d9b23d'), 0, 0.03, 0).rotation.x = -Math.PI / 2; break;
        case 'gear-armor': for (let i = 0; i < 3; i++) box(gear, 0.24 - i * 0.04, 0.05, 0.16, '#70767c', 0, 0.025 + i * 0.05); break;
        case 'gear-bandage': box(gear, 0.2, 0.06, 0.08, '#eee6d6', 0, 0.03).rotation.y = 0.3; box(gear, 0.05, 0.065, 0.085, '#b8433e', 0, 0.03).rotation.y = 0.3; break;
      }
    }
    if (pet.feeder) { cylinder(group, 0.11, 0.14, 0.05, '#c9b28a', 0.34, 0.025, 0.42); cylinder(group, 0.07, 0.07, 0.3, '#d6ecee', 0.34, 0.2, 0.36, 8); cylinder(group, 0.08, 0.08, 0.04, '#a5433a', 0.34, 0.37, 0.36, 8); }
    if (toy.children.length || kit.some((gear) => gear.children.length) || pet.feeder) this.dynamic.add(group);
  }
  pet(pet) {
    this.petSprite = null;
    if (!pet) return;
    let map;
    if (pet.stage === 'creature' && BY_ID[pet.species]) map = bugTexture(THREE, BY_ID[pet.species], pet.style, pet.level);
    else if (pet.stage === 'egg' || pet.stage === 'dead') map = paintedTexture(128, 128, ctx => {
      if (pet.stage === 'egg') drawEgg(ctx, { w: 128, h: 128, still: true }); else drawGrave(ctx, { w: 128, h: 128 });
    }, true);
    if (!map) return;
    if (pet.stage === 'creature') this.petThings(pet);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
    const size = 0.85 * (pet.stage === 'creature' ? bugScale(pet.level) : 1);
    sprite.position.set(this.furniture.pet.x, 0.74 + size / 2, this.furniture.pet.z); sprite.scale.set(size, size, 1); this.dynamic.add(sprite);
    sprite.userData.dragId = 'pet';
    if (pet.stage !== 'creature') return;
    // A bug wanders its case. A neglected one stamps about under a small red cloud of opinion.
    const grumpy = ['peckish', 'bored', 'grubby', 'sulking'].includes(pet.mood);
    this.petSprite = { sprite, size, grumpy, home: sprite.position.clone() };
    if (grumpy) {
      const mark = this.petSprite.mark = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, map: paintedTexture(16, 16, ctx => {
        ctx.fillStyle = '#d8372f';
        for (const [x, y, w, h] of [[3, 2, 2, 5], [3, 5, 5, 2], [11, 2, 2, 5], [8, 5, 5, 2], [3, 9, 5, 2], [3, 9, 2, 5], [8, 9, 5, 2], [11, 9, 2, 5]]) ctx.fillRect(x, y, w, h);
      }, true) }));
      mark.scale.set(0.24, 0.24, 1); mark.userData.dragId = 'pet'; this.dynamic.add(mark);
    }
  }
  resident(owner, generation) {
    const group = new THREE.Group(); group.position.set(this.furniture?.rug.x ?? ROOM_FIXTURES.resident[0], ROOM_FIXTURES.resident[1], this.furniture?.rug.z ?? ROOM_FIXTURES.resident[2]); group.rotation.order = 'YXZ'; group.rotation.y = 0.35; this.dynamic.add(group);
    group.userData.dragId = 'rug';
    this.residentPick = mesh(group, new THREE.BoxGeometry(0.95, 2.15, 0.75), new THREE.MeshBasicMaterial({ visible: false }), 0, 1.07, 0);
    this.residentPick.userData.selection = { kind: 'resident' };
    this.residentGroup = group; this.residentHome = group.position.clone(); this.residentRoute = residentStep(this.furniture, this.shelves, this.wallDisplays);
    this.errands = residentErrands(this.furniture, this.shelves, this.wallDisplays); this.residentYaw = 0.35;
    this.tasks = residentTasks(this.furniture, this.shelves, this.wallDisplays, this.errands);
    // Anything on a display he can walk up to is something he can pick up and put back.
    const handy = this.errands.find(errand => errand.kind === 'inspect' && this.spotProps?.[errand.id]);
    if (handy) this.tasks.tidy = { ...handy, kind: 'tidy', pose: 'hold', hold: 3200, prop: this.spotProps[handy.id] };
    if (this.coffee && !(this.coffee.task = this.tasks[this.coffee.kind])) this.coffee = null;
    this.homestead?.setProps?.({ chairSide: this.tasks.eat?.side || 0 });
    this.onHouseTasks?.(Object.keys(this.tasks));
    const avatar = owner?.avatar, skinTone = avatar?.skinTone, seed = avatar?.seed || owner?.id || 'room-resident', look = looks(seed, skinTone);
    const shirt = avatar?.wear?.body?.c || avatar?.wear?.skin?.c || look.shirt;
    this.residentLegs = [-0.14, 0.14].map(x => {
      const leg = new THREE.Group(); leg.position.set(x, 0.73, 0); group.add(leg);
      box(leg, 0.2, 0.32, 0.24, '#3f4552', 0, -0.15);
      const shin = leg.userData.knee = new THREE.Group(); shin.position.y = -0.3; leg.add(shin);
      box(shin, 0.2, 0.3, 0.24, '#3f4552', 0, -0.14); box(shin, 0.23, 0.14, 0.38, '#30231e', 0, -0.33, 0.07);
      box(shin, 0.235, 0.035, 0.39, '#1c1c1d', 0, -0.39, 0.07); return leg;
    });
    const body = cylinder(group, 0.33, 0.28, 0.67, shirt, 0, 1.02); body.scale.z = 0.72;
    const skinParts = [];
    this.residentArms = [-1, 1].map(side => {
      const arm = new THREE.Group(); arm.position.set(side * 0.35, 1.27, 0); group.add(arm);
      cylinder(arm, 0.1, 0.085, 0.5, shirt, side * 0.03, -0.25);
      cylinder(arm, 0.089, 0.085, 0.05, shade(shirt, 0.75), side * 0.03, -0.49);
      skinParts.push(mesh(arm, new THREE.IcosahedronGeometry(0.1, 1), material(look.skin), side * 0.03, -0.58)); return arm;
    });
    this.residentNote = box(this.residentArms[1], 0.22, 0.012, 0.12, '#b3b48a', 0.03, -0.68, 0.04); this.residentNote.visible = false;
    const mug = this.residentMug = new THREE.Group(); mug.position.set(0.08, -0.61, 0.1); this.residentArms[1].add(mug); mug.visible = false;
    cylinder(mug, 0.12, 0.1, 0.2, '#f1dfaf', 0.1, 0.02, 0);
    cylinder(mug, 0.1, 0.1, 0.01, '#503323', 0.1, 0.119, 0);
    mesh(mug, new THREE.TorusGeometry(0.075, 0.022, 5, 12), material('#f1dfaf'), -0.035, 0.035, 0);
    box(group, 0.52, 0.075, 0.41, '#493526', 0, 0.75); box(group, 0.1, 0.075, 0.025, '#bda475', 0, 0.75, 0.22);
    for (const y of [0.9, 1.04, 1.18]) box(group, 0.025, 0.025, 0.02, '#d9c8a7', 0, y, 0.235);
    for (const side of [-1, 1]) { const collar = box(group, 0.13, 0.13, 0.03, shade(shirt, 1.2), side * 0.07, 1.3, 0.19); collar.rotation.z = side * 0.45; }
    skinParts.push(cylinder(group, 0.08, 0.1, 0.18, look.skin, 0, 1.4));
    const headGroup = this.residentHead = new THREE.Group(); group.add(headGroup);
    // A drawn head is round, in two halves: hair colour behind, and the face wrapped round the front rather than held up
    // before it like a mask. A saved photo head replaces it with a flat cutout once it loads.
    const wide = 0.86, tall = 1.1, half = from => new THREE.SphereGeometry(0.25, 24, 16, from, Math.PI);
    const head = mesh(headGroup, half(Math.PI), material(look.hair, { flatShading: false }), 0, 1.68); head.scale.set(wide, tall, 0.9);
    const face = mesh(headGroup, half(0), material(look.skin, { flatShading: false }), 0, 1.68); face.scale.copy(head.scale);
    const wear = pixels => {
      const wrap = faceWrap(pixels.data, pixels.width, pixels.height);
      if (!wrap) return;
      // Only the box the head fills becomes the texture; past its edge the hair and skin colours carry on.
      const crop = document.createElement('canvas'); crop.width = wrap.w; crop.height = wrap.h;
      crop.getContext('2d').putImageData(pixels, -wrap.x, -wrap.y, wrap.x, wrap.y, wrap.w, wrap.h);
      const map = canvasTexture(crop); map.magFilter = map.minFilter = THREE.LinearFilter;
      // The picture fills the head's height and may widen by a tenth to reach its sides, so the face is not a small
      // patch in the middle; on a head still wider than that, the hair and skin colours run round the sides.
      const shape = wrap.w / wrap.h, across = Math.min(0.5 * wide, 0.5 * tall * shape * 1.1), up = across / shape, at = face.geometry.attributes.position;
      for (let i = 0; i < at.count; i++) face.geometry.attributes.uv.setXY(i, 0.5 + at.getX(i) * wide / across, 0.5 + at.getY(i) * tall / up);
      face.geometry.attributes.uv.needsUpdate = true;
      face.material.map?.dispose(); face.material.map = map; face.material.color.set('#ffffff'); face.material.needsUpdate = true;
      const rgb = colour => `rgb(${colour.join(',')})`;
      head.material.color.set(rgb(wrap.hair));
      if (!skinTone) for (const part of skinParts) part.material.color.set(rgb(wrap.skin));
    };
    const drawn = document.createElement('canvas'); drawn.width = 272; drawn.height = 336;
    const pen = drawn.getContext('2d', { willReadFrequently: true });
    if (pen?.getImageData) {
      // The same face as the bust at the table: brows, eyes, a nose and a mouth over the low-poly head.
      const h = headParts(seed, skinTone), { L, cx, cy } = h;
      pen.scale(4, 4); pen.translate(4, 12);
      for (const piece of [...h.ears, ...h.skin, ...h.beard, ...h.hair]) { pen.fillStyle = pen.strokeStyle = piece.fill; pen.lineWidth = 0.4; const path = new Path2D(piece.d); pen.fill(path); pen.stroke(path); }
      pen.lineCap = 'round';
      if (L.brows) { pen.strokeStyle = tint(L.hair, -0.3); pen.lineWidth = 1.6; pen.beginPath(); for (const side of [-1, 1]) { pen.moveTo(cx + side * 11, cy - 5); pen.lineTo(cx + side * 4, cy - 6); } pen.stroke(); }
      pen.fillStyle = '#1b1512'; for (const side of [-1, 1]) { pen.beginPath(); pen.ellipse(cx + side * 7, cy, 2, 2.3, 0, 0, Math.PI * 2); pen.fill(); }
      pen.fillStyle = tint(L.skin, -0.18); pen.beginPath(); pen.moveTo(cx, cy + 1); pen.lineTo(cx - 2.5, cy + 8); pen.lineTo(cx + 2, cy + 8); pen.fill();
      pen.strokeStyle = tint(L.skin, -0.45); pen.lineWidth = 1.3; pen.beginPath(); pen.moveTo(cx - 5, cy + 13); pen.quadraticCurveTo(cx, cy + 15.5, cx + 5, cy + 13); pen.stroke();
      wear(pen.getImageData(0, 0, drawn.width, drawn.height));
    }
    if (avatar?.kind === 'photo' && owner?.id) {
      new THREE.ImageLoader().load(`/api/avatars/${encodeURIComponent(owner.id)}.png?v=${encodeURIComponent(avatar.v || 0)}`, image => {
        if (this.disposed || generation !== this.generation) return;
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        // A photo head is the table's cutout bent round the front of the head like a mask, so it turns with him instead of
        // staring at the camera while he walks sideways. Wrapped round the ball itself, a real selfie's lighting and edges
        // never survived. From behind, the inside of the mask is the same cutout in the hair's colour.
        const wrap = faceWrap(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (!wrap) return;
        const rgb = colour => `rgb(${colour.join(',')})`;
        if (!skinTone) for (const part of skinParts) part.material.color.set(rgb(wrap.skin));
        const behind = document.createElement('canvas'); behind.width = canvas.width; behind.height = canvas.height;
        const ink = behind.getContext('2d'); ink.drawImage(image, 0, 0); ink.globalCompositeOperation = 'source-in'; ink.fillStyle = rgb(wrap.hair); ink.fillRect(0, 0, behind.width, behind.height);
        // Sized and placed by the box the head fills, so a cutout with spare room round it is no smaller.
        const high = 0.68 * canvas.height / wrap.h, across = high * canvas.width / canvas.height;
        const radius = Math.max(0.27, across / 2.4), arc = across / radius, shift = (0.5 - (wrap.x + wrap.w / 2) / canvas.width) * across / radius;
        const mask = new THREE.CylinderGeometry(radius, radius, high, 24, 1, true, shift - arc / 2, arc);
        [canvas, behind].forEach((source, i) => {
          const map = canvasTexture(source); map.magFilter = map.minFilter = THREE.LinearFilter;
          const cutout = new THREE.Mesh(mask, new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: i ? THREE.BackSide : THREE.FrontSide }));
          cutout.position.set(0, 0.25 + ((wrap.y + wrap.h / 2) / canvas.height - 0.5) * high, 0);
          headGroup.add(cutout);
        });
        head.material.color.set(rgb(wrap.hair)); face.material.map = null; face.material.color.set(rgb(wrap.skin)); face.material.needsUpdate = true;
        this.render();
      });
    }
    const hat = avatar?.wear?.hat;
    if (hat) {
      const [brim, low, high, crown] = HAT_SHAPES[hat.shape] || [0.35, 0.22, 0.2, 0.2], color = hat.c || '#b89052';
      if (brim) cylinder(headGroup, brim, brim, 0.04, color, 0, 1.9, 0, 24);
      if (high === 'dome') mesh(headGroup, new THREE.SphereGeometry(low, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(color), 0, 1.9);
      else cylinder(headGroup, high, low, crown, color, 0, 1.9 + crown / 2, 0, 24);
      cylinder(headGroup, low + 0.004, low + 0.004, 0.04, hat.c2 || '#4a3528', 0, 1.94, 0, 24);
    }
    // Nod from the neck: a head pivoting at the feet swings a long way forward.
    headGroup.position.y = 1.45; for (const part of headGroup.children) part.position.y -= 1.45;
    // The body is stretched to its height; the head is not. Stretched with it, a face came out 40% too long.
    // Undo that for the head, hat included, and make it a little oversized, like the bust at the table.
    headGroup.scale.set(1.3, 1.3 / RESIDENT_HEIGHT_SCALE, 1.3);
  }
  wealth(worth) {
    const table = new THREE.Group(), group = new THREE.Group(); group.position.x = -0.15; table.add(group); this.dynamic.add(table);
    table.userData.dragId = 'wealth';
    table.position.set(this.furniture.wealth.x, 1.1, this.furniture.wealth.z); table.rotation.y = this.furniture.wealth.r * Math.PI / 2;
    const layout = wealthLayout(worth), felt = this.furniture.poker;
    let heap = group;
    if (!felt.off && !layout.neutral) {
      const top = new THREE.Group(); top.position.set(felt.x, 0.985, felt.z); top.rotation.y = felt.r * Math.PI / 2; top.userData.dragId = 'poker'; this.dynamic.add(top);
      heap = new THREE.Group(); heap.position.x = 0.2; top.add(heap);
    }
    if (layout.neutral) { box(group, 1.3, 0.22, 0.8, '#805636', 0.1, 0.12); box(group, 0.13, 0.12, 0.03, '#c5a25b', 0.1, 0.12, 0.42); return; }
    const chipGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.038, 16);
    for (let color = 0; color < CHIP_ART.length; color++) {
      const chips = layout.chips.filter(c => c.color === color); if (!chips.length) continue;
      const stack = new THREE.InstancedMesh(chipGeometry, chipMaterials(...CHIP_ART[color]), chips.length);
      const transform = new THREE.Matrix4(); chips.forEach((p, i) => { transform.makeRotationY(p.turn).setPosition(p.x, p.y, p.z); stack.setMatrixAt(i, transform); }); heap.add(stack);
    }
    if (!layout.chips.length) chipGeometry.dispose();
    const note = layout.bundles.length && billTextures();
    layout.bundles.forEach((bundle, i) => {
      // Box faces run +x, -x, top, bottom, +z, -z: a printed note on top, the cut edges of the stack round the sides.
      const tone = bundle.band ? '#ffffff' : shade('#ffffff', 0.9 + (i % 3) * 0.05);
      const face = material(tone, { map: note.face }), edge = material(tone, { map: note.edge });
      mesh(group, new THREE.BoxGeometry(0.38, bundle.h, 0.16), [edge, edge, face, face, edge, edge], bundle.x, bundle.y, bundle.z).rotation.y = bundle.turn;
      if (bundle.band) box(group, 0.07, bundle.h + 0.004, 0.165, '#c9a646', bundle.x, bundle.y, bundle.z);
    });
  }
  isVisible() { return !document.hidden && this.inViewport !== false; }
  talk(now = performance.now()) {
    if (this.activityPaused || this.editing || this.disposed || this.failed || document.hidden) return;
    if (this.lastFrame != null) { this.advanceActivity(now - this.lastFrame); this.lastFrame = now; }
    this.activity.talk();
    this.render();
  }
  houseAction(kind, now = performance.now()) {
    if (!this.residentGroup || this.editing || this.failed || this.disposed || document.hidden) return 'unavailable';
    if (this.lastFrame != null) { this.advanceActivity(now - this.lastFrame); this.lastFrame = now; }
    if (kind === 'flush') {
      if (this.flushAge != null) return 'busy';
      this.flushAge = 0;
    } else if (TASK_KINDS.includes(kind)) {
      // Coffee was the first thing he could be sent to do; the rest go the same way.
      if (this.coffee) return 'busy';
      const task = this.tasks?.[kind] || this.errands?.find(errand => errand.kind === kind);
      if (!task) return 'blocked';
      const { phase, errand } = residentPose(this.residentTime()), prior = errand % (this.errands?.length || 1);
      const start = this.residentHome, length = task.path.reduce((sum, point, i) => sum + Math.hypot(point[0] - (i ? task.path[i - 1][0] : start?.x ?? 0), point[1] - (i ? task.path[i - 1][1] : start?.z ?? 0)), 0);
      const walk = Math.max(COFFEE_WALK, length / WALK_SPEED * 1000), settle = task.settle || COFFEE_SIT;
      let elapsed = 0;
      if (this.motion.matches) elapsed = walk + settle;
      else if (phase > 7 && phase < 23) {
        // Reverse the current errand from its exact position, including standing up from the couch.
        const back = phase < 12 ? 30 - phase : Math.max(18, phase);
        elapsed = this.errands?.[prior] === task ? Math.min(1, (23 - back) / 4) * walk : (back - 23) * 1000;
      }
      this.coffee = { kind, task, elapsed, prior, returning: false, walk, settle, held: 0 };
    } else if (kind === 'inside' && this.coffee) {
      if (this.coffee.returning) return 'busy';
      this.coffee.returning = true;
      if (this.coffee.elapsed === 0 || this.motion.matches) this.finishCoffee();
    } else return 'unavailable';
    this.notifyHouseState(); this.lighting?.invalidate(); this.render();
    return 'ok';
  }
  residentTime() { return this.activityPaused || this.motion.matches ? 0 : (this.activity.time - (this.residentRestart || 0)) / 1000; }
  finishCoffee() {
    const prop = this.coffee?.task?.prop;
    if (prop?.userData.rest) prop.position.copy(prop.userData.rest);
    this.coffee = null; this.residentRestart = this.activity.time;
  }
  notifyHouseState() {
    const state = !this.coffee ? 'home' : this.coffee.returning ? 'returning' : this.coffee.elapsed >= this.coffee.walk ? 'there' : 'walking';
    if (this.houseState === state) return;
    this.houseState = state; this.onHouseState?.(state, this.coffee?.kind);
    // He has a word to say about wherever he has been sent.
    if (state === 'there' && !this.activityPaused) this.activity.say?.(TASK_LINES[this.coffee.kind]);
  }
  advanceActivity(ms) {
    const delta = Math.max(0, ms);
    if (!this.activityPaused) this.activity.advance(delta);
    if (this.coffee) {
      const step = this.motion.matches ? Infinity : delta;
      if (this.coffee.returning && this.coffee.elapsed < 0) {
        this.coffee.elapsed += step;
        if (this.coffee.elapsed >= 0) this.finishCoffee();
      } else if (this.coffee.returning) {
        this.coffee.elapsed -= step;
        if (this.coffee.elapsed <= 0) this.finishCoffee();
      } else {
        const { walk, settle, task } = this.coffee, over = this.coffee.elapsed + step - walk - settle;
        this.coffee.elapsed = Math.min(walk + settle, this.coffee.elapsed + step);
        // Something picked up is held for a moment, then put back without being asked.
        if (task.hold && over > 0 && (this.coffee.held += Math.min(over, delta)) >= task.hold) this.coffee.returning = true;
      }
    }
    if (this.flushAge != null) {
      this.flushAge += delta;
      if (this.flushAge >= SPRINKLER_END) this.flushAge = null;
    }
  }
  visibilityChanged(now = performance.now()) {
    if (this.disposed || this.failed) return;
    if (this.isVisible()) { this.render(); return; }
    // Reduced motion may leave a long interval between renders; retain time already spent viewing.
    if (this.lastFrame != null) this.advanceActivity(now - this.lastFrame);
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
    if (this.coffee) this.finishCoffee();
    this.flushAge = null; this.homestead?.setSprinkler(false); this.notifyHouseState();
    this.activity?.quiet();
    if (this.faun) this.faun.visible = false;
    this.lighting?.invalidate();
    this.speechKey = ''; this.onSpeech?.(null);
  }
  animateActivity(now) {
    const visible = this.isVisible() && !this.editing && !!this.residentGroup;
    if (visible && this.lastFrame != null) this.advanceActivity(now - this.lastFrame);
    const ambient = visible && !this.activityPaused;
    const coffeeMoving = this.coffee && (this.coffee.elapsed < this.coffee.walk + this.coffee.settle || this.coffee.returning || !!this.coffee.task.hold);
    const active = visible && !!(ambient || coffeeMoving || this.flushAge != null);
    this.lastFrame = active ? now : null; this.notifyHouseState();
    this.homestead?.setSprinkler(this.flushAge != null && this.flushAge >= PIPE_DELAY);
    const state = ambient ? this.activity.state() : { text: null, faun: false };
    const t = ambient && !this.motion.matches ? this.activity.time / 1000 : 0;
    if (this.residentGroup) {
      const home = this.residentHome, route = this.residentRoute || { x: 0, z: 0 };
      const errands = this.errands?.length ? this.errands : home && (route.x || route.z) ? [{ kind: 'stroll', path: [[home.x + route.x, home.z + route.z]], facing: 0.35 }] : [];
      let pose = residentPose(ambient ? this.residentTime() : 0), errand = errands[pose.errand % errands.length];
      // 'asked' is the pose he holds once he gets where he was sent; 'settled' is how far into it he is.
      let asked, settled = 0;
      if (this.coffee) {
        if (this.coffee.elapsed < 0) {
          pose = residentPose(23 + this.coffee.elapsed / 1000); errand = errands[this.coffee.prior];
        } else {
          // Past the walk, the remaining time is spent settling in, or getting back up before heading home.
          const { walk, settle, task } = this.coffee, fraction = Math.min(1, this.coffee.elapsed / walk);
          settled = Math.max(0, this.coffee.elapsed - walk) / settle;
          pose = residentPose(settled ? (this.coffee.returning ? 19 - settled : 11 + settled) : this.coffee.returning ? 23 - fraction * 4 : 7 + fraction * 4);
          errand = task; asked = task.pose;
        }
      }
      const walking = !!errand && pose.facing !== 0, coffee = errand?.kind === 'coffee' && pose.phase >= 7 && pose.phase < 23;
      // In the bath the tub fills first, then he gets in.
      const soaking = Math.min(1, Math.max(0, (settled - 0.7) / 0.3)), sit = asked === 'soak' ? soaking * soaking * (3 - 2 * soaking) : errand?.seat ? pose.act : 0;
      const lie = asked === 'lie' ? sit : 0, held = asked === 'hold' ? pose.act : 0, rock = asked === 'rock' ? Math.sin(t * 2.2) * 0.1 * sit : 0;
      const look = errand?.kind === 'inspect' || asked === 'read' || asked === 'corner' ? pose.act : 0, cash = errand?.kind === 'cash', grab = cash ? pose.act : 0;
      let aim = 0.35;
      if (home && errand) {
        const points = [[home.x, home.z], ...errand.path], lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
        const total = lengths.reduce((sum, length) => sum + length, 0);
        let along = pose.offset * total, leg = 0;
        // Sent somewhere, he takes a step for every stride of ground rather than a fixed few.
        if (this.coffee && pose.stride) pose.stride = Math.sin(along * 2.3) * 0.24;
        while (leg < lengths.length - 1 && along > lengths[leg]) along -= lengths[leg++];
        const from = points[leg], to = points[leg + 1], part = lengths[leg] ? along / lengths[leg] : 0;
        const x = from[0] + (to[0] - from[0]) * part, z = from[1] + (to[1] - from[1]) * part, heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
        const drop = errand.rise ?? 0.6 * ((this.couch?.scale.y || 1) - 1) - 0.4;
        const px = sit ? x + (errand.seat[0] - x) * sit : x, pz = sit ? z + (errand.seat[1] - z) * sit : z;
        if (!this.dragging) this.residentGroup.position.set(px, home.y + stepDown(px, pz) + drop * sit, pz);
        aim = pose.facing > 0 ? heading : pose.facing < 0 ? heading + Math.PI : pose.offset > 0.5 ? errand.facing : 0.35;
      } else if (home && !this.dragging) this.residentGroup.position.copy(home);
      // Turn toward where they are going rather than snapping round.
      const yaw = this.residentYaw ?? 0.35;
      this.residentYaw = this.motion.matches ? aim : t || this.coffee ? yaw + Math.atan2(Math.sin(aim - yaw), Math.cos(aim - yaw)) * 0.3 : 0.35;
      this.residentGroup.scale.y = RESIDENT_HEIGHT_SCALE * (1 + Math.sin(t * 1.5) * 0.008);
      this.residentGroup.rotation.set(look * 0.06 + grab * 0.12 - lie * Math.PI / 2 - rock, this.residentYaw + Math.sin(t * 0.35) * 0.06 * (1 - lie), Math.sin(t * 0.7) * 0.008);
      // Like an actor, he cheats his face a little toward the audience unless he has his back to it.
      const view = this.camera?.getWorldDirection(new THREE.Vector3());
      const toCamera = view ? Math.atan2(-view.x, -view.z) - this.residentGroup.rotation.y : 0, turn = Math.atan2(Math.sin(toCamera), Math.cos(toCamera));
      const cheat = Math.abs(turn) < 2 ? THREE.MathUtils.clamp(turn, -0.5, 0.5) : 0;
      this.residentHead.rotation.y = (pose.glance + cheat) * (1 - look);
      // He looks up at the signpost and down at everything else.
      this.residentHead.rotation.x = Math.sin(t * 0.6) * 0.025 + look * (asked === 'read' ? -0.3 : 0.32);
      // Seated knees bend; in the tub his legs lie along it, and on the couch he is laid out straight.
      const bend = 1.45 * sit * (1 - lie);
      this.residentLegs?.forEach((leg, i) => {
        leg.rotation.x = walking ? pose.stride * (i ? 1 : -1) : -bend;
        if (leg.userData.knee) leg.userData.knee.rotation.x = walking ? Math.max(0, pose.stride * (i ? -1 : 1)) * 1.6 : bend * (asked === 'soak' ? 0.12 : 1);
      });
      // His right arm stirs the pan or brings supper up from the plate; both arms carry whatever he has picked up.
      const busy = asked === 'cook' ? -0.95 + Math.sin(t * 7) * 0.3 : asked === 'eat' ? -0.45 - Math.max(0, Math.sin(t * 2.4)) * 0.95 : 0;
      // Hands behind the back to inspect, a reach for the cash table, and a wave with whatever was found there.
      // Sideways, an arm only ever swings away from the body (positive for the right arm, negative for the left):
      // the wave used to turn the right arm inward, straight through the torso.
      this.residentArms?.forEach((arm, i) => {
        arm.rotation.x = held ? -1.15 * held : busy && i ? busy * pose.act : coffee && i ? -0.65 - pose.act * 0.22
          : (walking ? pose.stride * (i ? -1 : 1) : 0) + Math.sin(t * 1.1) * 0.035 + look * 0.45 - sit * 0.3 - (i ? grab * 1.2 : 0);
        arm.rotation.z = i ? pose.wave * 1.1 : -0.02 - 0.02 * Math.sin(t * 0.8);
      });
      if (this.residentNote) this.residentNote.visible = cash && pose.phase > 13 && pose.phase < 30;
      if (this.residentMug) { this.residentMug.visible = coffee; this.residentMug.rotation.x = -this.residentArms[1].rotation.x; }
      // What he is using comes out with him: the rocker rocks, the tub fills, the skillet and his supper appear.
      const rocker = this.homestead?.pieces?.porchChair2;
      if (rocker) rocker.rotation.z = rock;
      this.homestead?.setProps?.({ bath: asked === 'soak' ? Math.min(1, settled / 0.7) : 0, cook: asked === 'cook' && settled > 0, eat: asked === 'eat' && sit > 0.5 });
      const prop = errand?.prop;
      if (prop) {
        const rest = prop.userData.rest ??= prop.position.clone(), me = this.residentGroup.position, reach = [Math.sin(this.residentYaw) * 0.7, Math.cos(this.residentYaw) * 0.7];
        prop.position.set(rest.x + (me.x + reach[0] - rest.x) * held, rest.y + (1.3 - rest.y) * held, rest.z + (me.z + reach[1] - rest.z) * held);
      }
      if (this.activityPaused && (coffeeMoving || this.houseState === 'there')) this.lighting?.invalidate();
    }
    if (this.petSprite && !this.dragging) {
      const { sprite, size, grumpy, home, mark } = this.petSprite, turn = (this.furniture.pet.r || 0) * Math.PI / 2, pace = grumpy ? 2.2 : 1;
      const along = t ? (Math.sin(t * 0.31 * pace) * 0.7 + Math.sin(t * 0.83 * pace) * 0.3) * 0.34 + (grumpy ? Math.sin(t * 38) * 0.012 : 0) : 0;
      const forward = Math.cos(t * 0.31 * pace) * 0.217 + Math.cos(t * 0.83 * pace) * 0.249 >= 0;
      const hop = t ? Math.abs(Math.sin(t * (grumpy ? 9 : 4))) * (grumpy ? 0.05 : 0.02) : 0;
      sprite.position.set(home.x + Math.cos(turn) * along, home.y + hop, home.z - Math.sin(turn) * along);
      sprite.scale.x = size * (forward ? 1 : -1);
      if (mark) { mark.position.set(sprite.position.x + 0.22, home.y + size / 2 + 0.02 + hop, sprite.position.z); mark.scale.setScalar(0.24 * (1 + (t ? Math.sin(t * 6) * 0.15 : 0))); }
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
      this.faun.position.set(from.x + (to.x - from.x) * pose.peek, this.faunRoute.location === 'room' ? 0.02 : ROOM_GRADE + 0.01, from.z + (to.z - from.z) * pose.peek);
      this.faun.rotation.set(0, facing + pose.turn, pose.lean);
      if (this.faunHead) this.faunHead.rotation.y = pose.glance;
      this.faunLegs?.forEach((leg, i) => { leg.rotation.x = pose.stride * (i ? 1 : -1); });
    }
    let speech = null;
    if (state.text) {
      const speaker = state.speaker === 'faun' ? this.faun : this.residentGroup;
      const anchor = new THREE.Vector3(speaker.position.x, speaker.position.y + (state.speaker === 'faun' ? 2.8 : 2.3 * RESIDENT_HEIGHT_SCALE), speaker.position.z).project(this.camera);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight, edge = Math.min(126, w / 2);
      const offscreen = Math.abs(anchor.x) >= 1 || Math.abs(anchor.y) >= 1 || Math.abs(anchor.z) >= 1;
      speech = { text: state.text, speaker: state.speaker, offscreen,
        x: offscreen ? w / 2 : Math.round(Math.max(edge, Math.min(w - edge, (anchor.x + 1) * w / 2))),
        y: offscreen ? h - 12 : Math.round(Math.max(115, Math.min(h - 15, (1 - anchor.y) * h / 2))) };
    }
    if (speech) this.onSpeechPosition?.(speech.x, speech.y);
    const key = speech ? `${speech.speaker}:${speech.text}:${speech.offscreen}` : '';
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
          if (this.lighting) animateRoomLighting(this.lighting, this.activity.time, active && !this.activityPaused && !this.motion.matches);
          this.renderer.render(this.scene, this.camera);
          if (active) {
            const pipeChange = this.flushAge == null ? Infinity : (this.flushAge < PIPE_DELAY ? PIPE_DELAY : SPRINKLER_END) - this.flushAge;
            this.activityTimer = setTimeout(() => this.render(), this.motion.matches ? Math.min(pipeChange, this.activity.untilChange()) : 1000 / 24);
          }
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
    this.canvas.removeEventListener('contextmenu', this.contextMenu); this.canvas.removeEventListener('lostpointercapture', this.cancel);
    this.canvas.removeEventListener('wheel', this.wheel); this.canvas.removeEventListener('webglcontextlost', this.lost); document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('blur', this.cancel); document.removeEventListener('keydown', this.keys);
    for (const map of Object.values(this.floorMaps || {})) if (map !== this.floor?.material.map) map.dispose();
    this.homestead?.dispose(); this.lighting?.dispose(); disposeObjects(this.scene); this.renderer.dispose();
  }
}
