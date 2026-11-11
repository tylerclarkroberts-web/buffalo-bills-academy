import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMaze, bucketChain, findSpots, FINDS, FIRST_POOL_STEPS } from '../client/src/mines/maze.js';

test('finds sit against real walls, off the pools and away from the start', () => {
  const seen = new Map();
  for (let seed = 1; seed <= 600; seed++) {
    const cells = [7, 9, 11][seed % 3], maze = makeMaze(seed, cells, FIRST_POOL_STEPS[cells]), pools = bucketChain(maze, seed);
    const spots = findSpots(maze, seed, pools);
    assert.deepEqual(findSpots(maze, seed, pools), spots, 'the same shift shows the same things after a reload');
    assert.equal(new Set(spots.map((s) => `${s.x},${s.y}`)).size, spots.length, 'one find to a tile');
    for (const s of spots) {
      assert.equal(maze.grid[s.y][s.x], 0); assert.equal(maze.grid[s.y + s.dy][s.x + s.dx], 1);
      assert.ok(maze.dist[s.y][s.x] >= 3);
      assert.ok(!pools.some((p) => p.x === s.x && p.y === s.y));
      seen.set(s.id, (seen.get(s.id) || 0) + 1);
    }
  }
  for (const f of FINDS) assert.ok(Math.abs(seen.get(f.id) / 600 - f.chance) < 0.07, `${f.id} turns up about as often as it should`);
});
