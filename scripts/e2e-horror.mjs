// Horror Night in real browsers, forced on through the dev-login-only override (POST /api/dev/horror).
// Desktop: clock in (normal), lights out (fog, banner, flicker, FLASHING toggle), the crew come, freeze when looked
// at, walk when you look away, vanish in the lamp; a jump scare; dancing still works. Phone: the real 30–60 s timer
// turns the lights out by itself, at most two crew, a real chunk of mined acid can carry a scare, nothing scrolls.
// Reduced motion: flashing starts LOW and the scare fades instead of lunging.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir [GIF=1] node scripts/e2e-horror.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT, GIF = process.env.GIF === '1';
const PORT = 4190 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-horror-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = []; let frameDir = null;
const frame = async (p, n = 1, gap = 120) => { if (!GIF || !OUT) return; frameDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'bba-horror-gif-')); for (let i = 0; i < n; i++) { const f = path.join(frameDir, `f${String(frames.length).padStart(4, '0')}.png`); await p.screenshot({ path: f }); frames.push(f); if (gap) await wait(gap); } };
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
  await p.waitForTimeout(800); return p;
}
const H = (p, fn, arg) => p.evaluate(fn, arg);
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
const until = async (fn, ms = 6000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await wait(150); } return v; };
function straight(g) { // a 6-tile straight east-west tunnel, nearest the start
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 6; x++) if ([0, 1, 2, 3, 4, 5].every((k) => g[y][x + k] === 0)) return { x, y };
  return null;
}
const EAST = -Math.PI / 2, WEST = Math.PI / 2;
// The shared mine's heartbeat snaps anyone who teleports back, so walk there the way a miner would (from e2e-dances).
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

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 15000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const ann = await login('Ann', 'ann@horror.test'), bob = await login('Bob', 'bob@horror.test'), cal = await login('Cal', 'cal@horror.test');
  const forced = await fetch(B + '/api/dev/horror', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ann.cookie }, body: JSON.stringify({ on: true }) }).then((r) => r.json());
  check(forced.on === true, 'dev override forces Horror Night on (local server only)');
  const bankBefore = await fetch(B + '/api/me', { headers: { cookie: ann.cookie } }).then((r) => r.json()).then((m) => m.bankroll);
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

  // ================= desktop =================
  const D = await open(browser, ann, { w: 1280, h: 720 });
  await D.click('button[aria-pressed]:has-text("♪")').catch(() => {}); // sound on: the synthesized audio runs (headless, but it must not throw)
  check(await H(D, () => !!window.__acidHorror && !window.__acidHorror.dark), 'desktop: horror shift, lights still on at clock-in');
  check(!(await D.$('[data-test=flash-toggle]')), 'desktop: nothing spooky shows before the lights go');
  const g = await H(D, () => window.__acidMine.maze.grid), spot = straight(g);
  check(!!spot, `desktop: a straight tunnel at ${JSON.stringify(spot)}`);
  await walk(D, g, spot, EAST);
  const fogBefore = await H(D, () => window.__acidMine.scene.fog.far);
  await shot(D, 'desktop-1-normal'); await frame(D, 6, 150);
  await H(D, () => window.__acidHorror.lightsOut());
  await frame(D, 10, 100);
  await wait(1500);
  check(await H(D, () => window.__acidHorror.dark), 'desktop: lights out');
  const fogAfter = await H(D, () => window.__acidMine.scene.fog.far);
  check(fogAfter < fogBefore && fogAfter <= 6.6, `desktop: fog closes in (${fogBefore.toFixed(1)} → ${fogAfter.toFixed(1)} m)`);
  check(await D.isVisible('[data-test=horror-banner]'), 'desktop: "The lights feel wrong tonight…" banner, first time');
  check((await D.textContent('[data-test=horror-banner]')).includes('The lights feel wrong tonight'), 'desktop: banner copy');
  check(await D.isVisible('[data-test=flash-toggle]'), 'desktop: FLASHING toggle shows once the lights are out');
  await shot(D, 'desktop-2-lights-out');
  // lamp flicker: sample it
  const lamps = []; for (let i = 0; i < 40; i++) { lamps.push(await H(D, () => window.__acidMine.horror.lamp)); await wait(60); }
  check(Math.max(...lamps) - Math.min(...lamps) > 0.15, `desktop: the headlamp flickers (${Math.min(...lamps).toFixed(2)}–${Math.max(...lamps).toFixed(2)})`);
  await frame(D, 8, 150);
  // the crew come
  check(await until(() => H(D, () => window.__acidHorror.crew.members.some((m) => m.state === 'in')), 12000), 'desktop: one of the Last Crew appears');
  check(await H(D, () => window.__acidHorror.crew.members.filter((m) => m.state !== 'gone').length <= 3), 'desktop: at most three');
  // stage one 2.75 m down the tunnel and look a little to one side of it (seen, but outside the beam): it must hold still
  await H(D, ([x, y]) => { const c = window.__acidHorror.crew; c.next = 999; const m = c.members.find((k) => k.state === 'in') || c.members[0]; Object.assign(m, { x: (x + 1.25) * 2.2, z: y * 2.2, state: 'in', alpha: 1, nextTile: null, far: 0 }); window.__acidMine.yaw = -Math.PI / 2 + 0.36; for (const o of c.members) if (o !== m) o.state = 'gone', o.wait = 999; window.__m = m.id; }, [spot.x, spot.y]);
  await wait(400);
  const p0 = await H(D, () => { const m = window.__acidHorror.crew.members.find((k) => k.id === window.__m); return { x: m.x, z: m.z, seen: m.seen, state: m.state }; });
  await wait(1200);
  const p1 = await H(D, () => { const m = window.__acidHorror.crew.members.find((k) => k.id === window.__m); return { x: m.x, z: m.z, seen: m.seen, state: m.state }; });
  check(p0.seen && p1.state === 'in' && p0.x === p1.x && p0.z === p1.z, `desktop: looked at, it is perfectly still ${JSON.stringify([p0, p1])}`);
  await shot(D, 'desktop-3-creature'); await frame(D, 8, 150);
  await H(D, () => { window.__acidMine.yaw = Math.PI / 2; }); await wait(1500); // look away
  const p2 = await H(D, () => { const m = window.__acidHorror.crew.members.find((k) => k.id === window.__m); return { x: m.x, z: m.z, d: m.dist, state: m.state }; });
  check(p2.state === 'in' && (p2.x !== p1.x || p2.z !== p1.z), 'desktop: look away and it moves');
  check(p2.d >= 2.0, `desktop: it stops short of you (${p2.d.toFixed(2)} m)`);
  // walk into it: no body
  const posA = await H(D, () => ({ x: window.__acidMine.pos.x }));
  await H(D, ([x, y]) => { const m = window.__acidHorror.crew.members.find((k) => k.id === window.__m); Object.assign(m, { x: (x + 1.2) * 2.2, z: y * 2.2 }); window.__acidMine.yaw = -Math.PI / 2 + 1.2; }, [spot.x, spot.y]);
  await D.keyboard.down('d'); await wait(500); await D.keyboard.up('d'); // strafe through where it stands (yaw offset: not looking straight at it)
  check(await H(D, (a) => window.__acidMine.pos.x > a.x + 0.5, posA), 'desktop: it never blocks the tunnel');
  // the lamp: face it head-on, close, with the lamp working
  await walk(D, g, spot, EAST);
  await H(D, ([x, y]) => { const s = window.__acidMine, m = window.__acidHorror.crew.members.find((k) => k.id === window.__m); Object.assign(m, { x: (x + 1.5) * 2.2, z: y * 2.2, state: 'in', alpha: 1 }); s.yaw = -Math.PI / 2; s.horror.flicker.event = null; s.horror.flicker.wait = 99; }, [spot.x, spot.y]);
  check(await until(() => H(D, () => window.__acidHorror.crew.members.find((k) => k.id === window.__m).state !== 'in'), 3000), 'desktop: caught in the lamp beam, it vanishes');
  // jump scare
  await H(D, () => window.__acidHorror.scare());
  const sc = await H(D, () => ({ face: !!document.querySelector('[data-test=jump-scare]'), shake: document.querySelector('.m-play').classList.contains('m-shake'), pe: document.querySelector('[data-test=jump-scare]') && getComputedStyle(document.querySelector('[data-test=jump-scare]')).pointerEvents }));
  check(sc.face, 'desktop: jump scare face');
  check(sc.shake, 'desktop: screen shake');
  check(sc.pe === 'none', 'desktop: the scare never eats input');
  await wait(90); await shot(D, 'desktop-4-jump-scare');
  await frame(D, 3, 0);
  await wait(1100);
  check(!(await D.$('[data-test=jump-scare]')), 'desktop: and it is gone within a second');
  await frame(D, 4, 150);
  // the cooldown gate is armed, and quiet straight after a scare
  check(await H(D, () => window.__acidHorror.gate.armedAt != null), 'desktop: scare gate armed at lights out');
  // dances still work in the dark
  await D.keyboard.press('3'); await wait(400);
  check(await H(D, () => !!window.__acidMine.dance), 'desktop: dancing still works');
  await D.keyboard.press('w'); await wait(200);
  check(await H(D, () => !window.__acidMine.dance), 'desktop: walking stops the dance');
  // low flashing toggle
  await D.click('[data-test=flash-toggle]');
  check(await H(D, () => window.__acidMine.horror.flicker.calm), 'desktop: FLASHING: LOW calms the lamp');
  check((await D.textContent('[data-test=flash-toggle]')).includes('LOW'), 'desktop: toggle reads LOW');
  await D.click('[data-test=flash-toggle]');
  check(await noScroll(D), 'desktop: no scroll');
  check(D.errs.length === 0, `desktop: no page errors ${D.errs.join(' | ')}`);

  // ================= phone: the real timer, a real chunk =================
  const P = await open(browser, bob, { w: 390, h: 844, m: true });
  const lightsAt = await H(P, () => window.__acidHorror && window.__acidMine && true);
  check(lightsAt, 'phone: horror shift');
  await shot(P, 'phone-1-normal');
  // walk (teleport) to the first pool and wait there, so the vein comes in while we wait for the lights
  const t0 = Date.now();
  const pg = await H(P, () => window.__acidMine.maze.grid);
  const pool = await H(P, () => { const s = window.__acidMine; return { x: s.poolPos.x / 2.2, y: s.poolPos.z / 2.2 }; });
  await walk(P, pg, pool, 0);
  check(await until(() => H(P, () => window.__acidHorror.dark), 65000), 'phone: the lights went out on their own (30–60 s timer)');
  console.log(`     lights out after ~${Math.round((Date.now() - t0) / 1000) + 1} s of waiting`);
  await wait(1500);
  check(await P.isVisible('[data-test=horror-banner]'), 'phone: banner');
  await shot(P, 'phone-2-lights-out');
  check(await until(() => H(P, () => window.__acidHorror.crew.members.some((m) => m.state === 'in')), 15000), 'phone: the crew come');
  for (let i = 0; i < 20; i++) { await H(P, () => { window.__acidMine.yaw += 0.6; }); await wait(250); }
  check(await H(P, () => window.__acidHorror.crew.members.filter((m) => m.state !== 'gone').length <= 2 && window.__acidHorror.crew.max === 2), 'phone: capped at two');
  check(await H(P, () => window.__acidHorror.crew.members.every((m) => { const s = window.__acidMine; return Math.round(m.x / 2.2) !== Math.round(s.poolPos.x / 2.2) || Math.round(m.z / 2.2) !== Math.round(s.poolPos.z / 2.2); })), 'phone: none standing in the acid');
  // a chunk of real acid carries a scare: make the gate certain, then hold MINE
  await H(P, () => { const g = window.__acidHorror.gate; g.chance = 1; g.maxChance = 1; g.graceMs = 0; g.cooldownMs = 0; });
  const mineBtn = await until(async () => (await P.$('.m-mine .m-btn')) && P.isVisible('.m-mine .m-btn'), 30000);
  if (!mineBtn) console.log('     status:', await P.textContent('.m-hud.tl'), await H(P, () => JSON.stringify({ pos: [window.__acidMine.pos.x, window.__acidMine.pos.y], pool: window.__acidMine.poolPos })));
  check(!!mineBtn, 'phone: acid glows in the dark and HOLD TO MINE shows (if you can see acid, you can mine it)');
  if (mineBtn) {
    const b = await P.$('.m-mine .m-btn'); const box = await b.boundingBox();
    await P.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await P.mouse.down();
    const scared = await until(() => P.$('[data-test=jump-scare]'), 8000);
    await shot(P, 'phone-3-jump-scare');
    await P.mouse.up();
    if (!scared) console.log('     gate:', await H(P, () => JSON.stringify(window.__acidHorror.gate)));
    check(!!scared, 'phone: mining a chunk can make something jump out');
    check(await until(async () => (await H(P, () => Number(document.querySelector('[data-test=bucket-status] span')?.textContent.match(/(\d+) \//)?.[1] || 0))) > 0, 3000), 'phone: and the acid still went in the bucket');
  }
  await wait(1200);
  await shot(P, 'phone-4-dark-hud');
  check(await noScroll(P), 'phone: no scroll');
  const fps = await H(P, () => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log(`     phone (software GL in CI) frame rate ~${fps.toFixed(0)} fps`);
  check(P.errs.length === 0, `phone: no page errors ${P.errs.join(' | ')}`);

  // ================= reduced motion =================
  const R = await open(browser, cal, { w: 844, h: 390, m: true, reduce: true });
  await H(R, () => window.__acidHorror.lightsOut()); await wait(800);
  check((await R.textContent('[data-test=flash-toggle]')).includes('LOW'), 'reduced motion: flashing starts LOW');
  check(await H(R, () => window.__acidMine.horror.flicker.calm), 'reduced motion: calm lamp');
  await H(R, () => window.__acidHorror.scare()); await wait(150);
  check(await H(R, () => document.querySelector('[data-test=jump-scare]')?.classList.contains('calm') && !document.querySelector('.m-play').classList.contains('m-shake')), 'reduced motion: the scare fades in, no shake');
  await shot(R, 'phone-landscape-reduced-scare');
  check(await noScroll(R), 'landscape phone: no scroll');
  check(R.errs.length === 0, `reduced: no page errors ${R.errs.join(' | ')}`);

  // ================= money =================
  const bankAfter = await fetch(B + '/api/me', { headers: { cookie: ann.cookie } }).then((r) => r.json()).then((m) => m.bankroll);
  check(bankAfter === bankBefore, `no money moved for the scared miner mid-shift ($${bankBefore} → $${bankAfter})`);

  if (GIF && OUT && frames.length) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '7', '-i', path.join(frameDir, 'f%04d.png'), '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', path.join(OUT, 'horror-night.gif')]);
    console.log(`     GIF: ${path.join(OUT, 'horror-night.gif')} (${frames.length} frames)`);
  }
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
finally {
  await browser?.close(); srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); if (frameDir) fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall horror checks passed'); process.exit(fails.length ? 1 : 0);
}
