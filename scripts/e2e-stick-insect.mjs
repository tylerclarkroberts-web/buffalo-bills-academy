// Screenshots for the Lord Howe Island stick insect: wall/ceiling crawl, intro, battle, Bug Ledger, admin day flag.
//   PLAYWRIGHT_DIR=... OUT=/workspace/bba-legendary-shots node scripts/e2e-stick-insect.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-legendary-shots';
const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { webkit, devices } = req('playwright-core');
const PORT = 4300 + Math.floor(Math.random() * 200);
const B = `http://localhost:${PORT}`;
const ANN_ID = '11111111-1111-1111-1111-111111111111';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-stick-shot-'));
fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify({
  [ANN_ID]: { id: ANN_ID, name: 'Ann', createdAt: Date.now() - 40 * 86400e3, kind: 'dev', google: { sub: 'dev:ann@stick.test', email: 'ann@stick.test' }, bankroll: 8000, mining: { shifts: 12 } },
}));
fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify([ANN_ID]));

const env = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  DEV_LOGIN: '1',
  SLACK_BOT_TOKEN: '',
  MINE_TEST_TIER: '5',
  BARN_TEST_SPECIES: '1',
  BARN_INCUBATE_MS: '1',
  ADMIN_PLAYER_IDS: ANN_ID,
  PVP_TEST: '1',
};
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => {
  fs.mkdirSync(OUT, { recursive: true });
  await p.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
  console.log('shot', name);
};

async function login() {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann@stick.test' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { cookie, sid: cookie.split('=')[1], body: await r.json().catch(() => ({})) };
}
async function api(cookie, method, url, body) {
  const r = await fetch(B + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, text }; }
}

async function skipGates(p) {
  try {
    const skip = p.getByRole('button', { name: /skip for now/i });
    await skip.waitFor({ state: 'visible', timeout: 2500 });
    await skip.click();
    await p.waitForTimeout(300);
  } catch { /* already past the gate */ }
  try {
    const no = p.locator('[data-test=fawn-no]');
    if (await no.count()) await no.click({ force: true });
  } catch { /* */ }
  try {
    await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .fn-root { display:none!important;visibility:hidden!important; }' });
  } catch { /* */ }
}

async function openPage(browser, sid, device, path = '/mines') {
  const opts = device ? { ...device } : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext({ ...opts, reducedMotion: path.includes('/barn') || path.includes('/admin') ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + path);
  await skipGates(p);
  if (p.url().includes('/welcome')) { await skipGates(p); await p.goto(B + path); await skipGates(p); }
  return p;
}

async function clockIn(p) {
  await p.goto(B + '/mines');
  await skipGates(p);
  const clock = p.locator('text=[ CLOCK IN ]').first();
  await clock.waitFor({ timeout: 15000 });
  await clock.click();
  await p.waitForSelector('.m-canvas', { timeout: 20000 });
  await p.waitForFunction(() => !!window.__acidMine);
  await wait(400);
}

async function hideExtras(p) {
  await p.evaluate(() => {
    const s = window.__acidMine;
    if (!s) return;
    if (s.faun?.group) s.faun.group.visible = false;
    if (s.stalker) { s.stalker.armed = false; if (s.stalker.group) s.stalker.group.visible = false; }
    if (s.heeshee?.group) s.heeshee.group.visible = false;
    s.hideHands = true;
  });
}


async function frameStick(p, surface) {
  return p.evaluate((surface) => {
    const s = window.__acidMine, TILE = 2.2, WALL_H = 2.6;
    const w = [...s.wilds.values()].find((x) => x.species === 'dryococelus' && x.stick);
    if (!w) return { ok: false, why: 'no stick' };
    const g = s.maze.grid, n = g.length;
    let cell = null;
    // Prefer a 3-tile east-west corridor not far from the lift.
    const start = s.maze.start || { x: 1, y: 1 };
    let best = 1e9;
    for (let y = 1; y < n - 1; y++) for (let x = 2; x < n - 3; x++) {
      if (g[y][x] === 0 && g[y][x + 1] === 0 && g[y][x + 2] === 0) {
        const d = Math.abs(x - start.x) + Math.abs(y - start.y);
        if (d >= 3 && d < best) { best = d; cell = { x: x + 2, y, camX: x, camY: y }; }
      }
    }
    if (!cell) {
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (g[y][x] === 0) { cell = { x, y, camX: x, camY: y }; break; }
    }
    if (!cell) return { ok: false, why: 'no cell' };
    w.x = cell.x; w.y = cell.y;
    const worldX = cell.x * TILE, worldZ = cell.y * TILE;
    let surf = { kind: 'floor' };
    if (surface === 'ceiling') surf = { kind: 'ceiling' };
    else if (surface === 'wall') {
      if (g[cell.y]?.[cell.x + 1] !== 0) surf = { kind: 'wall', nx: 1, nz: 0 };
      else if (g[cell.y]?.[cell.x - 1] !== 0) surf = { kind: 'wall', nx: -1, nz: 0 };
      else if (g[cell.y + 1]?.[cell.x] !== 0) surf = { kind: 'wall', nx: 0, nz: 1 };
      else if (g[cell.y - 1]?.[cell.x] !== 0) surf = { kind: 'wall', nx: 0, nz: -1 };
      else surf = { kind: 'ceiling' };
    }
    // Import poseStick is not on window; pose via the scene loop by setting heading and a hook.
    s.heldWild = w.id;
    w.heading = Math.PI / 2; // face west, toward the camera in an east-west corridor
    // Call the same poser the scene uses, if we stashed it; otherwise set transform here.
    const pose = window.__poseStick;
    if (pose) pose(w.stick, { grid: g, x: worldX, z: worldZ, heading: w.heading, now: performance.now(), reduce: false, tile: TILE, wallH: WALL_H, surface: surf });
    else {
      if (surf.kind === 'ceiling') { w.stick.group.position.set(worldX, WALL_H - 0.14, worldZ); w.stick.group.rotation.set(Math.PI, Math.PI / 2, 0); }
      else if (surf.kind === 'wall') {
        const nx = surf.nx || 0, nz = surf.nz || 0;
        w.stick.group.position.set(worldX + nx * TILE * 0.46, 1.1, worldZ + nz * TILE * 0.46);
        w.stick.group.lookAt(worldX, 1.1, worldZ);
        w.stick.group.rotateX(-Math.PI / 2);
      } else { w.stick.group.position.set(worldX, 0.16, worldZ); w.stick.group.rotation.set(0, Math.PI / 2, 0); }
    }
    // Stand one tile west, in the open corridor, so the legendary's glow is inside the lantern and the fog.
    s.pos.set((cell.x - 1.05) * TILE, cell.y * TILE);
    if (g[Math.round(s.pos.y / TILE)]?.[Math.round(s.pos.x / TILE)] !== 0) s.pos.set(cell.camX * TILE, cell.camY * TILE);
    const tpos = w.stick.group.position;
    s.yaw = Math.atan2(-(tpos.x - s.pos.x), -(tpos.z - s.pos.y));
    // YXZ pitch: positive looks down in this camera, so look up with a negative pitch for the ceiling.
    const dy = tpos.y - 1.35, dist = Math.hypot(tpos.x - s.pos.x, tpos.z - s.pos.y) || 1;
    s.pitch = -Math.atan2(dy, dist);
    s.lampPower = 3.2;
    s.flicker = 0;
    s.sputter = 0;
    s.introLook = false;
    s.introFlicker = false;
    if (s.scene?.fog) { s.scene.fog.near = 1; s.scene.fog.far = 18; }
    w.freezeSurface = surf;
    return { ok: true, cell, surface: surf, at: { x: tpos.x, y: tpos.y, z: tpos.z }, pos: { x: s.pos.x, y: s.pos.y } };
  }, surface);
}

async function goToStick(p, { tiles = 2.4, look = true } = {}) {
  return p.evaluate(({ tiles, look }) => {
    const s = window.__acidMine;
    const w = [...s.wilds.values()].find((x) => x.species === 'dryococelus');
    if (!w) return null;
    const tx = w.x * 2.2, tz = w.y * 2.2;
    const yaw = Math.atan2(-(tx - s.pos.x), -(tz - s.pos.y)) || 0;
    // stand a few tiles back along the look vector
    const back = tiles * 2.2;
    s.pos.set(tx + Math.sin(yaw) * back, tz + Math.cos(yaw) * back);
    // if that put us in a wall, sit on the bug's tile instead and look
    const gx = Math.round(s.pos.x / 2.2), gy = Math.round(s.pos.y / 2.2);
    if (s.maze.grid[gy]?.[gx] !== 0) s.pos.set(tx + Math.sin(yaw) * 2.2, tz + Math.cos(yaw) * 2.2);
    s.yaw = Math.atan2(-(tx - s.pos.x), -(tz - s.pos.y));
    if (look) s.pitch = w.group?.position?.y > 1.5 ? 0.55 : 0.15;
    return { x: w.x, y: w.y, py: w.group?.position?.y, species: w.species, level: w.level };
  }, { tiles, look });
}

let browser;
try {
  await new Promise((r, j) => {
    const t = Date.now();
    const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 30000 ? j(new Error('server did not start on ' + B)) : setTimeout(ping, 200)));
    ping();
  });
  const me = await login();
  check(!!me.sid, 'logged in');
  // Hatch a partner and force the stick (viewer-only).
  await api(me.cookie, 'POST', '/api/dev/heeshee', { on: false, bug: true });
  const hatched = await api(me.cookie, 'GET', '/api/barn');
  check(hatched.json?.pen?.stage === 'creature' || hatched.json?.stable?.bugs?.length, 'has a bug ' + JSON.stringify(hatched.json?.pen?.stage || hatched.json?.error));
  await api(me.cookie, 'POST', '/api/dev/legend', { on: true });

  browser = await webkit.launch();
  const phone = devices['iPhone 15'] || { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

  // ---- desktop: wall / ceiling ----
  const desk = await openPage(browser, me.sid, { viewport: { width: 1280, height: 800 } });
  await clockIn(desk);
  await hideExtras(desk);
  await desk.evaluate(() => { window.__poseStick = window.__poseStick || null; });
  const ceil = await frameStick(desk, 'ceiling');
  check(ceil?.ok, 'framed on ceiling ' + JSON.stringify(ceil));
  await wait(400);
  await shot(desk, 'desktop-1280-ceiling');
  const wall = await frameStick(desk, 'wall');
  check(wall?.ok, 'framed on wall ' + JSON.stringify(wall));
  await wait(400);
  await shot(desk, 'desktop-1280-wall');

  // Step well back so the prompt/intro from standing on it is dismissed, then approach cleanly.
  await desk.evaluate(() => { try { localStorage.removeItem('bba.stick-intro'); } catch {} });
  await goToStick(desk, { tiles: 4, look: false });
  await wait(1200);
  await goToStick(desk, { tiles: 0.7, look: true });
  await wait(1500);
  const intro = await desk.locator('[data-test=stick-intro]').count();
  check(intro > 0, 'intro appeared on desktop');
  // Wait for the title card if it is coming (reduced-motion still runs timers).
  await desk.waitForSelector('[data-test=stick-intro-title], [data-test=stick-intro-line], [data-test=stick-intro]', { timeout: 4000 }).catch(() => {});
  await wait(200);
  await shot(desk, 'desktop-1280-intro');
  const skip = desk.locator('[data-test=stick-intro-skip]');
  if (await skip.count()) await skip.click();
  await desk.waitForSelector('[data-test=wild-prompt]', { timeout: 4000 }).catch(() => {});
  const send = desk.locator('[data-test=wild-send]').first();
  if (await send.count()) await send.click();
  await desk.waitForSelector('[data-test=bout], .bout, .b-ring', { timeout: 6000 }).catch(() => {});
  await wait(400);
  await shot(desk, 'desktop-1280-battle');
  await desk.close();

  // ---- iPhone 15: intro tightness + wall ----
  const ph = await openPage(browser, me.sid, phone);
  await clockIn(ph);
  await hideExtras(ph);
  await ph.evaluate(() => { try { localStorage.removeItem('bba.stick-intro'); } catch {} });
  const phWall = await frameStick(ph, 'wall');
  check(phWall?.ok, 'iphone wall frame ' + JSON.stringify(phWall));
  await wait(400);
  await shot(ph, 'iphone-15-wall');
  const phCeil = await frameStick(ph, 'ceiling');
  check(phCeil?.ok, 'iphone ceiling frame ' + JSON.stringify(phCeil));
  await wait(400);
  await shot(ph, 'iphone-15-ceiling');
  await goToStick(ph, { tiles: 0.7 });
  await wait(900);
  await ph.waitForSelector('[data-test=stick-intro]', { timeout: 4000 }).catch(() => {});
  await wait(200);
  const noScroll = await ph.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2);
  check(noScroll, 'iphone intro does not scroll the page');
  await shot(ph, 'iphone-15-intro');
  const skipPh = ph.locator('[data-test=stick-intro-skip]');
  if (await skipPh.count()) await skipPh.click();
  await ph.waitForSelector('[data-test=wild-prompt]', { timeout: 4000 }).catch(() => {});
  const sendPh = ph.locator('[data-test=wild-send]').first();
  if (await sendPh.count()) await sendPh.click();
  await ph.waitForSelector('[data-test=bout], .bout, .b-ring', { timeout: 6000 }).catch(() => {});
  await wait(400);
  await shot(ph, 'iphone-15-battle');
  const tightBattle = await ph.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2);
  check(tightBattle, 'iphone battle does not scroll the page');
  await ph.close();

  // ---- Bug Ledger ----
  await api(me.cookie, 'POST', '/api/dev/species', { id: 'dryococelus' });
  const led = await openPage(browser, me.sid, { viewport: { width: 1280, height: 800 } }, '/barn');
  await skipGates(led);
  const tab = led.getByRole('tab', { name: 'Bug Ledger' });
  await tab.waitFor({ timeout: 8000 });
  await tab.click();
  await led.waitForSelector('[data-test=barn-notes]', { timeout: 4000 });
  const kicker = await led.locator('[data-test=bug-ledger-kicker]').textContent().catch(() => '');
  check(/Bug Ledger/i.test(kicker || ''), 'ledger kicker: ' + kicker);
  const facts = await led.locator('[data-test=barn-notes]').innerText();
  check(/Makambo|1930s|tree lobster/i.test(facts), 'ledger has verified history');
  await shot(led, 'desktop-1280-ledger');
  await led.close();

  const ledPh = await openPage(browser, me.sid, phone, '/barn');
  await skipGates(ledPh);
  await ledPh.getByRole('tab', { name: 'Bug Ledger' }).click();
  await ledPh.waitForSelector('[data-test=barn-notes]', { timeout: 4000 });
  await shot(ledPh, 'iphone-15-ledger');
  const tightLed = await ledPh.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 8);
  check(tightLed, 'iphone ledger is tight (may page, not scroll the window much)');
  await ledPh.close();

  // ---- admin encounters: today is / is not a legendary day ----
  const adm = await openPage(browser, me.sid, { viewport: { width: 1280, height: 800 } }, '/admin?tab=mines');
  await skipGates(adm);
  const minesTab = adm.getByRole('tab', { name: 'Acid Mines' });
  if (await minesTab.count()) await minesTab.click().catch(() => {});
  await adm.waitForSelector('[data-test=bo-stick-day]', { timeout: 10000 });
  const dayLine = await adm.locator('[data-test=bo-stick-day]').textContent().catch(() => '');
  check(!!dayLine, 'admin shows legendary-day status: ' + dayLine);
  await shot(adm, 'desktop-1280-admin-encounters');
  await adm.close();

  if (fails.length) {
    console.error('FAILED', fails);
    process.exitCode = 1;
  } else console.log('all shot checks ok, files in', OUT);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch {}
  srv.kill('SIGTERM');
}
