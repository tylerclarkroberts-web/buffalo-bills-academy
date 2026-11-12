// v71: the shared mine's heartbeat. Every ~250 ms the page tells the server where you are standing and
// hears back who else is in the tunnels, whether someone is right in front of you with their back turned,
// and how your bug battle is going. One request at a time; a slow answer just skips a beat.
export const PVP_TICK_MS = 250;

export function createPvpClient({ send, pose, onView, onError, intervalMs = PVP_TICK_MS, paused = () => false, setTimer = setInterval, clearTimer = clearInterval }) {
  let busy = false, fresh = true, stopped = false, failures = 0;
  const beat = async () => {
    if (busy || stopped || paused()) return;
    const p = pose(); if (!p) return;
    busy = true;
    try {
      const view = await send('/mines/pvp/tick', { x: p.x, y: p.y, yaw: p.yaw, ...(fresh ? { fresh: true } : {}) });
      fresh = false; failures = 0;
      if (!stopped) onView(view);
    } catch (e) {
      failures++;
      if (!stopped) onError?.(e, failures);
    } finally { busy = false; }
  };
  const id = setTimer(beat, intervalMs);
  return {
    beat,
    /** The page restarted you at the elevator (a reload): say so on the next beat. */
    restart() { fresh = true; },
    dispose() { stopped = true; clearTimer(id); },
  };
}

/** Battle calls go straight through; the next heartbeat shows the result. */
export const pvpMove = (send, battleId, move) => send('/mines/pvp/move', { battleId, move });
export const pvpAmbush = (send, target) => send('/mines/pvp/ambush', { target });
export const pvpForfeit = (send) => send('/mines/pvp/forfeit', {});
