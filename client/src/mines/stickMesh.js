// The Lord Howe Island stick insect (Dryococelus australis, the "tree lobster").
// Matched to reference photos: a long, thin, cylindrical, glossy black-brown body;
// a small head; a long thorax; a tapered, many-segmented abdomen; long antennae;
// six jointed legs with visible tarsi; and, on the male, thick curved spiny hind femora.
// Front is +z, feet point -Y so the default pose walks the floor; poseStick reorients it
// onto walls and the ceiling.
import * as THREE from 'three';

export const STICK_TILE = 2.2, STICK_WALL_H = 2.6;

function shellTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#140c08';
  x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * 128;
    x.fillStyle = i % 2 ? 'rgba(48, 30, 18, 0.4)' : 'rgba(8, 6, 4, 0.32)';
    x.fillRect(0, y, 256, 128 / 12);
  }
  // Mid-lateral cream lines run along U (around the body), never as rings around a limb.
  x.fillStyle = 'rgba(170, 140, 100, 0.22)';
  x.fillRect(58, 0, 5, 128);
  x.fillRect(193, 0, 5, 128);
  const id = x.getImageData(0, 0, 256, 128), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = ((i * 17) % 13) - 6;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n - 1));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - 2));
  }
  x.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

const mat = (color, extras = {}) => new THREE.MeshPhongMaterial({
  color, flatShading: false, shininess: 95, specular: '#8a6848', emissive: '#080604', ...extras,
});

export function buildStick() {
  const map = shellTexture();
  const shell = mat('#1c120c', { map, bumpMap: map, bumpScale: 0.22, shininess: 120, specular: '#b08a58' });
  const gloss = mat('#22160e', { map, bumpMap: map, bumpScale: 0.18, shininess: 135, specular: '#c49a68' });
  const chitin = mat('#1a100a', { shininess: 90, specular: '#7a5a38' });
  const joint = mat('#100a08', { shininess: 40, specular: '#4a3424' });
  const spur = mat('#2a1a10', { shininess: 70, specular: '#8a6238' });
  const eye = mat('#0a0604', { emissive: '#1a1208', shininess: 40, specular: '#886644' });
  const claw = mat('#1c120c', { shininess: 50 });
  const mats = [shell, gloss, chitin, joint, spur, eye, claw];
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 10, 8),
    limb: new THREE.CylinderGeometry(0.7, 1, 1, 10),
    tube: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 8),
  };
  const geometry = new Set(Object.values(shapes));
  const g = new THREE.Group(); g.name = 'mine-stick';
  const pivot = (parent, name, x, y, z) => { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; };
  const add = (parent, shape, material, x, y, z, sx, sy = sx, sz = sx) => {
    const geo = typeof shape === 'string' ? shapes[shape] : shape; geometry.add(geo);
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = false; parent.add(mesh); return mesh;
  };
  const alongZ = (mesh) => { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)); return mesh; };
  const limb = (parent, a, b, width, material, tail = width * 0.75) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const mesh = add(parent, 'limb', material, 0, 0, 0, width, direction.length(), tail);
    mesh.position.copy(from.add(to).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };

  // A tree lobster is long and cylindrical — about 2.15 units, huge in a 2.6-unit tunnel,
  // but slim: the abdomen is a tapered run of glossy segments, not a bulky blob.
  const body = pivot(g, 'stick-body', 0, 0.09, 0);

  // Abdomen: eight overlapping glossy cylinders, tapering to the cerci. Starts just behind the metathorax.
  const abdomen = pivot(body, 'stick-abdomen', 0, 0, 0.12);
  const segs = [
    { r: 0.088, l: 0.155 }, { r: 0.092, l: 0.155 }, { r: 0.088, l: 0.15 }, { r: 0.08, l: 0.145 },
    { r: 0.07, l: 0.14 }, { r: 0.058, l: 0.13 }, { r: 0.046, l: 0.12 }, { r: 0.034, l: 0.11 },
  ];
  let z = 0;
  segs.forEach((seg, i) => {
    const mesh = add(abdomen, 'tube', i % 2 ? gloss : shell, 0, 0, z - seg.l * 0.48, seg.r, seg.l * 0.92, seg.r * 0.96);
    alongZ(mesh);
    // A thin darker ring between segments, so the joints read in profile.
    if (i) {
      const ring = add(abdomen, 'tube', joint, 0, 0, z + 0.01, seg.r * 0.98, 0.018, seg.r * 0.98);
      alongZ(ring);
    }
    z -= seg.l * 0.9;
  });
  for (const side of [-1, 1]) {
    const cerci = add(abdomen, 'cone', spur, side * 0.03, 0.01, z - 0.05, 0.014, 0.1, 0.014);
    cerci.rotation.x = Math.PI / 2;
    cerci.rotation.z = side * 0.25;
  }

  // Thorax: long, three square-edged segments (pro, meso, meta), as in the dorsal reference.
  const thorax = pivot(body, 'stick-thorax', 0, 0.015, 0.28);
  alongZ(add(thorax, 'tube', shell, 0, 0, 0.52, 0.068, 0.16, 0.068)); // prothorax
  alongZ(add(thorax, 'tube', gloss, 0, 0.01, 0.22, 0.086, 0.36, 0.086)); // mesothorax, the longest
  alongZ(add(thorax, 'tube', shell, 0, 0.005, -0.02, 0.09, 0.22, 0.09)); // metathorax
  // A low dorsal ridge, square-edged like a tree lobster's notum.
  add(thorax, 'box', gloss, 0, 0.062, 0.18, 0.028, 0.016, 0.55);

  // Head: small, slightly wider than long, with small eyes and short mandibles.
  const head = pivot(body, 'stick-head', 0, 0.02, 0.96);
  add(head, 'ball', shell, 0, 0.01, 0.02, 0.068, 0.058, 0.08);
  add(head, 'box', joint, 0, -0.01, 0.09, 0.05, 0.03, 0.04);
  for (const side of [-1, 1]) {
    add(head, 'cone', claw, side * 0.022, -0.02, 0.12, 0.014, 0.05, 0.014).rotation.x = Math.PI / 2;
    add(head, 'ball', eye, side * 0.058, 0.02, 0.03, 0.022, 0.02, 0.02);
  }
  const antennae = [];
  for (const side of [-1, 1]) {
    const ant = pivot(head, side < 0 ? 'stick-ant-l' : 'stick-ant-r', side * 0.03, 0.05, 0.08);
    limb(ant, [0, 0, 0], [side * 0.04, 0.07, 0.15], 0.0046, joint, 0.0038);
    limb(ant, [side * 0.04, 0.07, 0.15], [side * 0.08, 0.1, 0.32], 0.0038, joint, 0.003);
    limb(ant, [side * 0.08, 0.1, 0.32], [side * 0.1, 0.06, 0.5], 0.003, joint, 0.0022);
    add(ant, 'ball', claw, side * 0.1, 0.06, 0.5, 0.004);
    antennae.push(ant);
  }

  // Six legs. Fore and mid are slim and jointed; hind femora are swollen, curved and spined (male).
  const legs = [];
  const pairs = [
    { z: 0.7, out: 0.08, femur: 0.34, tibia: 0.4, tarsus: 0.14, thick: 0.022, hind: false, name: 'fore' },
    { z: 0.48, out: 0.09, femur: 0.38, tibia: 0.44, tarsus: 0.15, thick: 0.024, hind: false, name: 'mid' },
    { z: 0.22, out: 0.1, femur: 0.5, tibia: 0.42, tarsus: 0.16, thick: 0.07, hind: true, name: 'hind' },
  ];
  for (const pair of pairs) {
    for (const side of [-1, 1]) {
      const phase = (pair.name === 'mid') === (side < 0) ? 0.5 : 0;
      const leg = pivot(body, `stick-${pair.name}-${side < 0 ? 'l' : 'r'}`, side * pair.out, 0, pair.z);
      const hip = pivot(leg, 'hip', 0, 0, 0);
      const mid = pivot(hip, 'knee', side * pair.femur * (pair.hind ? 0.45 : 0.55), -pair.femur * (pair.hind ? 0.22 : 0.38), pair.hind ? -0.12 : 0);
      if (pair.hind) {
        // Two-part curved femur, swollen, with a row of defensive spines on the ventroexternal carina.
        limb(hip, [0, 0, 0], [side * pair.femur * 0.28, -pair.femur * 0.06, -0.04], pair.thick, chitin, pair.thick * 0.9);
        limb(hip, [side * pair.femur * 0.28, -pair.femur * 0.06, -0.04], [side * pair.femur * 0.45, -pair.femur * 0.22, -0.12], pair.thick * 0.9, chitin, pair.thick * 0.55);
        add(hip, 'ball', joint, side * pair.femur * 0.45, -pair.femur * 0.22, -0.12, pair.thick * 0.55);
        for (let k = 0; k < 4; k++) {
          const t = 0.12 + k * 0.1;
          const spine = add(hip, 'cone', spur, side * pair.femur * t, -pair.femur * (0.04 + k * 0.035), 0.02, 0.016, 0.055, 0.016);
          spine.rotation.x = -0.9;
        }
      } else {
        limb(hip, [0, 0, 0], [side * pair.femur * 0.55, -pair.femur * 0.38, 0], pair.thick, chitin, pair.thick * 0.8);
        add(hip, 'ball', joint, side * pair.femur * 0.55, -pair.femur * 0.38, 0, pair.thick * 0.85);
      }
      limb(mid, [0, 0, 0], [side * pair.tibia * 0.2, -pair.tibia, 0.03], pair.thick * (pair.hind ? 0.4 : 0.55), chitin, pair.thick * 0.35);
      const foot = pivot(mid, 'foot', side * pair.tibia * 0.2, -pair.tibia, 0.03);
      // Five tarsomeres and a pair of claws, so the feet read as insect tarsi.
      let tz = 0;
      for (let t = 0; t < 5; t++) {
        const len = 0.022, r = 0.011 - t * 0.0012;
        add(foot, 'box', claw, 0, -0.01, 0.02 + tz, r * 2, r, len);
        tz += len * 0.95;
      }
      for (const clawSide of [-1, 1]) {
        const hook = add(foot, 'cone', claw, clawSide * 0.012, -0.018, 0.02 + tz, 0.007, 0.03, 0.007);
        hook.rotation.x = Math.PI / 2.4;
      }
      legs.push({ leg, hip, mid, foot, side, hind: pair.hind, phase });
    }
  }

  const fill = new THREE.PointLight(0x8a6a48, 1.25, 5.4, 1.7);
  fill.position.set(0, 0.32, 0.12);
  body.add(fill);
  const hit = add(body, 'box', new THREE.MeshBasicMaterial({ visible: false }), 0, 0.02, 0.05, 0.45, 0.28, 2.2);

  const dispose = () => {
    g.traverse((o) => {
      if (o.geometry && !shapes[Object.keys(shapes).find((k) => shapes[k] === o.geometry)]) {
        try { o.geometry.dispose(); } catch { /* already */ }
      }
      if (o.material && !mats.includes(o.material)) { try { o.material.dispose(); } catch { /* already */ } }
    });
    for (const geo of geometry) geo.dispose();
    for (const m of mats) m.dispose();
    map.dispose();
  };

  return { group: g, body, hit, legs, antennae, fill, dispose };
}

/** Which surface of this cell the insect is on: a wall if one exists, else the ceiling, cycling slowly along the route. */
export function stickSurface(grid, tileX, tileY, now = 0) {
  const cx = Math.round(tileX), cy = Math.round(tileY);
  const walls = [];
  if (grid?.[cy]?.[cx - 1] !== 0) walls.push({ nx: -1, nz: 0 });
  if (grid?.[cy]?.[cx + 1] !== 0) walls.push({ nx: 1, nz: 0 });
  if (grid?.[cy - 1]?.[cx] !== 0) walls.push({ nx: 0, nz: -1 });
  if (grid?.[cy + 1]?.[cx] !== 0) walls.push({ nx: 0, nz: 1 });
  const h = (Math.imul(cx + 1, 73856093) ^ Math.imul(cy + 1, 19349663) ^ Math.floor(now / 5500)) >>> 0;
  if (!walls.length) return h % 2 === 0 ? { kind: 'ceiling' } : { kind: 'floor' };
  const pick = walls[h % walls.length];
  const mode = h % 5;
  if (mode === 0) return { kind: 'ceiling' };
  if (mode === 1) return { kind: 'floor' };
  return { kind: 'wall', ...pick };
}

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _mat = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _target = new THREE.Quaternion();

/**
 * Place the insect on the floor, a wall or the ceiling of its current cell, feet into the rock,
 * facing along its roam heading, and walk the legs in a smooth tripod gait.
 */
export function poseStick(built, { grid, x, z, heading, now, reduce = false, tile = STICK_TILE, wallH = STICK_WALL_H, surface = null }) {
  const g = built.group;
  const tileX = x / tile, tileY = z / tile;
  const surf = surface || stickSurface(grid, tileX, tileY, now);
  const stand = 0.16;
  const half = tile * 0.46;
  let px = x, py = stand, pz = z;
  if (surf.kind === 'floor') { _up.set(0, 1, 0); py = stand; }
  else if (surf.kind === 'ceiling') { _up.set(0, -1, 0); py = wallH - stand; }
  else {
    _up.set(-surf.nx, 0, -surf.nz);
    px = Math.round(tileX) * tile + surf.nx * half;
    pz = Math.round(tileY) * tile + surf.nz * half;
    py = 0.85 + 0.35 * Math.sin((now / 2600) + tileX);
  }

  _fwd.set(Math.sin(heading), 0, Math.cos(heading));
  _fwd.addScaledVector(_up, -_fwd.dot(_up));
  if (_fwd.lengthSq() < 1e-6) _fwd.set(_up.z, 0, -_up.x);
  _fwd.normalize();
  _right.crossVectors(_up, _fwd).normalize();
  _fwd.crossVectors(_right, _up).normalize();
  _mat.makeBasis(_right, _up, _fwd);
  _target.setFromRotationMatrix(_mat);

  g.position.set(px, py, pz);
  if (reduce) g.quaternion.copy(_target);
  else g.quaternion.slerp(_target, 0.12);

  // Smooth tripod: a long plant, a short lifted swing, no snapping.
  const gait = reduce ? 0 : now / 520;
  for (const leg of built.legs) {
    const ang = (gait + leg.phase) * Math.PI * 2;
    const raw = Math.sin(ang);
    const swing = raw * raw * raw * 0.26; // flatter around the plant
    const lift = Math.max(0, raw) * 0.1;
    leg.hip.rotation.z = -leg.side * (0.1 + lift * 0.4);
    leg.hip.rotation.x = swing;
    leg.mid.rotation.x = -0.42 - Math.max(0, raw) * 0.28;
    if (leg.foot) leg.foot.rotation.x = Math.max(0, raw) * 0.2;
  }
  built.antennae.forEach((ant, i) => {
    const w = reduce ? 0 : Math.sin(now / 640 + i * 1.7) * 0.14;
    ant.rotation.z = w;
    ant.rotation.x = 0.12 + (reduce ? 0 : Math.sin(now / 780 + i) * 0.07);
  });
}
