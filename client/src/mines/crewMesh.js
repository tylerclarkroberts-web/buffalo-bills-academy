// The Last Crew: the shift before yours, still on the clock. Thin, pale, coveralls gone black with acid, dented hard
// hats whose lamps died years ago, and a grin pulled far too wide. Low-poly like everything else down here.
// Faces never fog out, so far off they're a pale smile hanging in the dark. Front is +z.
import * as THREE from 'three';

let faceTex = null;
/** The face, painted once at low resolution and shared by every member (nearest-filtered, like the rest of the mine). */
function crewFace() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, 32, 40);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(120,110,90,${0.08 + Math.random() * 0.12})`; g.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 40), 1, 1); }
  // sunken, black-rimmed eyes with a pinprick of light: too round, too open, slightly different heights
  g.fillStyle = '#3a2a2a'; g.fillRect(5, 11, 9, 8); g.fillRect(18, 12, 9, 8);
  g.fillStyle = '#000'; g.fillRect(6, 12, 7, 6); g.fillRect(19, 13, 7, 6);
  g.fillStyle = '#fff'; g.fillRect(9, 14, 1, 1); g.fillRect(22, 15, 1, 1);
  // the grin: corner to corner and up toward the eyes, gums dark, a row of small square teeth
  g.fillStyle = '#1a0606';
  const mouth = [[2, 24], [3, 26], [5, 28], [8, 30], [12, 31], [20, 31], [24, 30], [27, 28], [29, 26], [30, 24]];
  g.beginPath(); g.moveTo(1, 22); for (const [x, y] of mouth) g.lineTo(x, y);
  g.lineTo(31, 22); g.lineTo(26, 25); g.lineTo(16, 26); g.lineTo(6, 25); g.closePath(); g.fill();
  g.fillStyle = '#e6dfc4';
  for (let x = 5; x < 27; x += 2) { g.fillRect(x, 25 + (x < 9 || x > 23 ? 0 : 1), 1, 2); g.fillRect(x, 28 + (x < 9 || x > 23 ? -1 : 0), 1, 2); }
  g.fillStyle = '#5a1a1a'; g.fillRect(1, 22, 1, 2); g.fillRect(30, 22, 1, 2); // the corners split a little
  faceTex = new THREE.CanvasTexture(c);
  faceTex.magFilter = THREE.NearestFilter; faceTex.minFilter = THREE.NearestFilter; faceTex.generateMipmaps = false;
  faceTex.colorSpace = THREE.SRGBColorSpace;
  return faceTex;
}

export function buildCrewMember() {
  const skin = new THREE.MeshBasicMaterial({ color: '#cfc8b4', transparent: true, fog: false });
  const face = new THREE.MeshBasicMaterial({ map: crewFace(), transparent: true, fog: false });
  const cloth = new THREE.MeshLambertMaterial({ color: '#141412', emissive: '#050505', transparent: true });
  const hat = new THREE.MeshLambertMaterial({ color: '#6b5a24', emissive: '#100c04', transparent: true });
  const mats = [skin, face, cloth, hat];
  const g = new THREE.Group();
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); parent.add(m); return m; };
  const leg = new THREE.CylinderGeometry(0.05, 0.045, 0.85, 5);
  add(g, leg, cloth, -0.09, 0.42, 0); add(g, leg, cloth, 0.09, 0.42, 0);
  add(g, new THREE.CylinderGeometry(0.2, 0.15, 0.8, 6), cloth, 0, 1.22, 0, 0.12);      // narrow, hunched torso
  const arm = new THREE.CylinderGeometry(0.04, 0.035, 0.95, 5);
  add(g, arm, cloth, -0.25, 1.1, 0.04, 0.1, 0, 0.08); add(g, arm, cloth, 0.25, 1.1, 0.04, 0.1, 0, -0.08); // arms hang to the knees
  const hand = new THREE.BoxGeometry(0.06, 0.16, 0.04);
  add(g, hand, skin, -0.29, 0.58, 0.08); add(g, hand, skin, 0.29, 0.58, 0.08);
  add(g, new THREE.CylinderGeometry(0.05, 0.06, 0.22, 5), skin, 0, 1.68, 0.02);           // a long neck
  const head = new THREE.Group(); head.position.set(0, 1.92, 0.04); head.scale.setScalar(1.3); g.add(head); // a head a little too big for the body
  add(head, new THREE.IcosahedronGeometry(0.17, 0), skin, 0, 0, 0, 0, 0, 0, 0.9, 1.15, 0.9); // faceted skull
  add(head, new THREE.PlaneGeometry(0.27, 0.34), face, 0, -0.01, 0.152);                    // the face
  add(head, new THREE.SphereGeometry(0.19, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0.1, -0.01, -0.12, 0, 0.1); // dented hard hat
  add(head, new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6), hat, 0, 0.16, 0.17, Math.PI / 2 - 0.2); // the dead lamp
  g.visible = false;
  return { group: g, head, mats };
}

/** Free a member's geometry and materials (the shared face texture stays). */
export function disposeCrewMember(m) {
  m.group.traverse((o) => { o.geometry?.dispose(); });
  for (const mat of m.mats) mat.dispose();
}
