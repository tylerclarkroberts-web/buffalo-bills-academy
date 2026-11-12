// Who can see whom in the shared daily mine, and what counts as "from behind". Pure and shared with the browser.
// Positions are in tiles (the maze grid; a miner at tile centre x has x = integer). Yaw follows the scene: facing
// is (-sin yaw, -cos yaw) in (x, y).
export const SIGHT_TILES = 5;            // about where the headlamp and fog give out in Shaft 7
export const VIEW_HALF_ANGLE = Math.PI * 50 / 180; // a 100-degree cone: what fits on a phone screen
export const TOUCH_TILES = 0.75;         // close enough to touch (a tile is 2.2 m)
export const BEHIND_ANGLE = Math.PI / 2; // "from behind" means in the back half, not just off to the side

export const facingOf = (yaw) => ({ x: -Math.sin(yaw), y: -Math.cos(yaw) });

/** Angle between where `a` faces and the direction from `a` to `b` (0 = dead ahead, PI = directly behind). */
export function bearing(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  const f = facingOf(a.yaw);
  return Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.y * dy) / d)));
}

/** True when nothing but tunnel lies on the straight line between two points (sampled every tenth of a tile). */
export function lineOfSight(grid, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 10));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(a.x + (dx * i) / n), y = Math.round(a.y + (dy * i) / n);
    if (grid[y]?.[x] !== 0) return false;
  }
  return true;
}

/** Can `a` see `b` right now: within sight distance, inside a's view cone and not behind rock. */
export function sees(grid, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d > SIGHT_TILES) return false;
  if (d <= TOUCH_TILES * 0.5) return true; // bumping into someone: you notice
  return bearing(a, b) <= VIEW_HALF_ANGLE && lineOfSight(grid, a, b);
}

export const touching = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) <= TOUCH_TILES;

/** The geometry half of a backstab: touching, and the attacker is in the victim's back half. */
export function behind(victim, attacker) {
  return bearing(victim, attacker) > BEHIND_ANGLE;
}

/** An open tunnel tile under this point. */
export function onTunnel(grid, p) {
  return grid[Math.round(p.y)]?.[Math.round(p.x)] === 0;
}
