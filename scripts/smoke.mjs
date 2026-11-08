// Smoke test over HTTP. Starts a throwaway local server (or uses SMOKE_URL=https://... for a live one),
// has 3 simulated players create/join a table with a 2-second turn limit, play several hands,
// then stop acting so the server's timers auto-check/auto-fold. Closes the table at the end.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let base = process.env.SMOKE_URL; let child; let dataDir;
if (!base) {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-smoke-'));
  const port = 3900 + Math.floor(Math.random() * 90);
  child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/health`); break; } catch { await sleep(100); } }
}
const call = async (token, method, url, body) => {
  const r = await fetch(`${base}/api${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok && !url.endsWith('/action')) throw new Error(`${method} ${url}: ${j.error}`);
  return j;
};
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('  ✓', msg); };

try {
  console.log(`Smoke test against ${base}`);
  ok((await call(null, 'GET', '/health')).ok, 'health check');
  const ps = [];
  for (const name of ['Smoke-A', 'Smoke-B', 'Smoke-C']) ps.push(await call(null, 'POST', '/players', { name, hidden: true }));
  const { code } = await call(ps[0].token, 'POST', '/tables', { name: 'Smoke test', settings: { maxPlayers: 3, turnSeconds: 2, nextHandDelaySeconds: 1, buyIn: 500, smallBlind: 5, bigBlind: 10 } });
  ok(/^[A-Z2-9]{6}$/.test(code), `created table ${code}`);
  await call(ps[1].token, 'POST', `/tables/${code}/join`);
  await call(ps[2].token, 'POST', `/tables/${code}/join`);
  await call(ps[0].token, 'POST', `/tables/${code}/start`);
  const tok = Object.fromEntries(ps.map((p) => [p.id, p.token]));
  let actions = 0; const stop = Date.now() + 20000; let v;
  while (Date.now() < stop) {
    v = await call(ps[0].token, 'GET', `/tables/${code}`);
    if (v.handNumber > 4) break;
    if (v.hand?.toActPlayerId) {
      const mine = await call(tok[v.hand.toActPlayerId], 'GET', `/tables/${code}`);
      if (mine.legal) {
        const type = actions % 7 === 3 && mine.legal.canRaise ? 'raise' : mine.legal.canCheck ? 'check' : 'call';
        const r = await call(tok[v.hand.toActPlayerId], 'POST', `/tables/${code}/action`, { type, amount: mine.legal.minRaiseTo, handNumber: mine.hand.number });
        if (!r.error) actions++;
      }
    } else await sleep(200);
  }
  ok(v.handNumber >= 4, `played ${v.handNumber - 1}+ complete hands with ${actions} actions`);
  const sum = (x) => x.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0) + (x.hand ? x.hand.pot : 0);
  ok(sum(v) === 1500, 'all 1500 chips accounted for');
  console.log('  … nobody acts for 7 seconds (2-second turn limit)');
  await sleep(7000);
  v = await call(ps[0].token, 'GET', `/tables/${code}`);
  const timeouts = v.log.filter((l) => /ran out of time/.test(l.text));
  ok(timeouts.length >= 2, `server auto-acted ${timeouts.length} timed-out turns, e.g. "${timeouts[0]?.text}"`);
  ok(sum(v) === 1500, 'chips still conserved after timeouts');
  const closed = await call(ps[0].token, 'POST', `/tables/${code}/close`);
  ok(closed.status === 'closed', 'host closed the table');
} catch (e) {
  console.error('FAIL:', e.message); process.exitCode = 1;
} finally {
  child?.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(process.exitCode ? 'SMOKE TEST FAILED' : 'SMOKE TEST PASSED');
