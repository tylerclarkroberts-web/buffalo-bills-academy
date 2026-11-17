// v71: the shared mine's heartbeat. Every ~250 ms the page tells the server where you are standing and
// hears back who else is in the tunnels, whether someone is right in front of you with their back turned,
// and how your bug battle is going. One request at a time; a slow answer just skips a beat.
import { behind, sees, touching } from '../../../server/engine/pvp-geometry.js';

export const PVP_TICK_MS = 250;

export function minerHint({ others = [], shield, ambush }, pose, grid) {
  if (!others.length) return '';
  const count = `⛏ ${others.length} OTHER MINER${others.length > 1 ? 'S' : ''} DOWN HERE`;
  if (ambush) return count;
  const distance = (o) => Math.hypot(o.x - pose.x, o.y - pose.y);
  const miner = others.filter(o => sees(grid, pose, o)).sort((a, b) => distance(a) - distance(b))[0];
  if (!miner) return count;
  if (shield === 'greenhorn') return 'YOU HAVE NEW-MINER PROTECTION';
  if (shield === 'elevator') return 'YOU HAVE ELEVATOR PROTECTION';
  const name = miner.name.toUpperCase();
  if (miner.shield === 'greenhorn') return `${name} HAS NEW-MINER PROTECTION`;
  if (miner.shield === 'elevator') return `${name} HAS ELEVATOR PROTECTION`;
  if (miner.shield === 'battle') return `${name} IS IN A BATTLE`;
  if (miner.cooling) return `2-HOUR TRUCE WITH ${name}`;
  if (!behind(miner, pose)) return 'MEET FACE TO FACE TO START A BUG BATTLE';
  return touching(pose, miner) ? 'STAY BEHIND THEM AND OUT OF SIGHT' : 'GET CLOSE BEHIND THEM TO ASSASSINATE';
}

export function createPvpClient({ send, pose, onView, onError, path = '/mines/pvp/tick', intervalMs = PVP_TICK_MS, paused = () => false, setTimer = setInterval, clearTimer = clearInterval }) {
  let busy = false, fresh = true, stopped = false, failures = 0;
  const beat = async () => {
    if (busy || stopped || paused()) return;
    const p = pose(); if (!p) return;
    busy = true;
    try {
      const view = await send(path, { ...p, ...(fresh ? { fresh: true } : {}) }); // the picnic beats the same way with its own path and pose
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
export const pvpMove = (send, battleId, moves, have) => send('/mines/pvp/move', { battleId, moves, have });
export const pvpAmbush = (send, target) => send('/mines/pvp/ambush', { target });
export const pvpForfeit = (send) => send('/mines/pvp/forfeit', {});
export const pvpWild = (send, wildId) => send('/mines/pvp/wild', { wildId });
export const pvpJar = (send, battleId, have) => send('/mines/pvp/jar', { battleId, have });
