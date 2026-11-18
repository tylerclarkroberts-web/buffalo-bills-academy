import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, Mesh, Raycaster, Vector3 } from 'three';
import { buildHomestead } from '../client/src/room/homestead.js';
import { ROOM_DOOR_HEIGHT, ROOM_WALL_HEIGHT, ROOM_FLOOR_SCALE as S } from '../client/src/room/scene-model.js';

function hits(wall, x, y, z, dx, dz) {
  const ray = new Raycaster(new Vector3(x * S, y, z * S), new Vector3(dx, 0, dz), 0, 0.6 * S);
  const hits = [];
  // Exercise the silhouette geometry even when the transparent wall ignores input rays.
  wall.traverse(mesh => {
    if (mesh.isMesh && mesh.geometry.type !== 'PlaneGeometry') Mesh.prototype.raycast.call(mesh, ray, hits);
  });
  return hits.length > 0;
}

test('both wings have open back, front and side windows at full wall height', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Offline'); });
  const root = new Group(), home = buildHomestead(root);
  t.after(() => home.dispose());
  await home.ready;
  root.updateMatrixWorld(true);
  const windows = [
    ['Kitchen rear window', 'left', -2.65, 4.05, 1, 0],
    ['Kitchen porch window', 'right', 3.55, 5.0, -1, 0],
    ['Kitchen counter window', 'front', 1.12, 7.45, 0, -1],
    ['Bedroom porch window', 'right', 3.85, -5.1, -1, 0],
    ['Bedroom side window', 'back', 0.85, -7.35, 0, 1],
    ['Bathroom rear window', 'left', -4.3, -5.35, 1, 0],
    ['Bathroom side window', 'back', -2.64, -7.35, 0, 1],
  ];
  for (const [name, side, x, z, dx, dz] of windows) {
    const wall = home.walls.find(wall => wall.solid.name === name);
    assert.equal(wall?.side, side, name);
    const pane = wall.solid.children.find(child => child.geometry?.type === 'PlaneGeometry');
    assert.ok(pane?.material.transparent && pane.material.opacity <= 0.25 && !pane.material.depthWrite, name + ' has clear glass');
    const midX = pane.position.x / S - dx * 0.3, midZ = pane.position.z / S - dz * 0.3;
    assert.ok(hits(wall.solid, midX, 2.67, midZ, dx, dz), name + ' has a solid central muntin');
    assert.equal(hits(wall.ghost, midX, 2.67, midZ, dx, dz), false, name + ' sash cuts away when near');
    for (const face of [wall.solid, wall.ghost]) {
      assert.ok(new Box3().setFromObject(face).max.y >= ROOM_WALL_HEIGHT - 0.001);
      assert.equal(hits(face, x, 2.67, z, dx, dz), false, name + ' window opening');
      assert.equal(hits(face, x, 1.2, z, dx, dz), true, name + ' section below the sill');
    }
  }
  const base = root.getObjectByName('Wing floors and capped cutaway bases');
  for (const [name, reverse, door, jamb, dx, dz] of [
    ['Kitchen doorway', 'kitchen', [2, 3.1], [0, 3.1], 0, 1],
    ['Bathroom doorway', 'bunk', [-0.18, -4.10], [-0.18, -5.5], -1, 0],
  ]) {
    const divider = home.walls.find(wall => wall.solid.name === name);
    assert.deepEqual(divider.reverseFor, [reverse]);
    const crosses = (face, [x, z], y) => hits(face, x, y, z, dx, dz);
    assert.ok(crosses(base, jamb, 0.5), name + ' keeps its base in the cutaway');
    assert.equal(crosses(base, door, 0.05), false, name + ' has a clear threshold');
    for (const face of [divider.solid, divider.ghost]) {
      assert.equal(crosses(face, door, ROOM_DOOR_HEIGHT - 0.05), false, name + ' has headroom');
      assert.ok(crosses(face, door, ROOM_DOOR_HEIGHT + 0.16), name + ' has a header');
      assert.ok(crosses(face, jamb, 1.3), name + ' has a wall beside the doorway');
    }
  }
});
