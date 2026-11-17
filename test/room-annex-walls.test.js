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
    ['Bathroom rear window', 'left', -2.65, 4.05, 1, 0],
    ['Bunk rear window', 'left', -4.3, -5.35, 1, 0],
    ['Bathroom porch window', 'right', 3.55, 5.0, -1, 0],
    ['Bunk porch window', 'right', 3.85, -5.1, -1, 0],
    ['Bathroom outer window', 'front', -0.7, 7.45, 0, -1],
    ['Kitchen counter window', 'back', 1.30, -7.35, 0, 1],
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
  const divider = home.walls.find(wall => wall.solid.name === 'Bathroom doorway');
  assert.equal(divider.reverseFor, 'bathroom');
  const base = root.getObjectByName('Wing floors and capped cutaway bases');
  assert.ok(hits(base, 0, 0.8, 3.1, 0, 1), 'bathroom divider stays legible in the near cutaway');
  assert.equal(hits(base, 2, 0.05, 3.1, 0, 1), false, 'door is clear at the threshold');
  for (const face of [divider.solid, divider.ghost]) {
    assert.equal(hits(face, 2, ROOM_DOOR_HEIGHT - 0.05, 3.1, 0, 1), false, 'door is clear at head height');
    assert.ok(hits(face, 2, ROOM_DOOR_HEIGHT + 0.16, 3.1, 0, 1), 'door header');
    assert.ok(hits(face, 0, 1.3, 3.1, 0, 1), 'upper wall beside the doorway');
  }
});
