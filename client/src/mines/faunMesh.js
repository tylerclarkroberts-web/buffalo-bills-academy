// Procedural low-poly papercraft faun (Mr. Tumnus): curly hair, small horns, pointed ears, a stylized
// face with mustache and goatee, bare tan torso, long red scarf, paper parcels and a snow-dusted
// umbrella, furry goat legs with hooves. Flat-shaded Lambert materials, front is +z, same as the visitor.
// The face is stylized geometry, not a photograph.
import * as THREE from 'three';

const mat = (color, extras = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extras });

export function buildFaun() {
  const skin = mat('#d4a07a');
  const hair = mat('#5a3a22');
  const horn = mat('#c8a882');
  const fur = mat('#6b4423');
  const furDark = mat('#4a2e18');
  const hoof = mat('#2a1c14');
  const scarf = mat('#c41e1e');
  const scarfDark = mat('#8a1212');
  const paper = mat('#b08958');
  const string = mat('#e8dcc0');
  const umbrella = mat('#6a4a32');
  const snow = mat('#f4f0e8');
  const stick = mat('#5a3a22');
  const eyeWhite = mat('#f5efe4');
  const pupil = mat('#2a1a12');
  const lip = mat('#a06050');
  const mats = [skin, hair, horn, fur, furDark, hoof, scarf, scarfDark, paper, string, umbrella, snow, stick, eyeWhite, pupil, lip];

  const g = new THREE.Group();
  const add = (parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };

  const leftLeg = new THREE.Group(); leftLeg.position.set(-0.11, 0.82, 0); g.add(leftLeg);
  const rightLeg = new THREE.Group(); rightLeg.position.set(0.11, 0.82, 0); g.add(rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    add(leg, new THREE.CylinderGeometry(0.09, 0.07, 0.42, 6), fur, 0, -0.2, 0.02, 0.15);
    add(leg, new THREE.SphereGeometry(0.055, 6, 5), fur, 0, -0.38, 0.04);
    add(leg, new THREE.CylinderGeometry(0.055, 0.045, 0.38, 6), furDark, 0, -0.52, 0.06, -0.25);
    add(leg, new THREE.BoxGeometry(0.09, 0.06, 0.14), hoof, 0, -0.74, 0.04);
    add(leg, new THREE.ConeGeometry(0.07, 0.14, 5), fur, 0.04, -0.15, 0.04, 0.4, 0, 0.3);
  }
  add(g, new THREE.SphereGeometry(0.22, 8, 6), fur, 0, 0.88, 0, 0, 0, 0, 1.15, 0.7, 0.95);

  add(g, new THREE.CylinderGeometry(0.13, 0.18, 0.48, 7), skin, 0, 1.18, 0);
  add(g, new THREE.SphereGeometry(0.16, 8, 6), skin, 0, 1.38, 0, 0, 0, 0, 1.15, 0.55, 0.9);

  const leftArm = new THREE.Group(); leftArm.position.set(-0.23, 1.36, 0.04); g.add(leftArm);
  const rightArm = new THREE.Group(); rightArm.position.set(0.23, 1.36, 0.04); g.add(rightArm);
  // Left arm cradles the parcels across the midriff.
  leftArm.rotation.set(0.95, 0.15, 0.45);
  add(leftArm, new THREE.CylinderGeometry(0.038, 0.045, 0.32, 6), skin, 0, -0.15, 0);
  add(leftArm, new THREE.CylinderGeometry(0.032, 0.036, 0.26, 6), skin, 0.02, -0.4, 0.02, 0.35);
  add(leftArm, new THREE.BoxGeometry(0.07, 0.06, 0.05), skin, 0.03, -0.54, 0.04);
  const parcels = new THREE.Group(); parcels.position.set(-0.2, 0.98, 0.22); g.add(parcels);
  add(parcels, new THREE.BoxGeometry(0.26, 0.14, 0.2), paper, 0, 0, 0, 0.1, 0.35, 0.1);
  add(parcels, new THREE.BoxGeometry(0.18, 0.11, 0.15), paper, 0.03, 0.12, 0.02, 0.05, -0.2, -0.1);
  add(parcels, new THREE.BoxGeometry(0.28, 0.014, 0.014), string, 0, 0.02, 0, 0.1, 0.35, 0.1);
  add(parcels, new THREE.BoxGeometry(0.014, 0.014, 0.22), string, 0, 0.02, 0, 0.1, 0.35, 0.1);
  add(parcels, new THREE.BoxGeometry(0.2, 0.014, 0.014), string, 0.03, 0.14, 0.02, 0.05, -0.2, -0.1);

  // Right arm hangs, holding the umbrella shaft so the canopy sits over the shoulder.
  rightArm.rotation.set(0.25, 0, -0.2);
  add(rightArm, new THREE.CylinderGeometry(0.038, 0.045, 0.32, 6), skin, 0, -0.15, 0);
  add(rightArm, new THREE.CylinderGeometry(0.032, 0.036, 0.26, 6), skin, 0, -0.4, 0.04, 0.2);
  add(rightArm, new THREE.BoxGeometry(0.06, 0.07, 0.05), skin, 0, -0.54, 0.06);
  const umbrellaG = new THREE.Group(); umbrellaG.position.set(0.28, 0.9, 0.06); umbrellaG.rotation.set(0.25, 0, 0.2); g.add(umbrellaG);
  add(umbrellaG, new THREE.CylinderGeometry(0.01, 0.012, 1.05, 5), stick, 0, 0.52, 0);
  // Inverted cone: wide canopy on top, tip on the stick.
  add(umbrellaG, new THREE.ConeGeometry(0.2, 0.13, 8), umbrella, 0, 1.08, 0, Math.PI);
  add(umbrellaG, new THREE.SphereGeometry(0.045, 5, 4), snow, 0.08, 1.12, 0.04, 0, 0, 0, 1, 0.45, 1);
  add(umbrellaG, new THREE.SphereGeometry(0.035, 5, 4), snow, -0.07, 1.1, -0.03, 0, 0, 0, 1, 0.4, 1);
  add(umbrellaG, new THREE.SphereGeometry(0.03, 5, 4), snow, 0.02, 1.14, -0.08, 0, 0, 0, 1.1, 0.35, 1);

  add(g, new THREE.TorusGeometry(0.12, 0.035, 5, 8, Math.PI * 1.6), scarf, 0, 1.48, 0.02, 0.5, 0, 0);
  add(g, new THREE.BoxGeometry(0.09, 0.55, 0.04), scarf, 0.1, 1.2, 0.12, 0.15, 0, 0.2);
  add(g, new THREE.BoxGeometry(0.08, 0.42, 0.035), scarfDark, -0.06, 1.15, 0.14, 0.2, 0, -0.3);
  add(g, new THREE.BoxGeometry(0.09, 0.06, 0.04), scarf, 0.1, 0.94, 0.14);
  add(g, new THREE.BoxGeometry(0.08, 0.05, 0.035), scarfDark, -0.06, 0.95, 0.16);

  add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6), skin, 0, 1.52, 0.02);
  const head = new THREE.Group(); head.position.set(0, 1.64, 0.04); g.add(head);
  add(head, new THREE.SphereGeometry(0.13, 8, 7), skin, 0, 0.02, 0, 0, 0, 0, 0.95, 1.05, 0.95);
  const curls = [
    [-0.08, 0.1, -0.04], [0.08, 0.1, -0.04], [0, 0.14, -0.02], [-0.12, 0.06, -0.02], [0.12, 0.06, -0.02],
    [-0.06, 0.08, -0.1], [0.06, 0.08, -0.1], [0, 0.1, -0.12], [-0.1, 0.02, -0.08], [0.1, 0.02, -0.08],
    [0, 0.14, 0.06], [-0.05, 0.12, 0.08], [0.05, 0.12, 0.08], [-0.09, 0.1, 0.04], [0.09, 0.1, 0.04],
  ];
  for (const [x, y, z] of curls) add(head, new THREE.SphereGeometry(0.048, 6, 5), hair, x, y, z);
  add(head, new THREE.ConeGeometry(0.03, 0.1, 5), horn, -0.07, 0.16, -0.02, 0.4, 0, 0.55);
  add(head, new THREE.ConeGeometry(0.03, 0.1, 5), horn, 0.07, 0.16, -0.02, 0.4, 0, -0.55);
  add(head, new THREE.ConeGeometry(0.04, 0.12, 5), skin, -0.13, 0.06, -0.01, 0, 0, 1.15);
  add(head, new THREE.ConeGeometry(0.04, 0.12, 5), skin, 0.13, 0.06, -0.01, 0, 0, -1.15);
  add(head, new THREE.ConeGeometry(0.022, 0.07, 5), hair, -0.128, 0.055, -0.02, 0, 0, 1.15);
  add(head, new THREE.ConeGeometry(0.022, 0.07, 5), hair, 0.128, 0.055, -0.02, 0, 0, -1.15);
  add(head, new THREE.SphereGeometry(0.025, 6, 5), eyeWhite, -0.045, 0.02, 0.11);
  add(head, new THREE.SphereGeometry(0.025, 6, 5), eyeWhite, 0.045, 0.02, 0.11);
  add(head, new THREE.SphereGeometry(0.012, 5, 4), pupil, -0.045, 0.02, 0.13);
  add(head, new THREE.SphereGeometry(0.012, 5, 4), pupil, 0.045, 0.02, 0.13);
  add(head, new THREE.ConeGeometry(0.025, 0.06, 5), skin, 0, -0.01, 0.13, 1.4);
  add(head, new THREE.BoxGeometry(0.12, 0.022, 0.035), hair, 0, -0.048, 0.125);
  add(head, new THREE.BoxGeometry(0.045, 0.06, 0.03), hair, 0, -0.085, 0.115);
  add(head, new THREE.BoxGeometry(0.05, 0.01, 0.015), lip, 0, -0.055, 0.125);

  g.visible = false;
  return { group: g, head, leftLeg, rightLeg, leftArm, rightArm, umbrella: umbrellaG, parcels, mats };
}

/** Hoofed trot: opposite-phase legs, a little body bob, scarf-still umbrella wobble. */
export function trotFaun(mesh, nowMs, moving, reduce = false) {
  if (!mesh) return;
  if (reduce) {
    mesh.leftLeg.rotation.x = 0;
    mesh.rightLeg.rotation.x = 0;
    mesh.head.rotation.set(0, 0, 0);
    return;
  }
  const t = nowMs / 1000;
  if (moving) {
    const swing = Math.sin(t * 10) * 0.45;
    mesh.leftLeg.rotation.x = swing;
    mesh.rightLeg.rotation.x = -swing;
    mesh.group.position.y = Math.abs(Math.sin(t * 10)) * 0.04;
    mesh.head.rotation.x = Math.sin(t * 8) * 0.06;
    mesh.head.rotation.z = Math.sin(t * 5) * 0.04;
    if (mesh.umbrella) mesh.umbrella.rotation.z = Math.sin(t * 8) * 0.05;
  } else {
    mesh.leftLeg.rotation.x *= 0.85;
    mesh.rightLeg.rotation.x *= 0.85;
    mesh.group.position.y *= 0.85;
    mesh.head.rotation.y = Math.sin(t * 1.4) * 0.15;
    mesh.head.rotation.x = Math.sin(t * 0.8) * 0.05;
    mesh.head.rotation.z *= 0.85;
  }
}
