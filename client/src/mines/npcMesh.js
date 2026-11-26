// The old-timers (server/engine/npc-miners.js), drawn as hard-hat miners like everyone else down here, each with their
// own painted face, colours, build and props: a pickaxe they lean on, a beard, a lit cigarette. poseNpc() runs every
// frame: idle breathing and a head that follows you, a flinch when the pickaxe lands, a slow fall onto their back with
// the hat knocked off and stars going round, and the smokes on the floor beside them. Pure three.js, so node tests can
// build and pose one without a browser (no canvas there: the face is skipped).
import * as THREE from 'three';
import { buildMiner, walkPose } from './miners.js';

export const FALL_S = 0.7, RISE_S = 2.4, FLINCH_S = 0.42;
const canvas = (w, h) => (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null);
const basic = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Each old-timer's face, painted at the same low resolution as the rest of the mine. */
function npcFace(look) {
  const c = canvas(32, 40); if (!c) return null;
  const g = c.getContext('2d'), px = (col, x, y, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  g.fillStyle = look.skin; g.beginPath(); g.ellipse(16, 20, 13, 17, 0, 0, 7); g.fill();
  px(shade(look.skin, -0.18), 15, 19, 2, 6); // nose
  const eye = (x) => { px('#f4efe4', x, 14, 5, 3); px('#1a1210', x + 2, 14, 2, 3); };
  if (look.face === 'squint') { px('#2a1a10', 8, 15, 6, 1); px('#2a1a10', 18, 15, 6, 1); px(shade(look.skin, -0.25), 6, 18, 3, 1); px(shade(look.skin, -0.25), 23, 18, 3, 1); px(shade(look.skin, -0.2), 9, 8, 14, 1); }
  else { eye(8); eye(19); }
  if (look.face === 'patch') { px('#111', 7, 12, 7, 6); px('#111', 4, 9, 24, 1); px('#a0182c', 12, 30, 8, 2); } // eye patch and lipstick
  if (look.face === 'unibrow') px(look.hair, 6, 11, 20, 2);
  else px(look.hair, 7, 11, 7, 1), px(look.hair, 19, 11, 7, 1);
  if (look.face === 'scar') { for (let k = 0; k < 7; k++) px('#9a3a3a', 21 + (k >> 1), 18 + k, 1, 1); }
  if (look.face === 'collar') { g.strokeStyle = '#c9c9c9'; g.lineWidth = 1; g.strokeRect(7.5, 12.5, 7, 6); g.strokeRect(18.5, 12.5, 7, 6); px('#c9c9c9', 14, 15, 5, 1); }
  if (look.beard) { g.fillStyle = look.beard; g.beginPath(); g.moveTo(4, 22); g.quadraticCurveTo(16, 44, 28, 22); g.lineTo(24, 27); g.lineTo(8, 27); g.closePath(); g.fill(); px(look.beard, 10, 26, 12, 2); }
  if (look.face !== 'patch') px('#3a1a14', 12, 30, 8, 1); // mouth
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  return tex;
}

/** One loose cigarette for the floor: white paper, tan filter, a little ash. Unlit, so it reads in the dark. */
function cigarette() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), basic('#f2efe6')); paper.position.y = 0.04; g.add(paper);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.07, 6), basic('#c98a3a')); filter.position.y = -0.095; g.add(filter);
  g.rotation.z = Math.PI / 2; return g;
}

/**
 * An old-timer. `npc` is the server's entry ({ id, name, look, smoker }). Returns the miner rig from buildMiner plus
 * `pick`, `hat`, `ember`, `stars` and `smokes` (a group of up to three cigarettes on the floor, hidden until dropped).
 */
export function buildNpc(npc) {
  const look = npc.look || {};
  const m = buildMiner({ id: `npc-${npc.id}`, name: npc.name, avatar: { kind: 'gen', seed: `npc-${npc.id}` }, bug: null });
  m.group.name = 'mine-npc';
  const colours = { 'miner-hat': look.hat, 'miner-shirt': look.shirt, 'miner-skin': look.skin, 'miner-hair': look.hair };
  m.group.traverse((o) => { if (o.isMesh && colours[o.material?.name]) o.material.color.set(colours[o.material.name]); });
  const face = m.head.children.find((o) => o.isMesh && o.geometry?.type === 'PlaneGeometry');
  const tex = npcFace(look);
  if (face && tex) { face.material.map?.dispose(); face.material.map = tex; face.material.needsUpdate = true; }
  const bulk = look.bulk || 1;
  m.body.scale.set(bulk, 1 + (bulk - 1) * 0.35, bulk);
  if (look.beard) {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.08), lambert(look.beard)); beard.position.set(0, -0.15, 0.1); m.head.add(beard);
  }
  // the pickaxe they lean on, head down by their right boot
  const pick = new THREE.Group(); pick.name = 'npc-pick';
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 6), lambert('#8a5a32')); haft.position.y = 0.5; pick.add(haft);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), lambert('#4a5256')); head.position.y = 1.0; pick.add(head);
  pick.position.set(0.42, 0, 0.12); pick.rotation.z = 0.22; m.body.add(pick);
  let ember = null;
  if (npc.smoker) { // a lit cigarette in the corner of the mouth
    const cig = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 5), basic('#f2efe6'));
    cig.rotation.set(Math.PI / 2, 0, 0.5); cig.position.set(0.06, -0.09, 0.17); m.head.add(cig);
    ember = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), basic('#ff6a1a')); ember.position.set(0.09, -0.09, 0.22); m.head.add(ember);
  }
  const stars = new THREE.Group(); stars.visible = false; m.body.add(stars);
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), basic('#ffe066')); stars.add(s); }
  const smokes = new THREE.Group(); smokes.name = 'npc-smokes'; smokes.visible = false; m.group.add(smokes);
  for (let k = 0; k < 3; k++) { const c = cigarette(); c.scale.setScalar(1.5); c.position.set(0.62 + (k % 2) * 0.12, 0.035, -0.35 + k * 0.22); c.rotation.y = 0.4 + k * 0.9; smokes.add(c); } // spilled beside him, by his chest
  return Object.assign(m, { npc, look, pick, hat: m.head.getObjectByName('miner-hardhat'), ember, stars, smokes,
    hunch: look.hunch || 0, fall: 0, flinch: 0, talk: 0, down: false, shown: 0, hits: 0, kick: { x: 0, z: 0 } });
}

/** Show `count` cigarettes on the floor beside them (0 hides the lot). */
export function showSmokes(m, count) {
  m.shown = Math.max(0, Math.min(3, count | 0));
  m.smokes.visible = m.shown > 0;
  m.smokes.children.forEach((c, k) => { c.visible = k < m.shown; });
}

/**
 * A pickaxe lands. `dir` is the swing's direction in the miner's own frame ({ x, z }, from you to them); `hits` how
 * many have landed in this beating. Each one shoves them back a step (further the more they've taken, never out of
 * their alcove), jolts the head and body and leaves them wobbling; from hit 6 they stay hunched and dazed.
 */
export function stumbleNpc(m, dir = { x: 0, z: -1 }, hits = 1) {
  const len = Math.hypot(dir.x, dir.z) || 1, ux = dir.x / len, uz = dir.z / len;
  const sev = Math.min(1.6, 0.55 + hits * 0.13);
  m.hits = hits; m.sev = sev; m.hitDir = { x: ux, z: uz };
  m.flinch = 1; m.wob = 1; m.stepT = 0; m.lastHit = 0;
  const push = 0.16 + hits * 0.05;
  let kx = (m.kick?.x || 0) + ux * push, kz = (m.kick?.z || 0) + uz * push;
  const most = m.kickMax || KICK_MAX, far = Math.hypot(kx, kz); if (far > most) { kx *= most / far; kz *= most / far; }
  m.kick = { x: kx, z: kz };
  m.daze = hits >= 6 ? 1 : m.daze || 0;
}
export const KICK_MAX = 0.62; // metres: a dead end is 2.2 wide, so a stagger never puts them in the rock

/**
 * Pose one old-timer for this frame. `look` is the yaw (relative to the body) toward the player, `close` 0..1 how near.
 * Down: they topple over backwards (away from you) and hit the floor with a bounce, hat gone, stars going round. Up
 * again: slowly, propped on an elbow for a beat, then on their feet and swaying until the stars clear.
 */
export function poseNpc(m, dt, now, { look = 0, close = 0, reduce = false } = {}) {
  m.kick ||= { x: 0, z: 0 }; m.lastHit = (m.lastHit || 0) + dt;
  // the fall (0 standing .. 1 on the floor): drops like a tree, gets up like a hangover
  if (m.down) {
    if (m.fall < 1) { m.fall = reduce ? 1 : Math.min(1, m.fall + dt / FALL_S); if (m.fall >= 1) m.bounce = 1; }
    m.rising = 0;
  } else if (m.fall > 0) {
    if (!m.rising) { m.rising = 1e-6; m.daze = 1; m.hits = 0; }
    m.rising = reduce ? 1 : Math.min(1, m.rising + dt / RISE_S);
    if (m.rising >= 1) { m.fall = 0; m.rising = 0; m.groggy = GROGGY_S; }
  }
  m.bounce = Math.max(0, (m.bounce || 0) - dt / 0.3);
  m.groggy = Math.max(0, (m.groggy || 0) - dt);
  if (!m.groggy && m.hits < 6 && !m.down && !m.fall) m.daze = Math.max(0, (m.daze || 0) - dt / 1.5);
  if (m.lastHit > 60 && !m.down) m.hits = 0; // they shake it off (the server's HIT_FORGET_MS)
  const sev = m.sev || 0.6, hits = m.hits || 0;
  m.flinch = Math.max(0, m.flinch - dt / (FLINCH_S + hits * 0.04));
  m.wob = Math.max(0, (m.wob || 0) - dt / (0.6 + hits * 0.14));
  m.stepT = (m.stepT || 0) + dt;
  m.talk = Math.max(0, m.talk - dt);
  // stagger back to their spot once the hit has landed, slower the more they've taken
  if (m.lastHit > 0.35 && !m.down && !m.fall) { const k = 1 - Math.exp(-dt * 1.8 / (1 + hits * 0.3)); m.kick.x -= m.kick.x * k; m.kick.z -= m.kick.z * k; }
  walkPose(m, 0, false, true);
  // how far over they are: a falling tree accelerates; rising pauses halfway (on an elbow) for a head shake
  let lie;
  if (m.fall > 0 && m.rising) { const r = m.rising; lie = r < 0.35 ? 1 - 0.55 * ease(r / 0.35) : r < 0.6 ? 0.45 : 0.45 * (1 - ease((r - 0.6) / 0.4)); }
  else lie = m.fall > 0 ? m.fall ** 2.2 : 0;
  const e = lie, still = reduce ? 0 : 1;
  const fl = still * Math.sin(Math.min(1, m.flinch) * Math.PI) * m.flinch * sev;
  const wob = still * m.wob * sev, daze = still * (m.daze || 0) * (1 - e), dir = m.hitDir || { x: 0, z: -1 };
  const breathe = still * Math.sin(now / 900) * 0.025;
  const sway = daze * Math.sin(now / 480) * 0.09 + wob * Math.sin(m.stepT * 17) * 0.13;
  m.upper.rotation.x = (m.hunch + daze * 0.28) * (1 - e) + breathe + fl * 0.6 * -1;
  m.head.rotation.x = -fl * 0.55 + daze * 0.3 + (m.talk > 0 && !reduce ? Math.sin(now / 70) * 0.07 : 0);
  m.head.rotation.y = (1 - e) * (1 - daze) * Math.max(-0.8, Math.min(0.8, look)) * close + (m.rising && m.rising > 0.35 && m.rising < 0.6 && !reduce ? Math.sin(now / 60) * 0.35 : 0);
  m.head.rotation.z = fl * 0.35 * Math.sin(now / 40) + daze * Math.sin(now / 610) * 0.25;
  // arms fly up with the hit, hang when dazed, splay on the floor
  m.armL.rotation.z = -fl * 0.9 - wob * 0.3 - e * 1.2; m.armR.rotation.z = fl * 0.9 + wob * 0.3 + e * 1.2;
  m.armL.rotation.x = m.armR.rotation.x = -fl * 0.5 + daze * 0.15;
  // a stumbling step or two, back the way the pick sent them
  const step = m.stepT < 0.45 && !m.down ? Math.sin(m.stepT / 0.45 * Math.PI * 2) * Math.min(1, sev) * 0.55 * still : 0;
  m.legL.rotation.x = step * (dir.z < 0 ? 1 : -1); m.legR.rotation.x = -step * (dir.z < 0 ? 1 : -1);
  // the whole body leans with the shove and wobbles; on the floor it lies on its back, head away from you
  const lean = still * (fl * 0.35 + wob * 0.1);
  m.body.rotation.set(-e * Math.PI / 2 + dir.z * lean * (1 - e), 0, (-dir.x * lean + sway) * (1 - e));
  const bounce = still * Math.sin((1 - m.bounce) * Math.PI) * m.bounce * 0.07;
  m.body.position.set(m.kick.x * (1 - e), e * 0.17 + bounce, m.kick.z * (1 - e) + e * 0.9);
  if (m.hat) { const off = Math.max(e, m.fall > 0 ? 1 : 0); m.hat.position.set(off * 0.3, 0.1 + off * 0.02, off * 0.12); m.hat.rotation.set(off * 0.4, 0, off * 1.4); }
  if (m.pick) m.pick.rotation.z = 0.22 + e * 1.1 + wob * 0.15;
  if (m.tag) m.tag.position.y = 2.08 - e * 1.3;
  if (m.ember) m.ember.material.color.setHSL(0.05, 1, reduce ? 0.55 : 0.5 + Math.sin(now / 260) * 0.12);
  // stars: round the head where it lies, or over it while they're dazed on their feet
  const starry = m.fall > 0.95 || (m.rising > 0) || daze > 0.3 || m.groggy > 0;
  m.stars.visible = starry;
  if (starry) m.stars.children.forEach((st, k) => {
    const a = (reduce ? 0 : now / 420) + k * 2.1, c = Math.cos(a) * 0.24, d = Math.sin(a) * 0.24;
    st.position.set(c, 1.95 * e + 2.2 * (1 - e) + d * e, 0.4 * e + d * (1 - e) - 0.1 * (1 - e));
    st.rotation.y = a;
  });
}
const ease = (x) => x * x * (3 - 2 * x);
export const GROGGY_S = 1.8;
