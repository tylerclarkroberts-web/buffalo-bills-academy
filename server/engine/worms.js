// v79: acid worms. On rougher days they leap out of the dark onto your goggles and sit there, wriggling, until you
// cut them off with the bowie knife. Pure logic (no React, no three.js) so node --test can drive it; the browser
// draws them (Worms.jsx). Client-only scenery like the finds: the server never hears about a worm.
//
// They never land while you are in reach of acid you can see, during a battle, behind the door or before the
// first few seconds of a shift: you can always start mining a pool you can reach. Once one is already on you,
// after a short pause it drinks from the bucket you are carrying (server-authoritative).
export const WORM_GRACE_MS = 6000;
export const WORM_SUCK_DELAY_MS = 1000;
export const WORM_SUCK_PER_SEC = 2; // bucket units (the same ones the HUD counts) per attached worm
export const WORM_SUCK_MAX_GAP_MS = 2000; // a late heartbeat only bills a couple of seconds, not a whole AFK
export const WORM_TILE = 2.2; // must match scene.js TILE
export const WORM_MINE_REACH = 1.9; // must match vein.js MINE_REACH (metres): no new landings this close to a pool

export class WormSwarm {
  /** row: a TIERS row (worms a minute, wormSize, wormMax). rand: 0..1. */
  constructor(row, rand = Math.random) {
    this.rate = row?.worms || 0; this.size = row?.wormSize || 0; this.max = row?.wormMax || 0;
    this.rand = rand; this.worms = []; this.n = 0; this.clock = 0; this.cuts = 0;
  }
  /** Advance by dt ms. `hold`: no new worms right now. `scale`: how thick they are here (0 at the lift, 2 at the far
   *  end of the shaft, 1 on average). Returns the worm that just landed, or null. */
  tick(dt, { hold = false, scale = 1 } = {}) {
    this.clock += dt;
    if (!this.rate || hold || this.clock < WORM_GRACE_MS || this.worms.length >= this.max) return null;
    if (this.rand() >= 1 - Math.exp(-this.rate * scale * dt / 60000)) return null;
    return this.spawn();
  }
  /** One worm, somewhere in the middle of the view (never over the HUD corners). */
  spawn() {
    const r = this.rand;
    const w = { id: ++this.n, x: 0.22 + r() * 0.56, y: 0.3 + r() * 0.36, size: this.size * (0.85 + r() * 0.3), rot: Math.round((r() - 0.5) * 70), flip: r() < 0.5, at: this.clock };
    this.worms.push(w); return w;
  }
  /** The knife: cut one worm off (the given one, or the one that has been on you longest). Returns it, or null. */
  slash(id = null) {
    const i = id == null ? 0 : this.worms.findIndex((w) => w.id === id);
    if (i < 0 || !this.worms.length) return null;
    const [w] = this.worms.splice(i, 1); this.cuts++; return w;
  }
  /** Rough share of the view covered right now (each worm's splat as a disc on a 16:9 view, capped at 1). */
  cover() {
    const area = this.worms.reduce((a, w) => a + Math.PI * (w.size / 2) ** 2 * (9 / 16), 0);
    return Math.min(1, area);
  }
  clear() { this.worms = []; }
  /** Replace the live list with the server's (the knife still cuts locally for a snappy slash). */
  sync(list = []) {
    this.worms = (list || []).map((w) => ({ ...w }));
    for (const w of this.worms) if (w.id > this.n) this.n = w.id;
    return this.worms;
  }
}

/**
 * Bucket units drained by `worms` between t0 and t1 (ms on the same clock as each worm's `at`).
 * Each worm starts drinking WORM_SUCK_DELAY_MS after it lands, at WORM_SUCK_PER_SEC, and never
 * before that. t1 <= t0 is zero. The caller clamps the result to what is actually in the bucket.
 */
export function suckUnits(worms, t0, t1) {
  if (!(t1 > t0) || !worms?.length) return 0;
  let units = 0;
  for (const w of worms) {
    const start = (Number(w.at) || 0) + WORM_SUCK_DELAY_MS;
    const from = Math.max(t0, start);
    if (t1 > from) units += WORM_SUCK_PER_SEC * (t1 - from) / 1000;
  }
  return units;
}

export function wormIsSucking(w, clock) {
  return (clock - (Number(w?.at) || 0)) >= WORM_SUCK_DELAY_MS;
}

/** What the browser needs to draw one worm, including whether it has started drinking. */
export function wormPublic(w, clock) {
  if (!w) return null;
  return { id: w.id, x: w.x, y: w.y, size: w.size, rot: w.rot, flip: !!w.flip, at: w.at, sucking: wormIsSucking(w, clock) };
}
