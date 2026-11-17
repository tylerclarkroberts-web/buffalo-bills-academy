// Inspection confirms the deposit; reach controls the MINE prompt. Only failed requests need a retry delay.
export const MINE_REACH = 1.9;      // in reach of the pool (metres from its centre)
export const LEAVE_REACH = 2.3;     // hysteresis: stay "in reach" until you step clearly away (no prompt flicker)
export const ERROR_RETRY_MS = 3000;

export class VeinTracker {
  constructor() {
    this.flowing = false;
    this.inspected = false;
    this.asking = false;
    this.retryAt = 0;
    this.inReach = false;
  }
  /** Until inspection succeeds, don't promise acid the server hasn't confirmed. */
  get look() { return this.flowing ? 'acid' : 'damp'; }
  /** Update reach from the player's distance to the current pool centre (with hysteresis). */
  reach(d) { this.inReach = this.inReach ? d < LEAVE_REACH : d < MINE_REACH; return this.inReach; }
  /** The invariant: acid drawn + in reach => you can mine. */
  canMine() { return this.flowing && this.inReach; }
  wantProbe(now) {
    return this.inReach && !this.flowing && !this.inspected && !this.asking && now >= this.retryAt;
  }
  fail(now) { this.asking = false; this.retryAt = now + ERROR_RETRY_MS; }
}
