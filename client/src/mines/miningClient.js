// One request lane keeps a late mining pulse from overtaking release or clock-out.
export function createMiningClient({ send, onState, onError, schedule = setTimeout, cancel = clearTimeout, now = Date.now }) {
  let queue = Promise.resolve(), hold = null, timer, disposed = false, terminal = null;
  const clear = () => { cancel(timer); timer = undefined; hold = null; };
  function request(path, body, allowed = () => true) {
    const job = queue.then(async () => {
      if (terminal) return terminal;
      if (!allowed()) return null;
      const state = await send(path, body);
      if (state.result || Object.hasOwn(state, 'pending')) { terminal = state; clear(); }
      if (!disposed) onState(state);
      return state;
    });
    queue = job.catch(error => {
      clear();
      if (!disposed) onError(error);
    });
    return job;
  }
  function start(poolId) {
    if (disposed || terminal || hold?.poolId === poolId) return;
    clear();
    const current = { poolId }; hold = current;
    const pulse = action => {
      const sentAt = now();
      return request('/mines/extract', { poolId, action }, () => hold === current && !disposed).then(state => {
        if (!state || hold !== current || disposed || terminal) return;
        if (state.currentPoolId !== poolId || !state.pools?.find(pool => pool.id === poolId)?.remaining) { clear(); return; }
        timer = schedule(() => pulse('continue'), Math.max(0, 500 - (now() - sentAt)));
      }).catch(() => {});
    };
    pulse('start');
  }
  function stop() {
    const current = hold; clear();
    return current ? request('/mines/extract', { poolId: current.poolId, action: 'stop' }) : queue.then(() => terminal);
  }
  return {
    start, stop,
    probe: poolId => request('/mines/probe', { poolId }),
    async clockOut() { await stop(); return request('/mines/quit', {}); },
    dispose() { const stopped = stop(); disposed = true; stopped.catch(() => {}); },
  };
}

export function readMineReceipt(playerId, storage) {
  try { return playerId ? (storage ?? globalThis.localStorage)?.getItem(`acidMine.seenResult:${playerId}`) || null : null; }
  catch { return null; }
}

export function rememberMineReceipt(playerId, shiftId, storage) {
  try { if (playerId && shiftId) (storage ?? globalThis.localStorage)?.setItem(`acidMine.seenResult:${playerId}`, shiftId); }
  catch { /* The server will offer the receipt again if browser storage is unavailable. */ }
}
