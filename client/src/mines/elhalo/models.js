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

// ---- other players: the same armoured hero, each in their own colours, with legs that walk and a name over the head
export const PLAYER_COLORS = [[0.1, 0.65, 0.65], [0.95, 0.35, 0.55], [1, 0.75, 0.15], [0.55, 0.4, 0.95], [0.4, 0.8, 0.3], [1, 0.5, 0.15], [0.3, 0.55, 1], [0.95, 0.95, 0.95]];
export function makePlayerModel(colorIdx, name) {
  const c = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const armor = [0.78, 0.45, 0.28].map((v, i) => v * 0.6 + c[i] * 0.4), armor2 = armor.map((v) => v * 0.75), under = [0.2, 0.18, 0.2], gold = [1, 0.78, 0.25];
  const g = [
    B(0.6, 0.34, 0.34, 0, 1.2, 0, under), B(0.72, 0.55, 0.42, 0, 1.6, 0, armor), B(0.5, 0.18, 0.06, 0, 1.68, -0.23, c),
    B(0.42, 0.4, 0.44, 0, 2.08, 0, armor), B(0.36, 0.14, 0.05, 0, 2.08, -0.22, gold), B(0.06, 0.18, 0.4, 0, 2.32, 0, c),
    painted(new THREE.CylinderGeometry(0.58, 0.6, 0.04, 14).rotateX(0.32).translate(0, 2.38, 0.08), c),
    painted(new THREE.CylinderGeometry(0.17, 0.21, 0.2, 10).rotateX(0.32).translate(0, 2.48, 0.05), gold),
  ];
  for (let i = 0; i < 6; i++) g.push(painted(new THREE.BoxGeometry(0.86, 0.13, 0.04).translate(0, -0.065 - i * 0.13, 0).rotateX(-0.12).translate(0, 1.95, 0.28), i % 2 ? c : SERAPE[i]));
  const m = mat();
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(new THREE.Mesh(mergeGeometries(g), m));
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const l = limb([B(0.22, 0.48, 0.24, 0, -0.24, 0, under), B(0.24, 0.4, 0.28, 0, -0.64, 0, armor), B(0.25, 0.08, 0.34, 0, -0.93, -0.03, armor2)], s * 0.16, 0.98, 0, m); body.add(l); legs.push(l);
    const ag = [B(0.3, 0.2, 0.45, 0, 0.0, 0, armor2), B(0.17, 0.5, 0.17, 0, -0.3, 0, under), B(0.2, 0.22, 0.2, 0, -0.6, 0, armor)];
    if (s > 0) ag.push(B(0.12, 0.14, 0.8, 0, -0.62, -0.35, [0.82, 0.68, 0.48]), B(0.14, 0.04, 0.45, 0, -0.53, -0.35, c));
    const a = limb(ag, s * 0.48, 1.86, 0, m); body.add(a); arms.push(a);
  }
  const tag = makeNameTag(name, c); tag.position.set(0, 2.95, 0); root.add(tag);
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
