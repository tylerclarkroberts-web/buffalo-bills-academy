import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A passing yard visitor, facing +Z with his hooves on the ground. */
export function roomFaun() {
  const group = new THREE.Group(); group.name = 'room-faun';
  const mat = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const skin = mat('#c69b76'), hair = mat('#493326'), fur = mat('#69513c'), darkFur = mat('#513d2e');
  const hoof = mat('#302c29'), horn = mat('#bdac84'), scarf = mat('#a12c32'), eye = mat('#241f1a');
  const cloth = mat('#655c50'), snow = mat('#dddcd2'), paper = mat('#987a54'), string = mat('#d4c2a0');
  const innerEar = mat('#a97c63'), iris = mat('#5c735e'), stitch = mat('#bc4648');
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent, w, h, d, material, x = 0, y = 0, z = 0) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const limb = (parent, from, to, width, material) => {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), direction = end.clone().sub(start);
    const object = add(parent, new THREE.CylinderGeometry(width * 0.8, width, direction.length(), 7), material);
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  };

  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = 'faun-goat-leg'; group.add(leg);
    const x = side * 0.14;
    limb(leg, [x, 1.02, 0], [x * 1.12, 0.58, 0.09], 0.16, fur);
    limb(leg, [x * 1.12, 0.6, 0.09], [x, 0.25, -0.07], 0.105, darkFur);
    limb(leg, [x, 0.3, -0.07], [x, 0.18, 0.06], 0.065, fur);
    for (const toe of [-1, 1]) {
      const foot = box(leg, 0.075, 0.24, 0.24, hoof, x + toe * 0.043, 0.12, 0.09); foot.name = 'faun-hoof';
    }
    for (const y of [0.63, 0.76, 0.89]) {
      const tuft = add(leg, new THREE.ConeGeometry(0.095, 0.18, 5), darkFur, x + side * 0.08, y, 0.08);
      tuft.rotation.z = Math.PI + side * 0.2;
    }
    // Hip pivots keep the short entrance/retreat steps attached to his torso.
    leg.position.y = 1.02; for (const part of leg.children) part.position.y -= 1.02;
  }
  const torso = add(group, new THREE.CylinderGeometry(0.265, 0.2, 0.52, 8), skin, 0, 1.24);
  torso.scale.z = 0.7;
  limb(group, [-0.25, 1.43, 0], [-0.37, 1.1, 0.12], 0.09, skin);
  limb(group, [-0.37, 1.1, 0.12], [-0.49, 1.25, 0.21], 0.07, skin);
  limb(group, [0.25, 1.43, 0], [0.36, 1.13, 0.1], 0.09, skin);
  limb(group, [0.36, 1.13, 0.1], [0.12, 1.12, 0.39], 0.07, skin);
  add(group, new THREE.DodecahedronGeometry(0.077), skin, -0.49, 1.25, 0.21);
  add(group, new THREE.DodecahedronGeometry(0.077), skin, 0.12, 1.12, 0.39);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    fingers.push(new THREE.BoxGeometry(0.018, 0.065, 0.03).translate(-0.522 + i * 0.023, 1.25, 0.271));
    fingers.push(new THREE.BoxGeometry(0.018, 0.058, 0.03).rotateZ(-0.15).translate(0.085 + i * 0.023, 1.1, 0.449));
  }
  add(group, mergeGeometries(fingers), skin); fingers.forEach(geometry => geometry.dispose());
  add(group, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), skin, 0, 1.55);

  const head = new THREE.Group(); head.name = 'faun-head'; head.position.set(0, 1.73, 0); group.add(head);
  const face = add(head, new THREE.SphereGeometry(0.205, 12, 8), skin); face.scale.set(0.86, 1.08, 0.86);
  const curls = new THREE.IcosahedronGeometry(0.075, 0);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    add(head, curls, hair, Math.cos(angle) * 0.15, 0.15 + (i % 2) * 0.025, Math.sin(angle) * 0.13);
  }
  add(head, curls, hair, 0, 0.22, 0);
  for (const side of [-1, 1]) {
    const ear = add(head, new THREE.ConeGeometry(0.065, 0.23, 4), skin, side * 0.24, 0.025, 0);
    ear.rotation.z = -side * 1.2; ear.scale.z = 0.45;
    const inset = add(ear, new THREE.ConeGeometry(0.041, 0.155, 4), innerEar, 0, 0.012, 0.047); inset.scale.z = 0.22;
    const tip = add(head, new THREE.ConeGeometry(0.045, 0.2, 6), horn, side * 0.14, 0.26, -0.035);
    tip.rotation.z = -side * 0.35; tip.rotation.x = -0.2;
    add(head, curls, hair, side * 0.145, 0.025, -0.1);
    const white = add(head, new THREE.SphereGeometry(0.027, 8, 6), snow, side * 0.071, 0.015, 0.17); white.scale.set(1, 0.58, 0.5);
    add(head, new THREE.CircleGeometry(0.011, 8), iris, side * 0.068, 0.015, 0.184);
    add(head, new THREE.CircleGeometry(0.0045, 8), eye, side * 0.068, 0.015, 0.185);
    const brow = box(head, 0.065, 0.018, 0.025, hair, side * 0.071, 0.065 + side * 0.005, 0.17); brow.rotation.z = side * 0.1;
    const moustache = box(head, 0.044, 0.025, 0.025, hair, side * 0.023, -0.072, 0.176); moustache.rotation.z = -side * 0.18;
  }
  const nose = add(head, new THREE.ConeGeometry(0.043, 0.085, 4), skin, 0, -0.026, 0.195); nose.rotation.x = Math.PI / 2;
  box(head, 0.065, 0.017, 0.025, eye, 0, -0.105, 0.165);
  const beard = add(head, new THREE.ConeGeometry(0.065, 0.13, 5), hair, 0, -0.15, 0.12); beard.rotation.z = Math.PI;

  const wrap = new THREE.Group(); wrap.name = 'faun-scarf'; group.add(wrap);
  add(wrap, new THREE.CylinderGeometry(0.13, 0.14, 0.14, 8), scarf, 0, 1.53);
  const tail = box(wrap, 0.13, 0.84, 0.045, scarf, -0.1, 1.05, 0.21); tail.rotation.z = -0.09;
  const stitches = Array.from({ length: 20 }, (_, i) => new THREE.BoxGeometry(0.009, 0.018, 0.003)
    .translate(i % 2 ? -0.051 : 0.051, -0.37 + Math.floor(i / 2) * 0.08, 0.024));
  add(tail, mergeGeometries(stitches), stitch); stitches.forEach(geometry => geometry.dispose());
  const fold = box(wrap, 0.13, 0.25, 0.045, scarf, -0.11, 0.53, 0.23); fold.rotation.z = 0.22;
  const end = box(wrap, 0.11, 0.4, 0.045, scarf, 0.01, 1.29, 0.23); end.rotation.z = 0.12;
  for (let i = 0; i < 4; i++) box(wrap, 0.018, 0.06, 0.027, scarf, -0.14 + i * 0.032, 0.39, 0.23);

  const parcel = new THREE.Group(); parcel.name = 'faun-parcel'; parcel.position.set(0.02, 1.09, 0.32); parcel.rotation.z = -0.12; group.add(parcel);
  box(parcel, 0.43, 0.3, 0.23, paper);
  box(parcel, 0.025, 0.308, 0.24, string);
  box(parcel, 0.44, 0.025, 0.24, string);
  for (const side of [-1, 1]) {
    const loop = add(parcel, new THREE.TorusGeometry(0.045, 0.009, 4, 6), string, side * 0.043, -0.015, 0.132);
    loop.scale.y = 0.65; loop.rotation.z = side * 0.4;
  }
  box(parcel, 0.027, 0.025, 0.03, string, 0, -0.018, 0.132);
  const folds = [-1, 1].map(side => new THREE.BoxGeometry(0.16, 0.006, 0.004).rotateZ(-side * 0.45).translate(side * 0.11, 0.075, 0.118));
  add(parcel, mergeGeometries(folds), cloth); folds.forEach(geometry => geometry.dispose());

  const umbrella = new THREE.Group(); umbrella.name = 'faun-umbrella'; umbrella.position.set(-0.51, 1.23, 0.18); umbrella.rotation.z = 0.35; group.add(umbrella);
  add(umbrella, new THREE.CylinderGeometry(0.015, 0.015, 1.42, 6), hair, 0, 0.3);
  add(umbrella, new THREE.ConeGeometry(0.3, 0.88, 8), cloth, 0, 0.52);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    limb(umbrella, [0, 0.96, 0], [Math.cos(angle) * 0.3, 0.08, Math.sin(angle) * 0.3], 0.009, hair);
    const y = i % 2 ? 0.4 : 0.62, radius = 0.3 * (0.96 - y) / 0.88;
    const dust = add(umbrella, new THREE.IcosahedronGeometry(0.065, 0), snow, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dust.scale.set(0.8, 2.2, 0.8);
  }
  return group;
}
