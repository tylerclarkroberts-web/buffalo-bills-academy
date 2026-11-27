// Chasing the Heeshee Mazode in a real browser (phone 390×844 and desktop 1280×720), forced on through the
// dev-login-only override. It takes the bug and bolts at 95% of walking pace; the miner stays a couple of tiles behind
// (at walking pace, the most a phone stick gives), it drops to 85% after 20 s, the miner closes in and swings (SWING on
// the phone, Space on the desktop), it stumbles, turns round and laughs, then asks three riddles. One run answers all
// three (the bug comes back), the other gets one wrong (it laughs and runs off at triple speed). The right answers are
// read from the local test server's
// own data folder, never from the page. Wild bugs, other miners and the old-timers are cleared so only the Heeshee is in frame.
//   npm run build && PLAYWRIGHT_DIR=/path/with/node_modules OUT=dir node scripts/e2e-mazode-chase.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4250 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-mazode-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', MINE_TEST_TIER: process.env.MINE_TEST_TIER || '1', SLACK_BOT_TOKEN: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, every = 120) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await wait(every); } return v; };
const post = (me, u, body) => fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie: me.cookie }, body: JSON.stringify(body) }).then((r) => r.json());
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0], me = { name, cookie, sid: cookie.split('=')[1] };
  await post(me, '/api/dev/horror', { on: false }); await post(me, '/api/dev/steeze', { on: false }).catch(() => {});
  const armed = await post(me, '/api/dev/heeshee', { on: true, bug: true });
  return { ...me, bug: armed.bug };
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine && !!window.__acidHeeshee && !!window.__acidMine.bugGuide);
  await p.evaluate(() => { // nobody else in frame: no wild bugs (no STEEZE), no other miners, no visitor; the Heeshee waits for its cue
    const s = window.__acidMine;
    for (const w of s.wilds.values()) s.scene.remove(w.group);
    s.wilds.clear(); s.setWilds = () => {}; s.setOthers?.([]); s.setOthers = () => {};
    if (s.stalker) { s.stalker.update = () => {}; s.stalker.present = false; }
    for (const n of s.npcs?.values?.() || []) { const g = n.m?.group || n.group; if (g) g.visible = false; } s.npcs?.clear?.(); // the old-timers sit this one out
    s.heeshee.state = 'dormant'; s.heeshee.afterMs = 1e9;
  });
  return p;
}
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
async function walk(p, to) {
  const g = await p.evaluate(() => window.__acidMine.maze.grid);
  const at = await p.evaluate(() => ({ x: Math.round(window.__acidMine.pos.x / 2.2), y: Math.round(window.__acidMine.pos.y / 2.2) }));
  let cur = at;
  for (const n of bfs(g, at, to).slice(1)) {
    for (let i = 1; i <= 4; i++) { await p.evaluate(([x, y]) => window.__acidMine.pos.set(x * 2.2, y * 2.2), [cur.x + (n.x - cur.x) * i / 4, cur.y + (n.y - cur.y) * i / 4]); await wait(80); }
    cur = n;
  }
  await wait(500);
}
/** In the page: keep the miner on its route at walking pace (never closer than `gap` tiles), facing it. */
const drive = (p, gap) => p.evaluate((gap) => {
  const s = window.__acidMine, h = s.heeshee, TILE = 2.2, WALK = 3.6 / TILE;
  window.__drive = window.__drive || { d: null, at: performance.now() };
  const dv = window.__drive; dv.gap = gap;
  if (dv.loop) return;
  const point = (route, d) => { const n = route.tiles.length, dd = Math.max(0, Math.min(n - 1, d)), i = Math.min(n - 2, Math.floor(dd)), f = dd - i, a = route.tiles[i], b = route.tiles[i + 1]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f }; };
  const step = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - dv.at) / 1000); dv.at = now;
    const at = h.chaseNow?.(), route = window.__acidMazode?.route;
    if (at && route && !dv.stop) {
      if (dv.d == null) dv.d = 0;
      if (at.state === 'chase') dv.d = Math.min(at.d - dv.gap, dv.d + WALK * dt);
      else if (dv.back != null) { // back off a little, but never round a corner out of its sight
        const nd = Math.max(dv.d - WALK * dt, dv.back), np = point(route, nd);
        if (Math.abs(np.x - at.x) < 0.02 || Math.abs(np.y - at.y) < 0.02) dv.d = nd; else dv.back = null;
      }
      const me = point(route, dv.d);
      s.pos.set(me.x * TILE, me.y * TILE);
      const hx = h.x - s.pos.x, hz = h.z - s.pos.y;
      if (Math.hypot(hx, hz) > 0.05) s.yaw = Math.atan2(-hx, -hz);
      s.pitch = at.ceiling ? 0.35 : -0.02;
    }
    dv.loop = requestAnimationFrame(step);
  };
  dv.loop = requestAnimationFrame(step);
}, gap);
const view = (p) => p.evaluate(() => { const v = window.__acidMazode?.view; return v ? { ...v, route: undefined, now: Date.now() + (v.skew || 0) } : null; });
/** Wait (a few seconds at most) until it is straight down the tunnel from you, for a clear picture. */
const inView = (p, ms = 5000) => until(() => p.evaluate(() => { const s = window.__acidMine, h = s.heeshee; return h.present && (Math.abs(h.x - s.pos.x) < 0.3 || Math.abs(h.z - s.pos.y) < 0.3) && Math.hypot(h.x - s.pos.x, h.z - s.pos.y) > 1.5 && !h.ceiling; }), ms, 100);
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
const rightAnswer = (caughtAt, n) => { // the local test server's own file: the e2e's answer key (the page never sees it)
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'mines.json'), 'utf8'));
  const shift = Object.values(doc.active || {}).find((s) => s?.chase?.caughtAt === caughtAt);
  return shift.chase.riddles[n].order.indexOf(0);
};

async function chase(browser, vp, tag, outcome, me) {
  const P = await open(browser, me, vp), L = `${tag}-${outcome}`;
  const g = await P.evaluate(() => window.__acidMine.maze.grid), spot = straight(g) || { x: 2, y: 1 };
  await walk(P, spot);
  // The steal: the guide at the miner's side, the Heeshee just out of grab range, and it uncoils.
  await P.evaluate(() => {
    const s = window.__acidMine, d = 2.15; s.yaw = -Math.PI / 2;
    const hx = s.pos.x - Math.sin(s.yaw) * d, hz = s.pos.y - Math.cos(s.yaw) * d;
    s.bugGuide.state = 'guiding'; s.bugGuide.x = s.pos.x; s.bugGuide.z = s.pos.y;
    window.__acidHeeshee.place(hx, hz, Math.atan2(s.pos.x - hx, s.pos.y - hz));
    s.heeshee.hasBug = true; window.__acidHeeshee.lunge();
  });
  const started = await until(async () => (await view(P))?.phase === 'chase', 5000);
  check(!!started, `${L}: the steal starts a chase`);
  if (!started) return P;
  await drive(P, 2.4);
  check(await until(() => P.isVisible('[data-test=mazode-chase]'), 3000), `${L}: the chase chip is up`);
  await wait(900); await inView(P, 3000);
  if (outcome === 'freed') await shot(P, `${L}-1-theft-chase`);
  const v0 = await view(P);
  check(v0.phase === 'chase' && !v0.lostMs, `${L}: keeping pace, it has not lost you`);
  check(await P.evaluate(() => window.__acidMine.chasing === true), `${L}: no running while chasing`);
  // a swing at two-and-a-bit tiles does nothing
  await (vp.m ? P.click('[data-test=swing]') : P.keyboard.press('Space')); await wait(400);
  check((await view(P)).phase === 'chase', `${L}: out of reach before the slowdown`);
  await until(async () => { const v = await view(P); return v.now >= v.slowAt + 600; }, 24000, 300);
  check(await P.isVisible('.mz-chip.slow'), `${L}: 20 s in it slows down (chip says so)`);
  if (outcome === 'freed') { await inView(P, 5000); await shot(P, `${L}-2-slowdown`); }
  await drive(P, 0.85);
  // close in (about a tile every four seconds), then swing until it lands
  let caught = null;
  for (let k = 0; k < 60 && !caught; k++) {
    await wait(400);
    const near = await P.evaluate(() => window.__acidMine.heesheeInReach());
    if (!near) continue;
    await (vp.m ? P.click('[data-test=swing]') : P.keyboard.press('Space'));
    caught = await until(async () => (await view(P))?.phase === 'caught' && (await view(P)), 900);
  }
  check(!!caught, `${L}: the pick lands and it stops`);
  if (!caught) return P;
  check(await P.evaluate(() => !!window.__acidMine.heeshee.stagger || window.__acidMine.heeshee.laugh > 0), `${L}: it staggers from the blow`);
  await P.evaluate(() => { window.__drive.back = window.__drive.d - 0.6; }); // a step back to take it in
  if (process.env.DBG) for (let k = 0; k < 4; k++) { console.log('     pose', JSON.stringify(await P.evaluate(() => { const s = window.__acidMine, h = s.heeshee, at = h.chaseNow(); return { me: [s.pos.x / 2.2, s.pos.y / 2.2, s.yaw], h: [h.x / 2.2, h.z / 2.2, h.facing, h.state, h.roof], at, d: window.__drive.d, vis: s.heesheeMesh.group.visible }; }))); await wait(500); }
  check(await until(() => P.isVisible('[data-test=mazode-laugh]'), 2500), `${L}: it laughs at you`);
  const laugh = await P.textContent('[data-test=mazode-laugh]');
  check(/only the Foreman/i.test(laugh) && /three riddles/.test(laugh), `${L}: "${laugh.slice(0, 70)}…"`);
  check(await noScroll(P), `${L}: no scrolling`);
  await wait(900);
  if (outcome === 'freed') await shot(P, `${L}-3-hit-laugh`);
  for (let n = 0; n < 3; n++) {
    check(await until(() => P.isVisible('[data-test=mazode-riddle]'), 9000), `${L}: riddle ${n + 1} is up`);
    const card = await P.evaluate(() => ({ q: document.querySelector('.mz-q')?.textContent, opts: [...document.querySelectorAll('.mz-opt')].map((b) => b.textContent), clock: document.querySelector('[data-test=mazode-clock]')?.textContent }));
    console.log(`     riddle ${n + 1}: ${card.q} [${card.opts.join(' | ')}] ${card.clock}`);
    check(card.opts.length === 4 && /^(19|20)s$/.test(card.clock), `${L}: four options and a 20 s clock`);
    check(await noScroll(P), `${L}: riddle card fits without scrolling`);
    if (n === 0 && outcome === 'freed') await shot(P, `${L}-4-riddle`);
    const right = rightAnswer(caught.caughtAt, n), pick = outcome === 'flee' && n === 1 ? (right + 1) % 4 : right;
    if (vp.m) await P.click(`[data-test=mazode-opt-${pick}]`); else await P.keyboard.press(String(pick + 1));
    if (outcome === 'flee' && n === 1) break;
    await until(async () => { const v = await view(P); return v.phase === 'freed' || v.riddle?.n === n + 1; }, 3000);
  }
  if (outcome === 'freed') {
    check(await until(() => P.isVisible('[data-test=mazode-freed]'), 3000), `${L}: three right: the bug is released`);
    await wait(700);
    await shot(P, `${L}-5-freed`);
    const back = await P.evaluate(() => ({ guide: window.__acidMine.bugGuide.state, carried: !!window.__acidMine.bugCarried, banner: !!document.querySelector('[data-test=heeshee-stolen]'), bugBtn: !!document.querySelector('[data-test=bug-btn]') }));
    check(back.guide !== 'stolen' && !back.carried && !back.banner && back.bugBtn, `${L}: the guide is back at work ${JSON.stringify(back)}`);
  } else {
    check(await until(() => P.isVisible('[data-test=mazode-flee]'), 3000), `${L}: a wrong answer and it laughs`);
    const was = await P.textContent('[data-test=mazode-flee]');
    check(/Wrong/.test(was) && /IT WAS:/.test(was), `${L}: "${was}"`);
    await wait(400);
    await shot(P, `${L}-6-wrong`);
    check(await until(() => P.isVisible('[data-test=mazode-escape]'), 5000, 60), `${L}: then it bolts at super speed`);
    await wait(250);
    const v = await view(P);
    check(v.phase === 'flee' && v.fleeUntil - v.fleeAt === 15000, `${L}: 15 s of super speed`);
    await shot(P, `${L}-7-escape`);
  }
  check(!P.errs.length, `${L}: no page errors ${P.errs.join(' | ')}`);
  return P;
}

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const runs = [
    [{ w: 390, h: 844, m: true }, 'phone', 'freed', 'Ann'], [{ w: 390, h: 844, m: true }, 'phone', 'flee', 'Bob'],
    [{ w: 1280, h: 720 }, 'desktop', 'freed', 'Cat'], [{ w: 1280, h: 720 }, 'desktop', 'flee', 'Dee'],
  ].filter(([, tag, outcome]) => !process.env.ONLY || process.env.ONLY === `${tag}-${outcome}`);
  for (const [vp, tag, outcome, name] of runs) {
    const me = await login(name, `${name.toLowerCase()}@mazode.test`);
    check(!!me.bug?.name, `${tag}-${outcome}: a hatched guide (${me.bug?.name || 'none'})`);
    const P = await chase(browser, vp, tag, outcome, me);
    await P.context().close();
  }
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
finally {
  await browser?.close(); const gone = new Promise((r) => srv.once('exit', r)); srv.kill(); await gone;
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a temp folder */ }
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
