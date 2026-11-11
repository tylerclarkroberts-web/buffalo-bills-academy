// Things other people left in the mine. Each builder returns a group whose origin is the foot of a wall, with +z
// pointing out into the tunnel. Decoration only: no collision, and the server never hears about any of it.
import * as THREE from 'three';

const lam = (color, emissive = '#000000', extra = {}) => new THREE.MeshLambertMaterial({ color, emissive, ...extra });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, n = 6, r2 = r) => new THREE.CylinderGeometry(r, r2, h, n);
function put(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const UP = new THREE.Vector3(0, 1, 0);
/** A straight piece (a bone, an axle) from point a to point b. */
function rod(g, mat, a, b, r = 0.02) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = new THREE.Mesh(cyl(r, A.distanceTo(B)), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize()); g.add(m); return m;
}
const px = (c, color, ...rects) => { c.fillStyle = color; for (const r of rects) c.fillRect(...r); };
/** Paint on rock: a picture hung flat on the wall, lit by the headlamp like everything else. */
function painted(canvasTex, w, h, tw, th, y, draw) {
  const g = new THREE.Group();
  put(g, new THREE.PlaneGeometry(w, h), lam('#ffffff', '#15120e', { map: canvasTex(tw, th, draw), alphaTest: 0.5 }), 0, y, 0.02);
  return g;
}
/** An old miner's cap: boiled leather, a wide round brim, three ribs over the crown and a brass carbide lamp, long out. Sits on y = 0, lamp toward +z. */
function hardHat() {
  const g = new THREE.Group(), shell = lam('#5a4329', '#120d07'), brass = lam('#b08a3a', '#231a08'), dark = lam('#1c1814', '#050403');
  put(g, new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 0.01, 0).scale.set(1, 0.8, 1.1);
  put(g, cyl(0.21, 0.014, 14), shell, 0, 0.007, 0).scale.z = 1.08;
  for (const tilt of [-0.55, 0, 0.55]) { // ribs run front to back
    const rib = new THREE.Group(); rib.rotation.z = tilt; g.add(rib);
    put(rib, new THREE.TorusGeometry(0.152, 0.012, 4, 8, Math.PI), dark, 0, 0.012, 0, 0, Math.PI / 2).scale.set(1.1, 0.8, 1);
  }
  put(g, box(0.05, 0.07, 0.03), dark, 0, 0.07, 0.16);
  put(g, cyl(0.03, 0.07, 8), brass, 0, 0.1, 0.19);
  put(g, cyl(0.02, 0.02, 6), brass, 0, 0.145, 0.19);
  put(g, new THREE.CylinderGeometry(0.06, 0.028, 0.025, 10), lam('#d8c070', '#2a2210'), 0, 0.105, 0.225, Math.PI / 2); // the reflector dish
  put(g, cyl(0.008, 0.02, 4), dark, 0, 0.105, 0.245, Math.PI / 2);
  return g;
}

const builders = {
  // A mine cart, nose-down on a stub of track with a wheel off and its last load across the floor.
  cart(canvasTex) {
    const g = new THREE.Group(), iron = lam('#2e2a25', '#090807');
    const rust = lam('#ffffff', '#120a06', { map: canvasTex(32, 16, (c) => {
      px(c, '#6b4128', [0, 0, 32, 16]);
      for (let i = 0; i < 60; i++) px(c, i % 3 ? '#52301e' : '#84563a', [(i * 37) % 32, (i * 23) % 16, 2, 1]);
      px(c, '#2e2018', [0, 0, 32, 1], [0, 15, 32, 1], [10, 0, 1, 16], [21, 0, 1, 16]);
      for (const x of [2, 8, 12, 19, 23, 29]) px(c, '#a07a58', [x, 3, 1, 1], [x, 12, 1, 1]);
    }) });
    // a stub of track, and the cart nose-down on it where the front axle gave out
    for (const z of [0.31, 0.79]) put(g, box(1.7, 0.03, 0.04), iron, 0, 0.02, z);
    for (const x of [-0.6, 0, 0.6]) put(g, box(0.12, 0.02, 0.66), lam('#3b2f1d', '#0a0805'), x, 0.01, 0.55);
    const tub = new THREE.Group(); tub.position.set(-0.05, 0.4, 0.55); tub.rotation.z = -0.3; g.add(tub);
    const shell = box(1.05, 0.5, 0.6), at = shell.attributes.position; // narrower at the bottom, like every mine cart
    for (let i = 0; i < at.count; i++) if (at.getY(i) < 0) at.setXYZ(i, at.getX(i) * 0.72, at.getY(i), at.getZ(i) * 0.8);
    put(tub, shell, rust, 0, 0, 0);
    put(tub, box(1.1, 0.05, 0.65), iron, 0, 0.24, 0);
    put(tub, box(0.95, 0.02, 0.5), lam('#0e0c0a'), 0, 0.262, 0);
    put(tub, cyl(0.025, 0.66), iron, -0.3, -0.36, 0, Math.PI / 2);
    const wheel = cyl(0.13, 0.05, 10), hub = cyl(0.05, 0.07, 6);
    for (const z of [0.3, -0.3]) { put(tub, wheel, iron, -0.3, -0.36, z, Math.PI / 2); put(tub, hub, rust, -0.3, -0.36, z, Math.PI / 2); }
    put(g, wheel, iron, 0.2, 0.04, 0.98); put(g, hub, rust, 0.2, 0.045, 0.98);
    const ore = new THREE.MeshBasicMaterial({ color: '#8dff5a' });
    for (const [x, z, s] of [[-0.25, 0.05, 0.08], [0, -0.08, 0.1], [0.22, 0.06, 0.09], [0.4, -0.04, 0.07]]) put(tub, new THREE.OctahedronGeometry(s, 0), ore, x, 0.27 + s * 0.4, z);
    for (const [x, z, s] of [[0.66, 0.6, 0.07], [0.8, 0.44, 0.05], [0.9, 0.7, 0.06], [1, 0.52, 0.04]]) put(g, new THREE.OctahedronGeometry(s, 0), ore, x, s, z);
    return g;
  },
  // Somebody sat down against the wall for a rest, one knee up, hat still on. Their bucket is next to them.
  bones() {
    const g = new THREE.Group(), bone = lam('#d8d2bc', '#2a2820'), hole = new THREE.MeshBasicMaterial({ color: '#000000' }), boot = lam('#5a4028', '#120c07');
    rod(g, bone, [0, 0.1, 0.22], [0.02, 0.62, 0.08], 0.024); // spine, slumped back onto the rock
    for (let i = 0; i < 5; i++) put(g, new THREE.TorusGeometry(0.135 - i * 0.008, 0.013, 4, 10, Math.PI), bone, 0.02 - i * 0.004, 0.57 - i * 0.062, 0.09 + i * 0.022, Math.PI / 2 + 0.25);
    rod(g, bone, [0.02, 0.57, 0.22], [0, 0.33, 0.27], 0.016);
    rod(g, bone, [-0.17, 0.6, 0.09], [0.19, 0.58, 0.09], 0.016);
    put(g, box(0.26, 0.07, 0.13), bone, 0, 0.1, 0.22);
    const skull = new THREE.Group(); skull.position.set(0.05, 0.72, 0.17); skull.rotation.set(0.3, 0, 0.25); g.add(skull); // head down
    put(skull, new THREE.SphereGeometry(0.105, 10, 8), bone, 0, 0, 0).scale.set(0.9, 1.05, 1.05);
    for (const s of [-1, 1]) put(skull, new THREE.SphereGeometry(0.03, 6, 5), hole, s * 0.042, 0.01, 0.092);
    put(skull, box(0.02, 0.03, 0.02), hole, 0, -0.03, 0.105);
    put(skull, box(0.1, 0.035, 0.07), bone, 0, -0.1, 0.05);
    const hat = hardHat(); hat.scale.setScalar(0.7); hat.position.set(0, 0.07, -0.035); hat.rotation.set(-0.4, 0, -0.2); skull.add(hat); // pushed back off the face
    const limbs = [ // shoulder or hip, then elbow or knee, then hand or foot
      [[-0.17, 0.6, 0.09], [-0.25, 0.33, 0.16], [-0.31, 0.03, 0.38]], [[0.19, 0.58, 0.09], [0.28, 0.32, 0.18], [0.36, 0.03, 0.42]],
      [[-0.09, 0.1, 0.25], [-0.15, 0.44, 0.56], [-0.17, 0.08, 0.8]], [[0.09, 0.1, 0.25], [0.2, 0.06, 0.66], [0.3, 0.08, 1]],
    ];
    limbs.forEach(([a, b, c], i) => {
      rod(g, bone, a, b, i < 2 ? 0.018 : 0.024); rod(g, bone, b, c, i < 2 ? 0.016 : 0.02);
      if (i < 2) put(g, box(0.06, 0.02, 0.08), bone, c[0], 0.015, c[2] + 0.03);
      else put(g, box(0.1, 0.11, 0.22), boot, c[0], 0.055, c[2] + 0.04, 0, i === 2 ? 0.1 : -0.35); // boots found in the tunnels are occupied
    });
    const rusty = lam('#4a3222', '#0e0805', { side: THREE.DoubleSide });
    put(g, new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10, 1, true), rusty, 0.56, 0.11, 0.36);
    put(g, cyl(0.1, 0.01, 10), rusty, 0.56, 0.01, 0.36);
    return g;
  },
  // Cave art: the crew, their buckets, the acid, and someone taller standing with them.
  art(canvasTex) {
    return painted(canvasTex, 1.6, 1.2, 64, 48, 1.25, (c) => {
      const ochre = '#b5532a', coal = '#241c18', pale = '#d4cfbb';
      const man = (x, y, color, tall = 0) => px(c, color, [x, y, 3, 3], [x + 1, y + 3, 1, 5 + tall], [x - 1, y + 4, 5, 1], [x, y + 8 + tall, 1, 3], [x + 2, y + 8 + tall, 1, 3]);
      for (const x of [6, 14, 22, 30]) { man(x, 25, ochre); px(c, ochre, [x + 4, 30, 2, 2]); }
      man(45, 13, pale, 9); px(c, pale, [44, 17, 1, 13], [48, 17, 1, 13]);
      px(c, '#5fbf2f', [4, 40, 34, 2], [8, 42, 26, 1]);
      px(c, ochre, [7, 4, 5, 7], [6, 5, 7, 5]); px(c, coal, [5, 3, 2, 2], [7, 5, 2, 2], [9, 7, 2, 2], [11, 9, 2, 2], [11, 3, 2, 2], [5, 9, 2, 2]);
      for (const [x, y] of [[55, 34], [58, 41]]) px(c, ochre, [x, y, 4, 4], [x, y - 2, 1, 2], [x + 1, y - 3, 1, 3], [x + 2, y - 3, 1, 3], [x + 3, y - 2, 1, 2], [x - 1, y + 1, 1, 2]);
    });
  },
  // A lawn chair. It is facing you.
  chair(canvasTex) {
    const g = new THREE.Group(), tube = lam('#9aa0a0', '#141616');
    const web = lam('#ffffff', '#141a12', { map: canvasTex(8, 8, (c) => { px(c, '#d8d8c6', [0, 0, 8, 8]); px(c, '#3f8a4a', [0, 0, 8, 2], [0, 4, 8, 2]); }) });
    put(g, box(0.52, 0.03, 0.46), web, 0, 0.4, 0.5);
    put(g, box(0.52, 0.6, 0.03), web, 0, 0.72, 0.26, -0.2);
    for (const s of [-1, 1]) {
      put(g, cyl(0.015, 0.4), tube, s * 0.25, 0.2, 0.3); put(g, cyl(0.015, 0.4), tube, s * 0.25, 0.2, 0.7);
      put(g, box(0.04, 0.03, 0.46), tube, s * 0.27, 0.58, 0.5); put(g, cyl(0.015, 0.18), tube, s * 0.27, 0.49, 0.7);
    }
    return g;
  },
  // An old miner's cap, dropped and left where it rolled.
  hat() {
    const g = new THREE.Group(), hat = hardHat();
    hat.position.set(0.1, 0.03, 0.55); hat.rotation.set(0, 0.7, 0.2); g.add(hat);
    return g;
  },
  // The canary's cage, on a crate, door open, nobody home.
  cage() {
    const g = new THREE.Group(), metal = lam('#8a8470', '#151410'), feather = lam('#e8d020', '#5a5000');
    put(g, box(0.45, 0.4, 0.45), lam('#4a3a24', '#0e0a06'), 0, 0.2, 0.4);
    put(g, cyl(0.15, 0.02, 10), metal, 0, 0.41, 0.4);
    for (let i = 0; i < 10; i++) { if (i === 2) continue; const a = (i / 10) * Math.PI * 2; put(g, cyl(0.01, 0.32, 3), metal, Math.cos(a) * 0.14, 0.57, 0.4 + Math.sin(a) * 0.14); }
    put(g, new THREE.ConeGeometry(0.15, 0.1, 10), metal, 0, 0.78, 0.4);
    put(g, new THREE.TorusGeometry(0.03, 0.008, 4, 8), metal, 0, 0.85, 0.4);
    put(g, cyl(0.008, 0.26, 3), metal, 0, 0.55, 0.4, 0, 0, Math.PI / 2);
    put(g, box(0.09, 0.14, 0.008), metal, 0.11, 0.52, 0.57, 0, 0.9);
    put(g, box(0.07, 0.006, 0.02), feather, -0.12, 0.405, 0.56, 0, 0.5); put(g, box(0.07, 0.006, 0.02), feather, 0.32, 0.01, 0.72, 0, -0.7);
    return g;
  },
  // The emergency exit. It is a painting of an emergency exit.
  exit(canvasTex) {
    return painted(canvasTex, 1, 2, 32, 64, 1, (c) => {
      px(c, '#cfcab8', [3, 14, 26, 2], [3, 14, 2, 50], [27, 14, 2, 50], [22, 40, 2, 2], [4, 60, 1, 4], [28, 58, 1, 6], [12, 16, 1, 3]);
      px(c, '#2f9e44', [5, 1, 22, 10]);
      c.fillStyle = '#e8ffe8'; c.font = 'bold 8px monospace'; c.fillText('EXIT', 6, 9);
    });
  },
  // The incident board. The number has never needed changing.
  sign(canvasTex) {
    return painted(canvasTex, 1.15, 0.72, 64, 40, 1.5, (c) => {
      px(c, '#3a3a30', [0, 0, 64, 40]); px(c, '#d6d2bd', [1, 1, 62, 38]); px(c, '#a82a20', [1, 1, 62, 8]);
      c.font = 'bold 7px monospace'; c.fillStyle = '#f2ede0'; c.fillText('SAFETY FIRST', 7, 7);
      c.fillStyle = '#26241e'; c.fillText('IT HAS BEEN', 20, 17); c.fillText('DAYS SINCE', 20, 26);
      px(c, '#26241e', [3, 11, 15, 18]); px(c, '#f2ede0', [4, 12, 13, 16]);
      c.fillStyle = '#a82a20'; c.font = 'bold 15px monospace'; c.fillText('0', 6, 25);
      px(c, '#26241e', [20, 29, 38, 6], [18, 31, 3, 3], [57, 28, 3, 3]);
      c.strokeStyle = '#3a3026'; c.lineWidth = 1; for (const x of [40, 45, 50]) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x + 10, 38); c.stroke(); }
    });
  },
};

export function buildFind(id, canvasTex) { return builders[id]?.(canvasTex) || null; }
