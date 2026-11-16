// v89: mine dances in real browsers. Two miners in today's shared mine (a phone and a desktop), a few tiles apart in
// the same tunnel: the desktop opens the picker with B and dances with the number keys, the phone uses the ♫ button
// and the 3×3 picker; walking (a key, or the stick) stops it; each sees the other's dance through the heartbeat.
// A third, landscape phone with reduced motion checks the picker fits and nothing spins. With OUT set: screenshots,
// and with MONTAGE=1 a GIF of all nine.   npm run build && PLAYWRIGHT_DIR=... OUT=dir [MONTAGE=1] node scripts/e2e-dances.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4180 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-dance-'));
// No PVP_TEST: everyone here is a greenhorn, so nobody can fight or stab, which is all this needs.
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie, sid: cookie.split('=')[1] };
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: vp.reduce ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
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
async function walk(p, g, to, yaw) {
  const at = await p.evaluate(() => ({ x: Math.round(window.__acidMine.pos.x / 2.2), y: Math.round(window.__acidMine.pos.y / 2.2) }));
  const route = bfs(g, at, { x: Math.round(to.x), y: Math.round(to.y) }); route.push(to);
  let cur = await p.evaluate(() => ({ x: window.__acidMine.pos.x / 2.2, y: window.__acidMine.pos.y / 2.2 }));
  for (const n of route.slice(1)) {
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
const sees = (p, name) => p.evaluate((n) => { for (const m of window.__acidMine.miners.map.values()) if (m.key.endsWith(`:${n}`)) return m.dance || null; return 'missing'; }, name);
const until = async (fn, want, ms = 4000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v === want) return v; await wait(150); } return v; };
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
const pickerFits = (p) => p.evaluate(() => { const r = document.querySelector('[data-test=dance-picker]')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 15000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const ann = await login('Ann', 'ann@dance.test'), bob = await login('Bob', 'bob@dance.test'), cal = await login('Cal', 'cal@dance.test');
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, ann, { w: 390, h: 844, m: true });
  const D = await open(browser, bob, { w: 1280, h: 720 });
  const g = await grid(A);
  let spot = null, best = 1e9;
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 5; x++) {
    if ([0, 1, 2, 3, 4].every((k) => g[y][x + k] === 0) && Math.hypot(x - 1, y - 1) > 4) { const l = bfs(g, { x: 1, y: 1 }, { x, y }).length; if (l > 1 && l < best) { best = l; spot = { x, y }; } }
  }
  check(!!spot, `found a straight tunnel at ${JSON.stringify(spot)}`);
  await walk(D, g, { x: spot.x + 3, y: spot.y }, WEST); // Bob looks west at Ann
  await walk(A, g, { x: spot.x, y: spot.y }, EAST);     // Ann looks east at Bob, three tiles off
  check(await until(() => A.evaluate(() => window.__acidMine.miners.map.size), 1) === 1, 'Ann sees Bob');

  // ---- desktop: B opens the picker, Esc closes it, number keys dance ----
  await D.keyboard.press('b');
  check(!!(await D.$('[data-test=dance-picker]')), 'desktop: B opens the dance picker');
  check((await D.$$('[data-test=dance-picker] button')).length === 9, 'nine dances in the picker');
  check(await pickerFits(D), 'desktop: picker fits on screen');
  await shot(D, 'picker-desktop-1280x720');
  await D.keyboard.press('Escape');
  check(!(await D.$('[data-test=dance-picker]')), 'desktop: Esc closes it');
  await D.keyboard.press('3');
  check(await D.evaluate(() => window.__acidMine.dance) === 'robot', 'desktop: 3 starts The Robot');
  check(await until(() => sees(A, 'Bob'), 'robot') === 'robot', 'Ann sees Bob doing The Robot');
  check(/BEEP/.test(await D.textContent('.m-ticker')), 'the ticker announces it');
  check(await D.textContent('[data-test=dance-btn]').then((t) => t.includes('STOP')), 'desktop: the ♫ button turns into STOP');
  await wait(700); await shot(A, 'seen-robot-from-phone');
  await D.keyboard.press('7');
  check(await until(() => sees(A, 'Bob'), 'swing') === 'swing', 'switching (7, The Swing) reaches Ann');
  const yaw0 = await D.evaluate(() => window.__acidMine.yaw);
  await D.mouse.move(640, 360); await D.mouse.down(); await D.mouse.move(760, 360, { steps: 5 }); await D.mouse.up();
  check(Math.abs(await D.evaluate(() => window.__acidMine.yaw) - yaw0) < 1e-9, 'desktop: dragging while dancing orbits the camera, not your facing');
  await D.keyboard.down('s'); await wait(150); await D.keyboard.up('s');
  check(await D.evaluate(() => window.__acidMine.dance) === null, 'desktop: a move key stops the dance');
  check(await until(() => sees(A, 'Bob'), null) === null, 'Ann sees Bob stop');

  // ---- phone: the ♫ button, the 3×3 picker, the stick stops it ----
  await A.tap('[data-test=dance-btn]');
  check(!!(await A.$('[data-test=dance-picker]')), 'phone: ♫ DANCE opens the picker');
  check(await pickerFits(A) && await noScroll(A), 'phone 390×844: picker fits, no scroll');
  await shot(A, 'picker-phone-390x844');
  await A.tap('[data-test=dance-tuktuk]');
  check(!(await A.$('[data-test=dance-picker]')), 'phone: picking closes the picker');
  check(await A.evaluate(() => window.__acidMine.dance) === 'tuktuk', 'phone: Tuk Tuk starts');
  check(await until(() => sees(D, 'Ann'), 'tuktuk') === 'tuktuk', 'Bob sees Ann doing the Tuk Tuk');
  await wait(900); await shot(A, 'dancing-tuktuk-phone'); await shot(D, 'seen-tuktuk-from-desktop');
  const stick = await A.$('.m-stick'); const sb = await stick.boundingBox();
  await A.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await A.mouse.down(); await A.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.85, { steps: 3 }); await wait(120); await A.mouse.up();
  check(await A.evaluate(() => window.__acidMine.dance) === null, 'phone: touching the stick stops the dance');
  check(await until(() => sees(D, 'Ann'), null) === null, 'Bob sees Ann stop');

  // ---- landscape phone, reduced motion ----
  const L = await open(browser, cal, { w: 844, h: 390, m: true, reduce: true });
  await L.tap('[data-test=dance-btn]');
  check(await pickerFits(L) && await noScroll(L), 'phone 844×390: picker fits, no scroll');
  await shot(L, 'picker-phone-844x390');
  await L.tap('[data-test=dance-spin]'); await wait(1500);
  check(await L.evaluate(() => window.__acidMine.dance === 'spin' && window.__acidMine.self.body.rotation.y === 0 && window.__acidMine.self.body.rotation.z === 0), 'reduced motion: Floor Spin plays without spinning or flipping');
  await shot(L, 'dancing-spin-reduced-844x390');
  await L.tap('[data-test=dance-btn]');
  check(await L.evaluate(() => window.__acidMine.dance) === null, 'phone: ■ STOP stops it');

  // ---- montage: Bob does all nine, filmed from his own dance camera ----
  if (OUT && process.env.MONTAGE) {
    const frames = path.join(OUT, 'frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
    await D.setViewportSize({ width: 640, height: 480 }); await wait(400);
    let n = 0;
    for (let k = 1; k <= 9; k++) {
      await D.keyboard.press(String(k)); await wait(250);
      const t0 = Date.now();
      while (Date.now() - t0 < 1900) { await D.screenshot({ path: path.join(frames, `f${String(n++).padStart(4, '0')}.png`) }); await wait(60); }
    }
    const fps = Math.max(6, Math.round(n / (9 * 1.9)));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-vf', 'scale=480:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', '-loop', '0', path.join(OUT, 'dance-montage.gif')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-pix_fmt', 'yuv420p', path.join(OUT, 'dance-montage.webm')]);
    fs.rmSync(frames, { recursive: true, force: true });
    console.log(`     montage: ${n} frames at ${fps} fps`);
    await D.keyboard.press('w');
  }
  for (const [nm, p] of [['Ann', A], ['Bob', D], ['Cal', L]]) check(!p.errs.length, `${nm}: no page errors ${p.errs.join(' | ')}`);
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); srv.kill(); await wait(400); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
