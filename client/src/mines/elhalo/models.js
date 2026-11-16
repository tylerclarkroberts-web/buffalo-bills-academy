// EL HALO: low-poly characters, all original. Alebrijes (painted folk-art beasts, here loose from the mercado),
// tin luchador-bots (wind-up wrestling robots with painted masks), the big winged jaguar, the hero for the title
// screen (armoured suit, a sombrero-brim crest that reads as a halo, a striped serape cape) and the first-person guns.
// Each body is merged into one vertex-coloured mesh; only legs/arms that swing are separate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BRIGHT = [[0.98, 0.3, 0.6], [0.2, 0.8, 0.8], [1, 0.82, 0.15], [0.62, 0.36, 0.95], [1, 0.5, 0.12], [0.4, 0.88, 0.3], [0.25, 0.5, 1]];

function painted(g, c) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const B = (w, h, d, x, y, z, c) => painted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function limb(geoms, x, y, z, m) { // a pivoting limb: geometry hangs below its pivot
  const pivot = new THREE.Group(); pivot.position.set(x, y, z);
  pivot.add(new THREE.Mesh(mergeGeometries(geoms), m));
  return pivot;
}

export function makeAlebrije(R, { big = false } = {}) {
  const base = BRIGHT[Math.floor(R() * BRIGHT.length)];
  let acc = BRIGHT[Math.floor(R() * BRIGHT.length)]; if (acc === base) acc = [1, 1, 1];
  const dot = BRIGHT[Math.floor(R() * BRIGHT.length)];
  const g = [];
  g.push(B(0.62, 0.5, 1.1, 0, 0.85, 0, base));
  for (let i = 0; i < 4; i++) g.push(B(0.64, 0.08, 0.12, 0, 0.88, -0.38 + i * 0.25, acc)); // painted stripes
  for (let i = 0; i < 6; i++) g.push(B(0.1, 0.1, 0.1, (i % 2 ? 0.32 : -0.32), 0.8 + (i % 3) * 0.08, -0.35 + i * 0.13, dot));
  g.push(B(0.42, 0.4, 0.44, 0, 1.1, -0.68, base));            // head
  g.push(B(0.3, 0.2, 0.3, 0, 1.0, -0.98, acc));               // snout
  g.push(B(0.08, 0.08, 0.04, -0.12, 1.16, -0.91, [1, 1, 1])); g.push(B(0.08, 0.08, 0.04, 0.12, 1.16, -0.91, [1, 1, 1]));
  g.push(B(0.04, 0.05, 0.03, -0.12, 1.15, -0.935, [0.05, 0.05, 0.05])); g.push(B(0.04, 0.05, 0.03, 0.12, 1.15, -0.935, [0.05, 0.05, 0.05]));
  for (const s of [-1, 1]) {
    g.push(painted(new THREE.ConeGeometry(0.07, 0.38, 4).rotateZ(-s * 0.4).translate(s * 0.15, 1.45, -0.62), dot)); // horns
    g.push(B(0.12, 0.2, 0.05, s * 0.24, 1.32, -0.55, acc));  // ears
    if (big || R() < 0.4) g.push(painted(new THREE.BoxGeometry(0.8, 0.04, 0.5).translate(s * 0.62, 0, 0).rotateZ(s * 0.35).translate(0, 1.15, -0.05), acc)); // wings
  }
  for (let i = 0; i < 4; i++) g.push(B(0.12, 0.12, 0.2, 0, 0.95 + i * 0.13, 0.62 + i * 0.12, i % 2 ? base : acc)); // curly tail
  if (big) for (let i = 0; i < 10; i++) g.push(B(0.12, 0.06, 0.12, (R() - 0.5) * 0.5, 1.1, (R() - 0.5) * 0.9, [0.1, 0.06, 0.1])); // spots
  const m = mat();
  const root = new THREE.Group(); const body = new THREE.Mesh(mergeGeometries(g), m); root.add(body);
  const legs = [];
  for (const [x, z] of [[-0.22, -0.38], [0.22, -0.38], [-0.22, 0.38], [0.22, 0.38]]) {
    const l = limb([B(0.13, 0.62, 0.13, 0, -0.31, 0, base), B(0.16, 0.08, 0.2, 0, -0.62, -0.03, acc)], x, 0.66, z, m); root.add(l); legs.push(l);
  }
  if (big) root.scale.setScalar(1.75);
  return { root, legs, mats: [m], kind: big ? 'jaguar' : 'alebrije' };
}

export function makeLuchabot(R) {
  const tin = [0.72, 0.76, 0.8], dark = [0.25, 0.27, 0.32];
  const mask = BRIGHT[Math.floor(R() * BRIGHT.length)]; let trim = BRIGHT[Math.floor(R() * BRIGHT.length)]; if (trim === mask) trim = [1, 1, 1];
  const g = [];
  g.push(painted(new THREE.CylinderGeometry(0.34, 0.28, 0.8, 8).translate(0, 1.25, 0), tin));         // tin can torso
  g.push(painted(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 8).translate(0, 0.92, 0), [1, 0.78, 0.2])); // belt
  g.push(B(0.24, 0.16, 0.06, 0, 0.92, -0.35, [1, 0.9, 0.4]));                                           // belt buckle
  for (let i = 0; i < 3; i++) g.push(B(0.05, 0.05, 0.03, -0.1 + i * 0.1, 1.38, -0.33, [0.4, 0.4, 0.45])); // rivets
  g.push(B(0.18, 0.12, 0.18, 0, 1.7, 0, dark));                                                         // neck
  g.push(painted(new THREE.IcosahedronGeometry(0.27, 0).translate(0, 1.92, 0), mask));                 // masked head
  for (const s of [-1, 1]) {
    g.push(painted(new THREE.BoxGeometry(0.13, 0.08, 0.04).rotateZ(s * 0.35).translate(s * 0.1, 1.97, -0.24), [1, 1, 1])); // mask eye shapes
    g.push(B(0.05, 0.04, 0.03, s * 0.1, 1.97, -0.26, [1, 0.25, 0.1]));
    g.push(painted(new THREE.ConeGeometry(0.05, 0.22, 4).rotateZ(s * 1.1).translate(s * 0.25, 2.05, -0.02), trim)); // mask flames
  }
  g.push(B(0.05, 0.22, 0.42, 0, 2.17, 0, trim));                                                        // mask crest fin
  g.push(B(0.16, 0.04, 0.03, 0, 1.82, -0.25, dark));                                                    // mouth slot
  g.push(painted(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4).translate(0.12, 2.25, 0.08), dark)); g.push(B(0.06, 0.06, 0.06, 0.12, 2.42, 0.08, [1, 0.3, 0.2])); // antenna
  g.push(B(0.06, 0.06, 0.06, 0, 1.25, 0.34, [0.85, 0.7, 0.3]));                                        // wind-up key stem
  g.push(B(0.3, 0.16, 0.04, 0, 1.25, 0.4, [0.85, 0.7, 0.3]));
  // short cape, folded
  g.push(painted(new THREE.BoxGeometry(0.62, 0.7, 0.04).translate(0, -0.35, 0).rotateX(-0.12).translate(0, 1.62, 0.33), trim));
  const m = mat();
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), m));
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const l = limb([B(0.14, 0.42, 0.14, 0, -0.21, 0, tin), B(0.16, 0.38, 0.16, 0, -0.6, 0, dark), B(0.2, 0.08, 0.28, 0, -0.82, -0.05, mask)], s * 0.15, 0.86, 0, m); root.add(l); legs.push(l);
    const armG = [B(0.12, 0.5, 0.12, 0, -0.25, 0, tin), B(0.16, 0.16, 0.16, 0, -0.55, 0, trim)];
    if (s > 0) armG.push(painted(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6).rotateX(Math.PI / 2).translate(0, -0.55, -0.2), dark)); // bolt blaster
    const a = limb(armG, s * 0.42, 1.58, 0, m); root.add(a); arms.push(a);
  }
  return { root, legs, arms, mats: [m], kind: 'luchabot' };
}

// Serape stripes, top to bottom.
const SERAPE = [[0.85, 0.12, 0.2], [1, 0.55, 0.1], [1, 0.85, 0.2], [0.1, 0.6, 0.55], [0.3, 0.2, 0.6], [0.95, 0.35, 0.55], [1, 0.85, 0.2], [0.85, 0.12, 0.2]];

export function makeHero() {
  const armor = [0.78, 0.45, 0.28], armor2 = [0.55, 0.3, 0.2], under = [0.2, 0.18, 0.2], gold = [1, 0.78, 0.25], teal = [0.1, 0.65, 0.65];
  const g = [];
  g.push(B(0.62, 0.36, 0.36, 0, 1.2, 0, under));                // waist
  g.push(B(0.72, 0.55, 0.42, 0, 1.6, 0, armor));                // chest plate
  g.push(B(0.5, 0.18, 0.06, 0, 1.68, -0.23, teal));             // chest inlay
  g.push(B(0.2, 0.2, 0.05, 0, 1.68, -0.27, gold));
  for (const s of [-1, 1]) {
    g.push(B(0.3, 0.2, 0.45, s * 0.48, 1.86, 0, armor2));       // shoulder pads
    g.push(B(0.17, 0.55, 0.17, s * 0.48, 1.45, 0, under));      // arms
    g.push(B(0.2, 0.25, 0.2, s * 0.48, 1.15, 0, armor));        // gauntlets
    g.push(B(0.21, 0.06, 0.21, s * 0.48, 1.25, 0, SERAPE[s > 0 ? 3 : 1]));
    g.push(B(0.22, 0.5, 0.24, s * 0.16, 0.75, 0, under));       // thighs
    g.push(B(0.24, 0.42, 0.28, s * 0.16, 0.3, 0, armor));       // boots
    g.push(B(0.25, 0.08, 0.34, s * 0.16, 0.05, -0.03, armor2));
  }
  g.push(B(0.42, 0.4, 0.44, 0, 2.08, 0, armor));                // helmet
  g.push(B(0.36, 0.14, 0.05, 0, 2.08, -0.22, gold));            // amber visor
  g.push(B(0.06, 0.18, 0.4, 0, 2.32, 0, teal));                 // crown ridge
  // the crest: a wide sombrero brim tilted back over the helmet, with a zig-zag edge, which is the "halo"
  g.push(painted(new THREE.CylinderGeometry(0.58, 0.6, 0.04, 16).rotateX(0.32).translate(0, 2.38, 0.08), gold));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.push(painted(new THREE.ConeGeometry(0.035, 0.07, 3).translate(Math.cos(a) * 0.6, 2.38 - Math.sin(a) * 0.6 * Math.sin(0.32), 0.08 + Math.sin(a) * 0.6 * Math.cos(0.32)), i % 2 ? [0.85, 0.12, 0.2] : teal)); }
  g.push(painted(new THREE.CylinderGeometry(0.17, 0.21, 0.2, 10).rotateX(0.32).translate(0, 2.48, 0.05), gold));
  // serape cape: stripes hanging off the shoulders, with fringe
  for (let i = 0; i < SERAPE.length; i++) g.push(painted(new THREE.BoxGeometry(0.86, 0.13, 0.04).translate(0, -0.065 - i * 0.13, 0).rotateX(-0.12).translate(0, 1.95, 0.28), SERAPE[i]));
  for (let i = 0; i < 9; i++) g.push(B(0.025, 0.12, 0.025, -0.4 + i * 0.1, 0.84, 0.42, [0.95, 0.9, 0.8]));
  // rifle held across the chest
  g.push(B(0.12, 0.14, 0.9, 0.18, 1.32, -0.35, [0.82, 0.68, 0.48]));
  g.push(B(0.14, 0.04, 0.5, 0.18, 1.41, -0.35, teal));
  g.push(B(0.08, 0.22, 0.12, 0.18, 1.18, -0.38, [0.3, 0.28, 0.3]));
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), mat()));
  return root;
}

// First-person guns, built pointing down -Z, sitting lower right of the camera.
export function makeViewModels() {
  const sand = [0.82, 0.68, 0.48], dark = [0.22, 0.2, 0.22], teal = [0.1, 0.68, 0.66], gold = [1, 0.78, 0.25], glove = [0.55, 0.3, 0.2];
  const hand = (x, y, z) => [B(0.11, 0.1, 0.16, x, y, z, glove), B(0.12, 0.04, 0.12, x, y + 0.03, z + 0.14, SERAPE[1]), B(0.12, 0.04, 0.12, x, y + 0.03, z + 0.18, SERAPE[3])];
  const rifle = [
    B(0.11, 0.13, 0.62, 0, 0, 0, sand), B(0.12, 0.035, 0.42, 0, 0.078, -0.05, teal), B(0.035, 0.03, 0.36, 0.055, 0.02, -0.04, gold),
    painted(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 6).rotateX(Math.PI / 2).translate(0, 0.01, -0.46), dark),
    B(0.08, 0.2, 0.1, 0, -0.14, -0.08, dark), B(0.09, 0.12, 0.2, 0, -0.04, 0.36, sand), B(0.06, 0.06, 0.06, 0, 0.1, 0.12, dark),
    ...hand(0.02, -0.1, 0.16), ...hand(-0.03, -0.07, -0.25),
  ];
  const pistol = [
    B(0.07, 0.1, 0.32, 0, 0, -0.05, [0.78, 0.8, 0.84]), B(0.075, 0.025, 0.3, 0, 0.055, -0.05, gold),
    painted(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 7).rotateZ(Math.PI / 2).translate(0, -0.005, 0.04), [0.6, 0.62, 0.66]),
    B(0.06, 0.17, 0.08, 0, -0.11, 0.1, [0.95, 0.9, 0.78]), B(0.02, 0.1, 0.06, 0.035, -0.11, 0.1, teal),
    ...hand(0, -0.13, 0.13),
  ];
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mk = (gs) => { const o = new THREE.Group(); o.add(new THREE.Mesh(mergeGeometries(gs), m)); return o; };
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.95 }));
  flash.scale.set(1, 1, 2.2); flash.visible = false;
  return { rifle: mk(rifle), pistol: mk(pistol), flash, muzzle: { rifle: new THREE.Vector3(0, 0.01, -0.66), pistol: new THREE.Vector3(0, 0.02, -0.24) } };
}

export function makePinata(color) { // the grenade: a little star piñata with points
  const g = [painted(new THREE.OctahedronGeometry(0.12, 0), color)];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  dirs.forEach(([x, y, z], i) => { const c = new THREE.ConeGeometry(0.04, 0.14, 4); c.translate(0, 0.14, 0); c.rotateX(Math.PI / 2); c.lookAt(new THREE.Vector3(x, y, z)); g.push(painted(c, BRIGHT[i % BRIGHT.length])); });
  return new THREE.Mesh(mergeGeometries(g), mat());
}

export function makePickup(kind) {
  if (kind === 'ammo') return new THREE.Mesh(mergeGeometries([B(0.5, 0.3, 0.32, 0, 0.15, 0, [0.1, 0.55, 0.55]), B(0.52, 0.06, 0.34, 0, 0.27, 0, [1, 0.8, 0.2]), B(0.12, 0.04, 0.34, 0, 0.31, 0, [0.95, 0.95, 0.95])]), mat());
  if (kind === 'health') return new THREE.Mesh(mergeGeometries([ // an agua fresca jug
    painted(new THREE.CylinderGeometry(0.2, 0.24, 0.44, 8).translate(0, 0.22, 0), [0.95, 0.45, 0.6]),
    painted(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8).translate(0, 0.46, 0), [0.4, 0.85, 0.35]),
    B(0.06, 0.06, 0.08, 0, 0.3, -0.26, [0.9, 0.9, 0.9])]), mat());
  return makePinata([1, 0.4, 0.7]);
}
