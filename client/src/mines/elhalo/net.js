// EL HALO networking: one Server-Sent Events stream down (the whole match ~10x a second) and small JSON posts up
// (where you are, what you fired). The app already speaks SSE for tables, so no new dependency or socket server.
// Free play: these endpoints never touch money.
const BASE = '/api/elhalo';

export function connect({ onSnap, onStatus = () => {} }) {
  let es = null, closed = false, retry = 0, timer = 0;
  const open = () => {
    if (closed) return;
    es = new EventSource(`${BASE}/stream`, { withCredentials: true });
    es.onopen = () => { retry = 0; onStatus('open'); };
    es.onmessage = (m) => { try { onSnap(JSON.parse(m.data)); } catch { /* a torn frame: the next one is ten ms away */ } };
    es.addEventListener('bye', () => { onStatus('replaced'); close(); });
    es.onerror = () => {
      onStatus('lost');
      if (es && es.readyState === 2) { es = null; clearTimeout(timer); timer = setTimeout(open, Math.min(8000, 800 * 2 ** retry++)); }
    };
  };
  const close = () => { closed = true; clearTimeout(timer); if (es) es.close(); es = null; };
  open();
  return { close, reopen: () => { if (closed) { closed = false; retry = 0; open(); } } };
}

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}), keepalive: path === '/leave' });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, data };
}
export const join = () => post('/join');
export const leave = () => post('/leave');

// Inputs go up at ~10 Hz; at most two in flight, so a slow phone never builds a queue. Events wait for the next send.
export function inputSender() {
  let inFlight = 0;
  return {
    send(msg) {
      if (inFlight >= 2) return false;
      inFlight++;
      post('/input', msg).catch(() => null).finally(() => { inFlight--; });
      return true;
    },
    get busy() { return inFlight; },
  };
}
