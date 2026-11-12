import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMaze, bucketChain, veinChain, distFrom, FIRST_POOL_STEPS } from '../server/engine/maze.js';

test('bucket routes are repeatable, distinct, reachable, and retain the first deposit', () => {
  for (const cells of [7, 9, 11]) for (let seed = 0; seed < 80; seed++) {
    const maze = makeMaze(seed, cells, FIRST_POOL_STEPS[cells]);
    const chain = bucketChain(maze, seed);
    assert.deepEqual(chain, bucketChain(maze, seed));
    assert.deepEqual(chain[0], maze.pool);
    assert.ok(chain.length >= 1 && chain.length <= 8);
    assert.equal(new Set(chain.map(p => `${p.x},${p.y}`)).size, chain.length);
    assert.equal(chain.legs[0], maze.steps);
    chain.forEach((p, i) => {
      assert.equal(maze.grid[p.y][p.x], 0);
      assert.ok(p.x !== 1 || p.y !== 1);
      if (i) assert.equal(chain.legs[i], distFrom(maze.grid, chain[i - 1].x, chain[i - 1].y)[p.y][p.x]);
      assert.ok(chain.legs[i] > 0);
    });
  }
});

test('bucket routes shorten repeated travel while leaving legacy routes available', () => {
  let legacy = 0, bucket = 0;
  for (let seed = 0; seed < 100; seed++) {
    const maze = makeMaze(seed, 11, FIRST_POOL_STEPS[11]);
    legacy += veinChain(maze, seed).legs.slice(1).reduce((a, b) => a + b, 0);
    bucket += bucketChain(maze, seed).legs.slice(1).reduce((a, b) => a + b, 0);
  }
  assert.ok(bucket < legacy * 0.8, `${bucket} vs ${legacy}`);
});
