// The old-timers in a real browser: walk up to one, TALK for a tip, swing the pick (SWING on a phone, Space on a
// desktop) until they stumble, daze and go down, then pick up the smokes they dropped. Phone 390×844 plus a desktop
// keyboard check. Wild bugs are hidden so nothing but the old-timer is in frame; Greenhorn Gulch (no worms) by default.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir node scripts/e2e-npc-miners.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4230 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-npcs-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', MINE_TEST_TIER: process.env.MINE_TEST_TIER || '1', SLACK_BOT_TOKEN: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await wait(120); } return v; };
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  for (const [u, on] of [['/api/dev/horror', false], ['/api/dev/heeshee', false], ['/api/dev/steeze', false]]) await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ on }) }).catch(() => {});
  return { cookie, sid: cookie.split('=')[1] };
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine && window.__acidMine.npcs?.size > 0);
  await p.evaluate(() => { // nothing else in frame: no wild bugs (no STEEZE), no other miners, no visitor
    const s = window.__acidMine;
    for (const w of s.wilds.values()) s.scene.remove(w.group);
    s.wilds.clear(); s.setWilds = () => {}; s.miners?.set?.([]);
    if (s.stalker) { s.stalker.update = () => {}; s.stalker.present = false; }
  });
  return p;
}
function bfs(g, from, to) {
  const key = (x, y) => `${x},${y}`, prev = new Map([[key(from.x, from.y), null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (g[y]?.[x] === 0 && !prev.has(key(x, y))) { prev.set(key(x, y), c); q.push({ x, y }); } } }
  const out = []; for (let c = to; c; c = prev.get(key(c.x, c.y))) out.unshift(c); return out;
}
/** Walk (at a believable pace, so the heartbeat keeps up) to a spot in front of the old-timer and face them. */
async function approach(p) {
  const n = await p.evaluate(() => { const [x] = window.__acidMine.npcs.values(); return { id: x.id, x: x.x, y: x.y, wx: x.wx / 2.2, wy: x.wz / 2.2, f: x.facing }; });
  const g = await p.evaluate(() => window.__acidMine.maze.grid);
  const front = { x: n.wx + Math.sin(n.f) * 0.95, y: n.wy + Math.cos(n.f) * 0.95 };
  const route = bfs(g, { x: 1, y: 1 }, { x: Math.round(n.x + Math.round(Math.sin(n.f))), y: Math.round(n.y + Math.round(Math.cos(n.f))) });
  route.push(front);
  let cur = { x: 1, y: 1 };
  for (const t of route.slice(1)) {
    const d = Math.hypot(t.x - cur.x, t.y - cur.y), steps = Math.max(1, Math.ceil(d / 0.25)), face = Math.atan2(-(t.x - cur.x), -(t.y - cur.y));
    for (let i = 1; i <= steps; i++) {
      await p.evaluate(([x, y, a]) => { const m = window.__acidMine; m.pos.set(x * 2.2, y * 2.2); if (Number.isFinite(a)) m.yaw = a; }, [cur.x + (t.x - cur.x) * i / steps, cur.y + (t.y - cur.y) * i / steps, d > 0.01 ? face : NaN]);
      await wait(70);
    }
    cur = t;
  }
  await p.evaluate((f) => { window.__acidMine.yaw = f; window.__acidMine.pitch = -0.08; }, n.f); // facing back at them
  await wait(700);
  return n;
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ================= phone =================
  const P = await open(browser, await login('Ann', 'ann@npcs.test'), { w: 390, h: 844, m: true });
  const n = await approach(P);
  check(await until(() => P.isVisible('[data-test=npc-prompt]')), `phone: walking up to ${n.id} shows the prompt`);
  check(!(await P.isVisible('[data-test=npc-hit]')), 'phone: no fight button, only TALK');
  check(await P.isVisible('[data-test=swing]'), 'phone: the SWING button is there');
  check(await noScroll(P), 'phone: no scrolling');
  await shot(P, '1-meet');
  await P.tap('[data-test=npc-talk]');
  check(!!(await until(() => P.textContent('[data-test=npc-say]').catch(() => ''))), 'phone: TALK gives a tip');
  await wait(400); await shot(P, '2-tip');
  await P.tap('[data-test=npc-talk]'); await wait(300);
  const swing = async () => { await P.locator('[data-test=swing]').dispatchEvent('pointerdown'); };
  await swing(); await wait(110); await shot(P, '3-hit-stumble');
  check(await until(() => P.isVisible('[data-test=npc-hits]')), 'phone: a hit lands and is counted');
  for (let h = 2; h <= 6; h++) { await wait(380); await swing(); }
  await wait(130); await shot(P, '4-dazed');
  await wait(380); await swing(); await wait(380); await swing();
  check(await until(() => P.isVisible('[data-test=npc-down]')), 'phone: eight hits put them on the floor');
  await wait(1400);
  check(await P.isVisible('[data-test=npc-pickup]'), 'phone: smokes on the floor to pick up');
  await shot(P, '5-down-smokes');
  await P.tap('[data-test=npc-pickup]');
  check(await until(async () => /BUMMED SMOKES/.test(await P.textContent('.m-ticker'))), 'phone: pocketed, with the running count');
  await wait(300); await shot(P, '6-pickup');
  // a swing at empty tunnel just swings
  await P.evaluate(() => { window.__acidMine.yaw += Math.PI; }); await wait(400); await swing(); await wait(120);
  check(await P.evaluate(() => window.__acidMine.hands.whack > 0), 'phone: a swing at nothing still swings the pick');
  check(P.errs.length === 0, `phone: no page errors ${P.errs.join(' | ')}`);

  // ================= desktop: Space swings =================
  const D = await open(browser, await login('Bob', 'bob@npcs.test'), { w: 1280, h: 760 });
  await approach(D);
  check(await until(() => D.isVisible('[data-test=npc-prompt]')), 'desktop: prompt on walking up');
  check(!(await D.isVisible('[data-test=swing]')), 'desktop: no on-screen SWING (Space does it)');
  for (let h = 0; h < 3; h++) { await D.keyboard.press('Space'); await wait(380); }
  check(await until(async () => (await D.textContent('[data-test=npc-hits]').catch(() => '')).startsWith('●●●')), 'desktop: three Space swings, three hits');
  await shot(D, 'desktop-hits');
  check(D.errs.length === 0, `desktop: no page errors ${D.errs.join(' | ')}`);
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
finally { await browser?.close().catch(() => {}); srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
