import * as THREE from 'three';

const TILE = 2.2;

/** Tile coordinates shared by the rear-wall models and the explored map. */
export function entranceLayout(maze) {
  const west = maze.facing === 0, rear = .5 - .02 / TILE;
  const at = offset => ({ x: maze.start.x + (west ? -rear : offset / TILE), y: maze.start.y + (west ? -offset / TILE : -rear), rotation: west ? Math.PI / 2 : 0 });
  return { lift: at(-.38), door: at(.72) };
}

export function buildMineEntrance(maze, doorMap, liftSign) {
  const group = new THREE.Group(), layout = entranceLayout(maze);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const material = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const rust = material('#795037'), iron = material('#30342d'), wood = material('#75603b'), dark = material('#080b09');
  const box = (parent, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(cube, mat); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
  };
  const target = (kind, width, height, mat) => {
    const g = new THREE.Group(), at = layout[kind]; g.name = `mine-${kind}`;
    g.position.set(at.x * TILE, 0, at.y * TILE); g.rotation.y = at.rotation; group.add(g);
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    slab.position.set(0, height / 2, .025); slab.name = `mine-${kind}-slab`; g.add(slab);
    return { group: g, slab, normal: new THREE.Vector2(Math.sin(at.rotation), Math.cos(at.rotation)) };
  };
  const lift = target('lift', 1.16, 2.05, dark), cage = lift.group;
  for (const side of [-1, 1]) {
    box(cage, rust, side * .57, 1.08, .12, .085, 2.16, .19).rotation.z = side * .018;
    box(cage, iron, side * .32, 2.36, .09, .022, .53, .025).rotation.z = side * .035;
  }
  box(cage, rust, 0, 2.09, .13, 1.22, .12, .2).rotation.z = -.025;
  for (let i = 0; i < 4; i++) box(cage, wood, (i - 1.5) * .29, .075 + (i % 2) * .014, .19, .28, .12, .37).rotation.z = (i - 1.5) * .014;
  for (let i = 0; i < 5; i++) {
    const bar = box(cage, iron, (i - 2) * .2, 1.04, .17, .035, 1.81, .035); bar.rotation.z = (i % 2 ? -.018 : .025);
  }
  for (const [y, tilt] of [[.48, .08], [.97, -.055], [1.48, .035]]) box(cage, wood, -.035, y, .2, 1.03, .085, .055).rotation.z = tilt;
  box(cage, rust, .46, 1.03, .23, .14, .23, .12);
  box(cage, material('#b99b5d'), .46, 1.06, .3, .065, .055, .03);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.96, .3), new THREE.MeshLambertMaterial({ map: liftSign || null, color: '#e6d6ac' }));
  sign.position.set(-.015, 1.88, .23); sign.rotation.z = -.045; cage.add(sign);
  const door = target('door', .66, 1.99, new THREE.MeshLambertMaterial({ map: doorMap || null, color: '#dc4438', emissive: '#180402' }));
  const seamMat = door.seamMat = new THREE.MeshBasicMaterial({ color: '#ff4a32', transparent: true, opacity: .7 });
  for (const [w, h, x, y] of [[.72, .025, 0, 2.01], [.025, 2.01, -.35, 1], [.025, 2.01, .35, 1], [.72, .02, 0, .01]]) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(w, h), seamMat); seam.position.set(x, y, .03); door.group.add(seam);
  }
  box(door.group, iron, .23, .94, .07, .11, .035, .085);
  return { group, lift, door };
}
