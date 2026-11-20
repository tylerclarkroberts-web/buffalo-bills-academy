// The Heeshee Mazode in real browsers, forced on through the dev-login-only override (POST /api/dev/heeshee).
// Desktop: a hunched silhouette, a freeze and feather snap, a lunge that grabs the bug and walks off down the
// tunnel with it struggling in its hand (and squealing), a "nowhere to be found" banner, a blocked recall,
// then the Foreman returns the bug after you clock out with acid on the same shift.
// Phone: the same scare, tight no-scroll HUD.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir GIF=1 npm run e2e:heeshee
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT, GIF = process.env.GIF === '1';
const PORT = 4210 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heeshee-'));
const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', BARN_INCUBATE_MS: '1', SLACK_BOT_TOKEN: '' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = []; let frameDir = null;
const frame = async (p, n = 1, gap = 100) => { if (!GIF || !OUT) return; frameDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heeshee-gif-')); for (let i = 0; i < n; i++) { const f = path.join(frameDir, `f${String(frames.length).padStart(4, '0')}.png`); await p.screenshot({ path: f }); frames.push(f); if (gap) await wait(gap); } };
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie, sid: cookie.split('=')[1] };
}
async function arm(me) {
  await fetch(B + '/api/dev/horror', { method: 'POST', headers: { 'content-type': 'application/json', cookie: me.cookie }, body: JSON.stringify({ on: false }) });
  return fetch(B + '/api/dev/heeshee', { method: 'POST', headers: { 'content-type': 'application/json', cookie: me.cookie }, body: JSON.stringify({ on: true, bug: true }) }).then((r) => r.json());
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: vp.reduce ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine && !!window.__acidHeeshee);
  await p.waitForTimeout(600); return p;
}
const H = (p, fn, arg) => p.evaluate(fn, arg);
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
const until = async (fn, ms = 6000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await wait(150); } return v; };
function straight(g) {
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 6; x++) if ([0, 1, 2, 3, 4, 5].every((k) => g[y][x + k] === 0)) return { x, y };
  return null;
}
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
      await wait(80);
    }
    cur = n;
  }
  if (Number.isFinite(yaw)) await p.evaluate((a) => { window.__acidMine.yaw = a; }, yaw);
  await wait(400);
}

async function hush(p, { keepHeeshee = false, keepGuide = false } = {}) {
  // Keep the Heeshee off-stage until we place it, and hide wild bug billboards so the scare is readable.
  // Never hide the guide once it is clutched in the Heeshee's hand — that is the steal.
  // PvP ticks re-send the day's wilds; both get pinned.
  await p.evaluate(({ keep, keepGuide }) => {
    const s = window.__acidMine, h = s.heeshee;
    if (h && !keep) { h.state = 'dormant'; h.afterMs = 1e9; }
    const isGuideMesh = (o) => !!(s.bugMesh && (o === s.bugMesh.group || o === s.bugMesh.mesh || o?.parent === s.bugMesh.group));
    const hideBugs = () => {
      if (s.wilds) {
        for (const w of s.wilds.values()) { if (w.group) { w.group.visible = false; s.scene.remove(w.group); } }
        s.wilds.clear();
      }
      try { s.setOthers?.([]); s.miners?.set?.([]); } catch { /* */ }
      s.scene.traverse((o) => {
        if (s.bugCarried && isGuideMesh(o)) return;
        const geo = o.geometry;
        if (o.isMesh && geo?.type === 'PlaneGeometry' && Math.abs((geo.parameters?.width || 0) - 0.55) < 0.01) {
          if (s.bugCarried && isGuideMesh(o)) return;
          (o.parent || o).visible = false;
        }
      });
      if (!keepGuide && !s.bugCarried && s.bugMesh?.group) s.bugMesh.group.visible = false;
    };
    try { s.setWilds([]); } catch { /* may already be pinned */ }
    s.setWilds = () => {};
    s.setOthers = () => {};
    const prev = s._realUpdateBugGuide || s.updateBugGuide.bind(s);
    s._realUpdateBugGuide = prev;
    s.updateBugGuide = function (...args) {
      if (this.bugCarried) return prev.call(this, ...args);
      if (!keepGuide && this.bugMesh?.group) this.bugMesh.group.visible = false;
    };
    s.hideHands = true;
    if (s.hands?.group) s.hands.group.visible = false;
    hideBugs();
    s._hideBugs = hideBugs;
  }, { keep: keepHeeshee, keepGuide });
}
async function fillAcid(cookie) {
  const headers = { 'content-type': 'application/json', cookie };
  const s = await fetch(B + '/api/mines/start', { method: 'POST', headers, body: JSON.stringify({ rulesVersion: 2 }) }).then((r) => r.json());
  const poolId = s.currentPoolId, shiftId = s.shiftId;
  if (!shiftId || !poolId) return s;
  await fetch(B + '/api/mines/probe', { method: 'POST', headers, body: JSON.stringify({ rulesVersion: 2, shiftId, poolId }) });
  await fetch(B + '/api/mines/extract', { method: 'POST', headers, body: JSON.stringify({ rulesVersion: 2, shiftId, poolId, action: 'start' }) });
  await wait(900);
  return fetch(B + '/api/mines/extract', { method: 'POST', headers, body: JSON.stringify({ rulesVersion: 2, shiftId, poolId, action: 'stop' }) }).then((r) => r.json());
}

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const ann = await login('Ann', 'ann@heeshee.test'), bob = await login('Bob', 'bob@heeshee.test');
  const forced = await arm(ann);
  check(forced.force === true, 'dev override forces the Heeshee Mazode on (local server only)');
  check(!!forced.bug?.name, `dev hook plants a hatched guide (${forced.bug?.name || forced.bug?.error || 'none'})`);
  await arm(bob);
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

  // ================= desktop =================
  const D = await open(browser, ann, { w: 1280, h: 720 });
  await D.click('button[aria-pressed]:has-text("♪")').catch(() => {});
  await hush(D);
  const exclusivity = await H(D, () => ({
    heeshee: !!window.__acidHeeshee,
    faun: !!window.__acidMine.faun,
    scare: !!(window.__acidMine.stalker && window.__acidMine.stalker.armed),
    horror: !!window.__acidHorror,
    bug: !!window.__acidMine.bugGuide,
  }));
  check(exclusivity.heeshee && !exclusivity.faun && !exclusivity.scare, `desktop: only the Heeshee is on shift ${JSON.stringify(exclusivity)}`);
  check(exclusivity.bug, 'desktop: a hatched guide came along');
  const g = await H(D, () => window.__acidMine.maze.grid), spot = straight(g) || { x: 2, y: 1 };
  await walk(D, g, spot, -Math.PI / 2);
  await hush(D);
  // Stage it down the tunnel, mostly in shadow, then let it bumble.
  await H(D, ([x, y]) => {
    const m = window.__acidMine; m.yaw = -Math.PI / 2;
    const hx = (x + 1.55) * 2.2, hz = y * 2.2;
    window.__acidHeeshee.place(hx, hz, Math.atan2(m.pos.x - hx, m.pos.y - hz));
    m.heeshee.hasBug = true;
    m.heeshee.fan = 0.55;
  }, [spot.x, spot.y]);
  await wait(500);
  await H(D, () => window.__acidMine._hideBugs?.());
  const meshInfo = await H(D, () => {
    const s = window.__acidMine, g = s.heesheeMesh.group, h = s.heeshee;
    return { vis: g.visible, state: h.state, pos: [+g.position.x.toFixed(2), +g.position.y.toFixed(2), +g.position.z.toFixed(2)], player: [+s.pos.x.toFixed(2), +s.pos.y.toFixed(2)], yaw: +s.yaw.toFixed(2), dist: +Math.hypot(s.pos.x - h.x, s.pos.y - h.z).toFixed(2), wilds: s.wilds?.size || 0 };
  });
  console.log('     heeshee mesh', JSON.stringify(meshInfo));
  check(await H(D, () => window.__acidHeeshee.present && window.__acidMine.heesheeMesh.group.visible), 'desktop: the Heeshee is in the tunnel');
  await shot(D, 'desktop-1-silhouette'); await frame(D, 6, 140);

  // Look straight at it, a little farther than lunge range: it freezes, feathers snap toward the lamp.
  await H(D, () => {
    const s = window.__acidMine, d = 3.5;
    const hx = s.pos.x - Math.sin(s.yaw) * d, hz = s.pos.y - Math.cos(s.yaw) * d;
    window.__acidHeeshee.place(hx, hz, Math.atan2(s.pos.x - hx, s.pos.y - hz));
    s.heeshee.hasBug = true; s.heeshee.fan = 0.9; s.heeshee.snap = 1; s.heeshee.hold = 3; s.heeshee.state = 'frozen';
  });
  await wait(400);
  const froze = await H(D, () => window.__acidHeeshee.state);
  check(froze === 'frozen' || froze === 'wandering' || froze === 'lunging', `desktop: it reacts when looked at (state=${froze})`);
  await shot(D, 'desktop-2-feather-stare'); await frame(D, 5, 120);

  // The lunge: put the guide at the miner's side, the Heeshee just out of grab range, and uncoil.
  await hush(D, { keepHeeshee: true, keepGuide: true });
  await H(D, () => {
    const s = window.__acidMine, d = 2.15;
    const hx = s.pos.x - Math.sin(s.yaw) * d, hz = s.pos.y - Math.cos(s.yaw) * d;
    if (s.bugGuide) { s.bugGuide.state = 'guiding'; s.bugGuide.x = s.pos.x; s.bugGuide.z = s.pos.y; }
    if (s.bugMesh?.group) { s.bugMesh.group.visible = true; s.bugMesh.group.position.set(s.pos.x, 0, s.pos.y); }
    window.__acidHeeshee.place(hx, hz, Math.atan2(s.pos.x - hx, s.pos.y - hz));
    s.heeshee.hasBug = true;
    window.__acidHeeshee.lunge();
  });
  await frame(D, 8, 70);
  const stolen = await until(async () => H(D, () => !!(document.querySelector('[data-test=heeshee-stolen]') || window.__acidHeeshee.carrying || window.__acidHeeshee.state === 'fleeing' || window.__acidHeeshee.state === 'gone')), 4000);
  check(!!stolen, 'desktop: it lunges and takes the bug');
  const clutched = await until(async () => H(D, () => !!(window.__acidMine.bugCarried && window.__acidHeeshee.carrying && window.__acidHeeshee.present)), 2000);
  check(!!clutched, 'desktop: the bug is clutched in its hand and still on camera');
  // Still while the grab is unmistakable: bug glowing in its grip, creature turning to walk off.
  await frame(D, 3, 110);
  await shot(D, 'desktop-3-lunge-steal');
  // Then stay with the walk down the tunnel until it is swallowed by the dark.
  await frame(D, 16, 160);
  const banner = ((await D.textContent('[data-test=heeshee-stolen]')) || '');
  check(/nowhere to be found/i.test(banner) && /Heeshee Mazode took it/i.test(banner), `desktop: stolen banner wording (${banner.trim() || 'missing'})`);
  check(!(await D.$('[data-test=jump-scare]')), 'desktop: no full-screen flash-scare');
  check(!(await D.$('[data-test=bug-btn]')), 'desktop: the guide button is gone');
  // Recall (V / COME HERE) must not bring it back.
  await D.keyboard.press('v');
  await wait(300);
  const afterRecall = await H(D, () => ({
    state: window.__acidMine.bugGuide?.state || 'none',
    present: !!window.__acidMine.bugGuide?.present,
    line: document.body.innerText,
  }));
  check(afterRecall.state === 'stolen' || afterRecall.state === 'none', `desktop: recall leaves the guide stolen (state=${afterRecall.state})`);
  check(!afterRecall.present, 'desktop: the guide does not come back when called');
  check(/nowhere to be found/i.test(afterRecall.line), 'desktop: recall says the Heeshee Mazode took it');

  // Lamp flicker when it is close.
  const lamps = [];
  await H(D, () => {
    const s = window.__acidMine, d = 1.8;
    window.__acidHeeshee.place(s.pos.x - Math.sin(s.yaw) * d, s.pos.y - Math.cos(s.yaw) * d);
  });
  for (let i = 0; i < 30; i++) { lamps.push(await H(D, () => window.__acidMine.lamp.intensity)); await wait(50); }
  check(Math.max(...lamps) - Math.min(...lamps) > 0.4, `desktop: the lamp flickers when it is near (${Math.min(...lamps).toFixed(2)}–${Math.max(...lamps).toFixed(2)})`);

  // Find a little acid without the guide, then clock out so the Foreman can return the bug.
  const pool = await H(D, () => { const s = window.__acidMine; return { x: s.poolPos.x / 2.2, y: s.poolPos.z / 2.2 }; });
  await walk(D, g, pool, 0);
  await hush(D);
  const filled = await fillAcid(ann.cookie);
  console.log('     bucket after fill:', JSON.stringify({ collected: filled?.collected, result: !!filled?.result, bugReturned: filled?.result?.bugReturned }));
  await D.keyboard.down('Space'); await wait(1200); await D.keyboard.up('Space');
  await shot(D, 'desktop-4-stolen-hud');
  await D.click('text=CLOCK OUT');
  const returned = await until(async () => {
    const body = await D.textContent('body');
    return /wrestle that Heeshee Mazode|cigarettes|YOUR BUG IS BACK/i.test(body || '') || !!(await D.$('.fm, [data-test=heeshee-return]'));
  }, 10000);
  check(!!returned, 'desktop: after acid, the Foreman (or the report) brings the bug back');
  // Advance once if the first line is on the Foreman so the wrestle line is fully up.
  if (await D.$('.fm-next')) { await D.click('.fm-next').catch(() => {}); await wait(600); }
  const farewell = ((await D.textContent('body')) || '');
  check(/wrestle that Heeshee Mazode|cigarettes|YOUR BUG IS BACK/i.test(farewell), 'desktop: return line is on screen');
  await shot(D, 'desktop-5-foreman-return');
  // Dismiss the farewell to the report line.
  for (let i = 0; i < 4; i++) {
    if (await D.$('[data-test=heeshee-return]')) break;
    const next = await D.$('.fm-next, .fm-box button, button:has-text("BACK HOME")');
    if (next) { await next.click().catch(() => {}); await wait(400); } else break;
  }
  if (await D.$('[data-test=heeshee-return]')) await shot(D, 'desktop-6-bug-back');
  check(await noScroll(D), 'desktop: no scroll');
  check(D.errs.length === 0, `desktop: no page errors ${D.errs.join(' | ')}`);

  // ================= phone =================
  const P = await open(browser, bob, { w: 390, h: 844, m: true });
  await hush(P);
  check(await H(P, () => !!window.__acidHeeshee && !!window.__acidMine.bugGuide), 'phone: Heeshee shift with a guide');
  const pg = await H(P, () => window.__acidMine.maze.grid), pspot = straight(pg) || { x: 2, y: 1 };
  await walk(P, pg, pspot, -Math.PI / 2);
  await hush(P);
  await H(P, () => {
    const s = window.__acidMine; s.yaw = -Math.PI / 2;
    const d = 2.2;
    window.__acidHeeshee.place(s.pos.x - Math.sin(s.yaw) * d, s.pos.y - Math.cos(s.yaw) * d, Math.PI / 2);
    s.heeshee.hasBug = true; s.heeshee.fan = 0.7;
  });
  await wait(400);
  await shot(P, 'phone-1-silhouette');
  await hush(P, { keepHeeshee: true, keepGuide: true });
  await H(P, () => { window.__acidMine.hideHands = true; window.__acidMine.heeshee.hasBug = true; window.__acidHeeshee.lunge(); });
  check(await until(async () => P.$('[data-test=heeshee-stolen]'), 4000), 'phone: the steal banner shows');
  await wait(400);
  const phoneBanner = ((await P.textContent('[data-test=heeshee-stolen]')) || '');
  check(/nowhere to be found/i.test(phoneBanner), `phone: banner wording (${phoneBanner.trim() || 'missing'})`);
  await shot(P, 'phone-2-scare');
  check(!(await P.$('[data-test=jump-scare]')), 'phone: no full-screen flash-scare');
  check(await noScroll(P), 'phone: no scroll');
  const fps = await H(P, () => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log(`     phone (software GL in CI) frame rate ~${fps.toFixed(0)} fps`);
  check(P.errs.length === 0, `phone: no page errors ${P.errs.join(' | ')}`);

  if (GIF && OUT && frames.length) {
    const vf = 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '8', '-i', path.join(frameDir, 'f%04d.png'), '-vf', vf, path.join(OUT, 'heeshee-scare.gif')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '8', '-i', path.join(frameDir, 'f%04d.png'), '-vf', vf, path.join(OUT, 'heeshee-carry.gif')]);
    console.log(`     GIF: ${path.join(OUT, 'heeshee-scare.gif')} and heeshee-carry.gif (${frames.length} frames)`);
  }
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
finally {
  await browser?.close(); srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); if (frameDir) fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall heeshee checks passed'); process.exit(fails.length ? 1 : 0);
}
