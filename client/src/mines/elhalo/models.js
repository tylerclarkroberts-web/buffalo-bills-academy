// EL HALO: low-poly characters, all original. The horde (luchadores, mariachis, granjeros and padres, all cartoon
// party-crashers who go off like piñatas), the hero for the title screen and the other players (armoured suit, a
// sombrero-brim crest that reads as a halo, a striped serape cape) and the first-person guns.
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

// ---- the horde: cartoon party-crashers, built from boxes like everything else. Each gets swinging legs and arms.
const SKIN = [[0.95, 0.78, 0.62], [0.87, 0.66, 0.5], [0.76, 0.52, 0.36], [0.62, 0.42, 0.28]];
const pickR = (R, a) => a[Math.floor(R() * a.length)];

// A body: hips at 0.95, shoulders at 1.55, head at 1.75. `top` and `legs` colours, extra geometry merged in.
function person(R, { shirt, pants, boots = [0.25, 0.15, 0.1], skin = pickR(R, SKIN), bulk = 1, extra = [], armExtra = [[], []], sleeve = shirt, hand = skin, faceExtra = [] }) {
  const g = [];
  const w = 0.5 * bulk;
  g.push(B(w, 0.62, 0.3 * bulk, 0, 1.28, 0, shirt));                         // torso
  g.push(B(w * 0.95, 0.18, 0.28 * bulk, 0, 0.96, 0, pants));                 // hips
  g.push(B(0.36, 0.38, 0.36, 0, 1.8, 0, skin));                              // head
  g.push(B(0.06, 0.07, 0.03, -0.08, 1.84, -0.185, [1, 1, 1])); g.push(B(0.06, 0.07, 0.03, 0.08, 1.84, -0.185, [1, 1, 1]));
  g.push(B(0.03, 0.04, 0.02, -0.08, 1.835, -0.2, [0.05, 0.05, 0.05])); g.push(B(0.03, 0.04, 0.02, 0.08, 1.835, -0.2, [0.05, 0.05, 0.05]));
  g.push(B(0.07, 0.08, 0.06, 0, 1.76, -0.2, skin.map((v) => v * 0.9)));       // nose
  g.push(...faceExtra, ...extra);
  const m = mat();
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), m));
  const legs = [], arms = [];
  for (const sd of [-1, 1]) {
    const l = limb([B(0.17, 0.76, 0.18, 0, -0.38, 0, pants), B(0.19, 0.12, 0.28, 0, -0.82, -0.05, boots)], sd * 0.13, 0.88, 0, m); root.add(l); legs.push(l);
    const a = limb([B(0.13, 0.46, 0.14, 0, -0.22, 0, sleeve), B(0.12, 0.12, 0.12, 0, -0.5, 0, hand), ...armExtra[sd > 0 ? 1 : 0]], sd * (w / 2 + 0.08), 1.55, 0, m); root.add(a); arms.push(a);
  }
  return { root, legs, arms, mats: [m] };
}

export function makeLuchador(R) { // masked wrestler: bare chest, tights, a cape, a huge belt
  const mask = pickR(R, BRIGHT); let trim = pickR(R, BRIGHT); if (trim === mask) trim = [1, 1, 1];
  const tights = pickR(R, BRIGHT), skin = pickR(R, SKIN);
  const extra = [
    B(0.38, 0.4, 0.38, 0, 1.8, 0, mask),                                     // the mask over the head
    B(0.05, 0.3, 0.42, 0, 2.0, 0, trim),                                      // crest
    B(0.56, 0.14, 0.34, 0, 1.02, 0, [1, 0.8, 0.2]), B(0.22, 0.18, 0.06, 0, 1.02, -0.18, [1, 0.92, 0.45]), // championship belt
    painted(new THREE.BoxGeometry(0.6, 0.85, 0.04).translate(0, -0.42, 0).rotateX(-0.15).translate(0, 1.58, 0.2), trim), // cape
    B(0.1, 0.12, 0.42, 0, 1.31, 0, skin.map((v) => v * 0.92)),               // chest line
  ];
  const faceExtra = [];
  for (const s of [-1, 1]) {
    faceExtra.push(painted(new THREE.BoxGeometry(0.14, 0.09, 0.03).rotateZ(s * 0.35).translate(s * 0.08, 1.85, -0.2), trim));
    faceExtra.push(painted(new THREE.ConeGeometry(0.05, 0.2, 4).rotateZ(s * 1.2).translate(s * 0.22, 1.9, -0.02), trim));
  }
  const b = person(R, { shirt: skin, pants: tights, boots: [1, 1, 1], skin, bulk: 1.22, extra, faceExtra, sleeve: skin, hand: trim });
  return { ...b, kind: 'luchador' };
}

export function makeMariachi(R) { // charro suit, sombrero, a trumpet that fires notes
  const suit = R() < 0.5 ? [0.1, 0.1, 0.12] : [0.95, 0.93, 0.88], silver = [0.85, 0.86, 0.9], bow = pickR(R, [[0.9, 0.12, 0.2], [0.1, 0.6, 0.55], [1, 0.6, 0.1]]);
  const skin = pickR(R, SKIN), brim = suit[0] > 0.5 ? [0.92, 0.85, 0.6] : [0.12, 0.1, 0.12];
  const extra = [
    painted(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 14).translate(0, 2.0, 0), brim),                 // sombrero brim
    painted(new THREE.CylinderGeometry(0.17, 0.24, 0.36, 10).translate(0, 2.18, 0), brim),
    painted(new THREE.TorusGeometry(0.6, 0.03, 4, 16).rotateX(Math.PI / 2).translate(0, 2.02, 0), silver),
    B(0.2, 0.08, 0.05, 0, 1.56, -0.17, bow),                                                              // bow tie
    B(0.16, 0.04, 0.03, 0, 1.73, -0.2, [0.15, 0.08, 0.05]),                                               // mustache
  ];
  for (let i = 0; i < 4; i++) extra.push(B(0.04, 0.04, 0.03, 0.12, 1.45 - i * 0.12, -0.16, silver));
  const legStud = suit.map((v) => (v > 0.5 ? 0.75 : 0.3));
  const trumpet = [painted(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6).rotateX(Math.PI / 2).translate(0, -0.5, -0.24), [1, 0.8, 0.25]),
    painted(new THREE.ConeGeometry(0.1, 0.16, 8, 1, true).rotateX(-Math.PI / 2).translate(0, -0.5, -0.5), [1, 0.85, 0.3])];
  const b = person(R, { shirt: suit, pants: suit, boots: [0.12, 0.08, 0.06], skin, extra, armExtra: [[], trumpet] });
  b.root.children[0].geometry = mergeGeometries([b.root.children[0].geometry, B(0.02, 0.5, 0.02, -0.19, 0.6, 0, legStud), B(0.02, 0.5, 0.02, 0.19, 0.6, 0, legStud)]);
  return { ...b, kind: 'mariachi' };
}

export function makeGranjero(R) { // farmer: straw hat, checked shirt, overalls, a pitchfork, a grudge about his fence
  const shirt = pickR(R, [[0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.6, 0.15]]), denim = [0.25, 0.38, 0.62], straw = [0.95, 0.82, 0.45];
  const extra = [
    painted(new THREE.CylinderGeometry(0.5, 0.52, 0.05, 12).translate(0, 2.0, 0), straw),
    painted(new THREE.CylinderGeometry(0.2, 0.22, 0.24, 10).translate(0, 2.12, 0), straw),
    B(0.44, 0.04, 0.44, 0, 2.06, 0, [0.7, 0.2, 0.15]),
    B(0.42, 0.42, 0.33, 0, 1.18, 0, denim),                                   // overall bib
    B(0.06, 0.34, 0.33, -0.15, 1.5, 0, denim), B(0.06, 0.34, 0.33, 0.15, 1.5, 0, denim),
    B(0.18, 0.05, 0.03, 0, 1.72, -0.2, [0.25, 0.15, 0.08]),                  // mustache
  ];
  for (let i = 0; i < 3; i++) extra.push(B(0.52, 0.04, 0.32, 0, 1.3 + i * 0.13, 0, shirt.map((v) => v * 0.7)));
  const fork = [painted(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5).rotateX(Math.PI / 2).translate(0, -0.5, -0.35), [0.6, 0.42, 0.25])];
  for (const dx of [-0.08, 0, 0.08]) fork.push(B(0.02, 0.02, 0.24, dx, -0.5, -1.28, [0.75, 0.76, 0.8]));
  fork.push(B(0.2, 0.025, 0.025, 0, -0.5, -1.16, [0.75, 0.76, 0.8]));
  const b = person(R, { shirt, pants: denim, boots: [0.35, 0.22, 0.12], bulk: 1.15, extra, armExtra: [[], fork] });
  return { ...b, kind: 'granjero' };
}

export function makePadre(R) { // the padre: festive robe, censer on a chain, and (of course) a little golden halo
  const robe = pickR(R, [[0.5, 0.2, 0.6], [0.15, 0.15, 0.2], [0.75, 0.15, 0.25]]), gold = [1, 0.82, 0.25];
  const extra = [
    B(0.56, 0.95, 0.4, 0, 0.98, 0, robe),                                    // robe to the ankles
    B(0.12, 1.1, 0.03, -0.12, 1.1, -0.21, gold), B(0.12, 1.1, 0.03, 0.12, 1.1, -0.21, gold), // stole
    B(0.16, 0.06, 0.03, 0, 1.62, -0.17, [1, 1, 1]),                          // collar
    painted(new THREE.TorusGeometry(0.2, 0.025, 4, 14).rotateX(Math.PI / 2).translate(0, 2.18, 0), gold),
    B(0.38, 0.06, 0.38, 0, 2.0, 0, [0.35, 0.22, 0.15]),                      // hair ring
  ];
  const censer = [painted(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 3).translate(0, -0.75, -0.06), [0.7, 0.7, 0.7]),
    painted(new THREE.OctahedronGeometry(0.1, 0).translate(0, -1.0, -0.06), gold)];
  const b = person(R, { shirt: robe, pants: robe, boots: [0.15, 0.1, 0.08], extra, armExtra: [censer, []] });
  return { ...b, kind: 'padre' };
}

export const ENEMY_MAKERS = { luchador: makeLuchador, mariachi: makeMariachi, granjero: makeGranjero, padre: makePadre };

// ---- other players (and your lobby preview): the armoured hero in your colours, dressed in the look you picked
export const PLAYER_COLORS = [[0.1, 0.65, 0.65], [0.95, 0.35, 0.55], [1, 0.75, 0.15], [0.55, 0.4, 0.95], [0.4, 0.8, 0.3], [1, 0.5, 0.15], [0.3, 0.55, 1], [0.95, 0.95, 0.95]];
const PONCHO = [[[0.95, 0.35, 0.55], [1, 0.85, 0.2]], [[0.1, 0.68, 0.66], [0.95, 0.95, 0.9]], [[1, 0.65, 0.1], [0.85, 0.15, 0.2]], [[0.12, 0.1, 0.12], [0.9, 0.2, 0.3]], null, [[0.95, 0.9, 0.8], [0.3, 0.2, 0.6]]];
const HAT = [[0.93, 0.8, 0.5], [0.12, 0.1, 0.12], [0.96, 0.95, 0.9], [0.8, 0.15, 0.2], [0.2, 0.55, 0.3], [0.2, 0.35, 0.8]];
const NECK = [[0.85, 0.12, 0.2], [0.2, 0.4, 0.85], [0.12, 0.1, 0.12], [0.55, 0.25, 0.75], [0.25, 0.65, 0.3], [1, 0.55, 0.1]];
const BOOT = [[0.42, 0.25, 0.13], [0.1, 0.09, 0.1], [0.72, 0.62, 0.35]];
export const LOOK_SWATCH = { poncho: [[0.95, 0.35, 0.55], [0.1, 0.68, 0.66], [1, 0.65, 0.1], [0.12, 0.1, 0.12], [0.62, 0.36, 0.95], [0.95, 0.9, 0.8]], hatColor: HAT, cuelloColor: NECK, botas: BOOT };
// the outfit as merged geometry: poncho over the armour, a sombrero, a mustache on the visor, a bandana or serape
export function outfitGeoms(look, c) {
  const [poncho, hat, hatC, stache, neck, neckC] = look; const g = [];
  const hc = HAT[hatC] || HAT[0], trim = hatC === 1 ? [0.85, 0.85, 0.9] : [0.85, 0.15, 0.2];
  // poncho: a wide drape over the shoulders with bands and fringe
  const pc = PONCHO[poncho];
  const bandCols = pc ? [pc[0], pc[1], pc[0], pc[1], pc[0]] : SERAPE.slice(0, 5);
  for (let i = 0; i < 5; i++) {
    const y = 1.86 - i * 0.12, w = 0.96 + i * 0.02;
    if (poncho === 5) { for (let k = 0; k < 6; k++) g.push(B(w / 6, 0.12, 0.6, -w / 2 + w / 12 + k * w / 6, y, 0, (k + i) % 2 ? pc[0] : pc[1])); }
    else g.push(B(w, 0.12, 0.58, 0, y, 0, bandCols[i]));
  }
  for (let i = 0; i < 10; i++) g.push(B(0.03, 0.1, 0.03, -0.45 + i * 0.1, 1.27, -0.27, pc ? pc[1] : SERAPE[i % SERAPE.length]), B(0.03, 0.1, 0.03, -0.45 + i * 0.1, 1.27, 0.27, pc ? pc[1] : SERAPE[i % SERAPE.length]));
  g.push(B(0.2, 0.06, 0.6, 0, 1.94, 0, pc ? pc[1] : [1, 0.85, 0.2])); // neck hole edge
  // sombrero
  if (hat === 0) { // charro: wide brim with a rolled edge, tall crown, trim
    g.push(painted(new THREE.CylinderGeometry(0.62, 0.64, 0.05, 16).translate(0, 2.34, 0), hc));
    g.push(painted(new THREE.TorusGeometry(0.62, 0.04, 4, 18).rotateX(Math.PI / 2).translate(0, 2.38, 0), hc));
    g.push(painted(new THREE.CylinderGeometry(0.16, 0.22, 0.34, 10).translate(0, 2.53, 0), hc));
    g.push(painted(new THREE.TorusGeometry(0.21, 0.025, 4, 12).rotateX(Math.PI / 2).translate(0, 2.4, 0), trim));
  } else if (hat === 1) { // ranchero: medium brim, pinched crown
    g.push(painted(new THREE.CylinderGeometry(0.42, 0.44, 0.04, 14).translate(0, 2.33, 0), hc));
    g.push(B(0.36, 0.22, 0.34, 0, 2.45, 0, hc)); g.push(B(0.06, 0.06, 0.36, 0, 2.56, 0, hc.map((v) => v * 0.8)));
    g.push(B(0.38, 0.04, 0.36, 0, 2.38, 0, trim));
  } else if (hat === 2) { // sombrerón: enormous brim, cone crown, pompoms
    g.push(painted(new THREE.CylinderGeometry(0.86, 0.88, 0.05, 18).translate(0, 2.34, 0), hc));
    g.push(painted(new THREE.ConeGeometry(0.26, 0.5, 10).translate(0, 2.6, 0), hc));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.push(painted(new THREE.SphereGeometry(0.035, 4, 3).translate(Math.cos(a) * 0.86, 2.3, Math.sin(a) * 0.86), BRIGHT[i % BRIGHT.length])); }
  } else g.push(B(0.06, 0.18, 0.4, 0, 2.32, 0, c)); // no hat: the helmet ridge shows
  // mustache, on the front of the visor
  const mc = [0.18, 0.1, 0.05], z = -0.245;
  if (stache === 0) { g.push(B(0.22, 0.045, 0.03, 0, 1.97, z, mc)); for (const s of [-1, 1]) g.push(B(0.05, 0.12, 0.03, s * 0.13, 2.02, z, mc)); }
  else if (stache === 1) { g.push(B(0.22, 0.05, 0.03, 0, 1.97, z, mc)); for (const s of [-1, 1]) g.push(B(0.045, 0.2, 0.03, s * 0.11, 1.88, z, mc)); }
  else if (stache === 2) g.push(B(0.2, 0.018, 0.03, 0, 1.97, z, mc));
  // around the neck
  const nc = NECK[neckC] || NECK[0];
  if (neck === 1) { g.push(painted(new THREE.ConeGeometry(0.22, 0.26, 3).rotateX(Math.PI).rotateY(Math.PI / 6).scale(1, 1, 0.35).translate(0, 1.76, -0.3), nc)); g.push(B(0.46, 0.06, 0.46, 0, 1.93, 0, nc)); }
  else if (neck === 2) { for (let i = 0; i < 5; i++) g.push(painted(new THREE.BoxGeometry(0.16, 1.0, 0.04).rotateZ(0.7).translate(-0.05 + i * 0.03, 1.55 - i * 0.02, -0.31 - i * 0.002), i % 2 ? nc : SERAPE[(i + 2) % SERAPE.length])); }
  return g;
}
export function makePlayerModel(colorIdx, name, look = [0, 0, 0, 0, 1, 0, 0]) {
  const c = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const armor = [0.78, 0.45, 0.28].map((v, i) => v * 0.6 + c[i] * 0.4), armor2 = armor.map((v) => v * 0.75), under = [0.2, 0.18, 0.2], gold = [1, 0.78, 0.25];
  const boot = BOOT[look[6]] || BOOT[0];
  const g = [
    B(0.6, 0.34, 0.34, 0, 1.2, 0, under), B(0.72, 0.55, 0.42, 0, 1.6, 0, armor), B(0.5, 0.18, 0.06, 0, 1.68, -0.23, c),
    B(0.42, 0.4, 0.44, 0, 2.08, 0, armor), B(0.36, 0.14, 0.05, 0, 2.08, -0.22, gold),
    ...outfitGeoms(look, c),
  ];
  const m = mat();
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(new THREE.Mesh(mergeGeometries(g), m));
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const lg = [B(0.22, 0.48, 0.24, 0, -0.24, 0, under), B(0.24, 0.4, 0.28, 0, -0.64, 0, boot), B(0.25, 0.08, 0.34, 0, -0.93, -0.03, boot.map((v) => v * 0.7))];
    if (look[6] === 2) for (let k = 0; k < 3; k++) lg.push(B(0.25, 0.04, 0.29, 0, -0.5 - k * 0.12, 0, [0.35, 0.28, 0.12]));
    const l = limb(lg, s * 0.16, 0.98, 0, m); body.add(l); legs.push(l);
    const ag = [B(0.3, 0.2, 0.45, 0, 0.0, 0, armor2), B(0.17, 0.5, 0.17, 0, -0.3, 0, under), B(0.2, 0.22, 0.2, 0, -0.6, 0, armor)];
    if (s > 0) ag.push(B(0.12, 0.14, 0.8, 0, -0.62, -0.35, [0.82, 0.68, 0.48]), B(0.14, 0.04, 0.45, 0, -0.53, -0.35, c));
    const a = limb(ag, s * 0.48, 1.86, 0, m); body.add(a); arms.push(a);
  }
  let tag = null;
  if (name) { tag = makeNameTag(name, c); tag.position.set(0, 2.95, 0); root.add(tag); }
  return { root, body, legs, arms, mats: [m], tag };
}
export function makeNameTag(name, c = [1, 1, 1]) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const x = cv.getContext('2d');
  x.font = 'bold 30px VT323, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(250, x.measureText(name).width + 24);
  x.fillStyle = 'rgba(20,8,24,0.6)'; x.fillRect(128 - w / 2, 6, w, 36);
  x.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`; x.fillRect(128 - w / 2, 38, w, 4);
  x.fillStyle = '#fff'; x.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.3, 1); sp.renderOrder = 5;
  return sp;
}

// a musical note, the mariachis' ammunition
export function makeNote() {
  return new THREE.Mesh(mergeGeometries([painted(new THREE.SphereGeometry(0.12, 6, 4).scale(1.2, 0.9, 0.6), [1, 0.3, 0.75]),
    B(0.03, 0.34, 0.03, 0.12, 0.17, 0, [1, 0.3, 0.75]), B(0.14, 0.05, 0.03, 0.18, 0.32, 0, [1, 0.3, 0.75])]), new THREE.MeshBasicMaterial({ vertexColors: true }));
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

// First-person weapons, built pointing down -Z, sitting lower right of the camera. All original low-poly designs.
// Each one: { group, muzzle, home, scale }. Also used (smaller) for the gun riding on the supply truck.
export function makeViewModels() {
  const sand = [0.82, 0.68, 0.48], dark = [0.22, 0.2, 0.22], teal = [0.1, 0.68, 0.66], gold = [1, 0.78, 0.25], glove = [0.55, 0.3, 0.2];
  const steel = [0.62, 0.64, 0.7], violet = [0.5, 0.25, 0.85], lime = [0.55, 1, 0.35], pink = [1, 0.35, 0.75], olive = [0.4, 0.42, 0.25], red = [0.85, 0.15, 0.2], wood = [0.5, 0.3, 0.16];
  const cyl = (r0, r1, h, seg, x, y, z, c, rot = 'x') => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); if (rot === 'x') g.rotateX(Math.PI / 2); else if (rot === 'z') g.rotateZ(Math.PI / 2); return painted(g.translate(x, y, z), c); };
  const hand = (x, y, z) => [B(0.11, 0.1, 0.16, x, y, z, glove), B(0.12, 0.04, 0.12, x, y + 0.03, z + 0.14, SERAPE[1]), B(0.12, 0.04, 0.12, x, y + 0.03, z + 0.18, SERAPE[3])];
  const G = {
    rifle: [ // RIFLE DE ASALTO: the canyon's workhorse
      B(0.11, 0.13, 0.62, 0, 0, 0, sand), B(0.12, 0.035, 0.42, 0, 0.078, -0.05, teal), B(0.035, 0.03, 0.36, 0.055, 0.02, -0.04, gold),
      cyl(0.035, 0.03, 0.34, 6, 0, 0.01, -0.46, dark), B(0.08, 0.2, 0.1, 0, -0.14, -0.08, dark), B(0.09, 0.12, 0.2, 0, -0.04, 0.36, sand), B(0.06, 0.06, 0.06, 0, 0.1, 0.12, dark),
      ...hand(0.02, -0.1, 0.16), ...hand(-0.03, -0.07, -0.25)],
    pistol: [ // PISTOLA: a fat revolver-ish sidearm
      B(0.07, 0.1, 0.32, 0, 0, -0.05, [0.78, 0.8, 0.84]), B(0.075, 0.025, 0.3, 0, 0.055, -0.05, gold),
      cyl(0.06, 0.06, 0.1, 7, 0, -0.005, 0.04, [0.6, 0.62, 0.66], 'z'), B(0.06, 0.17, 0.08, 0, -0.11, 0.1, [0.95, 0.9, 0.78]), B(0.02, 0.1, 0.06, 0.035, -0.11, 0.1, teal), ...hand(0, -0.13, 0.13)],
    chispas: [ // PISTOLA DE CHISPAS: a curved violet shell with a glowing lime coil
      B(0.12, 0.12, 0.28, 0, 0, -0.04, violet), B(0.14, 0.05, 0.2, 0, 0.07, -0.06, [0.35, 0.15, 0.6]), cyl(0.05, 0.05, 0.16, 8, 0, 0, -0.2, lime),
      B(0.03, 0.03, 0.22, 0.07, 0.0, -0.05, lime), B(0.03, 0.03, 0.22, -0.07, 0.0, -0.05, lime), B(0.07, 0.15, 0.08, 0, -0.11, 0.06, [0.3, 0.12, 0.5]), ...hand(0, -0.13, 0.1)],
    agujas: [ // AGUJAS: a stubby launcher bristling with pink crystal needles
      B(0.13, 0.12, 0.34, 0, 0, 0, [0.35, 0.2, 0.45]), ...[-0.05, 0, 0.05].flatMap((x, i) => [painted(new THREE.ConeGeometry(0.018, 0.16, 4).translate(x, 0.12, -0.08 + i * 0.07), pink), painted(new THREE.ConeGeometry(0.018, 0.14, 4).translate(x * 1.2, 0.11, 0.06 - i * 0.05), pink)]),
      cyl(0.04, 0.03, 0.12, 6, 0, 0, -0.22, pink), B(0.07, 0.15, 0.08, 0, -0.12, 0.06, dark), ...hand(0, -0.14, 0.1), ...hand(-0.02, -0.06, -0.14)],
    rafaga: [ // RIFLE DE RÁFAGA: long, with a scope and a bone-white stock
      B(0.1, 0.12, 0.72, 0, 0, -0.02, [0.9, 0.88, 0.8]), B(0.11, 0.03, 0.6, 0, 0.075, -0.05, dark), cyl(0.04, 0.04, 0.22, 8, 0, 0.13, -0.02, dark), B(0.05, 0.04, 0.04, 0, 0.1, -0.02, dark),
      cyl(0.028, 0.028, 0.3, 6, 0, 0.01, -0.5, dark), B(0.07, 0.18, 0.09, 0, -0.13, 0.02, dark), B(0.08, 0.12, 0.2, 0, -0.03, 0.4, [0.9, 0.88, 0.8]), B(0.02, 0.02, 0.5, 0.055, 0.02, -0.05, red),
      ...hand(0.02, -0.1, 0.16), ...hand(-0.03, -0.07, -0.28)],
    escopeta: [ // ESCOPETA: pump gun, wood furniture, a fat barrel
      B(0.1, 0.12, 0.5, 0, 0, 0, dark), cyl(0.05, 0.05, 0.5, 8, 0, 0.02, -0.45, dark), cyl(0.045, 0.045, 0.25, 6, 0, -0.07, -0.35, wood),
      B(0.09, 0.14, 0.28, 0, -0.05, 0.36, wood), B(0.07, 0.15, 0.08, 0, -0.12, 0.08, wood), ...hand(0.02, -0.11, 0.14), ...hand(-0.02, -0.09, -0.35)],
    escopetita: [ // LA ESCOPETITA: a sawed-off brute, two short barrels and a brass knuckle guard
      cyl(0.045, 0.045, 0.26, 7, -0.035, 0, -0.18, steel), cyl(0.045, 0.045, 0.26, 7, 0.035, 0, -0.18, steel), B(0.14, 0.11, 0.18, 0, -0.01, 0.02, dark),
      B(0.12, 0.04, 0.2, 0, -0.08, 0.02, gold), B(0.07, 0.17, 0.08, 0, -0.13, 0.1, wood), ...hand(0, -0.14, 0.11)],
    francotirador: [ // FRANCOTIRADOR: very long, big scope, bipod
      B(0.09, 0.11, 0.8, 0, 0, 0, olive), cyl(0.03, 0.03, 0.5, 6, 0, 0.01, -0.62, dark), cyl(0.05, 0.05, 0.32, 8, 0, 0.13, -0.04, dark), cyl(0.06, 0.06, 0.04, 8, 0, 0.13, -0.21, teal),
      B(0.07, 0.16, 0.09, 0, -0.12, 0.05, dark), B(0.08, 0.14, 0.28, 0, -0.03, 0.46, olive), B(0.015, 0.2, 0.015, 0.04, -0.1, -0.5, dark), B(0.015, 0.2, 0.015, -0.04, -0.1, -0.5, dark),
      ...hand(0.02, -0.1, 0.18), ...hand(-0.03, -0.07, -0.3)],
    machete: [ // MACHETE DE ENERGÍA: a wooden grip and a long curved blade of hot turquoise light
      B(0.05, 0.05, 0.2, 0, -0.02, 0.08, wood), B(0.12, 0.04, 0.04, 0, -0.02, -0.03, gold),
      painted(new THREE.BoxGeometry(0.03, 0.09, 0.7).translate(0, 0.02, -0.4).rotateX(-0.12), [0.55, 1, 0.98]), painted(new THREE.BoxGeometry(0.02, 0.05, 0.62).translate(0, 0.07, -0.42).rotateX(-0.16), [0.2, 0.9, 1]), ...hand(0, -0.04, 0.1)],
    laser: [ // CAÑÓN LÁSER: a shoulder cannon with red cells down the side
      B(0.2, 0.2, 0.8, 0, 0.02, -0.05, [0.85, 0.85, 0.82]), B(0.22, 0.06, 0.6, 0, 0.14, -0.05, dark), cyl(0.09, 0.07, 0.14, 8, 0, 0.02, -0.5, dark),
      ...[0, 1, 2, 3].map((i) => B(0.03, 0.06, 0.08, 0.11, 0.02, 0.15 - i * 0.12, red)), B(0.08, 0.16, 0.1, 0, -0.14, 0.05, dark), ...hand(0.02, -0.14, 0.1), ...hand(-0.04, -0.1, -0.25)],
    cohetes: [ // LANZACOHETES: twin tubes in sun-faded green with a marigold stripe
      cyl(0.09, 0.09, 0.95, 8, -0.06, 0.03, -0.1, olive), cyl(0.09, 0.09, 0.95, 8, 0.12, 0.03, -0.1, olive), B(0.32, 0.04, 0.1, 0.03, 0.03, -0.5, [1, 0.65, 0.1]),
      B(0.06, 0.1, 0.1, 0.03, 0.17, -0.05, dark), B(0.08, 0.17, 0.09, 0.03, -0.14, 0.05, dark), ...hand(0.03, -0.15, 0.08), ...hand(0.0, -0.1, -0.25)],
    martillo: [ // MARTILLO DE GRAVEDAD: a long haft and a huge stone-and-iron head with a violet core
      cyl(0.03, 0.03, 0.9, 6, 0, -0.05, -0.1, wood), B(0.36, 0.22, 0.22, 0, -0.05, -0.6, steel), B(0.38, 0.06, 0.24, 0, 0.06, -0.6, dark), cyl(0.07, 0.07, 0.24, 8, 0, -0.05, -0.6, violet, 'z'),
      ...hand(0, -0.08, 0.18), ...hand(0, -0.06, -0.1)],
    torreta: [ // the jeep gun: twin handles and a fat barrel shroud
      B(0.24, 0.18, 0.5, 0, 0, 0, olive), cyl(0.06, 0.06, 0.55, 8, 0, 0.02, -0.5, dark), B(0.3, 0.04, 0.04, 0, -0.05, 0.25, dark), ...hand(-0.15, -0.06, 0.25), ...hand(0.15, -0.06, 0.25)],
  };
  const muzzle = { rifle: [0, 0.01, -0.66], pistol: [0, 0.02, -0.24], chispas: [0, 0, -0.3], agujas: [0, 0, -0.3], rafaga: [0, 0.01, -0.66], escopeta: [0, 0.02, -0.72], escopetita: [0, 0, -0.32],
    francotirador: [0, 0.01, -0.88], machete: [0, 0.02, -0.7], laser: [0, 0.02, -0.6], cohetes: [0.03, 0.03, -0.6], martillo: [0, 0, -0.7], torreta: [0, 0.02, -0.8] };
  const home = { rifle: [0.17, -0.17, -0.42, 0.6], pistol: [0.16, -0.15, -0.36, 0.75], chispas: [0.16, -0.15, -0.36, 0.75], agujas: [0.17, -0.16, -0.38, 0.7], rafaga: [0.16, -0.16, -0.4, 0.58],
    escopeta: [0.17, -0.17, -0.38, 0.6], escopetita: [0.17, -0.15, -0.34, 0.75], francotirador: [0.16, -0.16, -0.38, 0.55], machete: [0.2, -0.2, -0.34, 0.7], laser: [0.2, -0.2, -0.4, 0.55],
    cohetes: [0.18, -0.2, -0.36, 0.6], martillo: [0.22, -0.25, -0.3, 0.6], torreta: [0, -0.22, -0.5, 0.7] };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const out = { flash: null, muzzle: {}, home: {}, guns: {} };
  for (const [id, gs] of Object.entries(G)) {
    const o = new THREE.Group(); o.add(new THREE.Mesh(mergeGeometries(gs), m)); o.visible = false;
    out.guns[id] = o; out.muzzle[id] = new THREE.Vector3(...muzzle[id]); out.home[id] = new THREE.Vector3(home[id][0], home[id][1], home[id][2]); o.scale.setScalar(home[id][3]);
  }
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.95 }));
  flash.scale.set(1, 1, 2.2); flash.visible = false; out.flash = flash;
  // back-compat names
  out.rifle = out.guns.rifle; out.pistol = out.guns.pistol;
  return out;
}
// one gun as a world object (on the truck): its first-person model, scaled up and spinning
let displayKit = null; // built once; displays share its geometry (never dispose a display's geometry)
export function makeWeaponDisplay(id) {
  if (!displayKit) displayKit = makeViewModels();
  const src = displayKit.guns[id] || displayKit.guns.rifle, g = src.clone(true); g.visible = true; g.scale.setScalar(2.2); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
  const o = new THREE.Group(); o.add(g); o.userData.shared = true; return o;
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
  if (kind === 'sticky') return makeSticky();
  return makePinata([1, 0.4, 0.7]);
}

// ---- the night things. Original designs; each has eyes that glow (unlit) so they read in the dark.
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
function eyes(root, color, pts, size = 0.05) {
  const m = glowMat(color), geo = new THREE.SphereGeometry(size, 6, 4), group = new THREE.Group();
  for (const p of pts) { const e = new THREE.Mesh(geo, m); e.position.set(...p); group.add(e); }
  root.add(group); return group;
}
// four-legged body helper: legs[0..1] swing one way, arms[0..1] (the other two legs) the other
function quad(R, { body, len, hgt, leg, col, col2, extra = [] }) {
  const m = mat(); const root = new THREE.Group();
  root.add(new THREE.Mesh(mergeGeometries([...body, ...extra]), m));
  const legs = [], arms = [];
  for (const [i, sx, sz] of [[0, -1, -1], [1, 1, 1], [2, 1, -1], [3, -1, 1]]) {
    const l = limb([B(0.09, leg, 0.1, 0, -leg / 2, 0, col), B(0.12, 0.06, 0.16, 0, -leg, -0.04, col2)], sx * 0.16, hgt, sz * len * 0.38, m);
    root.add(l); (i < 2 ? legs : arms).push(l);
  }
  return { root, legs, arms, mats: [m] };
}
export function makeChupacabra(R) { // gaunt grey-green hunched thing, spines down its back, a long snout full of teeth
  const skin = [0.42, 0.48, 0.4], dark = [0.2, 0.22, 0.2], spine = [0.45, 0.08, 0.1], bone = [0.92, 0.9, 0.82];
  const body = [B(0.32, 0.36, 1.0, 0, 0.82, 0, skin), B(0.26, 0.3, 0.3, 0, 0.92, -0.5, skin), B(0.2, 0.2, 0.42, 0, 0.98, -0.78, skin), B(0.16, 0.08, 0.3, 0, 0.88, -0.86, dark)];
  for (let i = 0; i < 4; i++) body.push(B(0.34, 0.03, 0.05, 0, 0.75, -0.3 + i * 0.16, dark)); // ribs
  for (let i = 0; i < 9; i++) body.push(painted(new THREE.ConeGeometry(0.035, 0.22 + (i % 3) * 0.08, 4).translate(0, 1.08 + (i % 3) * 0.03, -0.6 + i * 0.15), spine));
  for (let i = 0; i < 6; i++) body.push(B(0.015, 0.06, 0.015, (i % 2 ? 1 : -1) * 0.07, 0.83, -0.95 - Math.floor(i / 2) * 0.04, bone)); // teeth
  body.push(B(0.05, 0.05, 0.5, 0, 0.75, 0.68, skin)); // tail
  const q = quad(R, { body, len: 1.0, hgt: 0.68, leg: 0.68, col: skin, col2: dark });
  q.eyes = eyes(q.root, 0xff2a1a, [[-0.07, 1.03, -0.9], [0.07, 1.03, -0.9]], 0.035);
  q.kind = 'quad'; return q;
}
export function makeLlorona() { // a weeping woman in a white gown, long black hair over her face, floating
  const white = [0.95, 0.95, 0.97], hair = [0.05, 0.04, 0.05], skin = [0.82, 0.84, 0.86];
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.86, emissive: 0x334455 });
  const g = [painted(new THREE.ConeGeometry(0.62, 1.6, 9, 1, true).translate(0, 0.85, 0), white), B(0.42, 0.5, 0.3, 0, 1.55, 0, white),
    B(0.32, 0.36, 0.32, 0, 1.9, 0, skin), B(0.38, 0.6, 0.1, 0, 1.72, -0.17, hair), B(0.4, 0.75, 0.36, 0, 1.75, 0.04, hair), B(0.5, 0.06, 0.4, 0, 2.08, 0, hair),
    painted(new THREE.ConeGeometry(0.5, 1.3, 7, 1, true).translate(0, 1.55, 0.05), [0.9, 0.9, 0.95])];
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), m));
  const arms = [];
  for (const s of [-1, 1]) { const a = limb([B(0.1, 0.62, 0.1, 0, -0.3, 0, white), B(0.07, 0.18, 0.05, 0, -0.68, 0, skin)], s * 0.26, 1.75, 0, m); root.add(a); arms.push(a); }
  const legs = [new THREE.Group(), new THREE.Group()];
  const ey = eyes(root, 0x9fd8ff, [[-0.06, 1.92, -0.23], [0.06, 1.92, -0.23]], 0.025);
  return { root, legs, arms, mats: [m], eyes: ey, kind: 'float' };
}
export function makeCucuy() { // the thing under the bed: huge, hunched, shaggy dark fur, a wide grin, yellow eyes
  const fur = [0.13, 0.1, 0.1], fur2 = [0.2, 0.15, 0.13], teeth = [0.95, 0.92, 0.8];
  const g = [B(1.0, 1.0, 0.7, 0, 1.6, 0.05, fur), B(0.8, 0.5, 0.6, 0, 0.95, 0, fur2), B(0.62, 0.55, 0.6, 0, 2.35, -0.12, fur), B(0.46, 0.12, 0.05, 0, 2.2, -0.43, [0.3, 0.02, 0.04])];
  for (let i = 0; i < 8; i++) g.push(B(0.04, 0.08, 0.03, -0.18 + i * 0.05, 2.22, -0.45, teeth));
  for (let i = 0; i < 14; i++) g.push(painted(new THREE.ConeGeometry(0.08, 0.3, 4).rotateX(-0.6 - (i % 3) * 0.2).translate(-0.45 + (i % 7) * 0.15, 2.0 + Math.floor(i / 7) * 0.2, 0.35), fur2));
  const b = person(() => 0.5, { shirt: fur, pants: fur2, boots: fur, skin: fur, bulk: 1.6, extra: g, sleeve: fur, hand: fur2 });
  b.root.children[0].geometry = mergeGeometries([B(0.01, 0.01, 0.01, 0, 0, 0, fur), ...g]); // no human face under it all
  for (const a of b.arms) { a.scale.set(1.3, 2.0, 1.3); a.position.y = 2.1; }
  for (const l of b.legs) l.scale.set(1.5, 1.1, 1.5);
  b.eyes = eyes(b.root, 0xffd21a, [[-0.14, 2.42, -0.43], [0.14, 2.42, -0.43]], 0.055);
  return { ...b, kind: 'cucuy' };
}
export function makeNahual(R) { // shapeshifter: a cloaked man in a coyote-skull mask / a lean grey coyote. Both built, one shown.
  const cloak = [0.18, 0.13, 0.12], bone = [0.9, 0.86, 0.75], grey = [0.45, 0.42, 0.38], dark = [0.2, 0.18, 0.16];
  const man = person(R, { shirt: cloak, pants: cloak, boots: dark, skin: bone, extra: [B(0.62, 1.2, 0.42, 0, 1.1, 0.02, cloak), painted(new THREE.ConeGeometry(0.1, 0.32, 4).rotateX(-Math.PI / 2).translate(0, 1.8, -0.32), bone),
    painted(new THREE.ConeGeometry(0.06, 0.2, 3).translate(-0.12, 2.06, 0), bone), painted(new THREE.ConeGeometry(0.06, 0.2, 3).translate(0.12, 2.06, 0), bone)] });
  const wbody = [B(0.3, 0.32, 0.95, 0, 0.78, 0, grey), B(0.26, 0.26, 0.3, 0, 0.92, -0.55, grey), B(0.14, 0.13, 0.3, 0, 0.88, -0.78, grey),
    painted(new THREE.ConeGeometry(0.05, 0.16, 3).translate(-0.08, 1.12, -0.55), grey), painted(new THREE.ConeGeometry(0.05, 0.16, 3).translate(0.08, 1.12, -0.55), grey),
    B(0.08, 0.08, 0.55, 0, 0.82, 0.68, dark), B(0.34, 0.06, 0.6, 0, 0.97, -0.05, dark)];
  const wolf = quad(R, { body: wbody, len: 0.95, hgt: 0.64, leg: 0.64, col: grey, col2: dark });
  const root = new THREE.Group(); root.add(man.root, wolf.root); wolf.root.visible = false;
  const me = eyes(man.root, 0xff8a1a, [[-0.07, 1.84, -0.2], [0.07, 1.84, -0.2]], 0.03), we = eyes(wolf.root, 0xff8a1a, [[-0.07, 0.96, -0.72], [0.07, 0.96, -0.72]], 0.03);
  return { root, man, wolf, legs: man.legs, arms: man.arms, mats: [...man.mats, ...wolf.mats], eyes: me, eyes2: we, kind: 'nahual' };
}
export function makeLechuza() { // an owl the size of a person with a pale woman's face, wide wings, hooked talons
  const brown = [0.42, 0.3, 0.2], cream = [0.9, 0.84, 0.72], face = [0.88, 0.86, 0.84], dark = [0.15, 0.1, 0.08];
  const g = [painted(new THREE.SphereGeometry(0.4, 7, 5).scale(1, 1.25, 0.9).translate(0, 0.5, 0), brown), painted(new THREE.SphereGeometry(0.3, 6, 4).scale(1, 1.1, 0.5).translate(0, 0.45, -0.28), cream),
    painted(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0.86, -0.33), face), B(0.42, 0.3, 0.12, 0, 1.02, -0.18, dark),
    B(0.05, 0.08, 0.05, 0, 0.8, -0.38, [0.7, 0.5, 0.3]), B(0.04, 0.2, 0.04, -0.12, 0.05, 0, dark), B(0.04, 0.2, 0.04, 0.12, 0.05, 0, dark)];
  const m = mat(); const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), m));
  const arms = [];
  for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.3, 0.7, 0); const wing = new THREE.Mesh(mergeGeometries([B(1.1, 0.06, 0.5, s * 0.55, 0, 0.05, brown), B(0.9, 0.05, 0.3, s * 0.5, -0.04, 0.3, cream)]), m); w.add(wing); root.add(w); arms.push(w); }
  const ey = eyes(root, 0xffffff, [[-0.08, 0.9, -0.37], [0.08, 0.9, -0.37]], 0.03);
  return { root, legs: [new THREE.Group(), new THREE.Group()], arms, mats: [m], eyes: ey, kind: 'fly' };
}
// ---- v3: the luchador volador and el gordo
export function makeVolador(R) { // a white eagle mask with a gold beak and feathered brows, a long red cape notched like wing tips
  const gold = [1, 0.8, 0.2], white = [0.97, 0.96, 0.94], red = [0.85, 0.1, 0.18], tights = pickR(R, [[0.1, 0.25, 0.75], [0.12, 0.12, 0.14], [0.85, 0.1, 0.18]]), skin = pickR(R, SKIN);
  const extra = [
    B(0.39, 0.41, 0.39, 0, 1.8, 0, white),                                   // the mask
    painted(new THREE.ConeGeometry(0.07, 0.2, 4).rotateX(-Math.PI / 2).translate(0, 1.76, -0.28), gold), // beak
    B(0.56, 0.14, 0.34, 0, 1.02, 0, gold), B(0.22, 0.18, 0.06, 0, 1.02, -0.18, [1, 0.92, 0.45]),
    B(0.1, 0.12, 0.42, 0, 1.31, 0, skin.map((v) => v * 0.92)),
  ];
  for (let i = 0; i < 4; i++) extra.push(painted(new THREE.BoxGeometry(0.2, 0.95 - i * 0.1, 0.04).translate(0, -0.45, 0).rotateZ((i - 1.5) * 0.18).rotateX(-0.2).translate((i - 1.5) * 0.14, 1.6, 0.22), i % 2 ? red : [0.65, 0.05, 0.12])); // cape feathers
  const faceExtra = [];
  for (const s of [-1, 1]) {
    faceExtra.push(painted(new THREE.BoxGeometry(0.16, 0.06, 0.03).rotateZ(s * 0.5).translate(s * 0.09, 1.88, -0.2), gold));         // feathered brows
    faceExtra.push(painted(new THREE.BoxGeometry(0.03, 0.26, 0.2).rotateZ(s * 0.6).translate(s * 0.24, 1.98, 0.02), white));           // little wing crests
    faceExtra.push(painted(new THREE.BoxGeometry(0.03, 0.18, 0.16).rotateZ(s * 0.6).translate(s * 0.26, 1.98, 0.02), gold));
  }
  const b = person(R, { shirt: skin, pants: tights, boots: [1, 0.8, 0.2], skin, bulk: 1.2, extra, faceExtra, sleeve: skin, hand: white });
  return { ...b, kind: 'volador' };
}
export function makeGordo(R) { // the heavyweight: a huge round belly, a tight mask, a championship belt, little legs
  const mask = pickR(R, [[0.1, 0.1, 0.12], [0.6, 0.1, 0.6], [0.95, 0.45, 0.1]]), trim = [1, 0.85, 0.25], skin = pickR(R, SKIN), tights = [0.15, 0.15, 0.2];
  const m = mat(), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const g = [
    painted(new THREE.SphereGeometry(0.78, 10, 8).scale(1.05, 0.95, 0.95).translate(0, 1.05, -0.05), skin),           // the belly
    painted(new THREE.SphereGeometry(0.6, 9, 7).scale(1.15, 0.8, 0.9).translate(0, 1.62, 0.05), skin),               // chest and shoulders
    painted(new THREE.SphereGeometry(0.06, 5, 4).translate(0, 1.05, -0.8), skin.map((v) => v * 0.8)),               // belly button
    painted(new THREE.CylinderGeometry(0.8, 0.82, 0.24, 12).translate(0, 0.62, 0), tights),                          // trunks
    painted(new THREE.CylinderGeometry(0.84, 0.84, 0.18, 12).translate(0, 0.8, 0), trim),                            // the belt
    B(0.46, 0.3, 0.08, 0, 0.8, -0.84, [1, 0.95, 0.55]), B(0.26, 0.18, 0.04, 0, 0.8, -0.89, [0.85, 0.15, 0.2]),       // buckle
    B(0.44, 0.44, 0.42, 0, 2.02, -0.02, mask),                                                                         // a tight mask
    B(0.44, 0.06, 0.43, 0, 2.15, -0.02, trim), B(0.06, 0.4, 0.44, 0, 2.05, -0.02, trim),
    B(0.08, 0.06, 0.03, -0.1, 2.06, -0.24, [1, 1, 1]), B(0.08, 0.06, 0.03, 0.1, 2.06, -0.24, [1, 1, 1]),
    B(0.04, 0.04, 0.02, -0.1, 2.06, -0.255, [0.05, 0.05, 0.05]), B(0.04, 0.04, 0.02, 0.1, 2.06, -0.255, [0.05, 0.05, 0.05]),
    B(0.14, 0.06, 0.03, 0, 1.92, -0.24, [0.6, 0.15, 0.15]),                                                           // mouth hole
  ];
  body.add(new THREE.Mesh(mergeGeometries(g), m));
  const legs = [], arms = [];
  for (const sd of [-1, 1]) {
    const l = limb([B(0.3, 0.5, 0.32, 0, -0.25, 0, tights), B(0.32, 0.14, 0.42, 0, -0.52, -0.06, [1, 1, 1])], sd * 0.34, 0.55, 0, m); root.add(l); legs.push(l);
    const a = limb([painted(new THREE.CylinderGeometry(0.17, 0.14, 0.7, 7).translate(0, -0.32, 0), skin), B(0.2, 0.2, 0.2, 0, -0.72, 0, trim)], sd * 0.88, 1.75, 0, m); body.add(a); arms.push(a);
  }
  // a health bar over its head (unlit, always faces the camera)
  const bar = new THREE.Group(); bar.position.y = 2.75;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.16), new THREE.MeshBasicMaterial({ color: 0x220810, transparent: true, opacity: 0.75, depthTest: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.1).translate(0.62, 0, 0), new THREE.MeshBasicMaterial({ color: 0xff3d5a, transparent: true, depthTest: false })); fg.position.x = -0.62; // (transparent too, so it draws after the backing)
  bg.renderOrder = 6; fg.renderOrder = 7; bar.add(bg, fg); root.add(bar);
  return { root, body, legs, arms, mats: [m], kind: 'gordo', bar, barFg: fg };
}
ENEMY_MAKERS.volador = makeVolador; ENEMY_MAKERS.gordo = makeGordo;

// ---- the town's harmless locals: street dogs and the elote man
const DOG_COATS = [[[0.72, 0.52, 0.3], [0.95, 0.88, 0.75]], [[0.2, 0.17, 0.15], [0.75, 0.6, 0.42]], [[0.9, 0.82, 0.62], [0.98, 0.95, 0.9]], [[0.55, 0.35, 0.2], [0.3, 0.2, 0.12]], [[0.6, 0.58, 0.55], [0.9, 0.9, 0.88]], [[0.82, 0.6, 0.3], [0.45, 0.3, 0.18]]];
export function makeDog(i = 0) { // a skinny low-poly mutt: faces -Z, legs swing, tail wags, the head dips to sniff
  const [coat, patch] = DOG_COATS[i % DOG_COATS.length], m = mat(), root = new THREE.Group();
  const body = [B(0.24, 0.24, 0.62, 0, 0.5, 0, coat), B(0.2, 0.06, 0.3, 0, 0.62, -0.05, patch), B(0.2, 0.2, 0.22, 0, 0.6, -0.32, coat)];
  root.add(new THREE.Mesh(mergeGeometries(body), m));
  const head = new THREE.Group(); head.position.set(0, 0.66, -0.4);
  head.add(new THREE.Mesh(mergeGeometries([B(0.2, 0.18, 0.2, 0, 0.04, -0.06, coat), B(0.12, 0.1, 0.16, 0, 0.0, -0.22, patch), B(0.05, 0.04, 0.03, 0, 0.03, -0.31, [0.08, 0.06, 0.06]),
    painted(new THREE.ConeGeometry(0.05, 0.12, 3).translate(-0.07, 0.17, -0.03), coat), painted(new THREE.ConeGeometry(0.05, 0.12, 3).translate(0.07, 0.17, -0.03), coat),
    B(0.03, 0.03, 0.02, -0.05, 0.08, -0.165, [0.05, 0.05, 0.05]), B(0.03, 0.03, 0.02, 0.05, 0.08, -0.165, [0.05, 0.05, 0.05])]), m));
  root.add(head);
  const tail = new THREE.Group(); tail.position.set(0, 0.58, 0.3); tail.add(new THREE.Mesh(painted(new THREE.BoxGeometry(0.04, 0.04, 0.26).translate(0, 0.04, 0.12).rotateX(-0.6), coat), m)); root.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) { const l = limb([B(0.06, 0.4, 0.07, 0, -0.2, 0, coat), B(0.07, 0.04, 0.09, 0, -0.4, -0.02, patch)], sx * 0.08, 0.42, sz * 0.24, m); root.add(l); legs.push(l); }
  return { root, legs, head, tail, phase: i * 1.7 };
}
export function makeEloteCart() { // a little steel cart with a striped umbrella, a pot of steaming corn, chili, lime and mayo; the vendor beside it
  const m = mat(), root = new THREE.Group();
  const steel = [0.78, 0.8, 0.82], dark = [0.2, 0.2, 0.22], corn = [1, 0.85, 0.25], husk = [0.62, 0.78, 0.35];
  const g = [B(1.3, 0.7, 0.7, 0, 0.75, 0, steel), B(1.36, 0.06, 0.76, 0, 1.12, 0, [0.6, 0.62, 0.65]), B(1.3, 0.25, 0.04, 0, 0.6, -0.36, [0.95, 0.3, 0.5]),
    painted(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 5).translate(0.55, 1.6, 0.25), [0.85, 0.85, 0.85]),
    painted(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10).rotateZ(Math.PI / 2).translate(-0.6, 0.22, 0.32), dark), painted(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10).rotateZ(Math.PI / 2).translate(0.6, 0.22, 0.32), dark),
    B(0.06, 0.06, 0.7, -0.75, 0.95, 0.55, [0.85, 0.85, 0.85]),                                            // handle
    painted(new THREE.CylinderGeometry(0.26, 0.24, 0.32, 10).translate(-0.3, 1.3, 0), steel),           // the pot
    B(0.12, 0.18, 0.12, 0.25, 1.24, -0.12, [0.85, 0.12, 0.1]), B(0.12, 0.14, 0.12, 0.42, 1.22, -0.12, [0.96, 0.95, 0.9]), // chili, mayo
    painted(new THREE.SphereGeometry(0.06, 5, 4).translate(0.3, 1.2, 0.15), [0.45, 0.8, 0.25]), painted(new THREE.SphereGeometry(0.06, 5, 4).translate(0.42, 1.2, 0.18), [0.45, 0.8, 0.25])];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.push(painted(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 6).rotateZ(0.3 * Math.cos(a)).rotateX(0.3 * Math.sin(a)).translate(-0.3 + Math.cos(a) * 0.1, 1.55, Math.sin(a) * 0.1), corn)); }
  for (let i = 0; i < 4; i++) g.push(painted(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 6).rotateZ(Math.PI / 2).translate(0.05, 1.19, 0.12 - i * 0.09), i % 2 ? corn : husk)); // a few on the grill
  root.add(new THREE.Mesh(mergeGeometries(g), m));
  const umb = new THREE.Group(); umb.position.set(0.55, 2.65, 0.25);
  for (let i = 0; i < 8; i++) { const c = new THREE.ConeGeometry(1.15, 0.45, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4); umb.add(new THREE.Mesh(painted(c, i % 2 ? [1, 1, 1] : [0.95, 0.2, 0.25]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }))); }
  root.add(umb);
  // the vendor: white apron, straw hat, a big mustache. Arms move (fanning the grill, holding up an elote).
  const v = person(() => 0.3, { shirt: [0.92, 0.3, 0.3], pants: [0.25, 0.3, 0.45], boots: [0.25, 0.18, 0.12], skin: SKIN[2],
    extra: [B(0.46, 0.6, 0.04, 0, 1.05, -0.17, [0.98, 0.98, 0.98]), painted(new THREE.CylinderGeometry(0.42, 0.44, 0.05, 12).translate(0, 2.0, 0), [0.95, 0.82, 0.45]),
      painted(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 10).translate(0, 2.1, 0), [0.95, 0.82, 0.45]), B(0.22, 0.06, 0.04, 0, 1.72, -0.2, [0.12, 0.08, 0.06])],
    armExtra: [[painted(new THREE.CylinderGeometry(0.04, 0.045, 0.28, 6).translate(0, -0.62, -0.05), corn)], [B(0.22, 0.02, 0.16, 0, -0.6, -0.08, [0.6, 0.45, 0.25])]] });
  v.root.position.set(-0.2, 0, 0.75); v.root.rotation.y = Math.PI; root.add(v.root);
  return { root, vendor: v, umb };
}
// a little speech bubble (sprite) for shouts: the elote man's calls, the volador's ¡ÁGUILA!
export function makeBubble(text, { color = '#2a1420', bg = '#fff8f0', w = 2.4 } = {}) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const x = cv.getContext('2d');
  x.fillStyle = bg; x.strokeStyle = color; x.lineWidth = 8;
  x.beginPath(); x.roundRect ? x.roundRect(8, 8, 496, 112, 40) : x.rect(8, 8, 496, 112); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(230, 116); x.lineTo(256, 152); x.lineTo(282, 116); x.closePath(); x.fill(); x.beginPath(); x.moveTo(230, 120); x.lineTo(256, 152); x.lineTo(282, 120); x.stroke();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; let fs = 64; x.font = `bold ${fs}px VT323, "Arial Black", sans-serif`;
  while (x.measureText(text).width > 460 && fs > 30) { fs -= 4; x.font = `bold ${fs}px VT323, "Arial Black", sans-serif`; }
  x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(w, w * 160 / 512, 1); sp.renderOrder = 8;
  return sp;
}
// where a leap will land: a pulsing ring on the ground
export function makeLandRing(color = 0xff3040) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  g.add(ring, fill); g.userData = { ring, fill }; return g;
}
ENEMY_MAKERS.chupacabra = makeChupacabra; ENEMY_MAKERS.llorona = makeLlorona; ENEMY_MAKERS.cucuy = makeCucuy; ENEMY_MAKERS.nahual = makeNahual; ENEMY_MAKERS.lechuza = makeLechuza;

// ---- the supply truck: a white pickup cab with a maroon bed, a black roof rack, a mattress up top, a washer
// leaning off the dropped tailgate, chairs and boxes, all tied down with yellow rope. Faces -Z.
export function makeTruck() {
  const white = [0.94, 0.94, 0.92], maroon = [0.62, 0.1, 0.16], black = [0.08, 0.08, 0.09], glass = [0.18, 0.24, 0.3], chrome = [0.75, 0.76, 0.8], tire = [0.1, 0.1, 0.1], rope = [1, 0.85, 0.15];
  const g = [
    B(1.9, 0.55, 1.4, 0, 0.95, -2.0, white), B(1.92, 0.25, 0.1, 0, 0.75, -2.72, chrome), B(1.4, 0.2, 0.06, 0, 1.0, -2.71, black), // hood, bumper, grille
    B(0.22, 0.14, 0.06, -0.72, 1.05, -2.72, [1, 1, 0.8]), B(0.22, 0.14, 0.06, 0.72, 1.05, -2.72, [1, 1, 0.8]),
    B(1.9, 1.35, 1.25, 0, 1.35, -0.75, white), B(1.92, 0.5, 1.0, 0, 1.75, -0.72, glass), B(1.7, 0.5, 0.06, 0, 1.75, -1.4, glass), // cab, windows, windshield
    B(1.94, 0.12, 0.06, 0, 1.15, -1.2, maroon), // a red stripe at the door
    B(1.9, 0.7, 2.7, 0, 0.95, 1.25, maroon), B(1.6, 0.06, 2.6, 0, 1.0, 1.25, [0.25, 0.08, 0.1]), B(1.92, 0.08, 2.72, 0, 1.32, 1.25, [0.5, 0.08, 0.12]), // bed
    B(1.9, 0.08, 0.7, 0, 0.62, 2.95, maroon), // the tailgate, dropped open
    B(1.94, 0.12, 4.6, 0, 0.55, 0.15, black), // chassis
  ];
  for (const [x, z] of [[-0.9, -1.85], [0.9, -1.85], [-0.9, 1.6], [0.9, 1.6]]) { g.push(painted(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10).rotateZ(Math.PI / 2).translate(x, 0.42, z), tire)); g.push(painted(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8).rotateZ(Math.PI / 2).translate(x, 0.42, z), chrome)); }
  // roof rack: posts up from the bed rails and a frame over the cab
  for (const [x, z] of [[-0.92, -0.2], [0.92, -0.2], [-0.92, 2.5], [0.92, 2.5], [-0.92, 1.1], [0.92, 1.1]]) g.push(B(0.07, 1.25, 0.07, x, 1.95, z, black));
  for (const z of [-0.2, 1.1, 2.5]) g.push(B(1.92, 0.07, 0.07, 0, 2.55, z, black));
  for (const x of [-0.92, 0.92]) g.push(B(0.07, 0.07, 3.6, x, 2.55, 0.85, black));
  g.push(B(1.92, 0.06, 0.06, 0, 1.6, 2.5, black));
  // cargo: mattress on the rack, a striped one leaning, a washer off the back, chairs, boxes, a little tv
  g.push(B(1.85, 0.25, 2.2, 0, 2.72, 0.7, [0.95, 0.95, 0.98]), B(1.87, 0.08, 2.22, 0, 2.62, 0.7, [0.2, 0.3, 0.75]));
  g.push(painted(new THREE.BoxGeometry(1.5, 1.1, 0.2).rotateX(-0.5).translate(0.1, 2.0, 2.3), [0.8, 0.82, 0.9]));
  for (let i = 0; i < 5; i++) g.push(painted(new THREE.BoxGeometry(1.52, 0.08, 0.21).rotateX(-0.5).translate(0.1, 1.6 + i * 0.2, 2.3 - i * 0.1), i % 2 ? [0.95, 0.6, 0.65] : [0.75, 0.82, 0.95]));
  g.push(painted(new THREE.BoxGeometry(0.75, 0.95, 0.72).rotateX(0.35).translate(0.45, 1.2, 3.05), [0.92, 0.92, 0.85]), painted(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10).rotateX(Math.PI / 2 + 0.35).translate(0.45, 1.25, 3.42), [0.4, 0.45, 0.5]));
  g.push(B(0.5, 0.08, 0.5, -0.45, 1.6, 0.6, [0.9, 0.2, 0.45]), B(0.5, 0.6, 0.08, -0.45, 1.9, 0.85, [0.9, 0.2, 0.45]), B(0.05, 0.5, 0.05, -0.65, 1.35, 0.4, black), B(0.05, 0.5, 0.05, -0.25, 1.35, 0.4, black));
  g.push(B(0.6, 0.5, 0.5, 0.4, 1.6, 0.3, [0.7, 0.55, 0.35]), B(0.5, 0.4, 0.45, 0.45, 2.05, 0.35, [0.65, 0.5, 0.3]), B(0.45, 0.35, 0.35, -0.5, 1.55, 1.6, [0.25, 0.25, 0.28]));
  // yellow rope criss-crossing the load
  for (const [ax, ay, az, bx, by, bz] of [[-0.95, 1.35, 0, 0.95, 2.85, 1.6], [0.95, 1.35, 0, -0.95, 2.85, 1.6], [-0.95, 1.35, 2.4, 0.9, 1.7, 3.2], [-0.95, 2.6, -0.2, 0.95, 2.6, 2.5]]) {
    const len = Math.hypot(bx - ax, by - ay, bz - az), geo = new THREE.BoxGeometry(0.035, 0.035, len);
    const o = new THREE.Object3D(); o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); o.lookAt(bx, by, bz); o.updateMatrix(); geo.applyMatrix4(o.matrix); g.push(painted(geo, rope));
  }
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), mat()));
  const show = new THREE.Group(); show.position.set(0, 3.6, 0.7); root.add(show); // the gun on offer spins up here
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.8, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.3; show.add(ring);
  return { root, show };
}

// ---- EL TORO: an open 4x4 with bull horns on the grille, a roll cage and a gun on a post in the back. Faces -Z.
export function makeJeep() {
  const body = [0.72, 0.55, 0.3], body2 = [0.55, 0.4, 0.22], black = [0.08, 0.08, 0.08], horn = [0.95, 0.9, 0.78], red = [0.85, 0.15, 0.2];
  const g = [B(1.9, 0.55, 3.8, 0, 0.85, 0, body), B(1.8, 0.4, 1.2, 0, 1.25, -1.2, body2), B(1.6, 0.25, 0.08, 0, 1.0, -1.92, black), B(1.94, 0.1, 3.84, 0, 1.13, 0, red),
    B(0.25, 0.4, 0.4, -0.4, 1.2, 0.0, black), B(0.5, 0.08, 0.4, -0.4, 1.0, 0.0, black), B(0.25, 0.4, 0.4, 0.4, 1.2, 0.0, black), B(0.5, 0.08, 0.4, 0.4, 1.0, 0.0, black)]; // seats
  for (const s of [-1, 1]) { const h = new THREE.ConeGeometry(0.08, 0.7, 5); h.rotateZ(s * -1.2); h.translate(s * 0.45, 1.25, -2.0); g.push(painted(h, horn)); }
  for (const [x, z] of [[-1, -1.25], [1, -1.25], [-1, 1.25], [1, 1.25]]) g.push(painted(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 10).rotateZ(Math.PI / 2).translate(x, 0.5, z), black));
  for (const [x, z] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) g.push(B(0.07, 1.1, 0.07, x, 1.65, z, black));
  g.push(B(1.9, 0.07, 0.07, 0, 2.2, -0.5, black), B(1.9, 0.07, 0.07, 0, 2.2, 0.5, black), B(0.07, 0.07, 1.0, -0.9, 2.2, 0, black), B(0.07, 0.07, 1.0, 0.9, 2.2, 0, black));
  g.push(painted(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6).translate(0, 1.5, 1.15), black)); // gun post
  const root = new THREE.Group(); root.add(new THREE.Mesh(mergeGeometries(g), mat()));
  const turret = new THREE.Group(); turret.position.set(0, 1.95, 1.15); root.add(turret);
  turret.add(new THREE.Mesh(mergeGeometries([B(0.3, 0.25, 0.7, 0, 0, -0.1, [0.4, 0.42, 0.25]), painted(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8).rotateX(Math.PI / 2).translate(0, 0.02, -0.75), black), B(0.6, 0.4, 0.04, 0, 0.1, -0.45, [0.4, 0.42, 0.25])]), mat()));
  return { root, turret };
}

// ---- grenades and projectiles
export function makeSticky() { // la pegajosa: a glowing blue spiky ball
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0x3fd8ff })));
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: 0x9ff4ff, wireframe: true, transparent: true, opacity: 0.7 })));
  return g;
}
export function makeRocket() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries([painted(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6).rotateX(Math.PI / 2), [0.4, 0.42, 0.25]), painted(new THREE.ConeGeometry(0.06, 0.16, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.33), [1, 0.65, 0.1])]), mat()));
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6).rotateX(Math.PI / 2).translate(0, 0, 0.45), new THREE.MeshBasicMaterial({ color: 0xffa040 })); g.add(fire);
  return g;
}
export function makeNeedle() { return new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4fc0 })); }
export function makeBleedRing() { // over a downed friend: a ring that empties as the bleed-out clock runs
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0x220810, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide }));
  const fg = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xff3d5a, depthTest: false, side: THREE.DoubleSide }));
  bg.renderOrder = 6; fg.renderOrder = 7; g.add(bg, fg);
  const cross = new THREE.Mesh(mergeGeometries([new THREE.PlaneGeometry(0.1, 0.36), new THREE.PlaneGeometry(0.36, 0.1)]), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, side: THREE.DoubleSide })); cross.renderOrder = 7; g.add(cross);
  g.userData.fg = fg; g.userData.k = 1;
  return g;
}
export function setBleed(ring, k) {
  k = Math.max(0, Math.min(1, k)); if (Math.abs(ring.userData.k - k) < 0.01) return; ring.userData.k = k;
  const fg = ring.userData.fg; fg.geometry.dispose(); fg.geometry = new THREE.RingGeometry(0.34, 0.42, 32, 1, Math.PI / 2, Math.max(0.001, Math.PI * 2 * k));
  fg.material.color.setRGB(1, 0.24 + 0.6 * k, 0.35 * k);
}
