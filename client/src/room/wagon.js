import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A parked prairie wagon, sized to the existing yard display. */
export function coveredWagon() {
  const group = new THREE.Group(); group.name = 'covered-wagon';
  const mat = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const timber = mat('#93613a'), lightWood = mat('#b48750'), darkWood = mat('#65462e'), iron = mat('#49453e');
  const canvas = new THREE.MeshLambertMaterial({ color: '#e7d7b7', side: THREE.DoubleSide, flatShading: true });
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent, w, h, d, material, x = 0, y = 0, z = 0) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);

  box(group, 1.28, 0.075, 0.7, darkWood, 0, 0.4);
  for (let i = 0; i < 6; i++) box(group, 1.25, 0.035, 0.108, i % 2 ? timber : lightWood, 0, 0.45, -0.28 + i * 0.112);
  for (const z of [-0.35, 0.35]) {
    for (const y of [0.51, 0.61, 0.71]) box(group, 1.28, 0.086, 0.045, timber, 0, y, z);
    for (const x of [-0.58, 0, 0.58]) box(group, 0.045, 0.32, 0.025, lightWood, x, 0.61, z + Math.sign(z) * 0.03);
    box(group, 1.32, 0.035, 0.065, lightWood, 0, 0.775, z);
    box(group, 1.08, 0.065, 0.055, darkWood, 0, 0.32, z * 0.65);
  }
  box(group, 0.055, 0.26, 0.67, timber, -0.615, 0.57);
  box(group, 0.2, 0.075, 0.64, darkWood, 0.53, 0.76);
  box(group, 0.055, 0.17, 0.64, lightWood, 0.44, 0.83);
  box(group, 0.18, 0.045, 0.4, darkWood, -0.7, 0.3);
  box(group, 0.23, 0.055, 0.07, darkWood, 0.695, 0.32);

  const tireGeometry = new THREE.TorusGeometry(0.236, 0.014, 4, 20);
  const rimGeometry = new THREE.TorusGeometry(0.211, 0.025, 5, 20);
  const hubGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.105, 10);
  const axleGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.96, 8);
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    return new THREE.BoxGeometry(0.025, 0.18, 0.04).translate(0, 0.12, 0).rotateZ(angle);
  });
  const spokeGeometry = mergeGeometries(spokes); spokes.forEach(geometry => geometry.dispose());
  for (const x of [-0.41, 0.41]) {
    add(group, axleGeometry, iron, x, 0.25).rotation.x = Math.PI / 2;
    for (const z of [-0.47, 0.47]) {
      const wheel = new THREE.Group(); wheel.name = 'wagon-wheel'; wheel.position.set(x, 0.25, z); group.add(wheel);
      add(wheel, tireGeometry, iron);
      add(wheel, rimGeometry, darkWood);
      add(wheel, spokeGeometry, lightWood);
      add(wheel, hubGeometry, lightWood).rotation.x = Math.PI / 2;
    }
  }

  // An open half-cylinder leaves a genuine view through both ends of the canvas cover.
  const cover = new THREE.Group(); cover.name = 'wagon-canopy'; group.add(cover);
  const roof = add(cover, new THREE.CylinderGeometry(0.38, 0.38, 1.03, 20, 1, true, 0, Math.PI), canvas, -0.075, 0.78);
  roof.rotation.z = Math.PI / 2; roof.scale.x = 1.3;
  for (const z of [-0.38, 0.38]) box(cover, 1.03, 0.13, 0.008, canvas, -0.075, 0.715, z);
  const hoopGeometry = new THREE.TorusGeometry(0.384, 0.012, 4, 20, Math.PI);
  for (const x of [-0.6, -0.34, -0.08, 0.18, 0.45]) {
    const hoop = add(cover, hoopGeometry, lightWood, x, 0.78);
    hoop.rotation.y = Math.PI / 2; hoop.scale.y = 1.3;
    for (const z of [-0.384, 0.384]) box(cover, 0.022, 0.13, 0.022, lightWood, x, 0.715, z);
  }
  return group;
}
