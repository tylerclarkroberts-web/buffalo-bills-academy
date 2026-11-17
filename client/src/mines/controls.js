export const WALK_SPEED = 3.6; // m/s, shared by the miner and the guide bug

// A fixed deadzone absorbs sideways thumb drift without a steering jump while walking.
export function stickTurn(x) {
  return Math.abs(x) <= 0.3 ? 0 : Math.sign(x) * Math.min(1, (Math.abs(x) - 0.3) / 0.7) * 0.9;
}
