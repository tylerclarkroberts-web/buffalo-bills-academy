// The Lord Howe Island stick insect (Dryococelus australis, the "tree lobster"): a huge, glossy,
// segmented body in the mine's low-poly style. Adults are bulky, not twig-thin. Front is +z, feet
// point -Y so the default pose walks the floor; poseStick reorients it onto walls and the ceiling.
import * as THREE from 'three';

export const STICK_TILE = 2.2, STICK_WALL_H = 2.6;

const mat = (color, extras = {}) => new THREE.MeshPhongMaterial({
  color, flatShading: true, shininess: 68, specular: '#6a5a48', emissive: '#120c08', ...extras,
});

export function buildStick() {
  const shell = mat('#2a1a10');
  const gloss = mat('#3e2818', { shininess: 90, specular: '#8a7058', emissive: '#1a1008' });
  const joint = mat('#1a100a');
  const spur = mat('#4a3420', { shininess: 40 });
  const eye = mat('#0a0604', { emissive: '#2a1a08', shininess: 20 });
  const claw = mat('#1c120c');
  const mats = [shell, gloss, joint, spur, eye, claw];
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 7, 6),
    limb: new THREE.CylinderGeometry(0.7, 1, 1, 6),
    cone: new THREE.ConeGeometry(1, 1, 6),
  };
  const geometry = new Set(Object.values(shapes));
  const g = new THREE.Group(); g.name = 'mine-stick';
  const pivot = (parent, name, x, y, z) => { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; };
  const add = (parent, shape, material, x, y, z, sx, sy = sx, sz = sx) => {
    const geo = typeof shape === 'string' ? shapes[shape] : shape; geometry.add(geo);
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const limb = (parent, a, b, width, material) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const mesh = add(parent, 'limb', material, 0, 0, 0, width, direction.length(), width);
    mesh.position.copy(from.add(to).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };

  // A tree lobster is a heavy, cylindrical insect ~1.8 units long — huge in a 2.6-unit tunnel.
  const body = pivot(g, 'stick-body', 0, 0.16, 0);

  // Abdomen: eight overlapping glossy segments, tapering toward the cerci.
  const abdomen = pivot(body, 'stick-abdomen', 0, 0, -0.18);
  const segs = [0.13, 0.145, 0.14, 0.13, 0.12, 0.105, 0.09, 0.07];
  let z = 0;
  segs.forEach((r, i) => {
    const len = 0.16;
    add(abdomen, 'limb', i % 2 ? gloss : shell, 0, 0, z - len * 0.45, r, len, r * 0.85).quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    z -= len * 0.88;
  });
  // Cerci at the tail
  for (const side of [-1, 1]) add(abdomen, 'cone', spur, side * 0.05, 0.02, z - 0.06, 0.025, 0.11, 0.025);

  // Thorax: thick, slightly raised, with a dorsal ridge.
  const thorax = pivot(body, 'stick-thorax', 0, 0.04, 0.28);
  add(thorax, 'ball', gloss, 0, 0, 0, 0.2, 0.16, 0.26);
  add(thorax, 'box', shell, 0, 0.1, -0.02, 0.1, 0.06, 0.28);
  add(thorax, 'ball', shell, 0, 0.02, 0.22, 0.16, 0.13, 0.14);

  // Head, mandibles, bulbous eyes, long filiform antennae.
  const head = pivot(body, 'stick-head', 0, 0.05, 0.58);
  add(head, 'ball', shell, 0, 0.02, 0.04, 0.12, 0.1, 0.14);
  add(head, 'box', joint, 0, -0.01, 0.14, 0.1, 0.06, 0.08);
  for (const side of [-1, 1]) {
    add(head, 'cone', claw, side * 0.04, -0.04, 0.2, 0.025, 0.08, 0.025).rotation.x = Math.PI / 2;
    add(head, 'ball', eye, side * 0.1, 0.04, 0.06, 0.045, 0.04, 0.04);
  }
  const antennae = [];
  for (const side of [-1, 1]) {
    const ant = pivot(head, side < 0 ? 'stick-ant-l' : 'stick-ant-r', side * 0.06, 0.08, 0.12);
    limb(ant, [0, 0, 0], [side * 0.08, 0.22, 0.28], 0.018, joint);
    limb(ant, [side * 0.08, 0.22, 0.28], [side * 0.16, 0.18, 0.62], 0.012, spur);
    add(ant, 'ball', claw, side * 0.16, 0.18, 0.62, 0.016);
    antennae.push(ant);
  }

  // Six legs in three pairs. Hind femora are swollen (male tree-lobster spurs).
  const legs = [];
  const pairs = [
    { z: 0.46, out: 0.16, femur: 0.36, tibia: 0.42, thick: 0.045, hind: false, name: 'fore' },
    { z: 0.28, out: 0.18, femur: 0.4, tibia: 0.48, thick: 0.05, hind: false, name: 'mid' },
    { z: 0.08, out: 0.2, femur: 0.46, tibia: 0.52, thick: 0.08, hind: true, name: 'hind' },
  ];
  for (const pair of pairs) {
    for (const side of [-1, 1]) {
      const leg = pivot(body, `stick-${pair.name}-${side < 0 ? 'l' : 'r'}`, side * pair.out, 0, pair.z);
      const hip = pivot(leg, 'hip', 0, 0, 0);
      const mid = pivot(hip, 'knee', side * pair.femur * 0.55, -pair.femur * 0.35, 0);
      limb(hip, [0, 0, 0], [side * pair.femur * 0.55, -pair.femur * 0.35, 0], pair.thick, pair.hind ? gloss : shell);
      add(hip, 'ball', joint, side * pair.femur * 0.55, -pair.femur * 0.35, 0, pair.thick * 0.9);
      if (pair.hind) {
        // A row of short spines on the swollen hind femur.
        for (let k = 0; k < 3; k++) add(hip, 'cone', spur, side * pair.femur * (0.2 + k * 0.12), -pair.femur * 0.12 - k * 0.04, 0.05, 0.02, 0.05, 0.02);
      }
      limb(mid, [0, 0, 0], [side * pair.tibia * 0.25, -pair.tibia, 0.04], pair.thick * 0.55, shell);
      const foot = pivot(mid, 'foot', side * pair.tibia * 0.25, -pair.tibia, 0.04);
      add(foot, 'box', claw, 0, -0.03, 0.05, 0.05, 0.025, 0.1);
      legs.push({ leg, hip, mid, foot, side, hind: pair.hind, phase: pair.name === 'mid' ? 0.5 : 0 });
    }
  }

  // A soft fill so the silhouette reads in a dark tunnel, plus a tight hit mesh for seeing / clicking.
  const fill = new THREE.PointLight(0xc49a5a, 2.4, 5.5, 1.6);
  fill.position.set(0, 0.2, 0.1);
  body.add(fill);
  const hit = add(body, 'box', new THREE.MeshBasicMaterial({ visible: false }), 0, 0.02, 0.05, 0.55, 0.35, 1.7);

  const dispose = () => {
    g.traverse((o) => {
      if (o.geometry && !shapes[Object.keys(shapes).find((k) => shapes[k] === o.geometry)]) {
        try { o.geometry.dispose(); } catch { /* already */ }
      }
      if (o.material && !mats.includes(o.material)) { try { o.material.dispose(); } catch { /* already */ } }
    });
    for (const geo of geometry) geo.dispose();
    for (const m of mats) m.dispose();
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
 * facing along its roam heading, and walk the legs in a tripod gait.
 */
export function poseStick(built, { grid, x, z, heading, now, reduce = false, tile = STICK_TILE, wallH = STICK_WALL_H, surface = null }) {
  const g = built.group;
  const tileX = x / tile, tileY = z / tile;
  const surf = surface || stickSurface(grid, tileX, tileY, now);
  const stand = 0.12; // body clear of the rock
  const half = tile * 0.46;
  let px = x, py = stand, pz = z;
  if (surf.kind === 'floor') { _up.set(0, 1, 0); py = stand; }
  else if (surf.kind === 'ceiling') { _up.set(0, -1, 0); py = wallH - stand; }
  else {
    _up.set(-surf.nx, 0, -surf.nz); // feet into the wall; up is toward the tunnel
    px = Math.round(tileX) * tile + surf.nx * half;
    pz = Math.round(tileY) * tile + surf.nz * half;
    py = 0.85 + 0.35 * Math.sin((now / 2600) + tileX);
  }

  // Forward: the roam heading, projected onto the surface so it stays tangent.
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

  const gait = reduce ? 0 : now / 220;
  for (const leg of built.legs) {
    const swing = Math.sin(gait + leg.phase * Math.PI + (leg.side < 0 ? 0 : Math.PI)) * 0.38;
    leg.hip.rotation.z = -leg.side * 0.15;
    leg.hip.rotation.x = swing;
    leg.mid.rotation.x = -0.55 - swing * 0.45;
  }
  built.antennae.forEach((ant, i) => {
    const w = reduce ? 0 : Math.sin(now / 380 + i * 1.7) * 0.18;
    ant.rotation.z = w;
    ant.rotation.x = 0.15 + (reduce ? 0 : Math.sin(now / 520 + i) * 0.08);
  });
}
