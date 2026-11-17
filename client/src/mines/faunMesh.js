// An adult papercraft faun: curls, horns, goatee, a scarf, parcels and an umbrella from somewhere colder.
// Front is +z. The face is original stylized geometry, not a photograph.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const mat = color => new THREE.MeshLambertMaterial({ color, flatShading: true });

export function buildFaun() {
  const skin = mat('#d4a07a'), hair = mat('#493021'), horn = mat('#cfb28b'), fur = mat('#775031');
  const furDark = mat('#4b3323'), hoof = mat('#27251f'), scarf = mat('#bf2929'), scarfDark = mat('#7f171c');
  const paper = mat('#b99362'), string = mat('#e8dcc0'), umbrella = mat('#4f655b'), snow = mat('#f4f0e8');
  const stick = mat('#634c32'), eyeWhite = mat('#eee4d0'), pupil = mat('#30251b'), lip = mat('#a76d59');
  const mats = [skin, hair, horn, fur, furDark, hoof, scarf, scarfDark, paper, string, umbrella, snow, stick, eyeWhite, pupil, lip];
  const shapes = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(1, 8, 6), curl: new THREE.IcosahedronGeometry(1, 0), cone: new THREE.ConeGeometry(1, 1, 6), limb: new THREE.CylinderGeometry(.8, 1, 1, 7) };
  const geometry = new Set(Object.values(shapes));
  const g = new THREE.Group(); g.name = 'mine-faun';
  const pivot = (parent, name, x, y, z) => { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; };
  const add = (parent, shape, material, x, y, z, sx, sy = sx, sz = sx) => {
    const geo = typeof shape === 'string' ? shapes[shape] : shape; geometry.add(geo);
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const limb = (parent, a, b, width, material) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const mesh = add(parent, 'limb', material, 0, 0, 0, width, direction.length(), width);
    mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };

  const leftLeg = pivot(g, 'faun-left-leg', -.145, .94, 0), rightLeg = pivot(g, 'faun-right-leg', .145, .94, 0);
  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]]) {
    limb(leg, [0, 0, 0], [side * .025, -.4, .08], .12, fur);
    add(leg, 'ball', fur, side * .025, -.4, .08, .075);
    limb(leg, [side * .025, -.4, .08], [0, -.71, -.075], .065, furDark);
    limb(leg, [0, -.71, -.075], [0, -.84, .06], .045, fur);
    for (const toe of [-1, 1]) add(leg, 'box', hoof, toe * .042, -.885, .075, .072, .11, .2);
    for (const y of [-.12, -.27, -.42]) {
      const tuft = add(leg, 'cone', furDark, side * .085, y, .065, .065, .19, .055); tuft.rotation.z = Math.PI + side * .25;
    }
  }
  const hips = pivot(g, 'faun-furry-haunches', 0, .96, 0);
  add(hips, 'ball', fur, 0, 0, 0, .285, .18, .21);
  for (const side of [-1, 1]) add(hips, 'cone', furDark, side * .21, -.08, .035, .075, .19, .065).rotation.z = Math.PI + side * .3;
  const tail = pivot(g, 'faun-tail', 0, 1.08, -.18);
  add(tail, 'cone', furDark, 0, .075, 0, .055, .19, .05);
  tail.rotation.x = -1.9;
  const moon = pivot(g, 'faun-moon', 0, .97, -.18); moon.visible = false;
  for (const side of [-1, 1]) add(moon, 'ball', skin, side * .1, 0, -.025, .115, .135, .09);

  const upper = pivot(g, 'faun-upper-body', 0, 1.01, 0);
  add(upper, new THREE.CylinderGeometry(.235, .18, .43, 8), skin, 0, .25, 0, 1, 1, .7);
  for (const side of [-1, 1]) add(upper, 'ball', skin, side * .215, .43, 0, .105, .095, .1);
  add(upper, 'limb', skin, 0, .51, .015, .07, .13, .07);
  const leftArm = pivot(upper, 'faun-left-arm', -.25, .43, .015), rightArm = pivot(upper, 'faun-right-arm', .25, .43, .015);
  limb(leftArm, [0, 0, 0], [-.07, -.23, .055], .057, skin);
  limb(leftArm, [-.07, -.23, .055], [.14, -.34, .25], .046, skin);
  add(leftArm, 'curl', skin, .14, -.34, .25, .06);
  limb(rightArm, [0, 0, 0], [.075, -.24, .025], .057, skin);
  limb(rightArm, [.075, -.24, .025], [.15, -.41, .115], .045, skin);
  add(rightArm, 'curl', skin, .15, -.41, .115, .06);
  const parcels = pivot(upper, 'faun-parcels', -.13, .055, .27); parcels.rotation.z = -.1;
  add(parcels, 'box', paper, 0, 0, 0, .34, .19, .24);
  add(parcels, 'box', paper, .035, .15, -.015, .25, .12, .19).rotation.y = .15;
  add(parcels, 'box', string, 0, 0, 0, .018, .198, .248);
  add(parcels, 'box', string, 0, 0, 0, .348, .018, .248);
  add(parcels, 'box', string, .035, .15, -.015, .018, .128, .198).rotation.y = .15;
  add(parcels, 'box', scarfDark, -.09, .035, .125, .075, .03, .006).rotation.z = -.12;

  const umbrellaG = pivot(upper, 'faun-umbrella', .4, .015, .13);
  umbrellaG.rotation.z = -.1;
  add(umbrellaG, 'limb', stick, 0, .49, 0, .012, 1.1, .012);
  add(umbrellaG, new THREE.TorusGeometry(.045, .012, 5, 8, Math.PI), stick, .045, -.055, 0, 1).rotation.z = Math.PI;
  add(umbrellaG, new THREE.ConeGeometry(.31, .16, 8), umbrella, 0, .98, 0, 1);
  add(umbrellaG, 'cone', stick, 0, 1.085, 0, .018, .09, .018);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x = Math.cos(a), z = Math.sin(a);
    limb(umbrellaG, [0, 1.055, 0], [x * .3, .9, z * .3], .006, stick);
    if (i % 2) add(umbrellaG, 'curl', snow, x * .22, .95, z * .22, .065, .018, .055);
  }
  add(upper, new THREE.CylinderGeometry(.125, .14, .12, 8), scarf, 0, .52, .015, 1);
  const scarfTail = pivot(upper, 'faun-scarf-tail', -.085, .49, .13);
  add(scarfTail, 'box', scarf, 0, -.31, .035, .12, .64, .04).rotation.z = -.08;
  add(scarfTail, 'box', scarfDark, .12, -.19, .015, .095, .4, .035).rotation.z = .17;
  for (let i = 0; i < 4; i++) add(scarfTail, 'box', scarf, -.04 + i * .03, -.65, .035, .018, .07, .03);

  const head = pivot(upper, 'faun-head', 0, .66, .015);
  add(head, 'ball', skin, 0, 0, 0, .17, .19, .15);
  for (let i = 0; i < 9; i++) {
    const a = i * Math.PI / 4;
    add(head, 'curl', hair, i === 8 ? 0 : Math.cos(a) * .13, i === 8 ? .2 : .12 + (i % 2) * .025, i === 8 ? 0 : Math.sin(a) * .105, .067);
  }
  for (const side of [-1, 1]) {
    add(head, 'curl', hair, side * .145, .015, -.065, .06);
    const ear = add(head, 'cone', skin, side * .2, .025, -.005, .052, .2, .025); ear.rotation.z = -side * 1.15;
    const inset = add(head, 'cone', lip, side * .21, .03, .02, .03, .12, .008); inset.rotation.z = -side * 1.15;
    const tip = add(head, 'cone', horn, side * .12, .25, -.025, .039, .22, .035); tip.rotation.set(-.24, 0, -side * .32);
    add(head, 'ball', eyeWhite, side * .062, .015, .14, .027, .019, .015);
    add(head, 'ball', pupil, side * .059, .014, .153, .011, .014, .006);
    add(head, 'box', hair, side * .062, .06 + (side > 0 ? .009 : 0), .145, .067, .018, .026).rotation.z = side * .14;
    add(head, 'box', hair, side * .024, -.066, .155, .05, .026, .032).rotation.z = -side * .22;
  }
  add(head, 'cone', skin, 0, -.02, .175, .034, .085, .03).rotation.x = Math.PI / 2;
  add(head, 'box', lip, 0, -.095, .143, .054, .014, .02).rotation.z = .1;
  add(head, 'cone', hair, 0, -.14, .11, .055, .13, .045).rotation.z = Math.PI;

  // Batch static pieces by material within each joint; curls, fur and fingers do not need separate draw calls.
  const joints = []; g.traverse(o => { if (o.isGroup) joints.push(o); });
  for (const joint of joints) for (const material of mats) {
    const pieces = joint.children.filter(o => o.isMesh && o.material === material); if (!pieces.length) continue;
    const baked = pieces.map(piece => {
      piece.updateMatrix(); const copy = piece.geometry.clone().applyMatrix4(piece.matrix); joint.remove(piece);
      if (!copy.index) return copy;
      const flat = copy.toNonIndexed(); copy.dispose(); return flat;
    });
    joint.add(new THREE.Mesh(mergeGeometries(baked), material)); baked.forEach(geo => geo.dispose());
  }
  geometry.forEach(geo => geo.dispose());
  g.visible = false;
  return { group: g, head, leftLeg, rightLeg, leftArm, rightArm, upper, hips, tail, moon, scarfTail, umbrella: umbrellaG, parcels, mats };
}

/** Root facing belongs to the follower; this poses the joints and briefly uncovers a cartoon rump. */
export function trotFaun(mesh, nowMs, moving = false, reduce = false, moon = 0) {
  if (!mesh) return;
  const m = Number.isFinite(moon) ? Math.max(0, Math.min(1, reduce && moon > 0 ? 1 : moon)) : 0;
  const t = nowMs / 1000, walk = moving && !m && !reduce ? Math.sin(t * 10) : 0;
  mesh.leftLeg.rotation.x = walk * .38; mesh.rightLeg.rotation.x = -walk * .38;
  mesh.group.position.y = Math.abs(walk) * .025;
  mesh.upper.rotation.x = m * .6;
  mesh.hips.position.y = .96 - m * .08; mesh.hips.scale.y = 1 - m * .3;
  mesh.moon.visible = m > .65;
  mesh.tail.rotation.x = -1.9 + m * 1.6;
  mesh.scarfTail.rotation.x = -m * .8;
  mesh.leftArm.rotation.x = m * .12; mesh.rightArm.rotation.z = -m * .12;
  mesh.head.rotation.set(reduce ? 0 : walk * .035 - m * .18, m * -.5 + (reduce || moving || m ? 0 : Math.sin(t * 1.4) * .12), reduce ? 0 : walk * .025);
  mesh.umbrella.rotation.set(-m * .18, 0, -.1 + (reduce ? 0 : walk * .025));
}
