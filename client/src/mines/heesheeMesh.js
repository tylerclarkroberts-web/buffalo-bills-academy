// The Heeshee Mazode: an original low-poly mine horror. A hunched, too-long-limbed muscular humanoid
// whose eye sockets are packed tight with feathers (the feathers are the eyes). Mostly shadow; no gore,
// no borrowed faces. Front is +z. Tuned to sit under the 2.6-unit tunnel ceiling, head almost scraping.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const mat = (color, extras = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extras });

export function buildHeeshee() {
  const hide = mat('#3a3026', { emissive: '#1c1610' });
  const muscle = mat('#4e4030', { emissive: '#20180e' });
  const ridge = mat('#1a1612');
  const claw = mat('#5a4c38');
  const socket = mat('#0a0806');
  const shaft = mat('#8a6a38');
  const vane = mat('#c4a05a');
  const tip = mat('#e8c878', { emissive: '#5a4018' });
  const mats = [hide, muscle, ridge, claw, socket, shaft, vane, tip];
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 6, 5),
    cone: new THREE.ConeGeometry(1, 1, 5),
    limb: new THREE.CylinderGeometry(0.7, 1, 1, 6),
  };
  const geometry = new Set(Object.values(shapes));
  const g = new THREE.Group(); g.name = 'mine-heeshee';
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

  // Hunched: hips high, spine pitched, head nearly at the ceiling, knuckles drag the floor.
  const hips = pivot(g, 'heeshee-hips', 0, 1.05, 0);
  add(hips, 'ball', muscle, 0, 0, 0, 0.32, 0.22, 0.26);
  add(hips, 'box', ridge, 0, 0.02, -0.16, 0.18, 0.2, 0.1);

  const leftLeg = pivot(g, 'heeshee-left-leg', -0.16, 1.02, 0.04);
  const rightLeg = pivot(g, 'heeshee-right-leg', 0.16, 1.02, 0.04);
  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]]) {
    limb(leg, [0, 0, 0], [side * 0.04, -0.48, 0.12], 0.11, muscle);
    add(leg, 'ball', ridge, side * 0.04, -0.48, 0.12, 0.08);
    limb(leg, [side * 0.04, -0.48, 0.12], [side * 0.02, -0.92, -0.02], 0.08, hide);
    add(leg, 'box', claw, side * 0.02, -1.0, 0.08, 0.16, 0.07, 0.28);
  }

  const torso = pivot(g, 'heeshee-torso', 0, 1.12, 0);
  add(torso, new THREE.CylinderGeometry(0.34, 0.26, 0.7, 7), muscle, 0, 0.38, 0.02, 1, 1, 0.85);
  add(torso, 'box', ridge, 0, 0.42, -0.2, 0.16, 0.55, 0.12);
  add(torso, 'ball', muscle, 0, 0.62, 0.16, 0.28, 0.16, 0.2);
  for (const side of [-1, 1]) add(torso, 'ball', muscle, side * 0.32, 0.62, 0.02, 0.14, 0.12, 0.13);
  // One cheap, shadowless fill so the silhouette reads in a dark tunnel without a flash.
  const fill = new THREE.PointLight(0x8a6a38, 4.2, 8, 1.6);
  fill.position.set(0, 0.55, 0.9);
  torso.add(fill);

  const leftArm = pivot(torso, 'heeshee-left-arm', -0.36, 0.62, 0.02);
  const rightArm = pivot(torso, 'heeshee-right-arm', 0.36, 0.62, 0.02);
  for (const [arm, side] of [[leftArm, -1], [rightArm, 1]]) {
    limb(arm, [0, 0, 0], [side * 0.12, -0.55, 0.08], 0.09, muscle);
    add(arm, 'ball', ridge, side * 0.12, -0.55, 0.08, 0.07);
    limb(arm, [side * 0.12, -0.55, 0.08], [side * 0.08, -1.15, 0.16], 0.07, hide);
    const hand = pivot(arm, side < 0 ? 'heeshee-left-hand' : 'heeshee-right-hand', side * 0.08, -1.18, 0.16);
    add(hand, 'ball', hide, 0, 0, 0, 0.07);
    for (const k of [-1, 0, 1]) add(hand, 'box', claw, k * 0.045, -0.09, 0.06, 0.03, 0.16, 0.03);
  }

  // A hook out to the right of the hunched chest so a stolen bug is readable from in front and from behind.
  const carryHook = pivot(g, 'heeshee-carry', 0.62, 1.22, 0.42);

  const head = pivot(torso, 'heeshee-head', 0, 0.86, 0.08);
  add(head, 'ball', hide, 0, 0.02, 0, 0.2, 0.22, 0.18);
  add(head, 'box', ridge, 0, 0.08, -0.12, 0.16, 0.16, 0.1);
  add(head, 'cone', hide, 0, -0.02, 0.18, 0.05, 0.1, 0.05).rotation.x = Math.PI / 2;
  // Eye sockets: dark holes, packed with feathers that fan outward. The feathers are the eyes.
  const brow = new THREE.PointLight(0xc4a05a, 1.8, 3.2, 2);
  brow.position.set(0, 0.1, 0.28);
  head.add(brow);
  const leftEye = pivot(head, 'heeshee-left-eye', -0.09, 0.05, 0.14);
  const rightEye = pivot(head, 'heeshee-right-eye', 0.09, 0.05, 0.14);
  for (const eye of [leftEye, rightEye]) {
    add(eye, 'ball', socket, 0, 0, 0, 0.055, 0.05, 0.04);
    const tuft = pivot(eye, 'tuft', 0, 0, 0.02);
    const feathers = 7;
    for (let i = 0; i < feathers; i++) {
      const a = (i / feathers) * Math.PI * 2, spread = 0.35;
      const x = Math.cos(a) * 0.03, y = Math.sin(a) * 0.03;
      const vaneM = i % 2 ? vane : shaft;
      const f = add(tuft, 'cone', vaneM, x, y, 0.07, 0.018, 0.16, 0.018);
      f.rotation.x = Math.PI / 2 + (Math.sin(a) * spread);
      f.rotation.y = Math.cos(a) * spread;
      if (i % 3 === 0) add(tuft, 'cone', tip, x * 1.2, y * 1.2, 0.14, 0.012, 0.08, 0.012).rotation.x = Math.PI / 2;
    }
  }

  // Batch static pieces by material within each joint so phones stay in budget.
  const joints = []; g.traverse((o) => { if (o.isGroup) joints.push(o); });
  for (const joint of joints) for (const material of mats) {
    const pieces = joint.children.filter((o) => o.isMesh && o.material === material); if (!pieces.length) continue;
    const baked = pieces.map((piece) => {
      piece.updateMatrix(); const copy = piece.geometry.clone().applyMatrix4(piece.matrix); joint.remove(piece);
      if (!copy.index) return copy;
      const flat = copy.toNonIndexed(); copy.dispose(); return flat;
    });
    joint.add(new THREE.Mesh(mergeGeometries(baked), material)); baked.forEach((geo) => geo.dispose());
  }
  geometry.forEach((geo) => geo.dispose());
  g.visible = false;
  return {
    group: g, hips, torso, head, leftLeg, rightLeg, leftArm, rightArm,
    leftHand: g.getObjectByName('heeshee-left-hand'), rightHand: g.getObjectByName('heeshee-right-hand'), carryHook,
    leftEye, rightEye, leftTuft: leftEye.getObjectByName('tuft'), rightTuft: rightEye.getObjectByName('tuft'),
    mats,
  };
}

/**
 * Pose the joints. `fan` 0..1 slowly opens the feather tufts; `snap` 1 briefly jerks them toward the miner.
 * `lunge` uncoils the long arms; `carry` clutches a stolen bug in the right hand and walks off with it;
 * `frozen` holds a dead still; `reduce` skips twitch.
 */
export function poseHeeshee(mesh, nowMs, { moving = false, frozen = false, lunge = 0, carry = false, fan = 0.5, snap = 0, reduce = false } = {}) {
  if (!mesh) return;
  const t = nowMs / 1000;
  const C = carry ? 1 : 0;
  const walk = moving && !frozen && !lunge && !reduce ? Math.sin(t * (C ? 6.2 : 7.4)) : 0;
  const jerk = moving && !frozen && !reduce && (Math.sin(t * 23) > 0.7) ? 0.12 : 0;
  const L = Math.max(0, Math.min(1, lunge));
  mesh.leftLeg.rotation.x = walk * 0.45 + L * -0.2 + C * 0.08;
  mesh.rightLeg.rotation.x = -walk * 0.45 + L * -0.2 + C * 0.08;
  mesh.group.position.y = Math.abs(walk) * 0.03 + L * 0.08;
  mesh.torso.rotation.x = 0.55 - L * 0.45 - C * 0.08 + (frozen || reduce ? 0 : walk * 0.03);
  mesh.hips.rotation.y = frozen ? 0 : walk * 0.04;
  // Carry: right arm holds the bug out to the side, chest-high, so the miner sees it struggling as the thing walks off.
  mesh.leftArm.rotation.x = 0.15 + walk * (C ? 0.22 : 0.5) - L * 1.4 - C * 0.2;
  mesh.rightArm.rotation.x = 0.15 - walk * (C ? 0.1 : 0.5) - L * 1.4 - C * 0.55;
  mesh.leftArm.rotation.z = 0.35 + L * 0.2 - C * 0.05;
  mesh.rightArm.rotation.z = -0.35 - L * 0.2 - C * 1.15;
  if (mesh.rightHand) mesh.rightHand.rotation.x = C * 0.4;
  mesh.head.rotation.set(
    (reduce ? 0 : walk * 0.04) - L * 0.2,
    frozen || reduce ? 0 : Math.sin(t * 0.7) * 0.08,
    frozen ? 0 : walk * 0.03 + jerk,
  );
  const open = 0.15 + fan * 0.85 + snap * 0.4;
  const aimY = snap * 0.35;
  if (mesh.mats?.[7]?.emissive) {
    const e = 0.18 + fan * 0.28 + snap * 0.5;
    mesh.mats[7].emissive.setRGB(e, e * 0.62, e * 0.18);
  }
  for (const tuft of [mesh.leftTuft, mesh.rightTuft]) {
    if (!tuft) continue;
    tuft.scale.set(0.7 + open * 0.5, 0.7 + open * 0.5, 0.45 + open * 0.85);
    tuft.rotation.x = -0.15 + fan * 0.25 - snap * 0.35;
    tuft.rotation.y = aimY;
    if (!reduce && !frozen) tuft.rotation.z = Math.sin(t * 9 + (tuft === mesh.leftTuft ? 0 : 1)) * 0.06;
  }
}
