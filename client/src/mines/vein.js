// v67: one source of truth for "is there acid you can mine?" — shared by what the scene draws and what the MINE
// button allows. Before v67 every pool in the chain was drawn as glowing acid, but the server only lets you mine
// once the shift's vein time has passed; arriving early showed bright acid with no MINE button ("seeping" or "dry").
// Now a pool is drawn as acid only once the server says the acid is in, and acid you can see is always minable
// the moment you are in reach. Pure logic (no three.js / React) so node --test can drive it.
export const MINE_REACH = 1.9;      // in reach of the pool (metres from its centre)
export const LEAVE_REACH = 2.3;     // hysteresis: stay "in reach" until you step clearly away (no prompt flicker)
export const SEEP_RETRY_MS = 2500;  // standing at a seeping pool: ask again this often
export const AWAY_POLL_MS = 3000;   // walking: ask now and then so the current pool lights up when the acid comes in
export const ERROR_RETRY_MS = 3000;

export class VeinTracker {
  /** chain: pools from veinChain(); the first is the current one. */
  constructor(chain) {
    this.chain = chain; this.i = 0;
    this.flowing = false;   // the server said the acid is in (time-based; it never goes back)
    this.asking = false;
    this.waitUntil = 0;     // at-pool retry gate
    this.nextAway = 0;      // away-from-pool poll gate
    this.inReach = false;
  }
  get pool() { return this.chain[this.i]; }
  /** What the scene should draw at the current pool: 'acid' (glowing, minable) or 'damp' (not in yet). */
  get look() { return this.flowing ? 'acid' : 'damp'; }
  /** Update reach from the player's distance to the current pool centre (with hysteresis). */
  reach(d) { this.inReach = this.inReach ? d < LEAVE_REACH : d < MINE_REACH; return this.inReach; }
  /** The invariant: acid drawn + in reach => you can mine. */
  canMine() { return this.flowing && this.inReach; }
  /** Should we send a probe now? Returns 'pool' (standing at it), 'away', or null. */
  wantProbe(now) {
    if (this.flowing || this.asking) return null;
    if (this.inReach) return now >= this.waitUntil ? 'pool' : null;
    return now >= this.nextAway ? 'away' : null;
  }
  begin(kind) { this.asking = true; this.kind = kind; this.at = this.i; }
  /**
   * Apply a probe answer { flowing, seeping }. kind is what begin() was called with.
   * Returns { flowing:true } | { seeping:true } | { moved: pool } | {} (nothing changed).
   * Only a probe sent while standing at the *same* pool can declare it dry and move the vein on.
   */
  settle(r, now) {
    const kind = this.kind, at = this.at; this.asking = false; this.kind = null;
    if (this.flowing) return {};
    if (r?.flowing) { this.flowing = true; return { flowing: true }; }
    if (kind !== 'pool' || at !== this.i) { this.nextAway = now + AWAY_POLL_MS; return {}; }
    if (r?.seeping || this.i >= this.chain.length - 1) { this.waitUntil = now + SEEP_RETRY_MS; return { seeping: true }; }
    this.i += 1; this.waitUntil = 0; this.nextAway = now + AWAY_POLL_MS;
    return { moved: this.pool };
  }
  fail(now) { this.asking = false; this.kind = null; this.waitUntil = now + ERROR_RETRY_MS; this.nextAway = now + ERROR_RETRY_MS; }
}
