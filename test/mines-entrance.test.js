import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { entranceLayout, buildMineEntrance } from '../client/src/mines/entrance.js';
import { MineScene, TILE, EYE } from '../client/src/mines/scene.js';

function fixture(facing) {
  const grid = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => x > 0 && y > 0 && x < 4 && y < 4 ? 0 : 1));
  const maze = { grid, start: { x: 1, y: 1 }, facing }, entrance = buildMineEntrance(maze);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(72, 1000 / 600, .05, 60);
  scene.add(entrance.group, camera);
  const mine = Object.assign(Object.create(MineScene.prototype), { maze, scene, camera, lift: entrance.lift, door: entrance.door, pos: new THREE.Vector2(TILE, TILE), yaw: facing === 0 ? Math.PI / 2 : 0,
    raycaster: new THREE.Raycaster(), renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) } } });
  mine.aim = () => { camera.position.set(mine.pos.x, EYE, mine.pos.y); camera.rotation.set(0, mine.yaw, 0, 'YXZ'); scene.updateMatrixWorld(true); };
  mine.aim();
  mine.point = target => { const p = target.slab.getWorldPosition(new THREE.Vector3()).project(camera); return [(p.x + 1) * 500, (1 - p.y) * 300]; };
  return mine;
}

test('lift and red door share the rear wall in either starting orientation, without changing tunnels', () => {
  for (const facing of [0, Math.PI / 2]) {
    const mine = fixture(facing), before = JSON.stringify(mine.maze.grid), layout = entranceLayout(mine.maze);
    const west = facing === 0;
    assert.equal(layout.lift.rotation, west ? Math.PI / 2 : 0);
    assert.equal(layout.door.rotation, layout.lift.rotation);
    for (const key of ['lift', 'door']) {
      assert.ok(Math.abs(mine[key].group.position.x / TILE - layout[key].x) < 1e-10);
      assert.ok(Math.abs(mine[key].group.position.z / TILE - layout[key].y) < 1e-10);
      assert.ok(mine[key].normal.dot(new THREE.Vector2(west ? 1 : 0, west ? 0 : 1)) > .999);
    }
    assert.ok(west ? layout.lift.y > layout.door.y : layout.lift.x < layout.door.x, 'lift is left of the door when looking back');
    assert.equal(JSON.stringify(mine.maze.grid), before);
    assert.ok(mine.lift.group.children.length > 15, 'lift has a cage, deck, slats, posts and cables');
    assert.ok(mine.door.slab.material.color.r > mine.door.slab.material.color.g * 2, 'door reads as red');
  }
});

test('nearby rays select the cage and adjacent door separately in both orientations', () => {
  for (const facing of [0, Math.PI / 2]) {
    const mine = fixture(facing), lift = mine.point(mine.lift), door = mine.point(mine.door);
    assert.ok(mine.liftView().dist < 2.1 && mine.liftView().facing > .75);
    assert.ok(mine.doorView().dist < 2.1 && mine.doorView().facing > .75);
    assert.equal(mine.hitsLift(...lift), true); assert.equal(mine.hitsDoor(...lift), false);
    assert.equal(mine.hitsDoor(...door), true); assert.equal(mine.hitsLift(...door), false);
    mine.yaw += Math.PI; mine.aim();
    assert.ok(mine.liftView().facing < 0 && mine.doorView().facing < 0);
    assert.equal(mine.hitsLift(500, 300), false); assert.equal(mine.hitsDoor(500, 300), false);
  }
});

test('entrance actions reject distant, behind-wall and blocked positions', () => {
  for (const facing of [0, Math.PI / 2]) for (const kind of ['lift', 'door']) {
    const mine = fixture(facing), target = mine[kind], p = target.group.position, n = target.normal;
    for (const distance of [2.11, -.05]) {
      mine.pos.set(p.x + n.x * distance, p.z + n.y * distance); mine.aim();
      assert.equal(mine.entranceView(target).dist, 99);
      assert.equal(mine.hitsEntrance(target, ...mine.point(target)), false);
    }
    mine.pos.set(TILE, TILE); mine.aim();
    for (const blocked of [1, 2]) {
      mine.maze.grid[1][1] = blocked;
      assert.equal(mine.entranceView(target).dist, 99);
      assert.equal(mine.hitsEntrance(target, ...mine.point(target)), false);
    }
  }
});

test('an intervening wall or rubble blocks entrance use even from a nearby open tile', () => {
  const mine = fixture(0), target = mine.lift;
  mine.pos.set(2.8, 3.2); target.group.position.set(3.5, 0, 4);
  target.normal.set(-Math.SQRT1_2, -Math.SQRT1_2); mine.yaw = Math.atan2(-.7, -.8);
  assert.ok(mine.entranceView(target).dist < 2.1);
  for (const blocked of [1, 2]) {
    mine.maze.grid[2][1] = blocked;
    assert.equal(mine.entranceView(target).dist, 99);
  }
});
