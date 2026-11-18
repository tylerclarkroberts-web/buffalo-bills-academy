// Wild bugs amble back and forth along a short route through the day's tunnels. Where one is depends only on its
// route and the clock, so the server and every miner's page agree without anything being sent or stored.
export const ROAM_STEP_MS = 2600; // one tile

/** A walk of up to `steps` tiles from `from` over tiles `open` allows, never turning straight back. */
export function roamRoute(from, steps, open, pick) {
  const path = [[from.x, from.y]];
  for (let at = from, prev = null, i = 0; i < steps; i++) {
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
      .filter((p) => open(p) && !(prev && p.x === prev.x && p.y === prev.y));
    if (!next.length) break; // a dead end: it turns round there
    prev = at; at = next[pick(next.length)]; path.push([at.x, at.y]);
  }
  return path;
}

/** Where a wild bug is at `now`, in tiles: along its `path` and back again. One with no route stays where it is. */
export function wildAt(wild, now) {
  const path = wild.path;
  if (!(path?.length > 1)) return { x: wild.x, y: wild.y };
  const span = path.length - 1, lap = (now / ROAM_STEP_MS) % (2 * span), at = lap <= span ? lap : 2 * span - lap;
  const i = Math.min(span - 1, Math.floor(at)), f = at - i, [ax, ay] = path[i], [bx, by] = path[i + 1];
  return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f };
}
