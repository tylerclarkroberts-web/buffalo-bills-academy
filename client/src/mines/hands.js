import * as THREE from 'three';
import { looks } from '../avatar/genbust.js';

/** A foreground viewmodel shares the mine's pixelated renderer, but never disappears inside a wall. */
export function buildMineHands(seed, skinTone) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5);
  const group = new THREE.Group(); scene.add(group);
  scene.add(new THREE.AmbientLight('#d8dfc4', 1.5));
  const lamp = new THREE.DirectionalLight('#fff1cc', 2.2); lamp.position.set(-1, 2, 3); scene.add(lamp);
  const look = looks(seed, skinTone);
  const material = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const skin = material(look.skin), shirt = material(look.shirt), cuff = material('#484236');
  const wood = material('#a4774a'), iron = material('#515c60'), steel = material('#859397');
  const knuckle = new THREE.SphereGeometry(1, 8, 6);
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 8);
  const sleeve = new THREE.CylinderGeometry(.6, 1, 1, 8);
  const part = (parent, geo, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
  };
  const [left, right] = [-1, 1].map(side => {
    const arm = new THREE.Group(); arm.name = side < 0 ? 'mine-left-hand' : 'mine-right-hand'; group.add(arm);
    const forearm = new THREE.Group(); arm.add(forearm);
    forearm.position.set(side * .035, -.066, .045);
    forearm.rotation.set(-.65, 0, side * .4);
    part(forearm, sleeve, shirt, 0, -.54, 0, .15, 1, .13);
    part(forearm, barrel, cuff, 0, -.046, 0, .093, .052, .083);
    part(forearm, knuckle, skin, 0, .005, 0, .066, .08, .06);
    return arm;
  });

  // The free hand rests palm-down. On the tool hand, the four knuckles stack down the shaft.
  part(left, knuckle, skin, -.015, -.012, -.036, .096, .062, .108);
  for (let i = 0; i < 4; i++) {
    const reach = [.068, .077, .072, .058][i];
    part(left, knuckle, skin, .046 - i * .042, -.031, -.116, .025, .03, reach).rotation.x = -.38;
  }
  part(left, knuckle, skin, .066, -.03, -.04, .038, .038, .07).rotation.y = -.55;

  part(right, knuckle, skin, .025, .008, -.006, .059, .102, .073);
  for (let i = 0; i < 4; i++) {
    const y = .074 - i * .043, reach = i === 3 ? .044 : .053;
    part(right, knuckle, skin, -.019, y, -.042, reach, .025, .032);
    part(right, knuckle, skin, -.058, y - .005, .012, .03, .024, .052).rotation.y = .44;
  }
  part(right, knuckle, skin, -.008, .055, .041, .032, .078, .032).rotation.z = .91;

  const pickaxe = new THREE.Group(); pickaxe.name = 'mine-pickaxe'; right.add(pickaxe);
  pickaxe.position.x = -.035; pickaxe.rotation.y = -.86;
  part(pickaxe, barrel, wood, 0, .23, 0, .038, .84, .03);
  part(pickaxe, barrel, iron, 0, .594, 0, .054, .094, .048);
  // A diamond section narrows to the pick point and flattens out at the chisel edge.
  const sections = [
    [-.44, .385, .003, .003], [-.34, .504, .018, .018], [-.18, .587, .034, .033],
    [0, .61, .044, .042], [.14, .584, .034, .032], [.28, .514, .008, .056],
  ];
  const vertices = [], indices = [];
  for (const [x, y, height, width] of sections) {
    const i = vertices.length / 3;
    vertices.push(x, y + height, 0, x, y, width, x, y - height, 0, x, y, -width);
    if (i) for (let j = 0; j < 4; j++) {
      const next = (j + 1) % 4;
      indices.push(i - 4 + j, i - 4 + next, i + next, i - 4 + j, i + next, i + j);
    }
  }
  const end = vertices.length / 3 - 4;
  indices.push(0, 2, 1, 0, 3, 2, end, end + 1, end + 2, end, end + 2, end + 3);
  const head = new THREE.BufferGeometry();
  head.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  head.setIndex(indices); head.computeVertexNormals();
  const blade = new THREE.Mesh(head, steel); blade.name = 'pick-head'; pickaxe.add(blade);
  const hands = { scene, camera, group, left, right, pickaxe, walk: 0, walking: 0, mining: 0 };
  resizeMineHands(hands, 1);
  return hands;
}

export function resizeMineHands(hands, aspect) {
  hands.camera.aspect = aspect; hands.camera.updateProjectionMatrix();
  const halfHeight = Math.tan(25 * Math.PI / 180);
  hands.spread = halfHeight * aspect * (aspect < 1 ? .62 : .72);
  hands.height = -halfHeight * .66;
  const scale = .7 * Math.min(1, aspect / 1.1);
  hands.left.scale.setScalar(scale); hands.right.scale.setScalar(scale);
  stepMineHands(hands, 0);
}

export function stepMineHands(hands, dt, { distance = 0, mining = false, hidden = false, reduce = false } = {}) {
  hands.group.visible = !hidden;
  hands.walk += distance * 4.5;
  hands.walking += ((distance > .0001 && !hidden && !reduce ? 1 : 0) - hands.walking) * (1 - Math.exp(-dt * 12));
  hands.mining = mining && !hidden && !reduce ? hands.mining + dt : 0;
  const sway = reduce || hidden ? 0 : Math.sin(hands.walk) * hands.walking;
  const lift = reduce || hidden ? 0 : Math.abs(Math.cos(hands.walk)) * hands.walking;
  const strike = hands.mining ? (1 - Math.cos(hands.mining * Math.PI * 4)) / 2 : 0;
  hands.left.position.set(-hands.spread + sway * .012, hands.height - .045 + lift * .015, -1 + sway * .025);
  hands.right.position.set(hands.spread * (1 - strike * .25) - sway * .012, hands.height - lift * .015, -1 - sway * .025 - strike * .14);
  hands.left.rotation.set(-.15, -.4, -.22 - sway * .035);
  hands.right.rotation.set(-.1 - strike * .99, 0, .2 + sway * .035 + strike * .1);
}
