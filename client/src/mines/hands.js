import * as THREE from 'three';
import { looks } from '../avatar/genbust.js';

/** A foreground viewmodel shares the mine's pixelated renderer, but never disappears inside a wall. */
export function buildMineHands(seed) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5);
  const group = new THREE.Group(); scene.add(group);
  scene.add(new THREE.AmbientLight('#d8dfc4', 1.5));
  const lamp = new THREE.DirectionalLight('#fff1cc', 2.2); lamp.position.set(-1, 2, 3); scene.add(lamp);
  const look = looks(seed);
  const material = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const skin = material(look.skin), shirt = material(look.shirt), cuff = material('#30372c');
  const wood = material('#85572d'), grain = material('#4d301b'), steel = material('#75888b');
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(cube, mat); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
  };
  const arms = [-1, 1].map(side => {
    const arm = new THREE.Group(); arm.name = side < 0 ? 'mine-left-hand' : 'mine-right-hand'; group.add(arm);
    box(arm, shirt, 0, -.32, .09, .22, .47, .2).rotation.x = -.25;
    box(arm, cuff, 0, -.11, .035, .21, .065, .18);
    box(arm, skin, 0, -.045, .015, .145, .13, .13);
    box(arm, skin, 0, .055, 0, .17, .16, .14);
    for (let i = 0; i < 4; i++) {
      const finger = box(arm, skin, (i - 1.5) * .041, .145, -.012, .035, .09, .085);
      finger.rotation.x = -.38;
      box(arm, skin, (i - 1.5) * .041, .157, -.06, .035, .045, .07);
    }
    box(arm, skin, -side * .095, .065, .045, .065, .105, .08).rotation.z = side * .45;
    return arm;
  });
  const [left, right] = arms;
  const pickaxe = new THREE.Group(); pickaxe.name = 'mine-pickaxe'; right.add(pickaxe);
  box(pickaxe, wood, 0, .17, -.085, .065, .9, .065);
  box(pickaxe, grain, -.014, .36, -.049, .014, .43, .008);
  box(pickaxe, steel, 0, .54, -.085, .1, .14, .12);
  const head = new THREE.Shape();
  head.moveTo(-.31, .37); head.lineTo(-.25, .54); head.lineTo(-.12, .62); head.lineTo(.07, .62);
  head.lineTo(.21, .54); head.lineTo(.31, .35); head.lineTo(.16, .46); head.lineTo(.04, .5);
  head.lineTo(-.1, .5); head.lineTo(-.22, .45); head.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(head, { depth: .09, bevelEnabled: false }), steel);
  blade.position.z = -.13; pickaxe.add(blade);
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
  hands.left.position.set(-hands.spread + sway * .012, hands.height + lift * .015, -1 + sway * .025);
  hands.right.position.set(hands.spread - sway * .012, hands.height - lift * .015 - strike * .07, -1 - sway * .025);
  hands.left.rotation.set(-.12, .2, -.22 - sway * .035);
  hands.right.rotation.set(-.12 - strike * .55, -.15, .2 + sway * .035 + strike * .5);
}
