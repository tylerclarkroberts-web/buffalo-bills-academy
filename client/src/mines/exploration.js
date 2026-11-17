export function revealExploration(explored, grid, x, y, pools, currentPoolId) {
  x = Math.round(x); y = Math.round(y);
  if (grid[y]?.[x] !== 0) return false;
  const before = explored.tiles.size + explored.pools.size;
  const visible = new Set([`${x},${y}`]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let step = 1; step <= 2; step++) {
      const X = x + dx * step, Y = y + dy * step, tile = grid[Y]?.[X];
      if (tile == null) break;
      visible.add(`${X},${Y}`);
      if (tile !== 0) break;
    }
  }
  for (const tile of visible) explored.tiles.add(tile);
  for (const pool of pools) {
    if (visible.has(`${pool.x},${pool.y}`) && (pool.quantity != null || pool.id === currentPoolId)) explored.pools.add(pool.id);
  }
  return explored.tiles.size + explored.pools.size !== before;
}

export function markWild(explored, wild) {
  if (!wild || explored.wilds.has(wild.id)) return false;
  explored.wilds.add(wild.id);
  explored.tiles.add(`${wild.x},${wild.y}`);
  return true;
}

export function readExploration(playerId, shiftId, grid, pools, storage, wilds = []) {
  const empty = { tiles: new Set(), pools: new Set(), wilds: new Set() };
  try {
    if (!playerId || !shiftId) return empty;
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(`acidMine.map:${playerId}`) || 'null');
    if (saved?.shiftId !== shiftId || !Array.isArray(saved.tiles) || !Array.isArray(saved.pools)) return empty;
    if (saved.tiles.length > grid.length * grid.length || saved.pools.length > pools.length) return empty;
    const validTile = tile => {
      if (typeof tile !== 'string' || !/^\d+,\d+$/.test(tile)) return false;
      const [x, y] = tile.split(',').map(Number);
      return tile === `${x},${y}` && grid[y]?.[x] != null;
    };
    if (!saved.tiles.every(validTile) || !saved.pools.every(id => pools.some(p => p.id === id && saved.tiles.includes(`${p.x},${p.y}`)))) return empty;
    const known = wilds.filter(w => Array.isArray(saved.wilds) && saved.wilds.includes(w.id) && saved.tiles.includes(`${w.x},${w.y}`));
    return { tiles: new Set(saved.tiles), pools: new Set(saved.pools), wilds: new Set(known.map(w => w.id)) };
  } catch { return empty; }
}

export function rememberExploration(playerId, shiftId, explored, storage) {
  try {
    if (playerId && shiftId) (storage ?? globalThis.localStorage)?.setItem(`acidMine.map:${playerId}`, JSON.stringify({ shiftId, tiles: [...explored.tiles], pools: [...explored.pools], wilds: [...(explored.wilds || [])] }));
  } catch { /* Without browser storage the chart lasts until this page closes. */ }
}
