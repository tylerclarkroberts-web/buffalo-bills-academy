// Two (then three) real browsers in today's shared mine (v71). Boots a throwaway server with the PvP test hook
// (greenhorn rules and the clock-in grace off), clocks everyone in, walks them to the same tunnel by the server's
// own speed rules, and checks: you can see the other miner, the ASSASSINATE prompt shows behind an unaware miner,
// meeting face to face starts a Game Boy bug battle on both screens, the battle plays out, and the loser gets the
// receipt. A third miner then stabs the winner in the back.   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-pvp.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4080 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pvp-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', PVP_TEST: '1', PVP_TEST_GRACE_MS: '0', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: '300', BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const post = async (u, b) => { const x = await fetch(B + '/api' + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(b || {}) }); return x.json(); };
  return { name, cookie, sid: cookie.split('=')[1], post };
}
/** A hatched bug of a given species: grab the forced egg on a throwaway shift, let it hatch, pick the species. */
async function hatch(me, species) {
  const s = await me.post('/mines/start', { rulesVersion: 2 });
  await me.post('/mines/egg', { shiftId: s.shiftId });
  await me.post('/mines/quit', { shiftId: s.shiftId });
  await wait(500); await fetch(B + '/api/barn', { headers: { cookie: me.cookie } });
  await me.post('/dev/species', { id: species });
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
  const lecture = await p.$('text=/FOREMAN/i'); void lecture;
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine);
  await p.waitForTimeout(600); return p;
}
const grid = (p) => p.evaluate(() => window.__acidMine.maze.grid);
function bfs(g, from, to) {
  const key = (x, y) => `${x},${y}`, prev = new Map([[key(from.x, from.y), null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (g[y]?.[x] === 0 && !prev.has(key(x, y))) { prev.set(key(x, y), c); q.push({ x, y }); } } }
  const out = []; for (let c = to; c; c = prev.get(key(c.x, c.y))) out.unshift(c); return out;
}
/** Walk tile centre to tile centre at ~2 tiles/s (the server allows ~2.5), then stand at an exact spot facing `yaw`. */
async function walk(p, g, to, yaw) {
  const at = await p.evaluate(() => ({ x: Math.round(window.__acidMine.pos.x / 2.2), y: Math.round(window.__acidMine.pos.y / 2.2) }));
  const path = bfs(g, at, { x: Math.round(to.x), y: Math.round(to.y) }); path.push(to);
  let cur = await p.evaluate(() => ({ x: window.__acidMine.pos.x / 2.2, y: window.__acidMine.pos.y / 2.2 }));
  for (const n of path.slice(1)) {
    const d = Math.hypot(n.x - cur.x, n.y - cur.y), steps = Math.max(1, Math.ceil(d / 0.25));
    const face = Math.atan2(-(n.x - cur.x), -(n.y - cur.y));
    for (let i = 1; i <= steps; i++) {
      const x = cur.x + (n.x - cur.x) * i / steps, y = cur.y + (n.y - cur.y) * i / steps;
      await p.evaluate(([x, y, a]) => { const m = window.__acidMine; m.pos.set(x * 2.2, y * 2.2); if (Number.isFinite(a)) m.yaw = a; }, [x, y, d > 0.01 ? face : NaN]);
      await wait(125);
    }
    cur = n;
  }
  await p.evaluate((a) => { window.__acidMine.yaw = a; }, yaw); await wait(600);
}
const EAST = -Math.PI / 2, WEST = Math.PI / 2;

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 15000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const ann = await login('Ann', 'ann@pvp.test'), bob = await login('Bob', 'bob@pvp.test'), cal = await login('Cal', 'cal@pvp.test');
  await hatch(ann, 'bombardier'); // Ann brings a real bug; Bob has none and borrows the Foreman's
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, ann, { w: 390, h: 844, m: true });
  const Bp = await open(browser, bob, { w: 1280, h: 720 });
  const g = await grid(A);
  check(JSON.stringify(g) === JSON.stringify(await grid(Bp)), 'both miners got the same maze today');
  // a straight east-west tunnel, out of the elevator's safe zone, as close as possible
  let spot = null, best = 1e9;
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 4; x++) {
    if ([0, 1, 2, 3].every((k) => g[y][x + k] === 0) && Math.hypot(x - 1, y - 1) > 4) { const l = bfs(g, { x: 1, y: 1 }, { x, y }).length; if (l > 1 && l < best) { best = l; spot = { x, y }; } }
  }
  check(!!spot, `found a straight tunnel at ${JSON.stringify(spot)}`);
  // Bob walks in first and stands with his back to the west; Ann follows him in
  await walk(Bp, g, { x: spot.x + 2, y: spot.y }, EAST);
  await walk(A, g, { x: spot.x, y: spot.y }, EAST);
  await A.waitForSelector('[data-test=others]', { timeout: 4000 }).catch(() => null);
  check(!!(await A.$('[data-test=others]')), 'Ann sees "1 OTHER MINER DOWN HERE"');
  const drawn = await A.evaluate(() => window.__acidMine.miners.map.size);
  check(drawn === 1, `Ann's scene draws Bob (${drawn})`);
  await shot(A, '1-maze-other-player-phone');
  // sneak up: right behind him, he is still facing east
  await walk(A, g, { x: spot.x + 1.45, y: spot.y }, EAST);
  await A.waitForSelector('[data-test=ambush-prompt]', { timeout: 4000 }).catch(() => null);
  check(!!(await A.$('[data-test=ambush-prompt]')), 'the ASSASSINATE prompt shows behind an unaware Bob');
  check(!(await Bp.$('[data-test=ambush-prompt]')), 'Bob gets no prompt (he cannot see her)');
  await shot(A, '2-assassinate-prompt-phone');
  const noScroll = await A.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  check(noScroll, 'phone: no page scroll with the prompt up');
  // ...but Ann holds off. Bob turns around: they see each other and they are touching. Bugs out.
  await Bp.evaluate((a) => { window.__acidMine.yaw = a; }, WEST);
  await Promise.all([A.waitForSelector('[data-test=bug-battle]', { timeout: 6000 }).catch(() => null), Bp.waitForSelector('[data-test=bug-battle]', { timeout: 6000 }).catch(() => null)]);
  check(!!(await A.$('[data-test=bug-battle]')) && !!(await Bp.$('[data-test=bug-battle]')), 'face to face and touching: a bug battle opens on both screens');
  check(!(await A.$('[data-test=ambush-prompt]')), 'no assassinate prompt once he has seen you');
  await wait(400);
  await shot(A, '3-bug-battle-phone'); await shot(Bp, '3-bug-battle-desktop');
  const fits = await A.evaluate(() => { const r = document.querySelector('.gb-screen').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  check(fits, 'phone: the whole battle screen fits without scrolling');
  check(await A.evaluate(() => !!document.querySelector('[data-test=battle-run]')), 'RUN is on screen');
  // play it out: both pick their first usable move, turn after turn
  let over = false;
  for (let t = 0; t < 40 && !over; t++) {
    for (const p of [A, Bp]) {
      const btn = await p.$('[data-test^=battle-move-]:not([disabled])');
      if (btn) await btn.click().catch(() => {});
    }
    await wait(1200);
    if (t === 1) { await shot(A, '4-bug-battle-midfight-phone'); }
    over = !!(await A.$('[data-test=battle-over]')) && !!(await Bp.$('[data-test=battle-over]'));
  }
  await wait(1500);
  check(over, 'the battle ends on both screens');
  await shot(A, '5-battle-over-phone'); await shot(Bp, '5-battle-over-desktop');
  const annWon = await A.evaluate(() => document.querySelector('[data-test=battle-over]')?.textContent.includes('YOU WON'));
  const [W, L, winner] = annWon ? [A, Bp, ann] : [Bp, A, bob];
  console.log('     winner:', winner.name);
  await L.click('[data-test=battle-done]'); await L.waitForSelector('[data-test=pvp-receipt]', { timeout: 5000 }).catch(() => null);
  check(!!(await L.$('[data-test=pvp-receipt]')), 'the loser gets a YOUR BUG LOST receipt');
  await shot(L, '6-loser-receipt');
  await W.click('[data-test=battle-done]'); await wait(500);
  check(!!(await W.$('.m-canvas')) && !(await W.$('[data-test=bug-battle]')), 'the winner is back in the tunnels');
  // Cal comes down and stabs the winner in the back
  const C = await open(browser, cal, { w: 1280, h: 720 });
  const wpos = await W.evaluate(() => ({ x: window.__acidMine.pos.x / 2.2, y: window.__acidMine.pos.y / 2.2 }));
  const wyaw = await W.evaluate(() => window.__acidMine.yaw);
  // the winner faces along the tunnel; Cal comes in from behind
  const behind = { x: wpos.x + Math.sin(wyaw) * 0.6, y: wpos.y + Math.cos(wyaw) * 0.6 };
  const away = { x: wpos.x + Math.sin(wyaw) * 3, y: wpos.y + Math.cos(wyaw) * 3 };
  const g2 = await grid(C);
  if (g2[Math.round(away.y)]?.[Math.round(away.x)] === 0) await walk(C, g2, away, wyaw);
  await walk(C, g2, behind, wyaw);
  await C.waitForSelector('[data-test=ambush-prompt]', { timeout: 5000 }).catch(() => null);
  check(!!(await C.$('[data-test=ambush-prompt]')), 'Cal gets the ASSASSINATE prompt behind the winner');
  await shot(C, '7-assassinate-prompt-desktop');
  await C.keyboard.press('x'); await wait(800);
  const ticker = await C.evaluate(() => document.querySelector('.m-ticker')?.textContent || '');
  check(/FROM BEHIND/.test(ticker), `Cal's ticker reports the hit: ${ticker}`);
  await W.waitForSelector('[data-test=pvp-receipt]', { timeout: 5000 }).catch(() => null);
  check(!!(await W.$('[data-test=pvp-receipt]')), 'the winner\'s shift ends with an AMBUSHED receipt');
  await shot(W, '8-ambushed-receipt'); await shot(C, '8-after-the-hit-desktop');
  for (const [n, p] of [['Ann', A], ['Bob', Bp], ['Cal', C]]) check(!p.errs.length, `${n}: no page errors ${p.errs.join(' | ')}`);
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); srv.kill(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
