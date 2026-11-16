// v79: acid worms. On rougher days they leap out of the dark onto your goggles and sit there, wriggling, until you
// cut them off with the bowie knife. Pure logic (no React, no three.js) so node --test can drive it; the browser
// draws them (Worms.jsx). Client-only scenery like the finds: the server never hears about a worm.
//
// They never land while you are in reach of acid you can see, during a battle, behind the door or before the
// first few seconds of a shift: if you can see acid you can always mine it, and nothing here steals that.
export const WORM_GRACE_MS = 6000;

export class WormSwarm {
  /** row: a TIERS row (worms a minute, wormSize, wormMax). rand: 0..1. */
  constructor(row, rand = Math.random) {
    this.rate = row?.worms || 0; this.size = row?.wormSize || 0; this.max = row?.wormMax || 0;
    this.rand = rand; this.worms = []; this.n = 0; this.clock = 0; this.cuts = 0;
  }
  /** Advance by dt ms. `hold`: no new worms right now. Returns the worm that just landed, or null. */
  tick(dt, { hold = false } = {}) {
    this.clock += dt;
    if (!this.rate || hold || this.clock < WORM_GRACE_MS || this.worms.length >= this.max) return null;
    if (this.rand() >= 1 - Math.exp(-this.rate * dt / 60000)) return null;
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
}
