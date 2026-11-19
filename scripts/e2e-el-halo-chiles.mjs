// Browser check + screenshots for La Michoacana chili peppers and the seven powers.
// Boots a throwaway DEV_LOGIN server. Does not deploy.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-el-halo-chiles.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'path';
import { createRequire } from 'node:module';
import { CHILE_IDS, CHILE_BY_ID, CHILE_SPOT } from '../server/elhalo/chiles.js';
import { groundAt } from '../server/elhalo/map.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4030 + Math.floor(Math.random() * 9);
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-chiles-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const sid = r.headers.get('set-cookie').split(';')[0].split('=')[1];
  const av = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `bba_sid=${sid}` }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!av.ok) throw new Error('avatar ' + av.status + ' ' + await av.text());
  return sid;
}
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch { return false; } };

async function open(browser, sid, s) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m,
  });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.t0 = Date.now(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  const resp = await p.goto(`${B}/elhalo`, { waitUntil: 'domcontentloaded' });
  p.gotoStatus = resp?.status();
  try {
    await p.waitForSelector('[data-test=elhalo-page], [data-test=elhalo-room], [data-test=elhalo-lobby], [data-test=elhalo-start]', { timeout: 20000 });
    await p.waitForFunction(() => !!window.__elHalo, null, { timeout: 15000 });
  } catch (err) {
    console.error('open failed', p.url(), (await p.content()).slice(0, 800));
    throw err;
  }
  const rot = p.locator('[data-test=elhalo-rotate-dismiss]');
  if (await rot.count()) { try { await rot.click({ timeout: 800 }); } catch {} }
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') {
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]');
    else await tap('[data-test=elhalo-ready]');
  }
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined && window.__elHalo.state().st === 'alive');
}
const lookAtChile = async (p) => {
  const x = 13.2, z = 2.8;
  await hook(p, { place: { x, z, yaw: Math.atan2(-(CHILE_SPOT.x - x), -(CHILE_SPOT.z - z)) } });
  await p.evaluate((yaw) => window.__elHalo.face(yaw, -0.38), Math.atan2(-(CHILE_SPOT.x - 13.2), -(CHILE_SPOT.z - 2.8)));
};
const inShop = async (p, power) => {
  await hook(p, { clearChile: true, strip: true, empty: true, wave: 1, clear: true, calm: true });
  await until(p, () => window.__elHalo.state().phase === 'wave' || window.__elHalo.state().mode === 'playing', null, 4000);
  await lookAtChile(p);
  if (power) {
    const r = await hook(p, { chile: power });
    const seen = await until(p, (want) => { const c = window.__elHalo.state().chile; return Array.isArray(c) && c[1] === want; }, power, 5000);
    if (!seen) console.warn('pepper not in snapshot', power, r);
  }
};

async function framesToGif(frames, dest, fps = 10) {
  if (!OUT || !frames.length) return;
  const { spawnSync } = await import('node:child_process');
  const list = path.join(os.tmpdir(), `chile-gif-${Date.now()}.txt`);
  fs.writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${1 / fps}`).join('\n') + `\nfile '${frames.at(-1)}'\n`);
  const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=720:-1:flags=lanczos', dest], { encoding: 'utf8' });
  if (r.status !== 0) console.warn('gif fail', dest, r.stderr?.slice(-400));
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const sid = await login('Tyler', 'tyler.chiles@example.com');

  // ---- desktop: pepper colors + eat + each power
  const desk = await open(browser, sid, { w: 1280, h: 720, n: 'desktop' });
  check(await start(desk), 'desktop joined a match');
  await hook(desk, { empty: true, wave: 1, clear: true, calm: true });
  await until(desk, () => window.__elHalo.state().mode === 'playing');

  // pepper of every color
  for (const id of CHILE_IDS) {
    await inShop(desk, id);
    const seen = await until(desk, (want) => { const c = window.__elHalo.state().chile; return Array.isArray(c) && c[1] === want; }, id, 5000);
    check(seen, `pepper ${id} is in the snapshot`);
    await sleep(350);
    await shot(desk, `pepper-${id}`);
  }
  const last = await st(desk);
  check(Array.isArray(last.chile) && last.chile[1] === CHILE_IDS.at(-1), 'last pepper is visible in the paletería');

  // walk over and eat the last one (caballos) — then do a dedicated eat of a quiet power
  await inShop(desk, 'invis');
  await hook(desk, { place: { x: CHILE_SPOT.x, z: CHILE_SPOT.z } });
  const ate = await until(desk, () => window.__elHalo.state().power === 'invis', null, 5000);
  check(ate, 'walking onto the pepper eats it');
  const timerOn = await until(desk, () => {
    const el = document.querySelector('[data-test=elhalo-chile-timer]');
    const name = document.querySelector('[data-h=chilename]')?.textContent || '';
    return !!(el && el.classList.contains('on') && name.includes('INVISIBLE'));
  }, null, 4000);
  check(timerOn, '30s timer HUD shows after eating');
  const name = await desk.evaluate(() => document.querySelector('[data-h=chilename]')?.textContent || '');
  check(name.includes('INVISIBLE'), `timer names the power (${name})`);
  await sleep(400);
  await shot(desk, 'eat-invis-steam-timer');

  // each power, posed for a screenshot
  const poses = {
    invis: async (p) => { await hook(p, { place: { x: 0, z: 0, yaw: 0 }, spawn: [{ type: 'luchador', x: 2, z: -4, still: true }], grant: 'invis' }); },
    invuln: async (p) => { await hook(p, { place: { x: 0, z: 0, yaw: 0 }, spawn: [{ type: 'luchador', x: 2, z: -3, still: true }], grant: 'invuln' }); },
    instakill: async (p) => { await hook(p, { place: { x: 0, z: 0, yaw: 0 }, spawn: [{ type: 'luchador', x: 0, z: -4, still: true, hp: 400 }], grant: 'instakill' }); },
    gigante: async (p) => { await hook(p, { place: { x: 0, z: 8, yaw: 0 }, grant: 'gigante' }); },
    schnuttin: async (p) => { await hook(p, { place: { x: 0, z: 8, yaw: 0 }, grant: 'schnuttin' }); },
    mazo: async (p) => { await hook(p, { place: { x: 0, z: 0, yaw: 0 }, spawn: [{ type: 'luchador', x: 0, z: -3, still: true, hp: 400 }], grant: 'mazo' }); },
    caballos: async (p) => {
      await hook(p, { place: { x: 0, z: 10, yaw: 0 }, spawn: [
        { type: 'luchador', x: -4, z: 0, still: true }, { type: 'mariachi', x: 4, z: 2, still: true },
        { type: 'granjero', x: 0, z: -6, still: true }, { type: 'luchador', x: 6, z: 8, still: true },
      ], grant: 'caballos' });
    },
  };

  for (const id of CHILE_IDS) {
    await hook(desk, { clearChile: true, strip: true, clear: true, empty: true, wave: 1, calm: true });
    await poses[id](desk);
    const got = await until(desk, (want) => window.__elHalo.state().power === want, id, 4000);
    check(got, `granted ${id}`);
    if (id === 'schnuttin') {
      const banner = await until(desk, () => (document.querySelector('[data-test=elhalo-schnuttin]')?.textContent || '').includes('SCHNUTTIN'), null, 2500);
      check(banner, 'schnuttin banner is on screen and spoken');
    }
    if (id === 'caballos') {
      await desk.evaluate(() => window.__elHalo.overview(true));
      await sleep(900);
      await shot(desk, 'power-caballos-overview');
      await desk.evaluate(() => window.__elHalo.overview(false));
    }
    if (id === 'gigante') await desk.evaluate(() => window.__elHalo.face(0, -0.35));
    await sleep(id === 'caballos' || id === 'mazo' ? 700 : 350);
    await shot(desk, `power-${id}`);
    if (id === 'mazo') {
      await sleep(800);
      await shot(desk, 'power-mazo-swing');
    }
  }

  // short GIFs: spicy eat, water horses, mallet
  const gifEat = [];
  await hook(desk, { clearChile: true, strip: true, clear: true, empty: true, wave: 1, calm: true });
  await inShop(desk, 'schnuttin');
  await hook(desk, { place: { x: CHILE_SPOT.x - 0.1, z: CHILE_SPOT.z } });
  for (let i = 0; i < 12; i++) {
    const fp = path.join(OUT || os.tmpdir(), `_eat_${i}.png`);
    if (OUT) await desk.screenshot({ path: fp });
    gifEat.push(fp);
    await sleep(120);
  }
  if (OUT) await framesToGif(gifEat, path.join(OUT, 'eat-steam.gif'), 8);

  const gifWash = [];
  await hook(desk, { clearChile: true, strip: true, clear: true, empty: true, wave: 1, calm: true });
  await desk.evaluate(() => window.__elHalo.overview(true));
  await poses.caballos(desk);
  for (let i = 0; i < 16; i++) {
    const fp = path.join(OUT || os.tmpdir(), `_wash_${i}.png`);
    if (OUT) await desk.screenshot({ path: fp });
    gifWash.push(fp);
    await sleep(140);
  }
  if (OUT) await framesToGif(gifWash, path.join(OUT, 'power-caballos.gif'), 8);
  await desk.evaluate(() => window.__elHalo.overview(false));

  check(!(await st(desk)).errs?.length, 'no desktop page errors during chili checks');
  const deskErrs = desk.errs.filter((e) => !/favicon/.test(e));
  check(deskErrs.length === 0, 'desktop console clean' + (deskErrs.length ? ': ' + deskErrs.slice(0, 3).join(' | ') : ''));
  await desk.ctx.close();

  // ---- mobile / pad: timer and eat still work, pad stays usable
  const phone = await open(browser, sid, { w: 844, h: 390, m: true, n: 'phone' });
  check(await start(phone), 'phone joined a match');
  const rot = phone.locator('[data-test=elhalo-rotate-dismiss]');
  if (await rot.count()) { try { await rot.click({ timeout: 800 }); } catch {} }
  await hook(phone, { empty: true, wave: 1, clear: true, calm: true });
  const pad = await phone.locator('[data-test=elhalo-pad]').isVisible();
  check(pad, 'mobile pad is visible');
  await inShop(phone, 'invuln');
  await hook(phone, { place: { x: CHILE_SPOT.x, z: CHILE_SPOT.z } });
  const atePhone = await until(phone, () => window.__elHalo.state().power === 'invuln', null, 5000);
  check(atePhone, 'eating a pepper works with mobile controls');
  const timerReady = await until(phone, () => document.querySelector('[data-test=elhalo-chile-timer]')?.classList.contains('on'), null, 4000);
  const phoneTimer = await phone.evaluate(() => {
    const el = document.querySelector('[data-test=elhalo-chile-timer]');
    if (!el) return { on: false };
    const r = el.getBoundingClientRect(), pad = document.querySelector('[data-test=elhalo-pad]')?.getBoundingClientRect();
    const on = el.classList.contains('on') || el.textContent.trim().length > 0;
    const clear = !pad || r.bottom < (pad.top || 999) + 8 || r.top < 130;
    return { on, top: r.top, bottom: r.bottom, padTop: pad?.top, clear };
  });
  check(timerReady && phoneTimer.on, 'phone shows the chili timer');
  check(phoneTimer.clear, `phone timer stays out of the pad (top=${phoneTimer.top}, padTop=${phoneTimer.padTop})`);
  await sleep(200);
  await shot(phone, 'phone-pepper-timer');
  const phoneErrs = phone.errs.filter((e) => !/favicon/.test(e));
  check(phoneErrs.length === 0, 'phone console clean' + (phoneErrs.length ? ': ' + phoneErrs.slice(0, 3).join(' | ') : ''));
  await phone.ctx.close();

  await browser.close();
  srv.kill('SIGTERM');
  if (fails.length) { console.error('\nFAILED:\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('ALL OK');
}

main().catch((err) => { console.error(err); try { srv.kill('SIGTERM'); } catch {} process.exit(1); });
