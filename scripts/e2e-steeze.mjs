// Screenshots for STEEZE: in the tunnel, in battle, each flourish, collection with release blocked.
//   PLAYWRIGHT_DIR=... OUT=/workspace/bba-legendary-shots node scripts/e2e-steeze.mjs
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-steeze-shot-'));
fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify({
  [ANN_ID]: { id: ANN_ID, name: 'Ann', createdAt: Date.now() - 40 * 86400e3, kind: 'dev', google: { sub: 'dev:ann@steeze.test', email: 'ann@steeze.test' }, bankroll: 8000, mining: { shifts: 12 } },
}));
fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify([ANN_ID]));

const env = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  DEV_LOGIN: '1',
  SLACK_BOT_TOKEN: '',
  MINE_TEST_TIER: '3',
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
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann@steeze.test' }) });
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
  const ctx = await browser.newContext({ ...opts });
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
    if (s.scene?.fog) s.scene.fog.far = 28;
    if (s.lamp) s.lamp.intensity = Math.max(s.lamp.intensity || 0, 2.2);
  });
}
async function frameSteeze(p) {
  return p.evaluate(() => {
    const s = window.__acidMine, TILE = 2.2, EYE = 1.35;
    const w = [...s.wilds.values()].find((x) => x.species === 'steeze');
    if (!w) return { ok: false, why: 'no steeze' };
    const g = s.maze.grid, n = g.length;
    let cell = null, best = 1e9;
    const start = s.maze.start || { x: 1, y: 1 };
    for (let y = 1; y < n - 1; y++) for (let x = 2; x < n - 4; x++) {
      if (g[y][x] === 0 && g[y][x + 1] === 0 && g[y][x + 2] === 0 && g[y][x + 3] === 0) {
        const d = Math.abs(x - start.x) + Math.abs(y - start.y);
        if (d < best) { best = d; cell = { x: x + 2, y }; }
      }
    }
    if (!cell) cell = { x: Math.max(2, Math.floor(w.x)), y: Math.max(1, Math.floor(w.y)) };
    w.x = cell.x; w.y = cell.y;
    if (w.group) { w.group.position.set(cell.x * TILE, 0, cell.y * TILE); w.group.visible = true; }
    // Hold him still so the roam path does not walk him out of frame before the shot.
    s.heldWild = w.id;
    const camX = (cell.x - 1.05) * TILE, camZ = cell.y * TILE;
    s.pos.x = camX; s.pos.y = camZ;
    s.yaw = -Math.PI / 2; // look +X (east) toward STEEZE; forward is (-sin(yaw), -cos(yaw))
    s.pitch = 0;
    s.camera.position.set(camX, EYE, camZ);
    s.camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    if (s.scene?.fog) { s.scene.fog.near = 8; s.scene.fog.far = 40; }
    if (w.mesh?.material) { w.mesh.material.color.setHex(0xffe8c8); w.mesh.material.needsUpdate = true; }
    // Put him 2m in front of the camera so the shot does not depend on tile facing.
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const gx = camX + fx * 1.35, gz = camZ + fz * 1.35;
    w.x = gx / TILE; w.y = gz / TILE;
    if (w.group) { w.group.visible = true; w.group.position.set(gx, 0, gz); w.group.rotation.y = s.yaw; }
    if (w.mesh) { w.mesh.visible = true; w.mesh.scale.set(1, 1, 1); }
    // After the scene loop writes the camera, look at him just before the frame is drawn.
    if (s.renderer && !s._steezeLookHooked) {
      const raw = s.renderer.render.bind(s.renderer);
      s.renderer.render = (scene, camera) => {
        const him = [...s.wilds.values()].find((x) => x.species === 'steeze');
        if (him?.group) {
          const dir = new camera.position.constructor();
          camera.getWorldDirection(dir);
          // If the camera is still mostly looking at the floor, aim down the tunnel instead.
          if (Math.abs(dir.y) > 0.5) { dir.x = 1; dir.y = 0; dir.z = 0; dir.normalize(); }
          him.group.position.set(camera.position.x + dir.x * 1.55, 0, camera.position.z + dir.z * 1.55);
          him.group.rotation.y = Math.atan2(dir.x, dir.z);
          him.group.visible = true;
          camera.lookAt(him.group.position.x, 0.88, him.group.position.z);
        }
        raw(scene, camera);
      };
      s._steezeLookHooked = true;
    }
    return { ok: true, x: w.x, y: w.y, yaw: s.yaw, gx, gz, camX, camZ, vis: w.group?.visible, hooked: !!s._steezeLookHooked, isSteezeMesh: !!w.steeze, children: w.group?.children?.length, geom: w.mesh?.geometry?.parameters };
  });
}

let browser;
try {
  for (let i = 0; i < 40; i++) {
    try { await fetch(B + '/'); break; } catch { if (i === 39) throw new Error('server did not start on ' + B); await wait(250); }
  }
  const photo = await fetch(B + '/api/steeze.png');
  check(photo.status === 200, 'GET /api/steeze.png is ' + photo.status);
  const missing = await fetch(B + '/api/no-such-steeze.png');
  check(true, 'server up');

  const me = await login();
  check(!!me.sid, 'logged in');
  await api(me.cookie, 'POST', '/api/dev/heeshee', { on: false, bug: true });
  const hatched = await api(me.cookie, 'GET', '/api/barn');
  check(hatched.json?.pen?.stage === 'creature' || hatched.json?.stable?.bugs?.length, 'has a bug ' + JSON.stringify(hatched.json?.pen?.stage || hatched.json?.error));
  await api(me.cookie, 'POST', '/api/dev/steeze', { on: true });

  browser = await webkit.launch();
  const phone = devices['iPhone 15'] || { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

  const desk = await openPage(browser, me.sid, { viewport: { width: 1280, height: 800 } });
  await clockIn(desk);
  await hideExtras(desk);
  const framed = await frameSteeze(desk);
  check(framed?.ok, 'framed in tunnel ' + JSON.stringify(framed));
  await wait(900);
  await shot(desk, 'steeze-desktop-1280-tunnel');

  const send = async (p) => {
    await p.waitForSelector('[data-test=wild-prompt]', { timeout: 5000 }).catch(() => {});
    const btn = p.locator('[data-test=wild-send]').first();
    if (await btn.count()) await btn.click();
    await p.waitForSelector('[data-test=bout]', { timeout: 8000 }).catch(() => {});
    await wait(500);
  };
  // Walk onto him so the prompt opens, or trigger it by standing close.
  await desk.evaluate(() => { window.__forceAskSteeze?.(); });
  await wait(500);
  await send(desk);
  check(await desk.locator('[data-test=bout]').count() > 0, 'desktop battle opened');
  await shot(desk, 'steeze-desktop-1280-battle');
  for (const move of ['wealth', 'golf', 'calves', 'chicken']) {
    await desk.evaluate((m) => { window.__steezeShow = m; }, move);
    await desk.waitForSelector(`[data-test=steeze-move][data-move=${move}]`, { timeout: 3000 }).catch(() => {});
    await wait(250);
    const shown = await desk.locator(`[data-test=steeze-move][data-move=${move}]`).count();
    check(shown > 0, `desktop move ${move} visible`);
    await shot(desk, `steeze-desktop-1280-move-${move}`);
  }
  await desk.evaluate(() => { window.__steezeShow = null; });
  await desk.close();

  const ph = await openPage(browser, me.sid, phone);
  await clockIn(ph);
  await hideExtras(ph);
  const phFrame = await frameSteeze(ph);
  check(phFrame?.ok, 'iphone framed ' + JSON.stringify(phFrame));
  await wait(600);
  await shot(ph, 'steeze-iphone-15-tunnel');
  await ph.evaluate(() => { window.__forceAskSteeze?.(); });
  await wait(500);
  await send(ph);
  check(await ph.locator('[data-test=bout]').count() > 0, 'iphone battle opened');
  const tight = await ph.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2);
  check(tight, 'iphone battle does not scroll the page');
  await shot(ph, 'steeze-iphone-15-battle');
  for (const move of ['wealth', 'golf', 'calves', 'chicken']) {
    await ph.evaluate((m) => { window.__steezeShow = m; }, move);
    await ph.waitForSelector(`[data-test=steeze-move][data-move=${move}]`, { timeout: 3000 }).catch(() => {});
    await wait(250);
    const shown = await ph.locator(`[data-test=steeze-move][data-move=${move}]`).count();
    check(shown > 0, `iphone move ${move} visible`);
    await shot(ph, `steeze-iphone-15-move-${move}`);
  }
  await ph.close();

  // Collection + release blocked
  const swapped = await api(me.cookie, 'POST', '/api/dev/species', { id: 'steeze' });
  check(swapped.status === 200, 'swapped partner to STEEZE ' + swapped.status);
  const barn = await openPage(browser, me.sid, { viewport: { width: 1280, height: 800 } }, '/barn');
  await skipGates(barn);
  await barn.waitForSelector('[data-test=barn-canvas], .steeze-art', { timeout: 8000 });
  const stuck = barn.locator('[data-test=no-release]');
  await stuck.waitFor({ timeout: 8000 });
  const msg = (await stuck.textContent()) || '';
  check(/golf bag|stall is his now/i.test(msg), 'release blocked: ' + msg);
  check((await barn.locator('[data-test=release]').count()) === 0, 'no release button');
  await shot(barn, 'steeze-desktop-1280-collection');
  await barn.close();

  const barnPh = await openPage(browser, me.sid, phone, '/barn');
  await skipGates(barnPh);
  await barnPh.waitForSelector('[data-test=no-release]', { timeout: 8000 });
  const tightBarn = await barnPh.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 24);
  check(tightBarn, 'iphone collection is reasonably tight');
  await shot(barnPh, 'steeze-iphone-15-collection');
  await barnPh.close();

  if (fails.length) {
    console.log('FAILURES:\n' + fails.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else console.log('all steeze shots ok');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch {}
  srv.kill('SIGTERM');
  setTimeout(() => process.exit(process.exitCode || 0), 400);
}
